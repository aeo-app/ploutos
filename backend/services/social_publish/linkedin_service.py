"""
services/social_publish/linkedin_service.py — LinkedIn Company Page posting
================================================================================
Posts as a LinkedIn COMPANY PAGE the connecting member administers, not
their personal profile — uses w_organization_social (the Company Page
equivalent of w_member_social). Unlike personal posting, this requires the
"Community Management API" product in the Developer Portal, which is
GATED behind LinkedIn's partner-program review (you apply, LinkedIn
approves your app, then w_organization_social/rw_organization_admin become
requestable) — this is the real trade-off for posting as the company
rather than the individual. Verified against LinkedIn's current docs
(2026) and multiple independent developer reports confirming this exact
self-serve/reviewed split.

  OAuth (standard 3-legged, no PKCE required):
    Authorize: GET  https://www.linkedin.com/oauth/v2/authorization
    Token:     POST https://www.linkedin.com/oauth/v2/accessToken
    Scopes:    openid profile w_organization_social rw_organization_admin
      - openid + profile: from the self-serve "Sign In with LinkedIn using
        OpenID Connect" product — used only to label the connection with
        the name of the member who connected it, not to identify the
        author of a post (that's the organization now).
      - w_organization_social: from the "Community Management API"
        product (partner-program review required) — the actual
        Company-Page posting permission.
      - rw_organization_admin: also from the Community Management API
        product — needed to look up which Company Pages the connecting
        member administers via GET /v2/organizationAcls.

  Identifying the member (label only — see get_member_urn):
    GET /v2/userinfo (requires the openid scope)
      -> {"sub": "...", "name": "...", ...}
    (NOT /v2/me — that endpoint is legacy and routinely rejects requests
    with "Not enough permissions" even with the right products enabled;
    /v2/userinfo is LinkedIn's current recommended path via OpenID
    Connect.)

  Listing the Company Pages this member administers (replaces posting
  straight to the person — there IS a "which page do you administer" step
  now, same shape as Meta's Page picker):
    GET /v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED
        &projection=(elements*(organization~(id,localizedName)))
      -> {"elements": [{"organization~": {"id": 12345, "localizedName": "Acme Inc"}, ...}, ...]}
    Organization URN = f"urn:li:organization:{id}"

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

  One thing worth knowing: posts made this way show up as coming from the
  Company Page itself (e.g. "Acme Inc posted: ..."), not the individual
  who connected it — that's the point of this over personal posting, but
  it does mean the connecting member must actually be an administrator of
  that Page, and your app must have been approved for the Community
  Management API product, or every call below will fail with a
  permissions error even though the OAuth step itself succeeded.
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
ORGANIZATION_ACLS_URL = "https://api.linkedin.com/v2/organizationAcls"
API_BASE = "https://api.linkedin.com"

# openid + profile: self-serve via "Sign In with LinkedIn using OpenID
# Connect" — used only to label the connection with the connecting
# member's name via GET /v2/userinfo, not to authenticate them into this
# app (they're already logged into THIS app) and not to author posts.
# w_organization_social + rw_organization_admin: from the "Community
# Management API" product, which requires LinkedIn's partner-program
# review before these scopes can even be requested — this is what makes
# Company Page posting possible, and it's the one part of this file that
# isn't a drop-in, self-serve swap from the old personal-profile version.
SCOPES = "openid profile w_organization_social rw_organization_admin"

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
    """Identifies the connecting LinkedIn member via OpenID Connect's
    userinfo endpoint (NOT /v2/me, which is legacy and frequently rejects
    requests even with the right products enabled). Returns
    {"person_urn": "urn:li:person:{sub}", "name": "..."}. Used only to
    label a connection/invite with a human name ("connected by Jane
    Smith") — the member's own URN is never the post author here, the
    organization the member administers is (see list_organizations)."""
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


def list_organizations(access_token: str) -> list[dict]:
    """Returns every Company Page the connecting member administers, as
    [{"id": "urn:li:organization:12345", "label": "Acme Inc"}, ...] — the
    Company-Page equivalent of Meta's list_pages(). Requires
    rw_organization_admin. An empty list usually means either the member
    isn't an admin of any Company Page, or this app hasn't been approved
    for the Community Management API product yet (LinkedIn returns an
    empty/forbidden result rather than a clear "not approved" error in
    that case, so an empty list here is worth checking against the
    Developer Portal before assuming the member truly has no pages)."""
    resp = requests.get(
        ORGANIZATION_ACLS_URL,
        params={
            "q": "roleAssignee",
            "role": "ADMINISTRATOR",
            "state": "APPROVED",
            "projection": "(elements*(organization~(id,localizedName)))",
        },
        headers=_headers(access_token),
        timeout=REQUEST_TIMEOUT,
    )
    if not resp.ok:
        raise LinkedInError(f"LinkedIn organizationAcls lookup failed: {resp.status_code} {resp.text}", resp.status_code)
    elements = resp.json().get("elements", [])
    organizations = []
    for el in elements:
        org = el.get("organization~") or {}
        org_id = org.get("id")
        if not org_id:
            continue
        organizations.append({
            "id": f"urn:li:organization:{org_id}",
            "label": org.get("localizedName", f"Organization {org_id}"),
        })
    return organizations


def upload_image(access_token: str, owner_urn: str, image_bytes: bytes) -> str:
    """Returns the image URN to reference in a post. `owner_urn` is the
    Company Page's organization URN (from list_organizations) — LinkedIn's
    image upload API calls this parameter "owner" regardless of whether
    the poster is a person or an organization."""
    init_resp = requests.post(
        f"{API_BASE}/rest/images",
        params={"action": "initializeUpload"},
        json={"initializeUploadRequest": {"owner": owner_urn}},
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


def create_post(access_token: str, author_urn: str, commentary: str, image_urn: str | None = None) -> str:
    """Returns the new post's URN (from the x-restli-id response header).
    `author_urn` is the Company Page's organization URN — the post will
    show up as coming from that Page, not the individual who connected
    it."""
    body = {
        "author": author_urn,
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
