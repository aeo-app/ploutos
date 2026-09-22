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

import hashlib
import logging
import os
import secrets
import uuid

import requests
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import RedirectResponse

from core.security import get_current_user_id, require_admin
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
    AutoGeneratePosterRequest,
    BrandTemplateDatasetResponse,
    BrandTemplateFieldInfo,
    BrandTemplateInfo,
    CanvaConnectResponse,
    CanvaStatusResponse,
    CreatePosterRequest,
    EditInCanvaRequest,
    ExportPosterResponse,
    GeneratePosterRequest,
    PosterListResponse,
    PosterResponse,
    RegeneratePosterRequest,
)
from services.canva_service import (
    CanvaError,
    build_authorize_url,
    create_autofill_job,
    create_design_with_asset,
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
from services.image_generation_service import ImageGenerationError, generate_image_from_prompt
from services.media_upload_service import upload_image
from services.openai_image_service import OpenAIImageError
from services.openai_image_service import generate_image_from_prompt as generate_image_via_openai

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
        source=item.get("source", "openai"),
        poster_image_url=item.get("poster_image_url"),
        brand_template_id=item.get("brand_template_id"),
        design_id=item.get("design_id"),
        edit_url=item.get("edit_url"),
        thumbnail_url=item.get("thumbnail_url"),
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


def _select_template_for_post(templates: list[dict], day_date: str, post_number: int, category: str = "") -> dict:
    """
    Deterministic selection across the account's available Brand Templates —
    NOT always the first/same one. The same exact post (day_date +
    post_number) always maps to the same template if regenerated, but
    different posts spread across whatever templates exist. When a
    category is given, all posts in that category land on the same
    template (so a recognizable structure can emerge per content category
    without hardcoding a category->template mapping) while different
    categories are spread across different templates — the account owner
    still controls the actual look by how they design each template.
    """
    if not templates:
        raise ValueError("no templates available")
    if len(templates) == 1:
        return templates[0]
    seed_key = category.strip().lower() or f"{day_date}#{post_number}"
    idx = int(hashlib.sha256(seed_key.encode()).hexdigest(), 16) % len(templates)
    return templates[idx]


def _best_effort_field_mapping(fields: list[dict], caption: str, cta: str) -> dict:
    """Best-effort match of a template's actual text field names to the
    post's caption/cta — template authors name fields however they like,
    so this can't assume an exact name. Falls back to caption for anything
    unmatched rather than leaving a field empty."""
    text_fields = {}
    for f in fields:
        if f.get("type") != "text":
            continue
        name_lower = f["name"].strip().lower()
        if any(k in name_lower for k in ("cta", "button", "action")):
            text_fields[f["name"]] = cta or caption
        else:
            text_fields[f["name"]] = caption
    return text_fields


async def _auto_generate_poster(user_id: str, req: AutoGeneratePosterRequest) -> PosterResponse:
    """Shared by the regular and admin auto-generate endpoints. Picks a
    template, generates a genuinely new image from visual_suggestion
    (rather than reusing whatever was manually uploaded before), and runs
    the normal autofill flow — see module docstring on why this exists at
    all (Canva's Autofill API stamps one fixed layout; it can't design a
    new layout or pick its own image, so both of those have to happen
    before autofill is even called)."""
    token = _get_valid_access_token(user_id)

    templates = list_brand_templates(token)
    if not templates:
        raise HTTPException(
            status_code=422,
            detail="No Brand Templates found in your connected Canva account. Create one in "
                   "Canva first (design it, add autofill data fields, publish as a Brand Template) "
                   "before posters can be auto-generated.",
        )
    template = _select_template_for_post(templates, req.day_date, req.post_number, req.category)

    dataset = get_brand_template_dataset(token, template["id"])
    fields = [{"name": name, "type": info.get("type", "text")} for name, info in dataset.items()]
    image_fields = [f for f in fields if f["type"] == "image"]
    if not image_fields:
        raise HTTPException(
            status_code=422,
            detail=f"Brand Template '{template.get('title', template['id'])}' has no image fields — "
                   f"add at least one image data field in Canva's Data autofill app before using it here.",
        )

    try:
        image_bytes = generate_image_from_prompt(req.visual_suggestion)
        asset_id = upload_asset_from_bytes(token, image_bytes, name=f"{req.day_date}-post{req.post_number}.png")
    except ImageGenerationError as e:
        raise HTTPException(status_code=502, detail=f"Could not generate an image for this poster: {e}")
    except CanvaError as e:
        raise HTTPException(status_code=502, detail=f"Could not upload the generated image to Canva: {e}")

    image_asset_ids = {f["name"]: asset_id for f in image_fields}
    text_fields = _best_effort_field_mapping(fields, req.caption, req.cta)

    try:
        design, used_images = _run_autofill(token, template["id"], text_fields, {}, image_asset_ids)
    except CanvaError as e:
        raise HTTPException(status_code=502, detail=f"Could not generate the poster: {e}")

    poster_id = str(uuid.uuid4())
    save_poster(
        user_id=user_id, poster_id=poster_id, day_date=req.day_date, post_number=req.post_number,
        brand_template_id=template["id"], design_id=design["design_id"], edit_url=design["edit_url"],
        thumbnail_url=design["thumbnail_url"], image_field_values=used_images, text_field_values=text_fields,
    )
    logger.info(f"[canva] auto-generated poster {poster_id} for user={user_id} using template={template['id']}")
    return _record_to_poster_response(get_poster(user_id, poster_id))


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
    "/posters/auto-generate",
    response_model=PosterResponse,
    summary="Fully automatic poster: picks a Brand Template and generates a new image from visual_suggestion — no manual template/field selection needed",
)
async def auto_generate_poster(req: AutoGeneratePosterRequest, user_id: str = Depends(get_current_user_id)):
    return await _auto_generate_poster(user_id, req)


@router.post(
    "/posters/generate",
    response_model=PosterResponse,
    summary="Generate a poster via OpenAI — the primary poster-generation path for every user, no Canva involved",
)
async def generate_poster(req: GeneratePosterRequest, user_id: str = Depends(get_current_user_id)):
    """
    The new "Create Poster" button's actual target. Generates one image
    from `visual_suggestion` (unchanged in meaning — still exactly what
    drives what the poster looks like) via OpenAI, stores it directly
    (no Canva design, autofill, or template involved at all), and saves
    a poster record with source="openai".

    Deliberately on-demand only — nothing calls this automatically when
    a calendar is created; it only runs when this endpoint is actually
    hit, i.e. when the user clicks "Create Poster" for one specific day.
    """
    try:
        image_bytes = generate_image_via_openai(req.visual_suggestion, width=1080, height=1080)
    except OpenAIImageError as e:
        raise HTTPException(status_code=502, detail=f"Could not generate an image for this poster: {e}")

    try:
        image_url = upload_image(image_bytes, filename=f"{req.day_date}-post{req.post_number}.png", user_id=user_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Generated the image but could not store it: {e}")

    # Same poster_id for the same day/post across regenerations (matches
    # the existing Canva-autofill path's behavior) — a repeat "Create
    # Poster" click on a day that already has one overwrites it rather
    # than accumulating duplicate poster records.
    existing = next(
        (p for p in list_posters(user_id) if p.get("day_date") == req.day_date and p.get("post_number") == req.post_number),
        None,
    )
    poster_id = existing["poster_id"] if existing else str(uuid.uuid4())

    save_poster(
        user_id=user_id, poster_id=poster_id, day_date=req.day_date, post_number=req.post_number,
        source="openai", poster_image_url=image_url,
        # Explicitly clear any Canva fields from a PREVIOUS "edit in
        # Canva" pass on this exact poster_id — a freshly (re)generated
        # OpenAI image invalidates whatever design was built from the old
        # one, so the stale edit_url/design_id shouldn't linger and look
        # current when they no longer reflect this image at all.
        brand_template_id="", design_id="", edit_url="", thumbnail_url="",
    )
    logger.info(f"[canva] generated poster {poster_id} via OpenAI for user={user_id}, day={req.day_date} post={req.post_number}")
    return _record_to_poster_response(get_poster(user_id, poster_id))


@router.post(
    "/posters/edit-in-canva",
    response_model=PosterResponse,
    summary="Admin-only: send an already-generated poster's image to Canva for manual editing",
)
async def edit_poster_in_canva(req: EditInCanvaRequest, admin_id: str = Depends(require_admin)):
    """
    The only way Canva re-enters the picture at all now — takes a poster
    that already has an OpenAI-generated image (from generate_poster
    above) and hands that image to Canva as a genuinely editable design,
    rather than generating anything new. Admin-only: require_admin is the
    same DynamoDB-backed role check used throughout routers/admin_router.py.

    Uses create_design_with_asset (a plain design with the image dropped
    in), not Autofill — Autofill needs a pre-built Brand Template with
    matching data fields, which doesn't fit "edit this one already-
    finished image freely" at all.
    """
    poster = get_poster(admin_id, req.poster_id)
    if not poster:
        raise HTTPException(status_code=404, detail=f"No poster found with id '{req.poster_id}' for this account.")
    if not poster.get("poster_image_url"):
        raise HTTPException(status_code=422, detail="This poster has no generated image yet — create it first, then edit in Canva.")

    token = _get_valid_access_token(admin_id)
    try:
        asset_id = upload_asset_from_url(token, poster["poster_image_url"], name=f"poster-{req.poster_id}.png")
        design = create_design_with_asset(token, asset_id, title=f"Poster — {poster['day_date']} #{poster['post_number']}")
    except CanvaError as e:
        raise HTTPException(status_code=502, detail=f"Could not open this poster in Canva: {e}")

    save_poster(
        user_id=admin_id, poster_id=req.poster_id, day_date=poster["day_date"], post_number=poster["post_number"],
        source="canva", design_id=design["design_id"], edit_url=design["edit_url"], thumbnail_url=design["thumbnail_url"],
    )
    logger.info(f"[canva] admin={admin_id} sent poster {req.poster_id} to Canva for editing, design={design['design_id']}")
    return _record_to_poster_response(get_poster(admin_id, req.poster_id))


@router.post(
    "/posters/sync-from-canva",
    response_model=PosterResponse,
    summary="Admin-only: pull the latest edited version of a poster back from Canva",
)
async def sync_poster_from_canva(req: EditInCanvaRequest, admin_id: str = Depends(require_admin)):
    """
    Canva's editor has no live sync or webhook back to this app — an
    admin editing a design in the Canva tab that edit_poster_in_canva
    opened doesn't automatically update anything here. This is the
    explicit step that closes that loop: request an export of the
    design's CURRENT state from Canva, download the result, and store it
    as this poster's new image — the same way the original OpenAI image
    was stored, so every other part of the app (publish, download) keeps
    working on a single, ordinary poster_image_url with no special case
    for "this one came from Canva."

    Only meaningful on a poster that's actually been sent to Canva
    (source == "canva", i.e. edit_poster_in_canva has run on it) — there
    is nothing to sync back from otherwise.
    """
    poster = get_poster(admin_id, req.poster_id)
    if not poster:
        raise HTTPException(status_code=404, detail=f"No poster found with id '{req.poster_id}' for this account.")
    if not poster.get("design_id"):
        raise HTTPException(status_code=422, detail="This poster hasn't been sent to Canva yet — nothing to sync back.")

    token = _get_valid_access_token(admin_id)
    try:
        job_id = create_export_job(token, poster["design_id"])
        export_urls = poll_export_job(token, job_id)
    except CanvaError as e:
        raise HTTPException(status_code=502, detail=f"Could not export the edited design from Canva: {e}")
    if not export_urls:
        raise HTTPException(status_code=502, detail="Canva's export finished but returned no file.")

    # Canva's export URLs are temporary — downloaded and re-stored in our
    # own media storage immediately, same as every other image this app
    # keeps, rather than pointing poster_image_url at a link that could
    # expire later.
    try:
        exported_bytes = requests.get(export_urls[0], timeout=30).content
        new_image_url = upload_image(exported_bytes, filename=f"{poster['day_date']}-post{poster['post_number']}-canva.png", user_id=admin_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Exported from Canva but could not save the result: {e}")

    save_poster(
        user_id=admin_id, poster_id=req.poster_id, day_date=poster["day_date"], post_number=poster["post_number"],
        source="canva", poster_image_url=new_image_url,
        # thumbnail_url previously pointed at a stale render from before
        # this edit — clear it so nothing keeps showing an outdated
        # preview now that poster_image_url itself is the fresh export.
        thumbnail_url="",
    )
    logger.info(f"[canva] admin={admin_id} synced poster {req.poster_id} back from Canva design={poster['design_id']}")
    return _record_to_poster_response(get_poster(admin_id, req.poster_id))


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
