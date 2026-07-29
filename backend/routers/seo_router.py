"""
seo_router.py — SEO analysis endpoints (Bedrock + DynamoDB + Cognito auth)
===========================================================================
- AI via AWS Bedrock (bedrock_service.py)
- Persistence via DynamoDB (db/dynamo.py)
- user_id extracted from Cognito access token (core/security.py)
"""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from typing import Optional

from core.security import get_current_user_id
from db import (
    delete_analysis,
    get_analysis,
    get_user_stats,
    list_analyses,
    save_analysis,
)
from models.db_models import (
    AnalysisMeta,
    AnalysisRecord,
    DeleteResponse,
    ListAnalysesResponse,
    UserStatsResponse,
)
from models.seo_models import AnalyseRequest, ContentStrategyRequest
from services.bedrock_service import (
    generate_competitor_analysis,
    generate_company_profile,
    generate_content_strategy,
    generate_da_strategy,
    generate_full_report,
    generate_keyword_volume,
    stream_content_strategy_events,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["SEO Intelligence"])


# ── Helper ────────────────────────────────────────────────────────────────────
def _save(*, user_id: str, analysis_type: str, req: AnalyseRequest, result_model) -> str:
    """Serialise and persist — never blocks response on failure."""
    try:
        result_dict = json.loads(result_model.model_dump_json())
        aid = save_analysis(
            user_id=user_id,
            analysis_type=analysis_type,
            company_name=req.company_name,
            url=req.url,
            market=req.market,
            industry=req.industry,
            result=result_dict,
            request_data=req.model_dump(),
            status="success",
        )
        logger.info(f"[seo] saved {analysis_type} aid={aid} user={user_id}")
        return aid
    except Exception as e:
        logger.error(f"[seo] DynamoDB save failed ({analysis_type}): {e}", exc_info=True)
        return "save-failed"


def _response(result_model, analysis_id: str, user_id: str) -> dict:
    data = json.loads(result_model.model_dump_json())
    data["_meta"] = {"analysis_id": analysis_id, "user_id": user_id}
    return data


# ── Analysis endpoints ────────────────────────────────────────────────────────

@router.post("/api/v1/seo/competitors", summary="Competitor analysis (Bedrock + web search)")
async def competitor_analysis(
    req: AnalyseRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Grounded competitor analysis. Saved to DynamoDB under user_id from JWT."""
    try:
        result = generate_competitor_analysis(req)
    except Exception as e:
        logger.error(f"competitor_analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    aid = _save(user_id=user_id, analysis_type="competitors", req=req, result_model=result)
    return _response(result, aid, user_id)


@router.post("/api/v1/seo/keywords", summary="Keyword volume (Bedrock + web search)")
async def keyword_volume(
    req: AnalyseRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Grounded keyword volume research. Saved to DynamoDB."""
    try:
        result = generate_keyword_volume(req)
    except Exception as e:
        logger.error(f"keyword_volume failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    aid = _save(user_id=user_id, analysis_type="keywords", req=req, result_model=result)
    return _response(result, aid, user_id)


@router.post("/api/v1/seo/profile", summary="Company profile (Bedrock + web search)")
async def company_profile(
    req: AnalyseRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Company profile from real scraped content. Saved to DynamoDB."""
    try:
        result = generate_company_profile(req)
    except Exception as e:
        logger.error(f"company_profile failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    aid = _save(user_id=user_id, analysis_type="profile", req=req, result_model=result)
    return _response(result, aid, user_id)


@router.post("/api/v1/seo/domain-authority", summary="DA strategy (Bedrock + web search)")
async def domain_authority(
    req: AnalyseRequest,
    user_id: str = Depends(get_current_user_id),
):
    """DA strategy from real backlink data. Saved to DynamoDB."""
    try:
        result = generate_da_strategy(req)
    except Exception as e:
        logger.error(f"domain_authority failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    aid = _save(user_id=user_id, analysis_type="domain_authority", req=req, result_model=result)
    return _response(result, aid, user_id)


@router.post("/api/v1/seo/full-report", summary="Full SEO report — all 4 analyses (Bedrock)")
async def full_report(
    req: AnalyseRequest,
    user_id: str = Depends(get_current_user_id),
):
    """All 4 analyses (~8 Bedrock calls). Saved to DynamoDB as one record."""
    try:
        result = generate_full_report(req)
    except Exception as e:
        logger.error(f"full_report failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    aid = _save(user_id=user_id, analysis_type="full_report", req=req, result_model=result)
    return _response(result, aid, user_id)


@router.post(
    "/api/v1/seo/content-strategy",
    summary="Keyword → competitor → content strategy generator (Bedrock)",
)
async def content_strategy(
    req: ContentStrategyRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Acts as an SEO + content marketing expert.

    Takes up to 5 primary keywords (plus optional extra keywords the user adds
    from Keyword Intelligence). For each keyword:
      1. Identifies the realistic top-ranking competitors.
      2. Analyses their backlink sources, content strategy, and on-page SEO
         factors (keyword usage, headings, meta structure).
      3. Explains how they achieved their rankings, focusing on backlink
         strategy and content quality.
      4. Generates an original, SEO-optimised content piece — matching or
         improving on the top competitor's style — with strong engagement
         and conversion elements.

    Also returns a cross-keyword executive summary. Saved to DynamoDB.
    """
    try:
        result = generate_content_strategy(req)
    except Exception as e:
        logger.error(f"content_strategy failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    aid = _save(user_id=user_id, analysis_type="content_strategy", req=req, result_model=result)
    return _response(result, aid, user_id)


@router.post(
    "/api/v1/seo/content-strategy/stream",
    summary="Content strategy generator — streamed via Server-Sent Events",
)
async def content_strategy_stream(
    req: ContentStrategyRequest,
    request: Request,
    user_id: str = Depends(get_current_user_id),
):
    """
    Same analysis as POST /api/v1/seo/content-strategy, but streamed as
    Server-Sent Events instead of one blocking JSON response:

      event: start             — {"keywords": [...], "total": N}
      event: analysis          — per-keyword competitor/SEO analysis, as soon
                                  as it's ready
      event: content_delta     — real token-by-token deltas as the article
                                  for that keyword is generated
      event: keyword_report    — the fully assembled report for one keyword
      event: keyword_error     — a keyword failed; the rest keep going
      event: executive_summary — cross-keyword synthesis, once all keywords
                                  that succeeded are done
      event: done              — {"failed_keywords": {...}, "result": {...}}
                                  — the final saved response

    Keywords are processed CONCURRENTLY (bounded), so results for the first
    keyword typically arrive within seconds instead of after the entire
    multi-keyword report finishes. The connection closes automatically if
    the client disconnects (remaining Bedrock calls are cancelled).
    """

    async def event_source():
        try:
            async for event, data in stream_content_strategy_events(
                req, request.is_disconnected
            ):
                yield f"event: {event}\ndata: {json.dumps(data)}\n\n"
                if event == "done":
                    try:
                        aid = save_analysis(
                            user_id=user_id,
                            analysis_type="content_strategy",
                            company_name=req.company_name,
                            url=req.url,
                            market=req.market,
                            industry=req.industry,
                            result=data["result"],
                            request_data=req.model_dump(),
                            status="partial" if data.get("failed_keywords") else "success",
                        )
                        yield f"event: saved\ndata: {json.dumps({'analysis_id': aid})}\n\n"
                    except Exception as e:
                        logger.error(f"[seo] DynamoDB save failed (content_strategy stream): {e}", exc_info=True)
                        yield f"event: saved\ndata: {json.dumps({'analysis_id': 'save-failed'})}\n\n"
        except Exception as e:
            logger.error(f"content_strategy_stream failed: {e}", exc_info=True)
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable proxy buffering (e.g. nginx)
            "Connection": "keep-alive",
        },
    )


# ── History endpoints ─────────────────────────────────────────────────────────

@router.get(
    "/api/v1/history",
    response_model=ListAnalysesResponse,
    summary="List your analyses (paginated)",
)
async def list_my_analyses(
    analysis_type: Optional[str] = Query(None, description="Filter by type"),
    limit: int = Query(20, ge=1, le=100),
    last_key: Optional[str] = Query(None, description="Pagination cursor JSON"),
    user_id: str = Depends(get_current_user_id),
):
    """Returns metadata-only list for the authenticated user. No full payloads."""
    last_evaluated_key = None
    if last_key:
        try:
            last_evaluated_key = json.loads(last_key)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="last_key must be valid JSON")
    try:
        page = list_analyses(user_id, analysis_type=analysis_type, limit=limit,
                             last_evaluated_key=last_evaluated_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return ListAnalysesResponse(
        user_id=user_id,
        items=[AnalysisMeta(**i) for i in page["items"]],
        count=page["count"],
        last_evaluated_key=page["last_evaluated_key"],
    )


@router.get(
    "/api/v1/history/stats",
    response_model=UserStatsResponse,
    summary="Your analysis counts by type",
)
async def my_stats(user_id: str = Depends(get_current_user_id)):
    try:
        return UserStatsResponse(**get_user_stats(user_id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/api/v1/history/{analysis_id}",
    response_model=AnalysisRecord,
    summary="Get a single analysis (full payload)",
)
async def get_one(
    analysis_id: str,
    user_id: str = Depends(get_current_user_id),
):
    try:
        item = get_analysis(user_id, analysis_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not item:
        raise HTTPException(status_code=404, detail=f"Analysis {analysis_id} not found")
    return AnalysisRecord(**item)


@router.delete(
    "/api/v1/history/{analysis_id}",
    response_model=DeleteResponse,
    summary="Delete one of your analyses",
)
async def delete_one(
    analysis_id: str,
    user_id: str = Depends(get_current_user_id),
):
    try:
        deleted = delete_analysis(user_id, analysis_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Analysis {analysis_id} not found")
    return DeleteResponse(deleted=True, analysis_id=analysis_id,
                          message=f"Analysis {analysis_id} deleted")
