"""
routers/admin_aeo_router.py — the team's side of the AEO dashboard
==================================================================
Customers can ask our team to review a blog ("Request team review") and
approve social posts and their images. This router lets an admin:

  * see which customers need attention (review requests, approvals),
  * read a customer's selected prompts, blog topics and social calendars,
  * write / edit / verify blogs and social posts on the customer's behalf,
  * generate or upload a post image for the customer,

and everything is stored in the same documents the customer's dashboard
reads, so edits show up on the customer's screen as soon as it refreshes.
Customer approvals (`approved`) are never written from here — they stay the
customer's decision and are shown to the admin read-only.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field

from core.security import require_admin
from db import (
    AeoStateTooLargeError,
    get_aeo_content,
    get_aeo_state,
    is_user_paid,
    list_aeo_content,
    save_aeo_content,
    save_aeo_content_by_sk,
    save_aeo_state,
)
from db.dynamo import _aeo_content_sk, get_analysis, list_all_users, list_analyses
from models.aeo_models import (
    AeoStrategyRequest,
    CHANNELS,
    AeoBlogDraftRequest,
    AeoBlogDraftResponse,
    AeoSocialRequest,
    AeoSocialResponse,
    AeoState,
)
from services.aeo_service import generate_aeo_blog_draft, generate_aeo_social, generate_aeo_strategy
from services.bedrock_service import TokenUsageTracker
from services.canva_service import CanvaError, create_design_with_asset, create_export_job, poll_export_job, upload_asset_from_url
from services.media_upload_service import MediaUploadError, read_own_image, read_user_image, signed_view_url, upload_image
from services.openai_image_service import OpenAIImageError
from services import brand_service as brand_svc
from services import short_jobs
from services.media_upload_service import upload_video
from services.shorts_service import ShortError, check_uploaded_short, to_mp4
from services.brand_overlay import apply_brand_bar
from services.openai_image_service import generate_image_from_prompt as generate_image_via_openai

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/admin/aeo", tags=["Admin AEO"])

_KEY_RE = re.compile(r"^[a-z0-9]{1,16}$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _user_row(user_id: str) -> dict:
    for u in list_all_users():
        if u.get("user_id") == user_id:
            return u
    raise HTTPException(status_code=404, detail="Unknown user")


def _business(user_id: str) -> dict:
    """company / site / market / industry as the customer's own analysis used them."""
    u = _user_row(user_id)
    market, industry = "Global", "General"
    try:
        items = list_analyses(user_id, analysis_type="aeo_prompts", limit=1).get("items", [])
        if items:
            market = items[0].get("market") or market
            industry = (items[0].get("request") or {}).get("industry") or items[0].get("industry") or industry
    except Exception:  # noqa: BLE001
        pass
    url = u.get("domain") or ""
    return {"company_name": u.get("company_name") or "Company", "url": url if url.startswith("http") else f"https://{url}", "market": market, "industry": industry}


def _save_state(user_id: str, state: dict) -> dict:
    try:
        return save_aeo_state(user_id, AeoState(**state).model_dump())
    except AeoStateTooLargeError as e:
        raise HTTPException(status_code=413, detail=str(e))


# ── Overview: who needs attention ────────────────────────────────────────────
@router.get("/overview", summary="Customers with AEO activity: review requests and approvals")
def overview(admin_id: str = Depends(require_admin)):
    rows = []
    for u in list_all_users():
        uid = u.get("user_id")
        if not uid:
            continue
        try:
            st = get_aeo_state(uid)
        except Exception:  # noqa: BLE001
            continue
        bs, ps = st.get("blog_state", {}), st.get("post_state", {})
        rows.append({
            "user_id": uid, "email": u.get("email", ""), "full_name": u.get("full_name", ""),
            "company_name": u.get("company_name", ""), "domain": u.get("domain", ""),
            "is_paid": is_user_paid(uid),
            "selected_prompts": len(st.get("selected_prompts", [])),
            "blog_requests": sum(1 for v in bs.values() if isinstance(v, dict) and v.get("pending") and v.get("team") != "verified"),
            "blogs_approved": sum(1 for v in bs.values() if isinstance(v, dict) and v.get("approved")),
            "posts_approved": sum(1 for v in ps.values() if isinstance(v, dict) and v.get("approved")),
        })
    rows.sort(key=lambda r: (-r["blog_requests"], -r["selected_prompts"], r["company_name"].lower()))
    return {"users": rows}


def _prompt_options(user_id: str, state: dict) -> list[str]:
    """Every prompt the customer could build content for: their analysed prompts plus ones they added."""
    out: list[str] = []
    try:
        items = list_analyses(user_id, analysis_type="aeo_prompts", limit=1).get("items", [])
        if items:
            full = get_analysis(user_id, items[0]["analysis_id"]) or {}
            for p in (full.get("result") or {}).get("prompts", []) or []:
                t = str((p or {}).get("text") or "").strip()
                if t and not (p or {}).get("locked"):
                    out.append(t)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[admin-aeo] prompt options failed: {e}")
    for t in (state.get("custom_prompts") or []):
        out.append(str(t))
    seen, uniq = set(), []
    for t in out:
        if t.lower() not in seen:
            seen.add(t.lower()); uniq.append(t)
    return uniq[:60]


# ── One customer's AEO workspace ─────────────────────────────────────────────
@router.get("/users/{user_id}", summary="A customer's prompts, saved state and generated content")
def workspace(user_id: str, admin_id: str = Depends(require_admin)):
    u = _user_row(user_id)
    state = get_aeo_state(user_id)
    content = []
    for c in list_aeo_content(user_id):
        d = c["data"]
        if c["kind"] not in ("strategy", "blog", "social"):
            continue
        content.append({"sk": c["sk"], "kind": c["kind"], "prompt": d.get("prompt", ""), "title": d.get("title", ""),
                        "updated_at": c["updated_at"], "data": d})
    return {
        "prompt_options": _prompt_options(user_id, state),
        "user": {"user_id": user_id, "email": u.get("email", ""), "full_name": u.get("full_name", ""),
                 "company_name": u.get("company_name", ""), "domain": u.get("domain", ""), "is_paid": is_user_paid(user_id)},
        "state": state, "content": content,
        "brand_complete": not brand_svc.missing_fields(state.get("brand") or {}),
    }


# ── Create / edit content on the customer's behalf ──────────────────────────
class SaveContentRequest(BaseModel):
    kind: Literal["blog", "social"]
    prompt: str = Field(..., min_length=3, max_length=300)
    title: str = Field(default="", max_length=300)          # blogs
    sk: Optional[str] = Field(default=None, max_length=120)  # social: the existing document, if any
    data: dict
    team: Literal["edited", "verified"] = "edited"
    state_key: Optional[str] = None                          # blog_state key to flag
    add_topic: bool = False                                  # list this blog among the prompt's topics on the customer's screen


def _clip(s, n):
    return str(s or "")[:n]


@router.put("/users/{user_id}/content", summary="Save a blog or social calendar the team wrote or edited")
def save_content(user_id: str, req: SaveContentRequest, admin_id: str = Depends(require_admin)):
    _user_row(user_id)
    if req.kind == "blog":
        if len(req.title.strip()) < 3:
            raise HTTPException(status_code=422, detail="A blog needs a title.")
        d = req.data
        secs = [{"h": _clip(s.get("h"), 200), "p": _clip(s.get("p"), 6000)} for s in (d.get("sections") or [])[:25] if isinstance(s, dict)]
        doc = AeoBlogDraftResponse(
            prompt=req.prompt, type=_clip(d.get("type") or "Blog", 40), title=req.title.strip()[:300],
            intro=_clip(d.get("intro"), 4000), sections=secs, team=req.team,
        ).model_dump()
        doc["cached"] = False
        save_aeo_content(user_id, "blog", f"{req.prompt}|{req.title.strip()}", doc)
        topic_added = None
        if req.add_topic:
            strat = next((c for c in list_aeo_content(user_id) if c["kind"] == "strategy" and c["data"].get("prompt") == req.prompt), None)
            if not strat:
                # The customer's Content Strategy for this prompt doesn't exist yet — create it so the blog has a home.
                try:
                    b = _business(user_id)
                    r = generate_aeo_strategy(AeoStrategyRequest(**b, prompt=req.prompt), usage_tracker=TokenUsageTracker(), limited=False)
                    sdoc = json.loads(r.model_dump_json())
                    sdoc["team"] = "edited"
                    ssk = _aeo_content_sk("strategy", req.prompt + ("" if is_user_paid(user_id) else "|free"))
                    save_aeo_content_by_sk(user_id, ssk, "strategy", sdoc)
                    strat = {"sk": ssk, "data": sdoc}
                except Exception as e:  # noqa: BLE001
                    logger.warning(f"[admin-aeo] could not create strategy for {req.prompt!r}: {e}")
            if not strat:
                topic_added = False
            else:
                topics = strat["data"].get("blog_topics") or []
                if not any(str(t.get("title", "")).strip().lower() == req.title.strip().lower() for t in topics):
                    topics.append({"type": doc["type"], "title": doc["title"], "words": int(d.get("words") or 1000)})
                    strat["data"]["blog_topics"] = topics
                    save_aeo_content_by_sk(user_id, strat["sk"], "strategy", strat["data"])
                topic_added = True
        if req.state_key:
            if not _KEY_RE.match(req.state_key):
                raise HTTPException(status_code=422, detail="Bad state key")
            st = get_aeo_state(user_id)
            cur = dict(st["blog_state"].get(req.state_key) or {})
            cur.update({"drafted": True, "pending": False, "team": req.team, "by": "team", "at": _now()})
            st["blog_state"][req.state_key] = cur
            _save_state(user_id, st)
        return {"ok": True, "data": doc, "topic_added": topic_added}

    # social
    chans = {}
    for ch in CHANNELS:
        posts = []
        for p in ((req.data.get("channels") or {}).get(ch) or [])[:4]:
            if not isinstance(p, dict):
                continue
            posts.append({k: _clip(p.get(k), n) for k, n in (("text", 3000), ("cta", 200), ("tags", 400), ("visual", 800), ("title", 200), ("duration", 20))})
        chans[ch] = posts
    prior = None
    sk = req.sk
    if sk:
        prior = next((c for c in list_aeo_content(user_id) if c["sk"] == sk and c["kind"] == "social"), None)
        if not prior:
            raise HTTPException(status_code=404, detail="That calendar no longer exists.")
    doc = AeoSocialResponse(prompt=req.prompt, channels=chans, limited=bool(prior and prior["data"].get("limited")), team=req.team).model_dump()
    doc["cached"] = False
    if not sk:
        sk = _aeo_content_sk("social", req.prompt + ("" if is_user_paid(user_id) else "|free"))
    save_aeo_content_by_sk(user_id, sk, "social", doc)
    return {"ok": True, "sk": sk, "data": doc}


class AiBlogRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=300)
    title: str = Field(..., min_length=3, max_length=300)
    type: str = Field(default="Blog", max_length=40)
    words: int = Field(default=1000, ge=300, le=3000)


@router.post("/users/{user_id}/blog/ai-draft", summary="AI first draft for the team to edit — returned, not saved")
def ai_blog(user_id: str, req: AiBlogRequest, admin_id: str = Depends(require_admin)):
    b = _business(user_id)
    try:
        r = generate_aeo_blog_draft(AeoBlogDraftRequest(**b, prompt=req.prompt, type=req.type, title=req.title, words=req.words),
                                    usage_tracker=TokenUsageTracker())
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Could not draft this right now: {e}")
    return json.loads(r.model_dump_json())


class AiSocialRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=300)


@router.post("/users/{user_id}/social/ai-generate", summary="Generate the full 4-post-per-channel calendar for a prompt and save it for the customer")
def ai_social(user_id: str, req: AiSocialRequest, admin_id: str = Depends(require_admin)):
    b = _business(user_id)
    try:
        r = generate_aeo_social(AeoSocialRequest(**b, prompt=req.prompt, keywords=list(get_aeo_state(user_id).get('calendar_keywords') or [])), usage_tracker=TokenUsageTracker(), limited=False)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Could not generate this right now: {e}")
    doc = json.loads(r.model_dump_json())
    doc["team"] = "edited"
    sk = _aeo_content_sk("social", req.prompt + ("" if is_user_paid(user_id) else "|free"))
    save_aeo_content_by_sk(user_id, sk, "social", doc)
    return {"ok": True, "sk": sk, "data": doc}


# ── Flags the customer's screen shows (verified / edited / image) ───────────
class FlagRequest(BaseModel):
    section: Literal["blog", "post"]
    key: str
    team: Optional[Literal["", "edited", "verified"]] = None
    pending: Optional[bool] = None
    img: Optional[str] = Field(default=None, max_length=600)   # "" removes the image
    vid: Optional[str] = Field(default=None, max_length=600)    # "" removes the Short video


@router.post("/users/{user_id}/flag", summary="Mark a blog/post as team-edited or verified, clear a review request, set/remove an image")
def set_flag(user_id: str, req: FlagRequest, admin_id: str = Depends(require_admin)):
    if not _KEY_RE.match(req.key):
        raise HTTPException(status_code=422, detail="Bad key")
    st = get_aeo_state(user_id)
    bucket = "blog_state" if req.section == "blog" else "post_state"
    cur = dict(st[bucket].get(req.key) or {})
    if req.team is not None:
        cur["team"] = req.team
        cur["by"], cur["at"] = "team", _now()
    if req.pending is not None and req.section == "blog":
        cur["pending"] = req.pending
    if req.img is not None and req.section == "post":
        if req.img and not req.img.startswith("https://"):
            raise HTTPException(status_code=422, detail="Image must be an https link")
        if req.img:
            cur["img"] = req.img
        else:
            cur.pop("img", None)
        cur["v"] = int(cur.get("v") or 0) + 1
    if req.vid is not None and req.section == "post" and not req.vid:
        cur.pop("vid", None)
        cur.pop("vthumb", None)
        cur["v"] = int(cur.get("v") or 0) + 1
    st[bucket][req.key] = cur
    return {"ok": True, "entry": cur, "state": _save_state(user_id, st)[bucket]}


# ── Images ───────────────────────────────────────────────────────────────────
class GenImageRequest(BaseModel):
    key: str
    visual: str = Field(..., min_length=5, max_length=900)
    brand: str = Field(default="", max_length=120)


def _attach_image(user_id: str, key: str, url: str) -> dict:
    st = get_aeo_state(user_id)
    cur = dict(st["post_state"].get(key) or {})
    cur.update({"img": url, "v": int(cur.get("v") or 0) + 1, "team": cur.get("team") or "edited", "by": "team", "at": _now()})
    st["post_state"][key] = cur
    _save_state(user_id, st)
    return cur


@router.post("/users/{user_id}/post-image/generate", summary="Generate a post image from its visual suggestion, for the customer")
def generate_image(user_id: str, req: GenImageRequest, admin_id: str = Depends(require_admin)):
    if not _KEY_RE.match(req.key):
        raise HTTPException(status_code=422, detail="Bad key")
    # The customer's logo + contact number are required and are printed on every generated image.
    brand, logo_bytes = brand_svc.require_brand(user_id)
    biz = _business(user_id)
    brief = brand_svc.build_photo_prompt(req.brand or biz["company_name"], biz["industry"], brand, req.visual, (get_aeo_state(user_id).get("calendar_keywords") or []))
    try:
        data = generate_image_via_openai(brief, width=1080, height=1080)
    except OpenAIImageError as e:
        raise HTTPException(status_code=502, detail=f"Could not generate an image: {e}")
    try:
        data = apply_brand_bar(data, brand, logo_bytes)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Generated the image but could not add the logo and contact details: {e}")
    try:
        url = upload_image(data, filename=f"aeo-{req.key}.png", user_id=user_id)
    except MediaUploadError as e:
        raise HTTPException(status_code=502, detail=f"Generated the image but could not store it. {e}")
    return {"image_url": url, "entry": _attach_image(user_id, req.key, url)}


@router.post("/users/{user_id}/post-image/upload", summary="Upload an image for a customer's post")
async def upload_post_image(user_id: str, key: str = Form(...), file: UploadFile = File(...), admin_id: str = Depends(require_admin)):
    if not _KEY_RE.match(key):
        raise HTTPException(status_code=422, detail="Bad key")
    data = await file.read()
    if not data or len(data) > 8_000_000:
        raise HTTPException(status_code=422, detail="Choose an image under 8 MB.")
    try:
        url = upload_image(data, file.filename or "upload.jpg", user_id)
    except MediaUploadError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"image_url": url, "entry": _attach_image(user_id, key, url)}


def _attach_video(user_id: str, key: str, video_url: str, thumb_url: str) -> dict:
    st = get_aeo_state(user_id)
    cur = dict(st["post_state"].get(key) or {})
    cur.update({"vid": video_url, "vthumb": thumb_url, "v": int(cur.get("v") or 0) + 1,
                "team": cur.get("team") or "edited", "by": "team", "at": _now()})
    st["post_state"][key] = cur
    _save_state(user_id, st)
    return cur


class ShortGenRequest(BaseModel):
    key: str
    title: str = Field(default="", max_length=200)
    text: str = Field(default="", max_length=3000)
    visual: str = Field(default="", max_length=900)


@router.post("/users/{user_id}/short-video", summary="Start creating a YouTube Short for a customer's post; poll GET .../short-video/{job_id}")
def admin_start_short(user_id: str, req: ShortGenRequest, background: BackgroundTasks, admin_id: str = Depends(require_admin)):
    if not _KEY_RE.match(req.key):
        raise HTTPException(status_code=422, detail="Bad key")
    biz = _business(user_id)
    params = {"key": req.key, "title": req.title, "text": req.text, "visual": req.visual,
              "company_name": biz["company_name"], "industry": biz["industry"],
              "keywords": list(get_aeo_state(user_id).get("calendar_keywords") or [])}
    job_id = short_jobs.start_job(user_id, params)      # 422 when the customer's logo / phone number are missing
    background.add_task(short_jobs.run_job, user_id, job_id, params,
                        lambda done: _attach_video(user_id, req.key, done["video_url"], done["thumb_url"]))
    return {"job_id": job_id, "status": "running"}


@router.get("/users/{user_id}/short-video/{job_id}", summary="Progress of a Short being created for a customer")
def admin_short_status(user_id: str, job_id: str, admin_id: str = Depends(require_admin)):
    if not job_id.isalnum() or len(job_id) > 64:
        raise HTTPException(status_code=422, detail="Bad job id")
    out = short_jobs.job_status(user_id, job_id)
    if out.get("status") == "done":
        out["entry"] = (get_aeo_state(user_id)["post_state"] or {})
    return out


@router.post("/users/{user_id}/short-upload", summary="Upload a Short (vertical or square video) for a customer's post")
async def admin_upload_short(user_id: str, key: str = Form(...), file: UploadFile = File(...), admin_id: str = Depends(require_admin)):
    if not _KEY_RE.match(key):
        raise HTTPException(status_code=422, detail="Bad key")
    data = await file.read()
    try:
        info = check_uploaded_short(data)
        video_url = upload_video(to_mp4(data), user_id)
        thumb_url = upload_image(info["thumbnail"], "short-thumb.jpg", user_id)
    except ShortError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except MediaUploadError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"video_url": video_url, "thumb_url": thumb_url, "duration": round(info["duration"], 1),
            "entry": _attach_video(user_id, key, video_url, thumb_url)}


class SignRequest(BaseModel):
    user_id: str
    url: str = Field(..., max_length=600)


@router.post("/image-url", summary="Signed link so the admin can see a customer's image")
def admin_image_url(req: SignRequest, admin_id: str = Depends(require_admin)):
    signed = signed_view_url(req.url, req.user_id)
    if not signed:
        raise HTTPException(status_code=404, detail="Image not found")
    return {"url": signed}


@router.post("/image-download", summary="Download a customer's image")
def admin_image_download(req: SignRequest, admin_id: str = Depends(require_admin)):
    try:
        got = read_user_image(req.url, req.user_id)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Could not read the image: {e}")
    if not got:
        raise HTTPException(status_code=404, detail="Image not found")
    data, ctype, name = got
    return Response(content=data, media_type=ctype, headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.post("/users/{user_id}/strategy/ai-generate", summary="Generate the content strategy + blog topics for a prompt and save it for the customer")
def ai_strategy(user_id: str, req: AiSocialRequest, admin_id: str = Depends(require_admin)):
    b = _business(user_id)
    try:
        r = generate_aeo_strategy(AeoStrategyRequest(**b, prompt=req.prompt), usage_tracker=TokenUsageTracker(), limited=False)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Could not generate this right now: {e}")
    doc = json.loads(r.model_dump_json())
    doc["team"] = "edited"
    sk = _aeo_content_sk("strategy", req.prompt + ("" if is_user_paid(user_id) else "|free"))
    save_aeo_content_by_sk(user_id, sk, "strategy", doc)
    return {"ok": True, "sk": sk, "data": doc}


# ── Edit a post image in Canva, then bring the result back ───────────────────
def _post_entry(user_id: str, key: str) -> tuple[dict, dict]:
    if not _KEY_RE.match(key):
        raise HTTPException(status_code=422, detail="Bad key")
    st = get_aeo_state(user_id)
    return st, dict(st["post_state"].get(key) or {})


class CanvaKeyRequest(BaseModel):
    key: str


@router.post("/users/{user_id}/post-image/canva-edit", summary="Send a post's image to Canva (the admin's own Canva account) and get the editor link")
def canva_edit(user_id: str, req: CanvaKeyRequest, admin_id: str = Depends(require_admin)):
    from routers.canva_router import _get_valid_access_token
    st, cur = _post_entry(user_id, req.key)
    img = cur.get("img")
    if not img:
        raise HTTPException(status_code=422, detail="Create or upload an image first, then edit it in Canva.")
    # Reuse the open design if the image hasn't changed since it was sent.
    if cur.get("cd") and cur.get("cu") and cur.get("cv") == cur.get("v"):
        return {"edit_url": cur["cu"], "entry": cur}
    token = _get_valid_access_token(admin_id)          # 428 → "connect Canva"
    try:
        asset_id = upload_asset_from_url(token, img, name=f"post-{req.key}.png")
        design = create_design_with_asset(token, asset_id, title=f"Post {req.key}")
    except CanvaError as e:
        raise HTTPException(status_code=502, detail=f"Could not open this image in Canva: {e}")
    cur.update({"cd": design["design_id"], "cu": design["edit_url"][:500], "cv": int(cur.get("v") or 0)})
    st["post_state"][req.key] = cur
    _save_state(user_id, st)
    return {"edit_url": design["edit_url"], "entry": cur}


@router.post("/users/{user_id}/post-image/canva-sync", summary="Bring the edited design back from Canva as the post's image")
def canva_sync(user_id: str, req: CanvaKeyRequest, admin_id: str = Depends(require_admin)):
    import requests as _rq
    from routers.canva_router import _get_valid_access_token
    st, cur = _post_entry(user_id, req.key)
    if not cur.get("cd"):
        raise HTTPException(status_code=422, detail="This image hasn't been sent to Canva yet.")
    token = _get_valid_access_token(admin_id)
    try:
        urls = poll_export_job(token, create_export_job(token, cur["cd"]))
    except CanvaError as e:
        raise HTTPException(status_code=502, detail=f"Could not export the design from Canva: {e}")
    if not urls:
        raise HTTPException(status_code=502, detail="Canva finished but returned no image.")
    try:
        data = _rq.get(urls[0], timeout=30).content
        url = upload_image(data, filename=f"aeo-{req.key}-canva.png", user_id=user_id)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Exported from Canva but could not save it: {e}")
    cur.update({"img": url, "v": int(cur.get("v") or 0) + 1, "team": cur.get("team") or "edited", "by": "team", "at": _now()})
    cur["cv"] = cur["v"]
    st["post_state"][req.key] = cur
    _save_state(user_id, st)
    return {"image_url": url, "entry": cur}
