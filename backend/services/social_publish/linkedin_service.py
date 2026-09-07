"""
services/social_publish/linkedin_service.py — LinkedIn personal profile posting
================================================================================
Posts to the AUTHENTICATED MEMBER'S OWN personal profile, not a Company
Page — uses w_member_social, which (unlike w_organization_social, the
Company Page equivalent) is granted purely self-serve via the "Share on
LinkedIn" product in the Developer Portal, no Community Management API
partner-program review required. Verified against LinkedIn's current docs
(2026) and multiple independent developer reports confirming this exact
self-serve/reviewed split.

  OAuth (standard 3-legged, no PKCE required):
    Authorize: GET  https://www.linkedin.com/oauth/v2/authorization
    Token:     POST https://www.linkedin.com/oauth/v2/accessToken
    Scopes:    openid profile w_member_social
      - openid + profile: from the self-serve "Sign In with LinkedIn using
        OpenID Connect" product — needed to identify WHO the authenticated
        member is (there's no organization to look up here, so the
        member's own id has to come from their profile instead).
      - w_member_social: from the self-serve "Share on LinkedIn" product —
        the actual posting permission.

  Identifying the member (replaces the old list_organizations() lookup —
  there's no "which page do you administer" step for personal posting,
  just "who are you"):
    GET /v2/userinfo (requires the openid scope)
      -> {"sub": "...", "name": "...", ...}
    Person URN = f"urn:li:person:{sub}"
    (NOT /v2/me — that endpoint is legacy and routinely rejects requests
    with "Not enough permissions" even with both products enabled; /v2/
    userinfo is LinkedIn's current recommended path via OpenID Connect.)

  Image upload (two-step, required before a post can reference an image):
    POST /rest/images?action=initializeUpload
      {"initializeUploadRequest": {"owner": "urn:li:person:{id}"}}
      -> {"value": {"uploadUrl": "...", "image": "urn:li:image:..."}}
    PUT <uploadUrl> with the raw image bytes

  Post creation:
    POST /rest/posts
      {"author": "urn:li:person:{id}", "commentary": "...",
       "visibility": "PUBLIC", "distribution": {"feedDistribution":
       "MAIN_FEED"}, "lifecycleState": "PUBLISHED",
       "content": {"media": {"id": "urn:li:image:..."}}}
    -> 201, new post URN in the x-restli-id response header

  Every request needs LinkedIn-Version (YYYYMM) and X-Restli-Protocol-Version
  headers.

  One thing worth knowing: posts made this way show up as coming from the
  individual person (e.g. "Jane Smith posted: ..."), not from a company's
  own LinkedIn Page — that's the actual trade-off for not needing review.
"""
from __future__ import annotations

import logging
import os

import requests

logger = logging.getLogger(__name__)

LINKEDIN_CLIENT_ID = os.getenv("LINKEDIN_CLIENT_ID", "")
LINKEDIN_CLIENT_SECRET = os.getenv("LINKEDIN_CLIENT_SECRET", "")
LINKEDIN_REDIRECT_URI = os.getenv("LINKEDIN_REDIRECT_URI", "http://localhost:8000/api/v1/social-publish/linkedin/callback")
# Bump periodically — LinkedIn expects a real, recent YYYYMM version string.
LINKEDIN_API_VERSION = os.getenv("LINKEDIN_API_VERSION", "202603")

AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization"
TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
API_BASE = "https://api.linkedin.com"

# openid + profile: self-serve via "Sign In with LinkedIn using OpenID
# Connect" — used only to identify the member via GET /v2/userinfo, not to
# authenticate them into this app (they're already logged into THIS app;
# this is purely "who is the LinkedIn account we just connected").
# w_member_social: self-serve via "Share on LinkedIn" — the actual posting
# permission. Neither product requires LinkedIn's partner-program review.
SCOPES = "openid profile w_member_social"

REQUEST_TIMEOUT = int(os.getenv("SOCIAL_PUBLISH_TIMEOUT_SECONDS", "20"))


class LinkedInError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _require_config() -> None:
    if not LINKEDIN_CLIENT_ID or not LINKEDIN_CLIENT_SECRET:
        raise LinkedInError(
            "LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET are not configured. "
            "Set them from your app's Auth settings in the LinkedIn Developer Portal."
        )


def _headers(access_token: str) -> dict:
    return {
        "Authorization": f"Bearer {access_token}",
        "LinkedIn-Version": LINKEDIN_API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
        "Content-Type": "application/json",
    }


def build_authorize_url(state: str) -> str:
    _require_config()
    params = {
        "response_type": "code", "client_id": LINKEDIN_CLIENT_ID,
        "redirect_uri": LINKEDIN_REDIRECT_URI, "scope": SCOPES, "state": state,
    }
    query = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
    return f"{AUTHORIZE_URL}?{query}"


def exchange_code_for_token(code: str) -> dict:
    _require_config()
    resp = requests.post(
        TOKEN_URL,
        data={
            "grant_type": "authorization_code", "code": code,
            "redirect_uri": LINKEDIN_REDIRECT_URI, "client_id": LINKEDIN_CLIENT_ID,
            "client_secret": LINKEDIN_CLIENT_SECRET,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=REQUEST_TIMEOUT,
    )
    if not resp.ok:
        raise LinkedInError(f"LinkedIn token exchange failed: {resp.status_code} {resp.text}", resp.status_code)
    return resp.json()  # {"access_token", "expires_in", "refresh_token"?, ...}


def get_member_urn(access_token: str) -> dict:
    """Identifies the connected LinkedIn member via OpenID Connect's
    userinfo endpoint (NOT /v2/me, which is legacy and frequently rejects
    requests even with the right products enabled). Returns
    {"person_urn": "urn:li:person:{sub}", "name": "..."} — there's no
    "which page do you administer" step here, since this posts as the
    member themselves, not a Company Page."""
    resp = requests.get(
        USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=REQUEST_TIMEOUT,
    )
    if not resp.ok:
        raise LinkedInError(f"LinkedIn userinfo failed: {resp.status_code} {resp.text}", resp.status_code)
    data = resp.json()
    sub = data.get("sub")
    if not sub:
        raise LinkedInError(f"LinkedIn userinfo did not return a 'sub' claim: {data}")
    return {"person_urn": f"urn:li:person:{sub}", "name": data.get("name", "")}


def upload_image(access_token: str, person_urn: str, image_bytes: bytes) -> str:
    """Returns the image URN to reference in a post. `person_urn` is the
    member's own URN (from get_member_urn) — LinkedIn's image upload API
    calls this parameter "owner" regardless of whether the poster is a
    person or an organization."""
    init_resp = requests.post(
        f"{API_BASE}/rest/images",
        params={"action": "initializeUpload"},
        json={"initializeUploadRequest": {"owner": person_urn}},
        headers=_headers(access_token),
        timeout=REQUEST_TIMEOUT,
    )
    if not init_resp.ok:
        raise LinkedInError(f"LinkedIn image upload init failed: {init_resp.status_code} {init_resp.text}", init_resp.status_code)
    value = init_resp.json().get("value", {})
    upload_url, image_urn = value.get("uploadUrl"), value.get("image")
    if not upload_url or not image_urn:
        raise LinkedInError(f"LinkedIn image upload init did not return uploadUrl/image: {value}")

    put_resp = requests.put(
        upload_url, data=image_bytes,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=REQUEST_TIMEOUT,
    )
    if not put_resp.ok:
        raise LinkedInError(f"LinkedIn image byte upload failed: {put_resp.status_code}", put_resp.status_code)
    return image_urn


def create_post(access_token: str, person_urn: str, commentary: str, image_urn: str | None = None) -> str:
    """Returns the new post's URN (from the x-restli-id response header).
    `person_urn` becomes the post's "author" — the post will show up as
    coming from this individual member, not a company page."""
    body = {
        "author": person_urn,
        "commentary": commentary,
        "visibility": "PUBLIC",
        "distribution": {"feedDistribution": "MAIN_FEED", "targetEntities": [], "thirdPartyDistributionChannels": []},
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }
    if image_urn:
        body["content"] = {"media": {"id": image_urn}}

    resp = requests.post(f"{API_BASE}/rest/posts", json=body, headers=_headers(access_token), timeout=REQUEST_TIMEOUT)
    if resp.status_code != 201:
        raise LinkedInError(f"LinkedIn post creation failed: {resp.status_code} {resp.text}", resp.status_code)
    post_urn = resp.headers.get("x-restli-id") or resp.headers.get("X-RestLi-Id")
    if not post_urn:
        raise LinkedInError("LinkedIn post created but no x-restli-id header was returned")
    return post_urn
