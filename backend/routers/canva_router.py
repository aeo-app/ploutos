"""
routers/canva_router.py — Canva Connect API integration
============================================================
Lets a user connect their Canva account (must be a member of the connected
Canva Enterprise org — see services/canva_service.py) and generate posters
for the relocation social media calendar from a Brand Template, including
"replace all images and recreate" via re-running the autofill job with a new
set of image field values.
"""
from __future__ import annotations

import logging
import os
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import RedirectResponse

from core.security import get_current_user_id
from db import (
    get_canva_connection,
    get_canva_pkce,
    get_poster,
    list_posters,
    save_canva_connection,
    save_canva_pkce,
    save_poster,
)
from models.canva_models import (
    AssetUploadResponse,
    BrandTemplateDatasetResponse,
    BrandTemplateFieldInfo,
    BrandTemplateInfo,
    CanvaConnectResponse,
    CanvaStatusResponse,
    CreatePosterRequest,
    ExportPosterResponse,
    PosterListResponse,
    PosterResponse,
    RegeneratePosterRequest,
)
from services.canva_service import (
    CanvaError,
    build_authorize_url,
    create_autofill_job,
    create_export_job,
    exchange_code_for_tokens,
    generate_pkce_pair,
    get_brand_template_dataset,
    list_brand_templates,
    poll_autofill_job,
    poll_export_job,
    refresh_access_token,
    upload_asset_from_bytes,
    upload_asset_from_url,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/canva", tags=["Canva"])

# Absolute URL, not a relative path — a relative "/" redirect only lands on
# the frontend if it happens to share the exact same origin as this backend
# (true in some production setups, but NOT in local dev, where the backend
# typically runs on a different port than the React dev server — a relative
# redirect there just hits this backend's own root endpoint instead of the
# frontend at all). Same fix as routers/social_publish_router.py's
# FRONTEND_URL.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
FRONTEND_RETURN_PATH = f"{FRONTEND_URL}/?canva="


def _record_to_poster_response(item: dict) -> PosterResponse:
    return PosterResponse(
        poster_id=item["poster_id"],
        day_date=item["day_date"],
        post_number=item["post_number"],
        brand_template_id=item["brand_template_id"],
        design_id=item["design_id"],
        edit_url=item["edit_url"],
        thumbnail_url=item["thumbnail_url"],
        image_field_values=item.get("image_field_values", {}),
        text_field_values=item.get("text_field_values", {}),
        created_at=item.get("created_at"),
        updated_at=item.get("updated_at"),
    )


def _get_valid_access_token(user_id: str) -> str:
    """Returns a live Canva access token for this user, refreshing it first
    if it's expired. Raises 428 (Precondition Required) if never connected —
    distinct from a generic 401/403 so the frontend can prompt "Connect
    Canva" specifically rather than showing a generic auth error."""
    conn = get_canva_connection(user_id)
    if not conn:
        raise HTTPException(status_code=428, detail="Canva is not connected for this account yet.")

    expires_at = conn.get("expires_at")
    try:
        is_expired = expires_at and datetime.fromisoformat(expires_at.replace("Z", "+00:00")) <= datetime.now(timezone.utc)
    except (ValueError, AttributeError):
        is_expired = True  # malformed timestamp — fail safe by refreshing

    if not is_expired:
        return conn["access_token"]

    try:
        tokens = refresh_access_token(conn["refresh_token"])
    except CanvaError as e:
        raise HTTPException(status_code=428, detail=f"Canva session expired — please reconnect. ({e})")

    new_expires_at = (
        datetime.now(timezone.utc).timestamp() + tokens.get("expires_in", 4 * 3600)
    )
    new_expires_iso = datetime.fromtimestamp(new_expires_at, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    save_canva_connection(
        user_id=user_id,
        access_token=tokens["access_token"],
        refresh_token=tokens.get("refresh_token", conn["refresh_token"]),  # Canva may or may not rotate it
        expires_at=new_expires_iso,
        canva_user_id=conn.get("canva_user_id", ""),
    )
    return tokens["access_token"]


# ── OAuth connect flow ───────────────────────────────────────────────────────
@router.get("/connect", response_model=CanvaConnectResponse, summary="Get the Canva authorize URL to start connecting")
async def connect(user_id: str = Depends(get_current_user_id)):
    verifier, challenge = generate_pkce_pair()
    # user_id is embedded in `state` (not just a random token) because the
    # /callback redirect comes straight from Canva to the user's browser,
    # with no Authorization header of ours to identify who's completing the
    # flow — this is the only way that endpoint can know whose PKCE record
    # to look up.
    state = f"{user_id}:{secrets.token_urlsafe(24)}"
    save_canva_pkce(user_id, state, verifier)
    return CanvaConnectResponse(authorize_url=build_authorize_url(state, challenge))


@router.get("/callback", summary="Canva OAuth redirect target — exchanges the code and stores the connection")
async def callback(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    error_description: str | None = Query(None),
):
    # code/state are deliberately NOT required at the FastAPI level (unlike
    # a normal endpoint) — if either is missing, or Canva sent an explicit
    # error instead (e.g. the user denied access, or a redirect_uri
    # mismatch — see error_description), FastAPI's automatic validation
    # would otherwise reject the request with a raw 422 JSON body BEFORE
    # this function even runs, which is exactly the kind of "stuck on a
    # confusing backend response" experience the broad except below exists
    # to avoid — that fix only covers failures INSIDE this function, not
    # ones that never reach it. Handling all of this here means every
    # outcome — success, Canva-reported error, or a malformed callback —
    # ends the same way: a clean redirect back to the frontend.
    if error or not code or not state:
        logger.warning(
            f"[canva] OAuth callback incomplete or errored: error={error!r}, "
            f"error_description={error_description!r}, code_present={bool(code)}, state_present={bool(state)}"
        )
        return RedirectResponse(url=f"{FRONTEND_RETURN_PATH}error")
    try:
        user_id, sep, _ = state.partition(":")
        if not sep or not user_id:
            raise ValueError("malformed state")
        pkce = get_canva_pkce(user_id, state)
        if not pkce:
            raise HTTPException(status_code=400, detail="Unknown or expired OAuth state")

        tokens = exchange_code_for_tokens(code, pkce["code_verifier"])
        expires_at = (
            datetime.now(timezone.utc).timestamp() + tokens.get("expires_in", 4 * 3600)
        )
        expires_iso = datetime.fromtimestamp(expires_at, tz=timezone.utc).isoformat().replace("+00:00", "Z")
        save_canva_connection(
            user_id=user_id,
            access_token=tokens["access_token"],
            refresh_token=tokens["refresh_token"],
            expires_at=expires_iso,
        )
        return RedirectResponse(url=f"{FRONTEND_RETURN_PATH}connected")
    except Exception as e:
        # Broad on purpose: whatever goes wrong here (a malformed token
        # response missing an expected key, a network hiccup calling
        # Canva, anything), the browser still needs to land back on the
        # frontend with an error status — not a raw, unhandled 500 stuck
        # at this backend URL, which is much harder to make sense of and
        # leaves no way back into the app without manually re-navigating.
        logger.error(f"[canva] OAuth callback failed: {e}", exc_info=True)
        return RedirectResponse(url=f"{FRONTEND_RETURN_PATH}error")


@router.get("/status", response_model=CanvaStatusResponse, summary="Is Canva connected for this account?")
async def status(user_id: str = Depends(get_current_user_id)):
    return CanvaStatusResponse(connected=get_canva_connection(user_id) is not None)


# ── Brand templates ──────────────────────────────────────────────────────────
@router.get("/brand-templates", response_model=list[BrandTemplateInfo], summary="List the connected account's brand templates")
async def brand_templates(user_id: str = Depends(get_current_user_id)):
    token = _get_valid_access_token(user_id)
    try:
        templates = list_brand_templates(token)
    except CanvaError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return [
        BrandTemplateInfo(id=t["id"], title=t.get("title", "Untitled"), thumbnail_url=t.get("thumbnail", {}).get("url"))
        for t in templates
    ]


@router.get(
    "/brand-templates/{brand_template_id}/dataset",
    response_model=BrandTemplateDatasetResponse,
    summary="Get a brand template's autofillable fields (text/image)",
)
async def brand_template_dataset(brand_template_id: str, user_id: str = Depends(get_current_user_id)):
    token = _get_valid_access_token(user_id)
    try:
        dataset = get_brand_template_dataset(token, brand_template_id)
    except CanvaError as e:
        raise HTTPException(status_code=502, detail=str(e))
    fields = [BrandTemplateFieldInfo(name=name, type=info.get("type", "text")) for name, info in dataset.items()]
    return BrandTemplateDatasetResponse(brand_template_id=brand_template_id, fields=fields)


# ── Posters ──────────────────────────────────────────────────────────────────
def _run_autofill(
    token: str, brand_template_id: str, text_fields: dict,
    image_urls: dict, image_asset_ids: dict | None = None,
) -> tuple[dict, dict]:
    """Uploads any image URLs as Canva assets (image_asset_ids are already
    uploaded — see POST /canva/assets/upload — and used directly), runs the
    autofill job, and returns (design_result, image_field_values_used) for
    bookkeeping on the saved poster record."""
    image_asset_ids = image_asset_ids or {}
    data: dict = {name: {"type": "text", "text": value} for name, value in text_fields.items()}
    used_images: dict = {}

    for field_name, asset_id in image_asset_ids.items():
        data[field_name] = {"type": "image", "asset_id": asset_id}
        used_images[field_name] = asset_id

    for field_name, url in image_urls.items():
        if field_name in image_asset_ids:
            continue  # an explicit asset_id for this field takes priority over a URL
        asset_id = upload_asset_from_url(token, url, name=f"{field_name}.jpg")
        data[field_name] = {"type": "image", "asset_id": asset_id}
        used_images[field_name] = url

    job_id = create_autofill_job(token, brand_template_id, data)
    design = poll_autofill_job(token, job_id)
    return design, used_images


@router.post(
    "/assets/upload",
    response_model=AssetUploadResponse,
    summary="Upload an image file directly (e.g. a user replacing a poster image from their device)",
)
async def upload_asset(user_id: str = Depends(get_current_user_id), file: UploadFile = File(...)):
    token = _get_valid_access_token(user_id)
    contents = await file.read()
    try:
        asset_id = upload_asset_from_bytes(token, contents, name=file.filename or "upload.jpg")
    except CanvaError as e:
        raise HTTPException(status_code=502, detail=f"Could not upload image: {e}")
    return AssetUploadResponse(asset_id=asset_id, name=file.filename or "upload.jpg")


@router.post("/posters", response_model=PosterResponse, summary="Create a poster from a brand template for one calendar post")
async def create_poster(req: CreatePosterRequest, user_id: str = Depends(get_current_user_id)):
    token = _get_valid_access_token(user_id)
    try:
        design, used_images = _run_autofill(token, req.brand_template_id, req.text_fields, req.image_urls, req.image_asset_ids)
    except CanvaError as e:
        raise HTTPException(status_code=502, detail=f"Could not create poster: {e}")

    poster_id = str(uuid.uuid4())
    save_poster(
        user_id=user_id,
        poster_id=poster_id,
        day_date=req.day_date,
        post_number=req.post_number,
        brand_template_id=req.brand_template_id,
        design_id=design["design_id"],
        edit_url=design["edit_url"],
        thumbnail_url=design["thumbnail_url"],
        image_field_values=used_images,
        text_field_values=req.text_fields,
    )
    saved = get_poster(user_id, poster_id)
    return _record_to_poster_response(saved)


@router.post(
    "/posters/{poster_id}/regenerate",
    response_model=PosterResponse,
    summary="Replace images (and/or text) and recreate the poster from the same brand template",
)
async def regenerate_poster(poster_id: str, req: RegeneratePosterRequest, user_id: str = Depends(get_current_user_id)):
    existing = get_poster(user_id, poster_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Poster {poster_id} not found")

    token = _get_valid_access_token(user_id)
    # Fall back to the poster's existing values for anything not explicitly
    # overridden in this regenerate call, so callers only need to send what
    # they're actually changing (e.g. just new images, same captions).
    text_fields = {**existing.get("text_field_values", {}), **req.text_fields}
    replacing_images = bool(req.image_urls or req.image_asset_ids)
    image_urls = req.image_urls if replacing_images else existing.get("image_field_values", {})
    image_asset_ids = req.image_asset_ids

    try:
        design, used_images = _run_autofill(token, existing["brand_template_id"], text_fields, image_urls, image_asset_ids)
    except CanvaError as e:
        raise HTTPException(status_code=502, detail=f"Could not regenerate poster: {e}")

    save_poster(
        user_id=user_id,
        poster_id=poster_id,
        day_date=existing["day_date"],
        post_number=existing["post_number"],
        brand_template_id=existing["brand_template_id"],
        design_id=design["design_id"],
        edit_url=design["edit_url"],
        thumbnail_url=design["thumbnail_url"],
        image_field_values=used_images,
        text_field_values=text_fields,
    )
    saved = get_poster(user_id, poster_id)
    return _record_to_poster_response(saved)


@router.get("/posters", response_model=PosterListResponse, summary="List your saved posters")
async def posters(user_id: str = Depends(get_current_user_id)):
    items = list_posters(user_id)
    return PosterListResponse(items=[_record_to_poster_response(i) for i in items])


@router.post("/posters/{poster_id}/export", response_model=ExportPosterResponse, summary="Export the poster's current design to an image file")
async def export_poster(poster_id: str, user_id: str = Depends(get_current_user_id)):
    existing = get_poster(user_id, poster_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Poster {poster_id} not found")
    token = _get_valid_access_token(user_id)
    try:
        job_id = create_export_job(token, existing["design_id"], export_format="png")
        urls = poll_export_job(token, job_id)
    except CanvaError as e:
        raise HTTPException(status_code=502, detail=f"Could not export poster: {e}")
    return ExportPosterResponse(export_urls=urls)
