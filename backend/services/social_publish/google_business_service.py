"""
services/social_publish/google_business_service.py — Google Business Profile posting
================================================================================
Verified against Google's current docs (2026) — the LocalPosts API is
active and maintained (Google split the old My Business API into 5 separate
APIs in 2021; this one is still live, confirmed against docs updated as
recently as July 2026).

  OAuth (standard Google OAuth2):
    Authorize: GET  https://accounts.google.com/o/oauth2/v2/auth
    Token:     POST https://oauth2.googleapis.com/token
    Scope:     https://www.googleapis.com/auth/business.manage

  Account + location discovery (separate API — Account Management API):
    GET https://mybusinessaccountmanagement.googleapis.com/v1/accounts
    GET https://mybusinessbusinessinformation.googleapis.com/v1/{account}/locations

  Post creation (My Business API v4 — LocalPosts):
    POST https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/localPosts
      {"languageCode": "en-US", "summary": "...", "topicType": "STANDARD",
       "media": [{"mediaFormat": "PHOTO", "sourceUrl": "..."}],
       "callToAction": {"actionType": "LEARN_MORE", "url": "..."}}

  NOTE: Google Business Profile API access has historically required
  requesting access via a form (not fully self-serve like a typical Google
  Cloud API) — separate from Meta/LinkedIn's app-review process, but also
  not instant. Confirm current access requirements at
  developers.google.com/my-business before relying on this in production.
"""
from __future__ import annotations

import logging
import os

import requests

logger = logging.getLogger(__name__)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_BUSINESS_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_BUSINESS_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_BUSINESS_REDIRECT_URI", "http://localhost:8000/api/v1/social-publish/google_business/callback")

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
ACCOUNT_MGMT_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1"
BUSINESS_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"
MY_BUSINESS_BASE = "https://mybusiness.googleapis.com/v4"

SCOPES = "https://www.googleapis.com/auth/business.manage"

REQUEST_TIMEOUT = int(os.getenv("SOCIAL_PUBLISH_TIMEOUT_SECONDS", "20"))


class GoogleBusinessError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _require_config() -> None:
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise GoogleBusinessError(
            "GOOGLE_BUSINESS_CLIENT_ID / GOOGLE_BUSINESS_CLIENT_SECRET are not configured. "
            "Set them from your OAuth Client's settings in Google Cloud Console."
        )


def build_authorize_url(state: str) -> str:
    _require_config()
    params = {
        "client_id": GOOGLE_CLIENT_ID, "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code", "scope": SCOPES, "state": state,
        "access_type": "offline", "prompt": "consent",  # ensures a refresh_token comes back
    }
    query = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
    return f"{AUTHORIZE_URL}?{query}"


def exchange_code_for_token(code: str) -> dict:
    _require_config()
    resp = requests.post(
        TOKEN_URL,
        data={
            "code": code, "client_id": GOOGLE_CLIENT_ID, "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": GOOGLE_REDIRECT_URI, "grant_type": "authorization_code",
        },
        timeout=REQUEST_TIMEOUT,
    )
    if not resp.ok:
        raise GoogleBusinessError(f"Google token exchange failed: {resp.status_code} {resp.text}", resp.status_code)
    return resp.json()  # {"access_token", "refresh_token", "expires_in", ...}


def refresh_access_token(refresh_token: str) -> dict:
    _require_config()
    resp = requests.post(
        TOKEN_URL,
        data={
            "refresh_token": refresh_token, "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET, "grant_type": "refresh_token",
        },
        timeout=REQUEST_TIMEOUT,
    )
    if not resp.ok:
        raise GoogleBusinessError(f"Google token refresh failed: {resp.status_code} {resp.text}", resp.status_code)
    return resp.json()


def list_accounts(access_token: str) -> list[dict]:
    resp = requests.get(
        f"{ACCOUNT_MGMT_BASE}/accounts",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=REQUEST_TIMEOUT,
    )
    if not resp.ok:
        raise GoogleBusinessError(f"Google accounts list failed: {resp.status_code} {resp.text}", resp.status_code)
    return resp.json().get("accounts", [])


def list_locations(access_token: str, account_name: str) -> list[dict]:
    """`account_name` is the full resource name, e.g. 'accounts/123456'."""
    resp = requests.get(
        f"{BUSINESS_INFO_BASE}/{account_name}/locations",
        params={"readMask": "name,title"},
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=REQUEST_TIMEOUT,
    )
    if not resp.ok:
        raise GoogleBusinessError(f"Google locations list failed: {resp.status_code} {resp.text}", resp.status_code)
    return resp.json().get("locations", [])


def create_local_post(
    access_token: str, account_id: str, location_id: str, summary: str, image_url: str,
    cta_url: str | None = None,
) -> str:
    """`account_id`/`location_id` are the bare numeric IDs (not the full
    'accounts/123/locations/456' resource name). Returns the created
    LocalPost's resource name."""
    body: dict = {
        "languageCode": "en-US",
        "summary": summary,
        "topicType": "STANDARD",
        "media": [{"mediaFormat": "PHOTO", "sourceUrl": image_url}],
    }
    if cta_url:
        body["callToAction"] = {"actionType": "LEARN_MORE", "url": cta_url}

    resp = requests.post(
        f"{MY_BUSINESS_BASE}/accounts/{account_id}/locations/{location_id}/localPosts",
        json=body, headers={"Authorization": f"Bearer {access_token}"}, timeout=REQUEST_TIMEOUT,
    )
    if not resp.ok:
        raise GoogleBusinessError(f"Google local post creation failed: {resp.status_code} {resp.text}", resp.status_code)
    data = resp.json()
    name = data.get("name")
    if not name:
        raise GoogleBusinessError(f"Google local post created but no 'name' was returned: {data}")
    return name
