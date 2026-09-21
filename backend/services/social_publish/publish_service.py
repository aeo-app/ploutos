"""
services/social_publish/publish_service.py — shared execution logic for
posting to Facebook, Instagram, LinkedIn, and Google Business Profile.

Pulled out of routers/social_publish_router.py so the background scheduler
(main.py's APScheduler job, via services/social_publish/scheduler.py) can
reuse the exact same posting logic as the immediate /publish endpoint,
without the scheduler importing from the router module (which would create
a circular import — the router needs to call into the scheduler to create
jobs, and the scheduler needs the posting logic the router used to own).
"""
from __future__ import annotations

import logging

import requests

from db import get_social_connection, mark_connection_needs_reconnect
from services.social_publish import google_business_service as gbp
from services.social_publish import linkedin_service as li
from services.social_publish import meta_service as meta
from services.social_publish import youtube_service as yt

logger = logging.getLogger(__name__)

PLATFORM_LABELS = {
    "facebook": "Facebook", "instagram": "Instagram",
    "linkedin": "LinkedIn", "google_business": "Google Business Profile",
    "youtube": "YouTube",
}


def _is_auth_failure(platform: str, exc: Exception) -> bool:
    """True only for "your token is expired/invalid/revoked, you need to
    reconnect" — never for rate limits, content policy violations, network
    errors, or malformed requests, since those need a different fix and
    telling the user to reconnect for those would be actively misleading.

    Verified signatures (2026):
      Meta:   OAuthException code 190 — often returned over HTTP 400, NOT
              401, so checking status code alone would miss most of these.
              The code appears in the raw error text regardless of status.
      LinkedIn: HTTP 401 specifically for an expired/invalid/revoked token.
      Google:   HTTP 401, or invalid_grant on a refresh_token that's been
                revoked — same signature for Google Business AND YouTube,
                since both are standard Google OAuth2 tokens.
    """
    text = str(exc)
    status_code = getattr(exc, "status_code", None)

    if platform in ("facebook", "instagram"):
        return '"code": 190' in text or "code\":190" in text or "OAuthException" in text
    if platform == "linkedin":
        return status_code == 401
    if platform in ("google_business", "youtube"):
        return status_code == 401 or "invalid_grant" in text.lower()
    return False


def _get_valid_google_token(user_id: str, platform: str, conn: dict) -> str:
    """Google access tokens are short-lived (~1hr) — refresh if we have a
    refresh_token, since a post might get published well after connecting,
    or a SCHEDULED post might fire hours/days after the token was issued.
    Shared between Google Business Profile and YouTube — both are
    standard Google OAuth2 tokens refreshed the exact same way, just
    against each service's own stored connection record."""
    from db import save_social_connection

    if not conn.get("refresh_token"):
        return conn["access_token"]
    try:
        refresher = gbp.refresh_access_token if platform == "google_business" else yt.refresh_access_token
        refreshed = refresher(conn["refresh_token"])
        new_token = refreshed["access_token"]
        save_social_connection(
            user_id=user_id, platform=platform, access_token=new_token,
            refresh_token=conn["refresh_token"], extra=conn.get("extra", {}),
        )
        return new_token
    except Exception as e:
        logger.warning(f"[social-publish] Google token refresh failed for platform={platform}, trying existing token anyway: {e}")
        return conn["access_token"]


def publish_to_platform(user_id: str, platform: str, image_url: str, caption: str, cta_url: str | None = None) -> dict:
    """Returns {"platform", "success", "post_id"?, "error"?} — never raises,
    so a caller publishing to several platforms in one request/job can
    always get a result for every platform, including whichever ones fail."""
    if platform not in PLATFORM_LABELS:
        return {"platform": platform, "success": False, "error": "Unknown platform"}

    conn = get_social_connection(user_id, platform)
    if not conn:
        return {"platform": platform, "success": False, "error": f"{PLATFORM_LABELS[platform]} is not connected"}

    try:
        if platform == "facebook":
            post_id = meta.post_to_facebook_page(conn["extra"]["page_id"], conn["access_token"], image_url, caption)
        elif platform == "instagram":
            post_id = meta.post_to_instagram(conn["extra"]["ig_user_id"], conn["access_token"], image_url, caption)
        elif platform == "linkedin":
            image_bytes = requests.get(image_url, timeout=30).content
            image_urn = li.upload_image(conn["access_token"], conn["extra"]["person_urn"], image_bytes)
            post_id = li.create_post(conn["access_token"], conn["extra"]["person_urn"], caption, image_urn)
        elif platform == "google_business":
            token = _get_valid_google_token(user_id, "google_business", conn)
            post_id = gbp.create_local_post(
                token, conn["extra"]["account_id"], conn["extra"]["location_id"], caption, image_url, cta_url=cta_url,
            )
        elif platform == "youtube":
            token = _get_valid_google_token(user_id, "youtube", conn)
            image_bytes = requests.get(image_url, timeout=30).content
            video_bytes = yt.generate_short_video_from_image(image_bytes)
            # YouTube has no separate "caption" field the way an image
            # post does — the caption becomes the video's description,
            # and its first line (or a truncated version of the whole
            # thing) doubles as the title, since a title is required and
            # a calendar post was never written with one in mind.
            title = (caption.strip().splitlines() or [caption])[0][:100] or "New post"
            post_id = yt.upload_video(token, video_bytes, title=title, description=caption)
        else:
            raise ValueError(f"Unhandled platform: {platform}")

        return {"platform": platform, "success": True, "post_id": post_id}
    except Exception as e:
        logger.error(f"[social-publish] {platform} publish failed for user={user_id}: {e}", exc_info=True)
        result = {"platform": platform, "success": False, "error": str(e)}
        if _is_auth_failure(platform, e):
            mark_connection_needs_reconnect(user_id, platform)
            result["needs_reconnect"] = True
            result["error"] = f"{PLATFORM_LABELS[platform]} connection has expired or been revoked — please reconnect."
        return result


def publish_to_platforms(user_id: str, platforms: list[str], image_url: str, caption: str, cta_url: str | None = None) -> list[dict]:
    return [publish_to_platform(user_id, p, image_url, caption, cta_url) for p in platforms]
