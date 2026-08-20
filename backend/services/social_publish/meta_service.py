"""
services/social_publish/meta_service.py — Facebook Page + Instagram posting
================================================================================
Facebook and Instagram share ONE Meta developer app and ONE OAuth flow —
Instagram publishing rides on a Facebook Page's access token (an Instagram
Business/Creator account must be linked to a Facebook Page; there's no
separate Instagram-only OAuth). Verified against Meta's current docs (2026):

  OAuth (standard, no PKCE required — confidential/server-side client):
    Authorize: GET  https://www.facebook.com/v22.0/dialog/oauth
    Token:     GET  https://graph.facebook.com/v22.0/oauth/access_token
    Long-lived token exchange (60-day, non-expiring for Pages):
               GET  https://graph.facebook.com/v22.0/oauth/access_token
                    ?grant_type=fb_exchange_token

  Discover the user's Pages + their per-Page access tokens + linked IG
  Business Account:
    GET /me/accounts?fields=id,name,access_token,instagram_business_account

  Facebook Page photo post:
    POST /{page-id}/photos  — url, caption, access_token

  Instagram publish (two-step container model):
    POST /{ig-user-id}/media          — image_url, caption -> container id
    GET  /{container-id}?fields=status_code  — poll until FINISHED
    POST /{ig-user-id}/media_publish  — creation_id -> published media id
"""
from __future__ import annotations

import logging
import os
import time

import requests

logger = logging.getLogger(__name__)

META_CLIENT_ID = os.getenv("META_CLIENT_ID", "")
META_CLIENT_SECRET = os.getenv("META_CLIENT_SECRET", "")
META_REDIRECT_URI = os.getenv("META_REDIRECT_URI", "http://localhost:8000/api/v1/social-publish/meta/callback")

GRAPH_VERSION = "v22.0"
GRAPH_BASE = f"https://graph.facebook.com/{GRAPH_VERSION}"
AUTHORIZE_URL = f"https://www.facebook.com/{GRAPH_VERSION}/dialog/oauth"

# pages_show_list + pages_read_engagement: find the Page and its linked IG
# account. pages_manage_posts: post to the Page. instagram_basic +
# instagram_content_publish: read/publish to the linked Instagram account.
SCOPES = "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish"

REQUEST_TIMEOUT = int(os.getenv("SOCIAL_PUBLISH_TIMEOUT_SECONDS", "20"))
POLL_INTERVAL_SECONDS = 2
POLL_MAX_ATTEMPTS = 30  # ~60s — Meta recommends polling for up to ~5 min, but
                         # posters are single images, which finish in seconds


class MetaError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _require_config() -> None:
    if not META_CLIENT_ID or not META_CLIENT_SECRET:
        raise MetaError(
            "META_CLIENT_ID / META_CLIENT_SECRET are not configured. "
            "Set them from your app's settings in the Meta for Developers portal."
        )


def build_authorize_url(state: str) -> str:
    _require_config()
    params = {
        "client_id": META_CLIENT_ID,
        "redirect_uri": META_REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
        "response_type": "code",
    }
    query = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
    return f"{AUTHORIZE_URL}?{query}"


def _get(path: str, params: dict) -> dict:
    resp = requests.get(f"{GRAPH_BASE}{path}", params=params, timeout=REQUEST_TIMEOUT)
    if not resp.ok:
        logger.error(f"[meta] GET {path} -> {resp.status_code}: {resp.text}")
        raise MetaError(f"Meta API error ({resp.status_code}): {resp.text}", resp.status_code)
    return resp.json()


def _post(path: str, data: dict) -> dict:
    resp = requests.post(f"{GRAPH_BASE}{path}", data=data, timeout=REQUEST_TIMEOUT)
    if not resp.ok:
        logger.error(f"[meta] POST {path} -> {resp.status_code}: {resp.text}")
        raise MetaError(f"Meta API error ({resp.status_code}): {resp.text}", resp.status_code)
    return resp.json()


def exchange_code_for_token(code: str) -> dict:
    """Short-lived user access token (~1-2 hours)."""
    _require_config()
    data = _get("/oauth/access_token", {
        "client_id": META_CLIENT_ID, "client_secret": META_CLIENT_SECRET,
        "redirect_uri": META_REDIRECT_URI, "code": code,
    })
    return data  # {"access_token": ..., "token_type": ..., "expires_in": ...}


def exchange_for_long_lived_token(short_lived_token: str) -> dict:
    """Exchanges a short-lived user token for a long-lived one (~60 days)."""
    _require_config()
    return _get("/oauth/access_token", {
        "grant_type": "fb_exchange_token", "client_id": META_CLIENT_ID,
        "client_secret": META_CLIENT_SECRET, "fb_exchange_token": short_lived_token,
    })


def list_pages(user_access_token: str) -> list[dict]:
    """Every Facebook Page this user manages, each with its own (effectively
    non-expiring, as long as the user token stays valid) Page access token,
    and the linked Instagram Business Account ID if one exists."""
    data = _get("/me/accounts", {
        "fields": "id,name,access_token,instagram_business_account",
        "access_token": user_access_token,
    })
    return data.get("data", [])


def post_to_facebook_page(page_id: str, page_access_token: str, image_url: str, caption: str) -> str:
    """Returns the new post's Facebook object ID."""
    resp = _post(f"/{page_id}/photos", {
        "url": image_url, "caption": caption, "access_token": page_access_token,
    })
    post_id = resp.get("post_id") or resp.get("id")
    if not post_id:
        raise MetaError(f"Facebook post did not return an id: {resp}")
    return post_id


def post_to_instagram(ig_user_id: str, page_access_token: str, image_url: str, caption: str) -> str:
    """Two-step container model. `page_access_token` is the SAME token
    returned for the linked Facebook Page in list_pages() — Instagram
    publishing authenticates through the Page, not a separate IG token."""
    container = _post(f"/{ig_user_id}/media", {
        "image_url": image_url, "caption": caption, "access_token": page_access_token,
    })
    container_id = container.get("id")
    if not container_id:
        raise MetaError(f"Instagram container creation did not return an id: {container}")

    for _ in range(POLL_MAX_ATTEMPTS):
        status = _get(f"/{container_id}", {"fields": "status_code", "access_token": page_access_token})
        code = status.get("status_code")
        if code == "FINISHED":
            break
        if code == "ERROR":
            raise MetaError(f"Instagram container failed to process: {status}")
        time.sleep(POLL_INTERVAL_SECONDS)
    else:
        raise MetaError("Instagram container timed out before processing finished")

    published = _post(f"/{ig_user_id}/media_publish", {
        "creation_id": container_id, "access_token": page_access_token,
    })
    media_id = published.get("id")
    if not media_id:
        raise MetaError(f"Instagram publish did not return an id: {published}")
    return media_id
