"""
routers/aeo_router.py — endpoints behind the AEO dashboard
===========================================================
  POST /api/v1/aeo/prompts          Top prompts + per-engine visibility + competitor share of voice
  POST /api/v1/aeo/strategy         Plan + blog topics for ONE prompt          (free: trimmed preview)
  POST /api/v1/aeo/blog-draft       Draft one blog topic                        (paid)
  POST /api/v1/aeo/social-posts     4 posts x 5 channels for ONE prompt         (free: 1 per channel)
  POST /api/v1/aeo/site-checks      Real checks of the customer's own website
  GET  /api/v1/aeo/state            Saved custom prompts/competitors, selection, links, approvals
  PUT  /api/v1/aeo/state            Replace any of those fields
  PUT/DELETE /api/v1/aeo/social-links   Manually linked social channels

Handlers are plain `def` (not `async def`) on purpose: they block on Bedrock or
on HTTP fetches, and FastAPI runs plain `def` handlers in its thread pool
instead of stalling the event loop.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone
from typing import Callable, Optional

from pydantic import BaseModel, Field
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Response, UploadFile

from core.security import get_current_user_id, require_paid_access
from db import (
    AeoStateTooLargeError,
    DomainMismatchError,
    check_and_lock_domain,
    get_aeo_content,
    get_aeo_state,
    list_aeo_content,
    get_user_domain_lock,
    is_user_paid,
    save_aeo_content,
    save_aeo_state,
    save_analysis,
)
from db.dynamo import normalize_domain
from models.aeo_models import (
    CALENDAR_PROMPT,
    BlogTopicIdea,
    AeoBlogDraftRequest,
    AeoBlogDraftResponse,
    AeoPromptsRequest,
    AeoSocialRequest,
    AeoSocialResponse,
    AeoState,
    AeoStatePatch,
    AeoStrategyRequest,
    AeoStrategyResponse,
    SiteChecksRequest,
    SiteChecksResponse,
    SocialLinkRequest,
)
from services.aeo_service import (
    generate_aeo_blog_draft,
    generate_aeo_prompts,
    generate_aeo_social,
    social_shape_ok,
    generate_aeo_strategy,
    normalise_social_link,
    run_site_checks,
)
from services.bedrock_service import TokenUsageTracker
from services import brand_service as brand_svc
from services.aeo_service import _safe_get, clean_keywords, suggest_site_keywords
from services.brand_overlay import normalise_logo, validate_logo
from services.media_upload_service import MediaUploadError, signed_view_url, upload_image
from services.site_contact_service import analyse_site
from services import short_jobs
from services.media_upload_service import upload_video
from services.shorts_service import ShortError, check_uploaded_short, to_mp4

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/aeo", tags=["AEO Dashboard"])


def _enforce_domain(user_id: str, url: str, company_name: str) -> None:
    """Same one-user-one-domain rule as every other analysis endpoint."""
    try:
        check_and_lock_domain(user_id, url, company_name)
    except DomainMismatchError as e:
        raise HTTPException(status_code=403, detail=str(e))


def _cached_or_generate(
    user_id: str, kind: str, key: str, refresh: bool, response_cls, generate: Callable[[TokenUsageTracker], object],
    valid: Optional[Callable[[dict], bool]] = None,
):
    """Generated assets are stored per (kind, prompt/title) so a page reload — or
    a second click — returns the saved copy instead of paying for Bedrock again."""
    saved = get_aeo_content(user_id, kind, key)
    # Work our team has edited is never overwritten by a regeneration.
    if saved and saved.get("team"):
        refresh = False
    if saved and valid and not saved.get("team") and not valid(saved):
        saved = None                       # an older shape (e.g. the old 4-posts-per-channel calendar) — build the new one
    if not refresh:
        if saved:
            try:
                return response_cls(**{**saved, "cached": True})
            except Exception:  # stale shape from an older version — regenerate
                logger.warning(f"[aeo] cached {kind} for user={user_id} no longer matches the schema; regenerating")
    try:
        tracker = TokenUsageTracker()
        result = generate(tracker)
    except Exception as e:
        logger.error(f"[aeo] {kind} generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Could not generate this right now: {e}")
    try:
        save_aeo_content(user_id, kind, key, json.loads(result.model_dump_json()))
    except Exception as e:  # never lose a paid-for generation because the cache write failed
        logger.error(f"[aeo] saving {kind} failed: {e}", exc_info=True)
    return result


# ── Prompt visibility ─────────────────────────────────────────────────────────
@router.post("/prompts", summary="Top prompts, per-engine visibility estimates and competitor share of voice")
def prompts(req: AeoPromptsRequest, user_id: str = Depends(get_current_user_id)):
    _enforce_domain(user_id, req.url, req.company_name)
    try:
        tracker = TokenUsageTracker()
        result = generate_aeo_prompts(req, usage_tracker=tracker, is_paid=is_user_paid(user_id))
        token_usage = tracker.as_dict()
    except Exception as e:
        logger.error(f"[aeo] prompts failed: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Could not analyse prompts right now: {e}")

    data = json.loads(result.model_dump_json())
    try:
        aid = save_analysis(
            user_id=user_id, analysis_type="aeo_prompts", company_name=req.company_name, url=req.url,
            market=req.market, industry=req.industry, result=data, request_data=req.model_dump(),
            status="success", token_usage=token_usage,
        )
    except Exception as e:
        logger.error(f"[aeo] saving prompts analysis failed: {e}", exc_info=True)
        aid = "save-failed"
    data["_meta"] = {"analysis_id": aid, "user_id": user_id, "token_usage": token_usage}
    return data


# ── Per-prompt content (free = trimmed preview; blog drafts are paid) ─────────────────────────────────────────────────
def _with_team_blogs(user_id: str, prompt: str, result):
    """Blogs our team wrote for this prompt always appear in its topic list."""
    try:
        have = {t.title.strip().lower() for t in result.blog_topics}
        extra = []
        for c in list_aeo_content(user_id):
            d = c["data"]
            title = str(d.get("title", "")).strip()
            if c["kind"] == "blog" and d.get("prompt") == prompt and d.get("team") and title and title.lower() not in have:
                extra.append(BlogTopicIdea(type=str(d.get("type") or "Blog")[:40], title=title, words=1000))
                have.add(title.lower())
        if extra:
            return result.model_copy(update={"blog_topics": [*result.blog_topics, *extra]})
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[aeo] merging team blogs failed: {e}")
    return result


@router.post("/strategy", response_model=AeoStrategyResponse, summary="Strategy and blog topics for one prompt")
def strategy(req: AeoStrategyRequest, user_id: str = Depends(get_current_user_id)):
    # Free accounts get a trimmed preview (cheaper to generate); paid accounts get everything.
    _enforce_domain(user_id, req.url, req.company_name)
    limited = not is_user_paid(user_id)
    result = _cached_or_generate(
        user_id, "strategy", req.prompt + ("|free" if limited else ""), req.refresh, AeoStrategyResponse,
        lambda t: generate_aeo_strategy(req, usage_tracker=t, limited=limited),
    )
    return _with_team_blogs(user_id, req.prompt, result)


@router.post("/blog-draft", response_model=AeoBlogDraftResponse, summary="Draft one blog topic")
def blog_draft(req: AeoBlogDraftRequest, user_id: str = Depends(get_current_user_id)):
    _enforce_domain(user_id, req.url, req.company_name)
    # Reading an existing draft (including one written by our team) is free; generating a new one is paid.
    if not get_aeo_content(user_id, "blog", f"{req.prompt}|{req.title}") and not is_user_paid(user_id):
        raise HTTPException(status_code=402, detail="Blog drafts are part of a paid plan.")
    return _cached_or_generate(
        user_id, "blog", f"{req.prompt}|{req.title}", req.refresh, AeoBlogDraftResponse,
        lambda t: generate_aeo_blog_draft(req, usage_tracker=t),
    )


def _social_key(prompt: str, limited: bool, cycle: int = 0) -> str:
    """Month 1 keeps the original key (so the team's edits stay attached); later months get their own."""
    return prompt + ("|free" if limited else "") + (f"|m{cycle}" if cycle else "")


def _adopt_team_calendar(user_id: str, key: str, limited: bool) -> None:
    """The calendar used to be one per AI prompt. If our team already edited one in the new weekly format, carry the newest into the keyword calendar."""
    try:
        docs = [c for c in list_aeo_content(user_id)
                if c["kind"] == "social" and c["data"].get("team") and bool(c["data"].get("limited")) == limited and social_shape_ok(c["data"], limited)]
        if docs:
            best = max(docs, key=lambda c: c.get("updated_at", ""))
            doc = {**best["data"], "prompt": CALENDAR_PROMPT}
            doc.pop("cached", None)
            save_aeo_content(user_id, "social", key, doc)
    except Exception as e:  # noqa: BLE001 — never block the calendar over this
        logger.info(f"[aeo] could not carry over the team's calendar: {e}")


@router.post("/social-posts", response_model=AeoSocialResponse, summary="A month of posters and reels for each channel, for one prompt")
def social_posts(req: AeoSocialRequest, user_id: str = Depends(get_current_user_id)):
    _enforce_domain(user_id, req.url, req.company_name)
    limited = not is_user_paid(user_id)
    if limited and req.cycle:
        raise HTTPException(status_code=402, detail="Later months are part of the paid plans.")
    key = _social_key(req.prompt, limited, req.cycle)
    if req.prompt == CALENDAR_PROMPT and not req.cycle and not get_aeo_content(user_id, "social", key):
        _adopt_team_calendar(user_id, key, limited)
    res = _cached_or_generate(
        user_id, "social", key, req.refresh, AeoSocialResponse,
        lambda t: generate_aeo_social(req, usage_tracker=t, limited=limited),
        valid=lambda d: social_shape_ok(d, limited),
    )
    # The calendar is built around keywords — the user's own, or the top 10 taken from their website
    # when they gave none. Remember them so the user can see and edit them.
    try:
        kws = clean_keywords(getattr(res, "keywords", []))
        if kws:
            st = get_aeo_state(user_id)
            if not (st.get("calendar_keywords") or []):
                st["calendar_keywords"] = kws
                save_aeo_state(user_id, AeoState(**st).model_dump())
    except Exception as e:  # noqa: BLE001 — never fail a generation over this
        logger.info(f"[aeo] could not remember calendar keywords: {e}")
    return res


class KeywordSuggestRequest(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=200)
    url: str = Field(..., min_length=3, max_length=300)
    market: str = "Global"
    industry: str = "General"


@router.post("/keywords/suggest", summary="Top 10 keywords for this business, taken from its own website")
def keywords_suggest(req: KeywordSuggestRequest, user_id: str = Depends(get_current_user_id)):
    _enforce_domain(user_id, req.url, req.company_name)
    kws = suggest_site_keywords(req.company_name, req.url, req.market, req.industry, usage_tracker=TokenUsageTracker())
    if not kws:
        raise HTTPException(status_code=502, detail="We could not read enough from your website yet. Add your own keywords instead.")
    return {"keywords": kws}


# ── Brand kit: logo + contact details printed on every generated image / Short ────────────────
def _brand_view(user_id: str) -> dict:
    b = brand_svc.get_brand(user_id)
    missing = brand_svc.missing_fields(b)
    view = {k: b.get(k, "") for k in ("phone", "email", "website", "address")}
    view.update(logo_url=b.get("logo_url", ""), business=b.get("business") or {}, socials=b.get("socials") or {}, detected=bool(b.get("detected_at")))
    view["logo_view_url"] = (signed_view_url(b["logo_url"], user_id) if b.get("logo_url") else "") or ""
    return {"brand": view, "missing": missing, "complete": not missing}


@router.get("/brand", summary="The saved logo + contact details, and what is still missing")
def get_brand_kit(user_id: str = Depends(get_current_user_id)):
    return _brand_view(user_id)


class BrandUpdate(BaseModel):
    phone: str = Field(..., max_length=40)
    email: str = Field(default="", max_length=120)
    website: str = Field(default="", max_length=140)
    address: str = Field(default="", max_length=200)


@router.put("/brand", summary="Save the contact details printed on every generated image")
def put_brand_kit(req: BrandUpdate, user_id: str = Depends(get_current_user_id)):
    try:
        fields = dict(
            phone=brand_svc.clean_phone(req.phone), email=brand_svc.clean_email(req.email),
            website=brand_svc.clean_website(req.website), address=" ".join(req.address.split())[:200],
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    brand_svc.save_brand(user_id, **fields)
    return _brand_view(user_id)


def _store_logo(user_id: str, data: bytes) -> None:
    ok, msg, _ = validate_logo(data)
    if not ok:
        raise HTTPException(status_code=422, detail=msg)
    try:
        url = upload_image(normalise_logo(data), "logo.png", user_id)
    except MediaUploadError as e:
        raise HTTPException(status_code=502, detail=str(e))
    brand_svc.save_brand(user_id, logo_url=url)


@router.post("/brand/logo", summary="Upload the company logo")
async def upload_brand_logo(file: UploadFile = File(...), user_id: str = Depends(get_current_user_id)):
    data = await file.read()
    if not data or len(data) > 8_000_000:
        raise HTTPException(status_code=422, detail="Choose a logo image under 8 MB (PNG, JPG or WebP).")
    _store_logo(user_id, data)
    return _brand_view(user_id)


class BrandDetectRequest(BaseModel):
    url: str = Field(..., min_length=3, max_length=300)
    company_name: str = Field(default="", max_length=200)


@router.post("/brand/detect", summary="Read the company website for phone, email, address, social links and a logo")
def detect_brand(req: BrandDetectRequest, user_id: str = Depends(get_current_user_id)):
    _enforce_domain(user_id, req.url, req.company_name or "Company")
    found = analyse_site(req.url)
    cur = brand_svc.get_brand(user_id)
    fill: dict = {}
    # Fill in only what the customer has not already entered themselves.
    if not str(cur.get("phone") or "").strip() and found["phones"]:
        try:
            fill["phone"] = brand_svc.clean_phone(found["phones"][0])
        except ValueError:
            pass
    if not str(cur.get("email") or "").strip() and found["emails"]:
        fill["email"] = found["emails"][0]
    if not str(cur.get("website") or "").strip():
        try:
            fill["website"] = brand_svc.clean_website(req.url)
        except ValueError:
            pass
    if not str(cur.get("address") or "").strip() and found["address"]:
        fill["address"] = found["address"][:200]
    brand_svc.save_brand(
        user_id, business={"title": found["title"], "description": found["description"]}, socials=found["socials"],
        detected_at=datetime.now(timezone.utc).isoformat(timespec="seconds"), **fill,
    )
    # Link the channels we found on the website, unless the customer already linked that channel themselves.
    st = get_aeo_state(user_id)
    links = dict(st.get("social_links") or {})
    added = []
    for found_key, ch_id in (("facebook", "fb"), ("instagram", "ig"), ("linkedin", "li"), ("youtube", "yt"), ("google_business", "gbp")):
        if found.get("socials", {}).get(found_key) and not links.get(ch_id):
            try:
                links[ch_id] = normalise_social_link(ch_id, found["socials"][found_key])
                added.append(ch_id)
            except ValueError:
                pass
    if added:
        st["social_links"] = links
        save_aeo_state(user_id, AeoState(**st).model_dump())
    out = _brand_view(user_id)
    out["found"] = {k: found[k] for k in ("phones", "emails", "address", "socials", "logo_candidates", "pages_read")}
    out["filled"] = sorted(fill)
    out["social_links"] = links
    return out


class BrandLogoFromSite(BaseModel):
    image_url: str = Field(..., min_length=8, max_length=600)


@router.post("/brand/logo-from-site", summary="Use a logo found on the company website")
def logo_from_site(req: BrandLogoFromSite, user_id: str = Depends(get_current_user_id)):
    try:
        r = _safe_get(req.image_url, timeout=8.0)
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=422, detail="We could not download that logo. Upload it instead.")
    if not r.ok or not (r.headers.get("content-type", "").lower().startswith("image/")):
        raise HTTPException(status_code=422, detail="That link is not an image. Upload your logo instead.")
    _store_logo(user_id, r.content)
    return _brand_view(user_id)


class SocialPostEdit(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=300)
    channel: str = Field(..., pattern=r"^(fb|ig|li|yt|gbp)$")
    index: int = Field(..., ge=0, le=19)
    cycle: int = Field(default=0, ge=0, le=23)
    post: dict


@router.put("/social-post", summary="Customer edits one post (caption, hashtags, call to action, image brief…)")
def edit_social_post(req: SocialPostEdit, user_id: str = Depends(get_current_user_id)):
    key = _social_key(req.prompt, not is_user_paid(user_id), req.cycle)
    doc = get_aeo_content(user_id, "social", key)
    if not doc:
        raise HTTPException(status_code=404, detail="Create the calendar for this prompt first.")
    posts = (doc.get("channels") or {}).get(req.channel) or []
    if req.index >= len(posts):
        raise HTTPException(status_code=404, detail="That post no longer exists.")
    cur = dict(posts[req.index])
    for k, n in (("text", 3000), ("cta", 200), ("tags", 400), ("visual", 800), ("title", 200), ("duration", 20)):
        if k in req.post:
            cur[k] = str(req.post.get(k) or "")[:n]
    if not str(cur.get("text", "")).strip():
        raise HTTPException(status_code=422, detail="The post text can't be empty.")
    posts[req.index] = cur
    doc["channels"][req.channel] = posts
    doc.pop("cached", None)
    save_aeo_content(user_id, "social", key, doc)
    return {"ok": True, "post": cur}


# ── YouTube Shorts: generate a vertical video, or upload your own ───────────────────────────
class ShortRequest(BaseModel):
    title: str = Field(default="", max_length=200)
    text: str = Field(default="", max_length=3000)
    visual: str = Field(default="", max_length=900)
    company_name: str = Field(default="", max_length=200)
    industry: str = Field(default="", max_length=120)
    keywords: list[str] = Field(default_factory=list, max_length=20)


@router.post("/short-video", summary="Start creating a YouTube Short (vertical video) for a post; poll GET /short-video/{job_id}")
def start_short(req: ShortRequest, background: BackgroundTasks, user_id: str = Depends(get_current_user_id)):
    params = req.model_dump()
    params["keywords"] = clean_keywords(params.get("keywords"))
    job_id = short_jobs.start_job(user_id, params)          # 422 when the logo / phone number are missing
    background.add_task(short_jobs.run_job, user_id, job_id, params)
    return {"job_id": job_id, "status": "running"}


@router.get("/short-video/{job_id}", summary="Progress of a Short being created")
def short_status(job_id: str, user_id: str = Depends(get_current_user_id)):
    if not job_id.isalnum() or len(job_id) > 64:
        raise HTTPException(status_code=422, detail="Bad job id")
    return short_jobs.job_status(user_id, job_id)


@router.post("/short-upload", summary="Upload your own YouTube Short (vertical or square video, up to 3 minutes)")
async def upload_short(file: UploadFile = File(...), user_id: str = Depends(get_current_user_id)):
    data = await file.read()
    try:
        info = check_uploaded_short(data)
        video = to_mp4(data)
        video_url = upload_video(video, user_id)
        thumb_url = upload_image(info["thumbnail"], "short-thumb.jpg", user_id)
    except ShortError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except MediaUploadError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {
        "video_url": video_url, "thumb_url": thumb_url, "duration": round(info["duration"], 1),
        "video_view_url": signed_view_url(video_url, user_id) or video_url,
        "thumb_view_url": signed_view_url(thumb_url, user_id) or thumb_url,
    }


# ── Website checks ───────────────────────────────────────────────────────────
@router.post("/site-checks", response_model=SiteChecksResponse, summary="Real checks of your own website")
def site_checks(req: SiteChecksRequest, user_id: str = Depends(get_current_user_id)):
    # Only the user's own (locked) domain can be checked — this endpoint fetches
    # a URL on the server's behalf, so it must not work as a general-purpose fetcher.
    lock = get_user_domain_lock(user_id)
    wanted = normalize_domain(req.url)
    if lock and wanted and lock.get("domain") != wanted:
        raise HTTPException(status_code=403, detail=f"You can only check your own website ({lock.get('domain')}).")
    if not lock:
        raise HTTPException(status_code=409, detail="Run an analysis for your website first, then checks become available.")
    return run_site_checks(req.url)


# ── Saved dashboard state ────────────────────────────────────────────────────
def _clean_str_list(values: list[str], limit: int, max_len: int = 300) -> list[str]:
    out, seen = [], set()
    for v in values:
        v = (v or "").strip()[:max_len]
        if v and v.lower() not in seen:
            seen.add(v.lower())
            out.append(v)
    return out[:limit]


@router.get("/state", response_model=AeoState, summary="Saved custom prompts/competitors, selection, links and approvals")
def read_state(user_id: str = Depends(get_current_user_id)):
    return AeoState(**get_aeo_state(user_id))


@router.put("/state", response_model=AeoState, summary="Replace any subset of the saved dashboard state")
def write_state(patch: AeoStatePatch, user_id: str = Depends(get_current_user_id)):
    state = get_aeo_state(user_id)
    changes = patch.model_dump(exclude_none=True)
    if "custom_prompts" in changes:
        changes["custom_prompts"] = _clean_str_list(changes["custom_prompts"], 50, 200)
    if "selected_prompts" in changes:
        changes["selected_prompts"] = _clean_str_list(changes["selected_prompts"], 20)
    if "custom_competitors" in changes:
        comps = []
        for c in changes["custom_competitors"]:
            name = str((c or {}).get("name", "")).strip()[:120]
            if name:
                comps.append({"name": name, "domain": str((c or {}).get("domain", "")).strip()[:120]})
        changes["custom_competitors"] = comps[:25]
    if "calendar_keywords" in changes:
        changes["calendar_keywords"] = clean_keywords(changes["calendar_keywords"], 20)
    if "calendar_start" in changes:
        cs = str(changes["calendar_start"] or "").strip()
        try:
            date.fromisoformat(cs)
        except ValueError:
            cs = ""
        # Once month 1 has started the date is fixed — later months are counted from it.
        changes["calendar_start"] = state.get("calendar_start") or cs
    if "hidden_prompts" in changes:
        changes["hidden_prompts"] = _clean_str_list(changes["hidden_prompts"], 80, 200)
    if "hidden_competitors" in changes:
        changes["hidden_competitors"] = _clean_str_list(changes["hidden_competitors"], 60, 120)
    for key in ("blog_state", "post_state"):
        if key in changes:
            # Only the few fields the UI uses, with bounded sizes — this is user-writable storage.
            allowed = {"drafted": bool, "approved": bool, "pending": bool, "img": str, "v": int, "published": bool, "pub_at": str, "vid": str, "vthumb": str}
            cleaned = {}
            for k, v in list(changes[key].items())[:2000]:
                if isinstance(v, dict):
                    cleaned[str(k)[:420]] = {f: v[f] for f, t in allowed.items() if f in v and isinstance(v[f], t) and (f not in ("img", "vid", "vthumb") or len(v[f]) <= 600) and (f != "pub_at" or len(v[f]) <= 40)}
            # Fields owned by our team can't be set (or wiped) from the user's side.
            existing = state.get(key) or {}
            for k, v in existing.items():
                if not isinstance(v, dict):
                    continue
                if v.get("team") or v.get("by") or v.get("cd"):
                    cleaned.setdefault(k, {})
                    for f in ("team", "by", "at", "cd", "cu", "cv"):
                        if f in v:
                            cleaned[k][f] = v[f]
                # A screen that was open before our team changed an image must not put the old one back.
                if isinstance(v.get("v"), int) and k in cleaned and int(cleaned[k].get("v") or 0) < v["v"]:
                    cleaned[k]["v"] = v["v"]
                    for f in ("img", "vid", "vthumb"):
                        if f in v:
                            cleaned[k][f] = v[f]
                        else:
                            cleaned[k].pop(f, None)
            changes[key] = cleaned
    state.update(changes)
    try:
        return AeoState(**save_aeo_state(user_id, AeoState(**state).model_dump()))
    except AeoStateTooLargeError as e:
        raise HTTPException(status_code=413, detail=str(e))


@router.put("/social-links", response_model=AeoState, summary="Manually link a social channel")
def link_social(req: SocialLinkRequest, user_id: str = Depends(get_current_user_id)):
    try:
        link = normalise_social_link(req.platform, req.url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    state = get_aeo_state(user_id)
    state["social_links"] = {**state.get("social_links", {}), req.platform: link}
    return AeoState(**save_aeo_state(user_id, state))


@router.delete("/social-links/{platform}", response_model=AeoState, summary="Remove a manually linked social channel")
def unlink_social(platform: str, user_id: str = Depends(get_current_user_id)):
    state = get_aeo_state(user_id)
    state["social_links"] = {k: v for k, v in state.get("social_links", {}).items() if k != platform}
    return AeoState(**save_aeo_state(user_id, state))


@router.post("/image-url", summary="Signed, viewable link for an image this user uploaded or generated")
async def image_url(body: dict, user_id: str = Depends(get_current_user_id)):
    from services.media_upload_service import signed_view_url
    url = str((body or {}).get("url") or "")[:600]
    signed = signed_view_url(url, user_id)
    if not signed:
        raise HTTPException(status_code=404, detail="Image not found")
    return {"url": signed}


@router.post("/image-download", summary="Download an image this user uploaded or generated")
def image_download(body: dict, user_id: str = Depends(get_current_user_id)):
    from services.media_upload_service import read_user_image
    url = str((body or {}).get("url") or "")[:600]
    try:
        got = read_user_image(url, user_id)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Could not read the image: {e}")
    if not got:
        raise HTTPException(status_code=404, detail="Image not found")
    data, ctype, name = got
    return Response(content=data, media_type=ctype, headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/team-index", summary="Which prompts have content our team created or edited for this customer")
def team_index(user_id: str = Depends(get_current_user_id)):
    out = {"blogs": [], "social": [], "strategy": []}
    for c in list_aeo_content(user_id):
        d = c["data"]
        if not d.get("team") and not (c["kind"] == "strategy" and d.get("team")):
            continue
        if c["kind"] == "blog":
            out["blogs"].append({"prompt": d.get("prompt", ""), "title": d.get("title", ""), "type": d.get("type", "Blog"), "team": d.get("team", "")})
        elif c["kind"] in ("social", "strategy"):
            out[c["kind"]].append(d.get("prompt", ""))
    return out
