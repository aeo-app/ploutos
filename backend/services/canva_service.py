"""
services/canva_service.py — Canva Connect API integration
=============================================================
Uses the Autofill + Brand Templates APIs, which require the connected
Canva account to be a member of a Canva Enterprise organization (confirmed
with the business before building this — every end-user who wants to use
this feature needs to be part of that same Canva Enterprise org, not just
have any Canva account).

API reference confirmed against Canva's current docs (2026):
  - OAuth 2.0, Authorization Code flow + PKCE (SHA-256):
      Authorize (browser-facing): GET  https://www.canva.com/api/oauth/authorize
      Token (backend only):       POST https://api.canva.com/rest/v1/oauth/token
      Introspect:                 POST https://api.canva.com/rest/v1/oauth/introspect
      Revoke:                     POST https://api.canva.com/rest/v1/oauth/revoke
    Access tokens expire in ~4 hours; refresh_token is long-lived.
  - Assets:  POST /rest/v1/asset-uploads (async job) — upload an image (by
             raw bytes, so external image URLs are fetched here first) so it
             can be used to fill an autofill image field.
             GET  /rest/v1/asset-uploads/{job_id} — poll for completion.
  - Brand templates: GET /rest/v1/brand-templates
                      GET /rest/v1/brand-templates/{id}/dataset — discover
                      which fields are autofillable (text vs image).
  - Autofill: POST /rest/v1/autofills (async job) — generate a NEW design
              from a brand template + field data. Canva's autofill always
              produces a new design per job — there's no "edit this exact
              design's image in place" operation, so "replace images and
              recreate" is implemented as "re-run the same job with new
              image field values", which is exactly how Canva's own autofill
              model works.
              GET  /rest/v1/autofills/{job_id} — poll for completion.
  - Export:   POST /rest/v1/exports (async job)
              GET  /rest/v1/exports/{job_id} — poll for completion.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
import secrets
import time

import requests

logger = logging.getLogger(__name__)

# ── Config ───────────────────────────────────────────────────────────────────
CANVA_CLIENT_ID = os.getenv("CANVA_CLIENT_ID", "")
CANVA_CLIENT_SECRET = os.getenv("CANVA_CLIENT_SECRET", "")
CANVA_REDIRECT_URI = os.getenv("CANVA_REDIRECT_URI", "http://127.0.0.1:8000/api/v1/canva/callback")

AUTHORIZE_URL = "https://www.canva.com/api/oauth/authorize"
API_BASE = "https://api.canva.com/rest/v1"

# Minimal scopes for this feature: read/write assets, read/write design
# content, read brand templates and their autofill datasets.
SCOPES = (
    "asset:read asset:write "
    "design:meta:read design:content:read design:content:write "
    "brandtemplate:meta:read brandtemplate:content:read"
)

REQUEST_TIMEOUT = int(os.getenv("CANVA_TIMEOUT_SECONDS", "20"))
# Async job polling — Canva's autofill/export/asset-upload jobs are all
# fire-and-poll. Bounded so a stuck job can't hang a request forever.
POLL_INTERVAL_SECONDS = 1.5
POLL_MAX_ATTEMPTS = 40  # ~60s max wait per job


class CanvaError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _require_config() -> None:
    if not CANVA_CLIENT_ID or not CANVA_CLIENT_SECRET:
        raise CanvaError(
            "CANVA_CLIENT_ID / CANVA_CLIENT_SECRET are not configured. "
            "Set them from your integration's settings in the Canva Developer Portal."
        )


# ── PKCE ─────────────────────────────────────────────────────────────────────
def generate_pkce_pair() -> tuple[str, str]:
    """Returns (code_verifier, code_challenge) — SHA-256, base64url, no padding."""
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(64)).rstrip(b"=").decode("ascii")
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def build_authorize_url(state: str, code_challenge: str) -> str:
    _require_config()
    params = {
        "response_type": "code",
        "client_id": CANVA_CLIENT_ID,
        "redirect_uri": CANVA_REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    query = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
    return f"{AUTHORIZE_URL}?{query}"


def exchange_code_for_tokens(code: str, code_verifier: str) -> dict:
    """Returns {access_token, refresh_token, expires_in, scope}."""
    _require_config()
    resp = requests.post(
        f"{API_BASE}/oauth/token",
        data={
            "grant_type": "authorization_code",
            "client_id": CANVA_CLIENT_ID,
            "client_secret": CANVA_CLIENT_SECRET,
            "code": code,
            "code_verifier": code_verifier,
            "redirect_uri": CANVA_REDIRECT_URI,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=REQUEST_TIMEOUT,
    )
    if not resp.ok:
        raise CanvaError(f"Canva token exchange failed: {resp.status_code} {resp.text}", resp.status_code)
    return resp.json()


def refresh_access_token(refresh_token: str) -> dict:
    _require_config()
    resp = requests.post(
        f"{API_BASE}/oauth/token",
        data={
            "grant_type": "refresh_token",
            "client_id": CANVA_CLIENT_ID,
            "client_secret": CANVA_CLIENT_SECRET,
            "refresh_token": refresh_token,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=REQUEST_TIMEOUT,
    )
    if not resp.ok:
        raise CanvaError(f"Canva token refresh failed: {resp.status_code} {resp.text}", resp.status_code)
    return resp.json()


# ── Authenticated request helper ────────────────────────────────────────────
def _request(access_token: str, method: str, path: str, **kwargs) -> dict:
    resp = requests.request(
        method, f"{API_BASE}{path}",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=REQUEST_TIMEOUT,
        **kwargs,
    )
    if not resp.ok:
        logger.error(f"[canva] {method} {path} -> {resp.status_code}: {resp.text}")
        raise CanvaError(f"Canva API error ({resp.status_code}): {resp.text}", resp.status_code)
    return resp.json() if resp.content else {}


# ── Brand templates ──────────────────────────────────────────────────────────
def list_brand_templates(access_token: str) -> list[dict]:
    data = _request(access_token, "GET", "/brand-templates")
    return data.get("items", [])


def get_brand_template_dataset(access_token: str, brand_template_id: str) -> dict:
    """Returns {field_name: {type: "text"|"image"|"chart", ...}}."""
    data = _request(access_token, "GET", f"/brand-templates/{brand_template_id}/dataset")
    return data.get("dataset", {})


# ── Assets ───────────────────────────────────────────────────────────────────
def upload_asset_from_bytes(access_token: str, image_bytes: bytes, name: str) -> str:
    """
    Uploads raw image bytes as a Canva asset (async job), polls until ready,
    returns the asset_id to use in an autofill image field.
    """
    name_b64 = base64.b64encode(name.encode("utf-8")).decode("ascii")
    resp = requests.post(
        f"{API_BASE}/asset-uploads",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/octet-stream",
            "Asset-Upload-Metadata": f'{{"name_base64":"{name_b64}"}}',
        },
        data=image_bytes,
        timeout=REQUEST_TIMEOUT,
    )
    if not resp.ok:
        raise CanvaError(f"Canva asset upload failed: {resp.status_code} {resp.text}", resp.status_code)
    job = resp.json().get("job", {})
    job_id = job.get("id")
    if not job_id:
        raise CanvaError("Canva asset upload did not return a job id")

    for _ in range(POLL_MAX_ATTEMPTS):
        status = _request(access_token, "GET", f"/asset-uploads/{job_id}")
        job = status.get("job", {})
        state = job.get("status")
        if state == "success":
            return job["asset"]["id"]
        if state == "failed":
            raise CanvaError(f"Canva asset upload job failed: {job.get('error')}")
        time.sleep(POLL_INTERVAL_SECONDS)
    raise CanvaError("Canva asset upload job timed out")


def upload_asset_from_url(access_token: str, image_url: str, name: str) -> str:
    """Fetches an image from a URL (e.g. one we already host) and uploads it
    as a Canva asset — Canva's upload API takes raw bytes, not a remote URL,
    so the fetch happens on our side first."""
    img_resp = requests.get(image_url, timeout=REQUEST_TIMEOUT)
    if not img_resp.ok:
        raise CanvaError(f"Could not fetch image to upload: {image_url} ({img_resp.status_code})")
    return upload_asset_from_bytes(access_token, img_resp.content, name)


# ── Autofill ─────────────────────────────────────────────────────────────────
def create_autofill_job(access_token: str, brand_template_id: str, data: dict) -> str:
    """
    `data` maps field_name -> {"type": "text", "text": "..."} or
    {"type": "image", "asset_id": "..."}, matching whatever fields the
    template's dataset declares. Returns the job id.
    """
    resp = _request(
        access_token, "POST", "/autofills",
        json={"brand_template_id": brand_template_id, "data": data},
    )
    job_id = resp.get("job", {}).get("id")
    if not job_id:
        raise CanvaError("Canva autofill job did not return a job id")
    return job_id


def poll_autofill_job(access_token: str, job_id: str) -> dict:
    """Polls until the autofill job completes. Returns
    {"design_id", "edit_url", "view_url", "thumbnail_url"}."""
    for _ in range(POLL_MAX_ATTEMPTS):
        status = _request(access_token, "GET", f"/autofills/{job_id}")
        job = status.get("job", {})
        state = job.get("status")
        if state == "success":
            design = job.get("result", {}).get("design", {})
            urls = design.get("urls", {})
            return {
                "design_id": design.get("id"),
                "edit_url": urls.get("edit_url"),
                "view_url": urls.get("view_url"),
                "thumbnail_url": design.get("thumbnail", {}).get("url"),
            }
        if state == "failed":
            raise CanvaError(f"Canva autofill job failed: {job.get('error')}")
        time.sleep(POLL_INTERVAL_SECONDS)
    raise CanvaError("Canva autofill job timed out")


# ── Export ───────────────────────────────────────────────────────────────────
def create_export_job(access_token: str, design_id: str, export_format: str = "png") -> str:
    resp = _request(
        access_token, "POST", "/exports",
        json={"design_id": design_id, "format": {"type": export_format}},
    )
    job_id = resp.get("job", {}).get("id")
    if not job_id:
        raise CanvaError("Canva export job did not return a job id")
    return job_id


def poll_export_job(access_token: str, job_id: str) -> list[str]:
    """Polls until the export job completes. Returns a list of exported
    file URLs (usually one per design page)."""
    for _ in range(POLL_MAX_ATTEMPTS):
        status = _request(access_token, "GET", f"/exports/{job_id}")
        job = status.get("job", {})
        state = job.get("status")
        if state == "success":
            return job.get("urls", [])
        if state == "failed":
            raise CanvaError(f"Canva export job failed: {job.get('error')}")
        time.sleep(POLL_INTERVAL_SECONDS)
    raise CanvaError("Canva export job timed out")
