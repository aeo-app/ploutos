"""
routers/social_router.py — Relocation social media content calendar endpoints
================================================================================
No payment required to CALL these endpoints — unpaid users get one real day
generated (real Bedrock cost) and locked placeholders for the rest (zero
Bedrock cost). See services/social_service.py's free-preview logic.
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from core.security import get_current_user_id
from db import check_and_lock_domain, DomainMismatchError, is_user_paid, save_analysis
from models.social_models import SocialCalendarRequest
from services.social_service import (
    generate_social_calendar,
    stream_social_calendar_events,
)
from services.bedrock_service import TokenUsageTracker

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Social Media Content"])


def _enforce_domain(user_id: str, req: SocialCalendarRequest) -> None:
    """Same one-to-one user<->domain mapping as seo_router.py. `company.website`
    is optional here — if not given, there's nothing to check or lock."""
    if not req.company.website:
        return
    try:
        check_and_lock_domain(user_id, req.company.website, req.company.name)
    except DomainMismatchError as e:
        raise HTTPException(status_code=403, detail=str(e))


def _save_social(
    *, user_id: str, req: SocialCalendarRequest, result_dict: dict,
    status: str = "success", token_usage: dict | None = None,
) -> str:
    """Persist to the same DynamoDB table as SEO analyses, under its own
    analysis_type. Never blocks the response on failure."""
    try:
        aid = save_analysis(
            user_id=user_id,
            analysis_type="relocation_social_calendar",
            company_name=req.company.name,
            url=req.company.website or "",
            market=req.market,
            industry=req.industry,
            result=result_dict,
            request_data=req.model_dump(mode="json"),
            status=status,
            token_usage=token_usage,
        )
        logger.info(f"[social] saved social_calendar aid={aid} user={user_id} industry={req.industry!r} tokens={token_usage}")
        return aid
    except Exception as e:
        logger.error(f"[social] DynamoDB save failed: {e}", exc_info=True)
        return "save-failed"


@router.post(
    "/api/v1/social/relocation-calendar",
    summary="Relocation social media content calendar for a custom date range (Bedrock, blocking)",
)
async def relocation_calendar(
    req: SocialCalendarRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Generates a social media content calendar for relocation services
    targeting one country, across any custom [start_date, end_date] range
    (inclusive, capped at MAX_DATE_RANGE_DAYS): 2 posts/day, platform-specific
    captions (Instagram/Facebook/LinkedIn/Google Business — the latter never
    contains testimonials), visual suggestions, CTAs, hashtags, and carousel
    slides where applicable. Generic for any relocation company — `company`
    carries whichever contact details this business wants reflected in CTAs.

    The schedule itself (dates, content-type/category/tone rotation,
    recommended posting times, LinkedIn weekday-only slots) is decided
    deterministically — see services/social_service.py — guaranteeing real
    variety instead of relying on the model to "randomize". Bedrock only
    writes the creative captions for each day (one bounded call per day, run
    concurrently). Partial failures don't abort the whole range — see
    `failed_dates` in the response.

    No payment required to CALL this endpoint — but unpaid users only get
    ONE day fully generated (real Bedrock cost); every other requested day
    comes back `locked: true` with no Bedrock call made for it at all (see
    DayScheduleSlot). Paid users get every day unlocked.
    """
    _enforce_domain(user_id, req)
    try:
        tracker = TokenUsageTracker()
        result = generate_social_calendar(req, usage_tracker=tracker, is_paid=is_user_paid(user_id))
        token_usage = tracker.as_dict()
    except Exception as e:
        logger.error(f"relocation_calendar failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    result_dict = json.loads(result.model_dump_json())
    status = "partial" if result.failed_dates else "success"
    aid = _save_social(user_id=user_id, req=req, result_dict=result_dict, status=status, token_usage=token_usage)
    result_dict["_meta"] = {"analysis_id": aid, "user_id": user_id, "token_usage": token_usage}
    return result_dict


@router.post(
    "/api/v1/social/relocation-calendar/stream",
    summary="Relocation social media content calendar — streamed via Server-Sent Events",
)
async def relocation_calendar_stream(
    req: SocialCalendarRequest,
    request: Request,
    user_id: str = Depends(get_current_user_id),
):
    """
    Same generator as /relocation-calendar, streamed as SSE so days appear
    as they're generated instead of waiting for the whole range:

      event: start        — {"period_label", "total_days", "unlocked_count"}
      event: day_ready    — one real day's full schedule (2 posts), as it completes
      event: day_locked   — a locked placeholder day, emitted immediately
                            (zero Bedrock cost)
      event: day_error    — a day failed; the rest keep going
      event: done         — {"failed_dates": {...}, "result": {...}} (final, saved)

    No payment required to CALL this endpoint — unpaid users get one real
    unlocked day and locked placeholders for the rest.
    """
    _enforce_domain(user_id, req)
    is_paid = is_user_paid(user_id)

    async def event_source():
        tracker = TokenUsageTracker()
        try:
            async for event, data in stream_social_calendar_events(
                req, request.is_disconnected, usage_tracker=tracker, is_paid=is_paid
            ):
                yield f"event: {event}\ndata: {json.dumps(data)}\n\n"
                if event == "done":
                    token_usage = data.get("token_usage") or tracker.as_dict()
                    status = "partial" if data.get("failed_dates") else "success"
                    try:
                        aid = _save_social(
                            user_id=user_id, req=req, result_dict=data["result"],
                            status=status, token_usage=token_usage,
                        )
                        yield f"event: saved\ndata: {json.dumps({'analysis_id': aid, 'token_usage': token_usage})}\n\n"
                    except Exception as e:
                        logger.error(f"[social] save failed: {e}", exc_info=True)
                        yield f"event: saved\ndata: {json.dumps({'analysis_id': 'save-failed'})}\n\n"
        except Exception as e:
            logger.error(f"relocation_calendar_stream failed: {e}", exc_info=True)
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )
