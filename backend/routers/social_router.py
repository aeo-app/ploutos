"""
routers/social_router.py — Relocation social media content calendar endpoints
================================================================================
"""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from core.security import get_current_user_id
from db import save_analysis
from models.social_models import RelocationSocialRequest
from services.social_service import (
    generate_relocation_calendar,
    stream_relocation_calendar_events,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Social Media Content"])


def _save_social(*, user_id: str, req: RelocationSocialRequest, result_dict: dict, status: str = "success") -> str:
    """Persist to the same DynamoDB table as SEO analyses, under its own
    analysis_type. Never blocks the response on failure."""
    try:
        aid = save_analysis(
            user_id=user_id,
            analysis_type="relocation_social_calendar",
            company_name=req.company.name,
            url=req.company.website or "",
            market=req.country,
            industry="Relocation Services",
            result=result_dict,
            request_data=req.model_dump(mode="json"),
            status=status,
        )
        logger.info(f"[social] saved relocation_social_calendar aid={aid} user={user_id}")
        return aid
    except Exception as e:
        logger.error(f"[social] DynamoDB save failed: {e}", exc_info=True)
        return "save-failed"


@router.post(
    "/api/v1/social/relocation-calendar",
    summary="Relocation social media content calendar for a custom date range (Bedrock, blocking)",
)
async def relocation_calendar(
    req: RelocationSocialRequest,
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
    """
    try:
        result = generate_relocation_calendar(req)
    except Exception as e:
        logger.error(f"relocation_calendar failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    result_dict = json.loads(result.model_dump_json())
    status = "partial" if result.failed_dates else "success"
    aid = _save_social(user_id=user_id, req=req, result_dict=result_dict, status=status)
    result_dict["_meta"] = {"analysis_id": aid, "user_id": user_id}
    return result_dict


@router.post(
    "/api/v1/social/relocation-calendar/stream",
    summary="Relocation social media content calendar — streamed via Server-Sent Events",
)
async def relocation_calendar_stream(
    req: RelocationSocialRequest,
    request: Request,
    user_id: str = Depends(get_current_user_id),
):
    """
    Same generator as /relocation-calendar, streamed as SSE so days appear
    as they're generated instead of waiting for the whole range:

      event: start      — {"period_label", "total_days"}
      event: day_ready   — one day's full schedule (2 posts), as it completes
      event: day_error   — a day failed; the rest keep going
      event: done        — {"failed_dates": {...}, "result": {...}} (final, saved)
    """

    async def event_source():
        try:
            async for event, data in stream_relocation_calendar_events(req, request.is_disconnected):
                yield f"event: {event}\ndata: {json.dumps(data)}\n\n"
                if event == "done":
                    status = "partial" if data.get("failed_dates") else "success"
                    try:
                        aid = _save_social(user_id=user_id, req=req, result_dict=data["result"], status=status)
                        yield f"event: saved\ndata: {json.dumps({'analysis_id': aid})}\n\n"
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
