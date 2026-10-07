"""
routers/aeo_router.py — endpoints behind the AEO dashboard
===========================================================
  POST /api/v1/aeo/prompts          Top prompts + per-engine visibility + competitor share of voice
  POST /api/v1/aeo/strategy         Plan + blog topics for ONE prompt          (paid)
  POST /api/v1/aeo/blog-draft       Draft one blog topic                        (paid)
  POST /api/v1/aeo/social-posts     4 posts x 5 channels for ONE prompt         (paid)
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
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException

from core.security import get_current_user_id, require_paid_access
from db import (
    AeoStateTooLargeError,
    DomainMismatchError,
    check_and_lock_domain,
    get_aeo_content,
    get_aeo_state,
    get_user_domain_lock,
    is_user_paid,
    save_aeo_content,
    save_aeo_state,
    save_analysis,
)
from db.dynamo import normalize_domain
from models.aeo_models import (
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
    generate_aeo_strategy,
    normalise_social_link,
    run_site_checks,
)
from services.bedrock_service import TokenUsageTracker

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
):
    """Generated assets are stored per (kind, prompt/title) so a page reload — or
    a second click — returns the saved copy instead of paying for Bedrock again."""
    if not refresh:
        saved = get_aeo_content(user_id, kind, key)
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


# ── Per-prompt content (paid) ─────────────────────────────────────────────────
@router.post("/strategy", response_model=AeoStrategyResponse, summary="Strategy and blog topics for one prompt")
def strategy(req: AeoStrategyRequest, user_id: str = Depends(require_paid_access)):
    _enforce_domain(user_id, req.url, req.company_name)
    return _cached_or_generate(
        user_id, "strategy", req.prompt, req.refresh, AeoStrategyResponse,
        lambda t: generate_aeo_strategy(req, usage_tracker=t),
    )


@router.post("/blog-draft", response_model=AeoBlogDraftResponse, summary="Draft one blog topic")
def blog_draft(req: AeoBlogDraftRequest, user_id: str = Depends(require_paid_access)):
    _enforce_domain(user_id, req.url, req.company_name)
    return _cached_or_generate(
        user_id, "blog", f"{req.prompt}|{req.title}", req.refresh, AeoBlogDraftResponse,
        lambda t: generate_aeo_blog_draft(req, usage_tracker=t),
    )


@router.post("/social-posts", response_model=AeoSocialResponse, summary="Four posts for each channel, for one prompt")
def social_posts(req: AeoSocialRequest, user_id: str = Depends(require_paid_access)):
    _enforce_domain(user_id, req.url, req.company_name)
    return _cached_or_generate(
        user_id, "social", req.prompt, req.refresh, AeoSocialResponse,
        lambda t: generate_aeo_social(req, usage_tracker=t),
    )


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
    for key in ("blog_state", "post_state"):
        if key in changes:
            # Only the few fields the UI uses, with bounded sizes — this is user-writable storage.
            allowed = {"drafted": bool, "approved": bool, "pending": bool, "img": str, "v": int}
            cleaned = {}
            for k, v in list(changes[key].items())[:800]:
                if isinstance(v, dict):
                    cleaned[str(k)[:420]] = {f: v[f] for f, t in allowed.items() if f in v and isinstance(v[f], t) and (f != "img" or len(v[f]) <= 600)}
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
