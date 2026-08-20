"""
services/social_publish/linkedin_service.py — LinkedIn Company Page posting
================================================================================
Verified against LinkedIn's current docs (2026) — deliberately uses the
CURRENT /rest/posts + /rest/images endpoints, not the deprecated /v2/ugcPosts
or /v2/shares (still technically callable but no longer guaranteed feature
parity, and new features are Posts-API-only).

  OAuth (standard 3-legged, no PKCE required):
    Authorize: GET  https://www.linkedin.com/oauth/v2/authorization
    Token:     POST https://www.linkedin.com/oauth/v2/accessToken

  Posting to a Company Page requires the w_organization_social scope, which
  comes through LinkedIn's Community Management API partner programme — a
  separate application/approval, not available purely self-serve the way
  w_member_social (personal profile posting) is.

  Image upload (two-step, required before a post can reference an image):
    POST /rest/images?action=initializeUpload
      {"initializeUploadRequest": {"owner": "urn:li:organization:{id}"}}
      -> {"value": {"uploadUrl": "...", "image": "urn:li:image:..."}}
    PUT <uploadUrl> with the raw image bytes

  Post creation:
    POST /rest/posts
      {"author": "urn:li:organization:{id}", "commentary": "...",
       "visibility": "PUBLIC", "distribution": {"feedDistribution":
       "MAIN_FEED"}, "lifecycleState": "PUBLISHED",
       "content": {"media": {"id": "urn:li:image:..."}}}
    -> 201, new post URN in the x-restli-id response header

  Every request needs LinkedIn-Version (YYYYMM) and X-Restli-Protocol-Version
  headers.
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
API_BASE = "https://api.linkedin.com"

# w_organization_social: post as a Company Page (needs Community Management
# API access — see module docstring). r_organization_social: look up the
# pages this user administers, to get their organization URN.
SCOPES = "w_organization_social r_organization_social"

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


def list_organizations(access_token: str) -> list[dict]:
    """Company Pages this user administers, via the organizationAcls
    finder — needed to get the organization URN to post as."""
    resp = requests.get(
        f"{API_BASE}/rest/organizationAcls",
        params={"q": "roleAssignee", "role": "ADMINISTRATOR", "state": "APPROVED"},
        headers=_headers(access_token),
        timeout=REQUEST_TIMEOUT,
    )
    if not resp.ok:
        raise LinkedInError(f"LinkedIn organizationAcls failed: {resp.status_code} {resp.text}", resp.status_code)
    elements = resp.json().get("elements", [])
    return [{"organization_urn": e.get("organization"), "role": e.get("role")} for e in elements]


def upload_image(access_token: str, organization_urn: str, image_bytes: bytes) -> str:
    """Returns the image URN to reference in a post."""
    init_resp = requests.post(
        f"{API_BASE}/rest/images",
        params={"action": "initializeUpload"},
        json={"initializeUploadRequest": {"owner": organization_urn}},
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


def create_post(access_token: str, organization_urn: str, commentary: str, image_urn: str | None = None) -> str:
    """Returns the new post's URN (from the x-restli-id response header)."""
    body = {
        "author": organization_urn,
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
