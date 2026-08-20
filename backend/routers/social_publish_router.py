"""
routers/social_publish_router.py — Direct posting to Facebook, Instagram,
LinkedIn, and Google Business Profile
================================================================================
Each platform is its own OAuth app with its own approval process (see the
module docstrings in services/social_publish/*.py for exactly what's
required) — this router is the code side of that; the credentials/app
review are separate, real, external steps you still need to do per platform
before any of this actually works in production. Nothing here bypasses
that.

Facebook and Instagram share ONE Meta OAuth connection (Instagram publishing
rides on a linked Facebook Page's access token) — connecting "meta" stores
BOTH a `facebook` and an `instagram` social connection record if an
Instagram Business Account is linked, so the rest of the app (status,
publish) can treat all four platforms uniformly.

Simplification worth knowing: if a connected account manages multiple
Facebook Pages / LinkedIn Company Pages / Google Business locations, this
picks the FIRST one found rather than presenting a picker. Fine for a
single-location business; would need a picker UI added for a multi-location
one.
"""
from __future__ import annotations

import logging
import secrets

import requests
from fastapi import APIRouter, Depends, HTTPException, Query

from core.security import get_current_user_id
from db import (
    delete_social_connection,
    get_social_connection,
    list_social_connections,
    save_social_connection,
)
from models.social_publish_models import (
    ConnectResponse,
    PlatformPublishResult,
    PublishRequest,
    PublishResponse,
    SocialConnectionsStatusResponse,
    SocialPlatformStatus,
)
from services.canva_service import create_export_job, poll_export_job
from services.social_publish import google_business_service as gbp
from services.social_publish import linkedin_service as li
from services.social_publish import meta_service as meta
from db.dynamo import get_poster

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/social-publish", tags=["Social Publishing"])

PLATFORM_LABELS = {
    "facebook": "Facebook", "instagram": "Instagram",
    "linkedin": "LinkedIn", "google_business": "Google Business Profile",
}


# ── Status ───────────────────────────────────────────────────────────────────
@router.get("/status", response_model=SocialConnectionsStatusResponse, summary="Which platforms are connected")
async def status(user_id: str = Depends(get_current_user_id)):
    connections = {c["platform"]: c for c in list_social_connections(user_id)}
    platforms = []
    for platform in ("facebook", "instagram", "linkedin", "google_business"):
        conn = connections.get(platform)
        platforms.append(SocialPlatformStatus(
            platform=platform,
            connected=conn is not None,
            account_label=(conn or {}).get("extra", {}).get("label", ""),
        ))
    return SocialConnectionsStatusResponse(platforms=platforms)


@router.post("/{platform}/disconnect", summary="Disconnect a platform")
async def disconnect(platform: str, user_id: str = Depends(get_current_user_id)):
    if platform not in PLATFORM_LABELS:
        raise HTTPException(status_code=404, detail=f"Unknown platform: {platform}")
    delete_social_connection(user_id, platform)
    return {"disconnected": platform}


# ── Meta (Facebook + Instagram) ──────────────────────────────────────────────
@router.get("/meta/connect", response_model=ConnectResponse, summary="Get the Meta authorize URL (covers Facebook + Instagram)")
async def meta_connect(user_id: str = Depends(get_current_user_id)):
    state = f"{user_id}:{secrets.token_urlsafe(24)}"
    return ConnectResponse(authorize_url=meta.build_authorize_url(state))


@router.get("/meta/callback", summary="Meta OAuth redirect target")
async def meta_callback(code: str = Query(...), state: str = Query(...)):
    user_id, sep, _ = state.partition(":")
    if not sep or not user_id:
        return _redirect_result("error")
    try:
        short_lived = meta.exchange_code_for_token(code)
        long_lived = meta.exchange_for_long_lived_token(short_lived["access_token"])
        user_token = long_lived["access_token"]

        pages = meta.list_pages(user_token)
        if not pages:
            logger.warning(f"[social-publish] Meta connect for {user_id}: no Facebook Pages found")
            return _redirect_result("error")

        page = pages[0]  # see module docstring — first Page, no picker yet
        save_social_connection(
            user_id=user_id, platform="facebook", access_token=page["access_token"],
            extra={"page_id": page["id"], "label": page.get("name", "")},
        )

        ig_account = page.get("instagram_business_account")
        if ig_account and ig_account.get("id"):
            save_social_connection(
                user_id=user_id, platform="instagram", access_token=page["access_token"],
                extra={"ig_user_id": ig_account["id"], "page_id": page["id"], "label": page.get("name", "")},
            )
        return _redirect_result("connected")
    except Exception as e:
        logger.error(f"[social-publish] Meta OAuth callback failed: {e}", exc_info=True)
        return _redirect_result("error")


# ── LinkedIn ─────────────────────────────────────────────────────────────────
@router.get("/linkedin/connect", response_model=ConnectResponse, summary="Get the LinkedIn authorize URL")
async def linkedin_connect(user_id: str = Depends(get_current_user_id)):
    state = f"{user_id}:{secrets.token_urlsafe(24)}"
    return ConnectResponse(authorize_url=li.build_authorize_url(state))


@router.get("/linkedin/callback", summary="LinkedIn OAuth redirect target")
async def linkedin_callback(code: str = Query(...), state: str = Query(...)):
    user_id, sep, _ = state.partition(":")
    if not sep or not user_id:
        return _redirect_result("error")
    try:
        tokens = li.exchange_code_for_token(code)
        access_token = tokens["access_token"]

        orgs = li.list_organizations(access_token)
        if not orgs:
            logger.warning(f"[social-publish] LinkedIn connect for {user_id}: no administered Company Pages found")
            return _redirect_result("error")

        org = orgs[0]  # see module docstring — first Page, no picker yet
        save_social_connection(
            user_id=user_id, platform="linkedin", access_token=access_token,
            refresh_token=tokens.get("refresh_token", ""),
            extra={"organization_urn": org["organization_urn"], "label": org["organization_urn"]},
        )
        return _redirect_result("connected")
    except Exception as e:
        logger.error(f"[social-publish] LinkedIn OAuth callback failed: {e}", exc_info=True)
        return _redirect_result("error")


# ── Google Business Profile ──────────────────────────────────────────────────
@router.get("/google_business/connect", response_model=ConnectResponse, summary="Get the Google authorize URL")
async def google_business_connect(user_id: str = Depends(get_current_user_id)):
    state = f"{user_id}:{secrets.token_urlsafe(24)}"
    return ConnectResponse(authorize_url=gbp.build_authorize_url(state))


@router.get("/google_business/callback", summary="Google OAuth redirect target")
async def google_business_callback(code: str = Query(...), state: str = Query(...)):
    user_id, sep, _ = state.partition(":")
    if not sep or not user_id:
        return _redirect_result("error")
    try:
        tokens = gbp.exchange_code_for_token(code)
        access_token = tokens["access_token"]

        accounts = gbp.list_accounts(access_token)
        if not accounts:
            logger.warning(f"[social-publish] Google Business connect for {user_id}: no accounts found")
            return _redirect_result("error")
        account = accounts[0]
        account_id = account["name"].split("/")[-1]

        locations = gbp.list_locations(access_token, account["name"])
        if not locations:
            logger.warning(f"[social-publish] Google Business connect for {user_id}: no locations found")
            return _redirect_result("error")
        location = locations[0]  # see module docstring — first location, no picker yet
        location_id = location["name"].split("/")[-1]

        save_social_connection(
            user_id=user_id, platform="google_business", access_token=access_token,
            refresh_token=tokens.get("refresh_token", ""),
            extra={"account_id": account_id, "location_id": location_id, "label": location.get("title", "")},
        )
        return _redirect_result("connected")
    except Exception as e:
        logger.error(f"[social-publish] Google Business OAuth callback failed: {e}", exc_info=True)
        return _redirect_result("error")


def _redirect_result(result: str):
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=f"/?social_publish={result}")


# ── Publish ──────────────────────────────────────────────────────────────────
def _get_valid_google_token(user_id: str, conn: dict) -> str:
    """Google access tokens are short-lived (~1hr) — refresh if we have a
    refresh_token, since a poster might get published well after connecting."""
    if not conn.get("refresh_token"):
        return conn["access_token"]
    try:
        refreshed = gbp.refresh_access_token(conn["refresh_token"])
        new_token = refreshed["access_token"]
        save_social_connection(
            user_id=user_id, platform="google_business", access_token=new_token,
            refresh_token=conn["refresh_token"], extra=conn.get("extra", {}),
        )
        return new_token
    except Exception as e:
        logger.warning(f"[social-publish] Google token refresh failed, trying existing token anyway: {e}")
        return conn["access_token"]


@router.post("/publish", response_model=PublishResponse, summary="Post a Canva-created poster directly to one or more platforms")
async def publish(req: PublishRequest, user_id: str = Depends(get_current_user_id)):
    poster = get_poster(user_id, req.poster_id)
    if not poster:
        raise HTTPException(status_code=404, detail=f"Poster {req.poster_id} not found")

    # Export a fresh, final image from the poster's current Canva design —
    # not the (possibly lower-res/watermarked) thumbnail_url already stored,
    # and picks up any edits made since the poster was first created.
    try:
        from routers.canva_router import _get_valid_access_token as _get_canva_token
        canva_token = _get_canva_token(user_id)
        job_id = create_export_job(canva_token, poster["design_id"], export_format="png")
        export_urls = poll_export_job(canva_token, job_id)
        if not export_urls:
            raise HTTPException(status_code=502, detail="Canva export produced no file")
        image_url = export_urls[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not export the poster from Canva: {e}")

    results: list[PlatformPublishResult] = []
    for platform in req.platforms:
        if platform not in PLATFORM_LABELS:
            results.append(PlatformPublishResult(platform=platform, success=False, error="Unknown platform"))
            continue

        conn = get_social_connection(user_id, platform)
        if not conn:
            results.append(PlatformPublishResult(platform=platform, success=False, error=f"{PLATFORM_LABELS[platform]} is not connected"))
            continue

        try:
            if platform == "facebook":
                post_id = meta.post_to_facebook_page(conn["extra"]["page_id"], conn["access_token"], image_url, req.caption)
            elif platform == "instagram":
                post_id = meta.post_to_instagram(conn["extra"]["ig_user_id"], conn["access_token"], image_url, req.caption)
            elif platform == "linkedin":
                image_bytes = requests.get(image_url, timeout=30).content
                image_urn = li.upload_image(conn["access_token"], conn["extra"]["organization_urn"], image_bytes)
                post_id = li.create_post(conn["access_token"], conn["extra"]["organization_urn"], req.caption, image_urn)
            elif platform == "google_business":
                token = _get_valid_google_token(user_id, conn)
                post_id = gbp.create_local_post(
                    token, conn["extra"]["account_id"], conn["extra"]["location_id"],
                    req.caption, image_url, cta_url=req.cta_url,
                )
            else:
                raise ValueError(f"Unhandled platform: {platform}")

            results.append(PlatformPublishResult(platform=platform, success=True, post_id=post_id))
        except Exception as e:
            logger.error(f"[social-publish] {platform} publish failed for user={user_id}: {e}", exc_info=True)
            results.append(PlatformPublishResult(platform=platform, success=False, error=str(e)))

    return PublishResponse(results=results)
