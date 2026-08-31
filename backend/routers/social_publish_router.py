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
import os
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from core.security import get_current_user_id
from db import (
    cancel_scheduled_post,
    delete_social_connection,
    get_social_connection,
    list_scheduled_posts_for_user,
    list_social_connections,
    save_scheduled_post,
    save_social_connection,
)
from db.dynamo import get_poster
from models.social_publish_models import (
    CancelScheduledPostResponse,
    ConnectResponse,
    PublishRequest,
    PublishResponse,
    ScheduledPostListResponse,
    ScheduledPostSummary,
    ScheduleRequest,
    ScheduleResponse,
    SocialConnectionsStatusResponse,
    SocialPlatformStatus,
    UploadMediaResponse,
)
from services.canva_service import create_export_job, poll_export_job
from services.media_upload_service import MediaUploadError, upload_image
from services.social_publish import google_business_service as gbp
from services.social_publish import linkedin_service as li
from services.social_publish import meta_service as meta
from services.social_publish.publish_service import PLATFORM_LABELS, publish_to_platforms

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/social-publish", tags=["Social Publishing"])


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
async def meta_callback(
    code: str | None = Query(None), state: str | None = Query(None),
    error: str | None = Query(None), error_description: str | None = Query(None),
):
    # code/state deliberately optional here — if either is missing, or Meta
    # sent an explicit error instead (denied access, misconfiguration,
    # etc.), FastAPI's automatic validation would otherwise reject the
    # request with a raw 422 before this function runs at all, bypassing
    # the try/except below entirely and leaving the browser stuck on a
    # confusing backend JSON response instead of redirecting anywhere.
    if error or not code or not state:
        logger.warning(
            f"[social-publish] Meta callback incomplete or errored: error={error!r}, "
            f"error_description={error_description!r}, code_present={bool(code)}, state_present={bool(state)}"
        )
        return _redirect_result("error")
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
async def linkedin_callback(
    code: str | None = Query(None), state: str | None = Query(None),
    error: str | None = Query(None), error_description: str | None = Query(None),
):
    if error or not code or not state:
        logger.warning(
            f"[social-publish] LinkedIn callback incomplete or errored: error={error!r}, "
            f"error_description={error_description!r}, code_present={bool(code)}, state_present={bool(state)}"
        )
        return _redirect_result("error")
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
async def google_business_callback(
    code: str | None = Query(None), state: str | None = Query(None),
    error: str | None = Query(None), error_description: str | None = Query(None),
):
    if error or not code or not state:
        logger.warning(
            f"[social-publish] Google Business callback incomplete or errored: error={error!r}, "
            f"error_description={error_description!r}, code_present={bool(code)}, state_present={bool(state)}"
        )
        return _redirect_result("error")
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

# Absolute URL, not a relative path — a relative "/" redirect only lands on
# the frontend if it happens to share the exact same origin as this backend
# (true in some production setups, but NOT in local dev, where the backend
# typically runs on a different port than the React dev server — a relative
# redirect there just hits this backend's own root endpoint instead of the
# frontend at all).
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")


def _redirect_result(result: str):
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=f"{FRONTEND_URL}/?social_publish={result}")


# ── Resolving an image source (Canva poster OR a direct upload) ────────────
def _resolve_image_url(user_id: str, poster_id: str | None, image_url: str | None) -> str:
    """Every publish/schedule request carries exactly one image source
    (enforced by models.social_publish_models._ImageSourceMixin). A direct
    image_url is used as-is; a poster_id triggers a fresh Canva export so
    edits made since the poster was first created are included."""
    if image_url:
        return image_url

    poster = get_poster(user_id, poster_id)
    if not poster:
        raise HTTPException(status_code=404, detail=f"Poster {poster_id} not found")
    try:
        from routers.canva_router import _get_valid_access_token as _get_canva_token
        canva_token = _get_canva_token(user_id)
        job_id = create_export_job(canva_token, poster["design_id"], export_format="png")
        export_urls = poll_export_job(canva_token, job_id)
        if not export_urls:
            raise HTTPException(status_code=502, detail="Canva export produced no file")
        return export_urls[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not export the poster from Canva: {e}")


# ── Direct image upload (a user's own poster, not created via Canva) ───────
@router.post("/uploads", response_model=UploadMediaResponse, summary="Upload your own image to post/schedule (instead of a Canva poster)")
async def upload_media(user_id: str = Depends(get_current_user_id), file: UploadFile = File(...)):
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=422, detail="Uploaded file is empty")
    try:
        url = upload_image(contents, file.filename or "upload.jpg", user_id)
    except MediaUploadError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return UploadMediaResponse(image_url=url)


# ── Publish now ──────────────────────────────────────────────────────────────
@router.post("/publish", response_model=PublishResponse, summary="Post a poster (Canva or your own upload) directly to one or more platforms, right now")
async def publish(req: PublishRequest, user_id: str = Depends(get_current_user_id)):
    image_url = _resolve_image_url(user_id, req.poster_id, req.image_url)
    results = publish_to_platforms(user_id, req.platforms, image_url, req.caption, cta_url=req.cta_url)
    return PublishResponse(results=results)


# ── Scheduling (Facebook + Instagram) ───────────────────────────────────────
@router.post("/schedule", response_model=ScheduleResponse, summary="Schedule a poster (Canva or your own upload) to post at a future time")
async def schedule(req: ScheduleRequest, user_id: str = Depends(get_current_user_id)):
    try:
        scheduled_dt = datetime.fromisoformat(req.scheduled_time.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid scheduled_time: {req.scheduled_time!r} — use ISO 8601")
    if scheduled_dt <= datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="scheduled_time must be in the future")

    image_url = _resolve_image_url(user_id, req.poster_id, req.image_url)
    schedule_id = str(uuid.uuid4())
    scheduled_iso = scheduled_dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    save_scheduled_post(
        schedule_id=schedule_id, user_id=user_id, day_date=req.day_date, platforms=req.platforms,
        caption=req.caption, image_url=image_url, cta_url=req.cta_url or "", scheduled_time_iso=scheduled_iso,
    )
    logger.info(f"[social-publish] scheduled post {schedule_id} for user={user_id} at {scheduled_iso}")
    return ScheduleResponse(schedule_id=schedule_id, scheduled_time=scheduled_iso, status="pending")


@router.get("/scheduled", response_model=ScheduledPostListResponse, summary="List your scheduled posts (any status)")
async def scheduled_posts(user_id: str = Depends(get_current_user_id)):
    items = list_scheduled_posts_for_user(user_id)
    return ScheduledPostListResponse(items=[
        ScheduledPostSummary(
            schedule_id=i["schedule_id"], day_date=i.get("day_date", ""), platforms=i.get("platforms", []),
            caption=i.get("caption", ""), image_url=i.get("image_url", ""), scheduled_time=i.get("scheduled_time", ""),
            status=i.get("status", "pending"), results=i.get("results", []),
        )
        for i in items
    ])


@router.delete("/scheduled/{schedule_id}", response_model=CancelScheduledPostResponse, summary="Cancel a pending scheduled post")
async def cancel_scheduled(schedule_id: str, user_id: str = Depends(get_current_user_id)):
    ok = cancel_scheduled_post(schedule_id, user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="No pending scheduled post found with that id for your account")
    return CancelScheduledPostResponse(cancelled=True)
