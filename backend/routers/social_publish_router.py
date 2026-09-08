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

Meta connections fetch every Facebook Page the authorizing user manages and
save the Page token only after the authorizing user picks a specific Page in
the page-picker UI. LinkedIn and Google Business retain their own connection
flows.
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
    get_page_invite,
    get_scheduled_post,
    get_social_connection,
    list_page_invites_for_user,
    list_scheduled_posts_for_user,
    list_social_connections,
    save_page_invite,
    save_scheduled_post,
    save_social_connection,
    update_page_invite,
    update_scheduled_post_status,
)
from db.dynamo import get_poster
from models.social_publish_models import (
    AvailablePageOption,
    CancelScheduledPostResponse,
    ConnectResponse,
    CreateInviteRequest,
    CreateInviteResponse,
    INVITABLE_CONNECT_GROUPS,
    PageInviteListItem,
    PageInviteListResponse,
    PublishRequest,
    PublishResponse,
    ScheduledPostListResponse,
    ScheduledPostSummary,
    ScheduleRequest,
    ScheduleResponse,
    SelectInvitePageRequest,
    SelectInvitePageResponse,
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
            needs_reconnect=bool((conn or {}).get("needs_reconnect", False)),
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
    # Use the same one-time page-picker flow as a customer invite. The
    # authenticated user is the requester, so the resulting connection is
    # stored on their account after they choose a specific Page.
    invite_token = secrets.token_urlsafe(24)
    save_page_invite(
        invite_token=invite_token,
        platform="meta",
        requested_by_user_id=user_id,
        requested_by_label="Your account",
        return_to_app=True,
    )
    return ConnectResponse(
        authorize_url=meta.build_authorize_url(_invite_state(invite_token)),
    )


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
        return _redirect_result("error", reason=error_description or "Missing code or state from Meta")
    is_invite, invite_token = _is_invite_state(state)
    if is_invite:
        return await _handle_meta_invite_callback(invite_token, code)

    # Meta connections must use a server-created invite state so the Page
    # selection step cannot be skipped and state cannot be forged.
    return _redirect_result("error", reason="Invalid or expired Meta connection state")


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
        return _redirect_result("error", reason=error_description or "Missing code or state from LinkedIn")
    user_id, sep, _ = state.partition(":")
    if not sep or not user_id:
        return _redirect_result("error", reason="Malformed state parameter")

    is_invite, invite_token = _is_invite_state(state)
    if is_invite:
        return await _handle_linkedin_invite_callback(invite_token, code)

    try:
        tokens = li.exchange_code_for_token(code)
        access_token = tokens["access_token"]

        # No page-picker step here (unlike Meta) — posting to the member's
        # own profile just needs to know who they are, not which of
        # several pages to act as.
        member = li.get_member_urn(access_token)
        save_social_connection(
            user_id=user_id, platform="linkedin", access_token=access_token,
            refresh_token=tokens.get("refresh_token", ""),
            extra={"person_urn": member["person_urn"], "label": member.get("name") or "LinkedIn profile"},
        )
        return _redirect_result("connected")
    except Exception as e:
        logger.error(f"[social-publish] LinkedIn OAuth callback failed: {e}", exc_info=True)
        return _redirect_result("error", reason=str(e))


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
        return _redirect_result("error", reason=error_description or "Missing code or state from Google")
    user_id, sep, _ = state.partition(":")
    if not sep or not user_id:
        return _redirect_result("error", reason="Malformed state parameter")

    is_invite, invite_token = _is_invite_state(state)
    if is_invite:
        return await _handle_google_business_invite_callback(invite_token, code)

    try:
        tokens = gbp.exchange_code_for_token(code)
        access_token = tokens["access_token"]

        accounts = gbp.list_accounts(access_token)
        if not accounts:
            logger.warning(f"[social-publish] Google Business connect for {user_id}: no accounts found")
            return _redirect_result("error", reason="No Google Business accounts found")
        account = accounts[0]
        account_id = account["name"].split("/")[-1]

        locations = gbp.list_locations(access_token, account["name"])
        if not locations:
            logger.warning(f"[social-publish] Google Business connect for {user_id}: no locations found")
            return _redirect_result("error", reason="No Google Business locations found")
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
        return _redirect_result("error", reason=str(e))

# Absolute URL, not a relative path — a relative "/" redirect only lands on
# the frontend if it happens to share the exact same origin as this backend
# (true in some production setups, but NOT in local dev, where the backend
# typically runs on a different port than the React dev server — a relative
# redirect there just hits this backend's own root endpoint instead of the
# frontend at all).
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")


def _redirect_result(result: str, reason: str | None = None):
    from fastapi.responses import RedirectResponse
    from urllib.parse import quote

    url = f"{FRONTEND_URL}/?social_publish={result}"
    if reason:
        # Truncate — this is for a quick diagnostic glance at the URL, not
        # a replacement for server logs, which still get the full message.
        url += f"&reason={quote(reason[:200])}"
    return RedirectResponse(url=url)


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


@router.delete("/uploads", summary="Delete a previously uploaded image, if it's yours and not needed anymore")
async def delete_uploaded_image(image_url: str = Query(...), force: bool = Query(False), user_id: str = Depends(get_current_user_id)):
    from services.media_upload_service import delete_image

    # Safety check: don't delete an image still referenced by a
    # successfully published post unless the user explicitly overrides it
    # (force=true) — a published post's image disappearing from a live
    # Facebook/Instagram post isn't something this can undo, so silently
    # deleting it out from under a real post would be a real data-loss risk,
    # not just a UI inconvenience.
    if not force:
        posts = list_scheduled_posts_for_user(user_id)
        still_used = [
            p for p in posts
            if p.get("image_url") == image_url and p.get("status") in ("posted", "partial")
        ]
        if still_used:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"This image is still associated with {len(still_used)} successfully published "
                    f"post(s). Pass force=true to delete it anyway (the already-published post itself "
                    f"is unaffected on the platform — only this image's storage here is removed)."
                ),
            )

    try:
        delete_image(image_url, user_id)
    except MediaUploadError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"deleted": True, "image_url": image_url}


# ── Page connection invitations ─────────────────────────────────────────────
# For a normal Meta connection, the authenticated user starts the same
# server-backed picker used by invites. For LinkedIn/Google Business, users
# still generate an invite link and send it to whoever administers the
# page/profile they want connected.
# That person clicks the link, authorizes DIRECTLY with the platform
# themselves (there's no way around this — every one of these platforms
# requires the actual admin to go through their own OAuth consent screen;
# there's no API to "request access" without that), picks the specific
# page from what they manage, and the connection is saved under the
# ORIGINAL REQUESTER's account — not the approving admin's, who may have
# no account here at all.
_INVITE_CONNECT_GROUP_TO_PLATFORMS = {
    "meta": ("facebook", "instagram"),
    "linkedin": ("linkedin",),
    "google_business": ("google_business",),
}


def _invite_state(invite_token: str) -> str:
    return f"invite:{invite_token}"


def _is_invite_state(state: str) -> tuple[bool, str]:
    if state.startswith("invite:"):
        return True, state.split(":", 1)[1]
    return False, ""


@router.post("/invites", response_model=CreateInviteResponse, summary="Create a page-connection invite link to send to a page/profile admin")
async def create_invite(req: CreateInviteRequest, user_id: str = Depends(get_current_user_id)):
    if req.connect_group not in INVITABLE_CONNECT_GROUPS:
        raise HTTPException(status_code=422, detail=f"Unknown connect_group: {req.connect_group!r}")

    from db.dynamo import register_user
    users = {}
    try:
        from db.dynamo import list_all_users
        users = {u["user_id"]: u for u in list_all_users()}
    except Exception:
        pass
    requester_label = (users.get(user_id) or {}).get("company_name") or "A business using AEO Intel"

    invite_token = secrets.token_urlsafe(24)
    save_page_invite(
        invite_token=invite_token, platform=req.connect_group,
        requested_by_user_id=user_id, requested_by_label=req.label.strip() or requester_label,
    )
    invite = get_page_invite(invite_token)
    return CreateInviteResponse(
        invite_token=invite_token, invite_url=f"{FRONTEND_URL}/connect-page/{invite_token}",
        platform=req.connect_group, status=invite["status"], expires_at=invite["expires_at"],
    )


@router.get("/invites", response_model=PageInviteListResponse, summary="List invites you've sent, and their status")
async def list_invites(user_id: str = Depends(get_current_user_id)):
    items = list_page_invites_for_user(user_id)
    return PageInviteListResponse(items=[
        PageInviteListItem(
            invite_token=i["invite_token"], platform=i["platform"], status=i["status"],
            created_at=i["created_at"], expires_at=i["expires_at"], approved_at=i.get("approved_at"),
            selected_page_label=(i.get("selected_page") or {}).get("label", ""),
        )
        for i in items
    ])


@router.get("/invites/{invite_token}", summary="PUBLIC — what the approving page admin sees before authorizing (no login required)")
async def get_invite_public_status(invite_token: str):
    """Deliberately unauthenticated — the person opening this link is a
    page admin who may have no account on this platform at all. Returns a
    different shape depending on where the invite is in its lifecycle;
    the frontend's /connect-page/:token route branches on `stage`."""
    invite = get_page_invite(invite_token)
    if not invite:
        raise HTTPException(status_code=404, detail="This invite link is invalid.")

    if invite["status"] in ("expired", "cancelled", "approved"):
        return {
            "stage": invite["status"],
            "platform": invite["platform"],
            "requested_by_label": invite["requested_by_label"],
            "selected_page_label": (invite.get("selected_page") or {}).get("label", ""),
            "return_to_app": invite.get("return_to_app", False),
        }
    if invite["status"] == "pages_ready":
        return {
            "stage": "pick_page",
            "platform": invite["platform"],
            "requested_by_label": invite["requested_by_label"],
            "available_pages": invite.get("available_pages", []),
            "return_to_app": invite.get("return_to_app", False),
        }
    return {
        "stage": "pending",
        "platform": invite["platform"],
        "requested_by_label": invite["requested_by_label"],
        "expires_at": invite["expires_at"],
    }


@router.get("/invites/{invite_token}/{connect_group}/connect", response_model=ConnectResponse, summary="PUBLIC — authorize URL for the page admin to click")
async def invite_connect(invite_token: str, connect_group: str):
    invite = get_page_invite(invite_token)
    if not invite:
        raise HTTPException(status_code=404, detail="This invite link is invalid.")
    if invite["platform"] != connect_group:
        raise HTTPException(status_code=422, detail="This invite is not for this platform.")
    if invite["status"] not in ("pending",):
        raise HTTPException(status_code=409, detail=f"This invite is already {invite['status']} and can't be re-authorized.")

    state = _invite_state(invite_token)
    if connect_group == "meta":
        return ConnectResponse(authorize_url=meta.build_authorize_url(state))
    elif connect_group == "linkedin":
        return ConnectResponse(authorize_url=li.build_authorize_url(state))
    elif connect_group == "google_business":
        return ConnectResponse(authorize_url=gbp.build_authorize_url(state))
    raise HTTPException(status_code=422, detail=f"Unknown connect_group: {connect_group!r}")


@router.post("/invites/{invite_token}/select-page", response_model=SelectInvitePageResponse, summary="PUBLIC — the page admin picks which specific page/location to connect")
async def select_invite_page(invite_token: str, req: SelectInvitePageRequest):
    invite = get_page_invite(invite_token)
    if not invite:
        raise HTTPException(status_code=404, detail="This invite link is invalid.")
    if invite["status"] != "pages_ready":
        raise HTTPException(status_code=409, detail=f"This invite isn't ready for page selection (status: {invite['status']}).")

    page = next((p for p in invite.get("available_pages", []) if p["id"] == req.page_id), None)
    if not page:
        raise HTTPException(status_code=404, detail="That page wasn't in this invite's available list.")

    requester_id = invite["requested_by_user_id"]
    access_token = invite["oauth_access_token"]

    if invite["platform"] == "meta":
        save_social_connection(
            user_id=requester_id, platform="facebook", access_token=page["page_access_token"],
            extra={"page_id": page["id"], "label": page["label"]},
        )
        if page.get("ig_user_id"):
            save_social_connection(
                user_id=requester_id, platform="instagram", access_token=page["page_access_token"],
                extra={"ig_user_id": page["ig_user_id"], "page_id": page["id"], "label": page["label"]},
            )
    elif invite["platform"] == "google_business":
        save_social_connection(
            user_id=requester_id, platform="google_business", access_token=access_token,
            refresh_token=invite.get("oauth_refresh_token", ""),
            extra={"account_id": page["account_id"], "location_id": page["location_id"], "label": page["label"]},
        )
    else:
        raise HTTPException(status_code=422, detail=f"{invite['platform']} doesn't use a page-selection step.")

    update_page_invite(invite_token, status="approved", selected_page={"id": page["id"], "label": page["label"]})
    logger.info(f"[social-publish] invite {invite_token} approved: {invite['platform']} page {page['label']!r} connected to user {requester_id}")
    return SelectInvitePageResponse(approved=True, selected_page_label=page["label"])


async def _handle_meta_invite_callback(invite_token: str, code: str):
    """Called from meta_callback when the admin authorized via an invite
    link rather than the direct logged-in-user flow. Fetches EVERY page
    this admin manages (not just the first one) and hands them to the
    frontend's page-picker — the admin, not this app, decides which
    specific page gets connected."""
    invite = get_page_invite(invite_token)
    if not invite or invite["status"] != "pending":
        return _invite_redirect(invite_token, error=True)
    try:
        short_lived = meta.exchange_code_for_token(code)
        long_lived = meta.exchange_for_long_lived_token(short_lived["access_token"])
        user_token = long_lived["access_token"]
        pages = meta.list_pages(user_token)
        if not pages:
            update_page_invite(invite_token, status="pending")  # stays retryable
            logger.warning(f"[social-publish] invite {invite_token}: no Facebook Pages found for this admin")
            return _invite_redirect(invite_token, error=True, reason="No Facebook Pages were returned for this account")

        available = [
            {
                "id": p["id"], "label": p.get("name", p["id"]), "page_access_token": p["access_token"],
                "ig_user_id": (p.get("instagram_business_account") or {}).get("id", ""),
            }
            for p in pages
        ]
        update_page_invite(invite_token, status="pages_ready", available_pages=available, oauth_access_token=user_token)
        return _invite_redirect(invite_token)
    except Exception as e:
        logger.error(f"[social-publish] invite {invite_token} Meta callback failed: {e}", exc_info=True)
        return _invite_redirect(invite_token, error=True, reason=str(e))


async def _handle_linkedin_invite_callback(invite_token: str, code: str):
    """LinkedIn has no page-picker step — w_member_social posts as the
    member themselves, so identifying them IS the whole connection. Goes
    straight to approved, no intermediate 'pick a page' stage."""
    invite = get_page_invite(invite_token)
    if not invite or invite["status"] != "pending":
        return _invite_redirect(invite_token, error=True)
    try:
        tokens = li.exchange_code_for_token(code)
        access_token = tokens["access_token"]
        member = li.get_member_urn(access_token)

        save_social_connection(
            user_id=invite["requested_by_user_id"], platform="linkedin", access_token=access_token,
            refresh_token=tokens.get("refresh_token", ""),
            extra={"person_urn": member["person_urn"], "label": member.get("name") or "LinkedIn profile"},
        )
        update_page_invite(
            invite_token, status="approved",
            selected_page={"id": member["person_urn"], "label": member.get("name") or "LinkedIn profile"},
        )
        logger.info(f"[social-publish] invite {invite_token} approved: LinkedIn profile connected to user {invite['requested_by_user_id']}")
        return _invite_redirect(invite_token)
    except Exception as e:
        logger.error(f"[social-publish] invite {invite_token} LinkedIn callback failed: {e}", exc_info=True)
        return _invite_redirect(invite_token, error=True)


async def _handle_google_business_invite_callback(invite_token: str, code: str):
    """Fetches EVERY location across every account this admin manages, so
    the picker can offer all of them — a Business Profile manager often
    has several locations, not just one."""
    invite = get_page_invite(invite_token)
    if not invite or invite["status"] != "pending":
        return _invite_redirect(invite_token, error=True)
    try:
        tokens = gbp.exchange_code_for_token(code)
        access_token = tokens["access_token"]

        accounts = gbp.list_accounts(access_token)
        available = []
        for account in accounts:
            account_id = account["name"].split("/")[-1]
            locations = gbp.list_locations(access_token, account["name"])
            for loc in locations:
                available.append({
                    "id": loc["name"], "label": loc.get("title", loc["name"]),
                    "account_id": account_id, "location_id": loc["name"].split("/")[-1],
                })

        if not available:
            update_page_invite(invite_token, status="pending")
            logger.warning(f"[social-publish] invite {invite_token}: no Google Business locations found for this admin")
            return _invite_redirect(invite_token, error=True)

        update_page_invite(
            invite_token, status="pages_ready", available_pages=available,
            oauth_access_token=access_token, oauth_refresh_token=tokens.get("refresh_token", ""),
        )
        return _invite_redirect(invite_token)
    except Exception as e:
        logger.error(f"[social-publish] invite {invite_token} Google Business callback failed: {e}", exc_info=True)
        return _invite_redirect(invite_token, error=True)


def _invite_redirect(invite_token: str, error: bool = False, reason: str | None = None):
    """Self-connect (the logged-in user connecting their OWN account,
    return_to_app=True) goes back into THIS app, where the page picker
    modal takes over. A real invite sent to a different page admin (who
    may have no account here at all) goes to the standalone public
    approval page instead."""
    from fastapi.responses import RedirectResponse
    from urllib.parse import quote

    invite = get_page_invite(invite_token)
    if invite and invite.get("return_to_app"):
        result = "error" if error else "pages_ready"
        url = f"{FRONTEND_URL}/?social_publish={result}&invite_token={invite_token}"
        if reason:
            url += f"&reason={quote(reason[:200])}"
        return RedirectResponse(url=url)

    suffix = "?error=1" if error else ""
    if reason:
        suffix += f"&reason={quote(reason[:200])}" if suffix else f"?reason={quote(reason[:200])}"
    return RedirectResponse(url=f"{FRONTEND_URL}/connect-page/{invite_token}{suffix}")


# ── Publish now ──────────────────────────────────────────────────────────────
@router.post("/publish", response_model=PublishResponse, summary="Post a poster (Canva or your own upload) directly to one or more platforms, right now")
async def publish(req: PublishRequest, user_id: str = Depends(get_current_user_id)):
    image_url = _resolve_image_url(user_id, req.poster_id, req.image_url)
    results = publish_to_platforms(user_id, req.platforms, image_url, req.caption, cta_url=req.cta_url)

    # Previously nothing was persisted here at all — an immediate "post
    # now" left no trace once the response was received, so there was no
    # way to see it again in any history/status view (only scheduled posts
    # were ever saved). Reuses the same storage as scheduled posts, just
    # with the outcome already known at save time instead of filled in
    # later by the scheduler.
    successes = sum(1 for r in results if r["success"])
    if successes == len(results):
        overall_status = "posted"
    elif successes == 0:
        overall_status = "failed"
    else:
        overall_status = "partial"

    schedule_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    save_scheduled_post(
        schedule_id=schedule_id, user_id=user_id,
        day_date=req.day_date or datetime.now(timezone.utc).date().isoformat(), post_number=req.post_number,
        platforms=req.platforms, caption=req.caption, image_url=image_url, cta_url=req.cta_url or "",
        scheduled_time_iso=now_iso, status=overall_status,
        results=results,
    )
    logger.info(f"[social-publish] immediate publish {schedule_id} for user={user_id}: {overall_status} ({successes}/{len(results)} succeeded)")

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
        schedule_id=schedule_id, user_id=user_id, day_date=req.day_date, post_number=req.post_number, platforms=req.platforms,
        caption=req.caption, image_url=image_url, cta_url=req.cta_url or "", scheduled_time_iso=scheduled_iso,
    )
    logger.info(f"[social-publish] scheduled post {schedule_id} for user={user_id} at {scheduled_iso}")
    return ScheduleResponse(schedule_id=schedule_id, scheduled_time=scheduled_iso, status="pending")


@router.get("/scheduled", response_model=ScheduledPostListResponse, summary="List your scheduled posts (any status)")
async def scheduled_posts(user_id: str = Depends(get_current_user_id)):
    items = list_scheduled_posts_for_user(user_id)
    return ScheduledPostListResponse(items=[
        ScheduledPostSummary(
            schedule_id=i["schedule_id"], day_date=i.get("day_date", ""), post_number=i.get("post_number"), platforms=i.get("platforms", []),
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


@router.post("/scheduled/{schedule_id}/retry", response_model=ScheduledPostSummary, summary="Retry a failed or partially-failed post")
async def retry_scheduled(schedule_id: str, user_id: str = Depends(get_current_user_id)):
    post = get_scheduled_post(schedule_id)
    if not post or post.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="No scheduled post found with that id for your account")
    if post.get("status") not in ("failed", "partial"):
        raise HTTPException(
            status_code=409,
            detail=f"Only failed or partially-failed posts can be retried (this one is {post.get('status')!r}).",
        )

    # Re-attempts every platform this post targeted, not just the ones
    # that failed last time — a platform that succeeded before should
    # still succeed again (same image/caption), and re-running it is
    # harmless; the alternative (tracking exactly which platforms still
    # need it) adds real complexity for a case where a duplicate
    # successful post is a minor, visible thing, not a hidden problem.
    results = publish_to_platforms(user_id, post["platforms"], post["image_url"], post["caption"], cta_url=post.get("cta_url") or None)
    successes = sum(1 for r in results if r["success"])
    overall_status = "posted" if successes == len(results) else ("partial" if successes > 0 else "failed")
    update_scheduled_post_status(schedule_id, overall_status, results=results)
    logger.info(f"[social-publish] retry {schedule_id} for user={user_id}: {overall_status} ({successes}/{len(results)} succeeded)")

    return ScheduledPostSummary(
        schedule_id=schedule_id, day_date=post.get("day_date", ""), post_number=post.get("post_number"), platforms=post.get("platforms", []),
        caption=post.get("caption", ""), image_url=post.get("image_url", ""), scheduled_time=post.get("scheduled_time", ""),
        status=overall_status, results=results,
    )



