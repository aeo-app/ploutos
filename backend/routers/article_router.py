"""
routers/article_router.py — Article Generator
================================================================================
Two-phase flow: POST /research-brief first (search intent, content gaps,
subtopics, a research-source table, content pillars), then POST /generate
using that brief as grounding for the full article. See
models/article_models.py's module docstring for why the research phase is
labeled AI-suggested guidance rather than verified research — this app's
Bedrock backend has no live web search tool.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from core.security import get_current_user_id
from db import check_and_lock_domain, DomainMismatchError
from db.dynamo import save_analysis
from models.article_models import (
    ArticleResponse,
    GenerateArticleRequest,
    ResearchBriefRequest,
    ResearchBriefResponse,
)
from services.article_service import generate_article, generate_research_brief
from services.bedrock_service import TokenUsageTracker

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/articles", tags=["Article Generator"])


def _enforce_domain(user_id: str, brief) -> None:
    """Same one-to-one user<->domain mapping as every other analysis
    endpoint (see routers/seo_router.py)."""
    try:
        check_and_lock_domain(user_id, brief.url, brief.business_name)
    except DomainMismatchError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.post(
    "/research-brief",
    response_model=ResearchBriefResponse,
    summary="Phase 1: research plan for an article topic — search intent, content gaps, subtopics, sources, content pillars",
)
async def research_brief(req: ResearchBriefRequest, user_id: str = Depends(get_current_user_id)):
    _enforce_domain(user_id, req.brief)
    try:
        tracker = TokenUsageTracker()
        brief_result = generate_research_brief(req, usage_tracker=tracker)
    except Exception as e:
        logger.error(f"research_brief failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    return brief_result


@router.post(
    "/generate",
    response_model=ArticleResponse,
    summary="Phase 2: write the full article using a research brief from /research-brief",
)
async def generate(req: GenerateArticleRequest, user_id: str = Depends(get_current_user_id)):
    _enforce_domain(user_id, req.brief)
    try:
        tracker = TokenUsageTracker()
        article = generate_article(req, usage_tracker=tracker)
        token_usage = tracker.as_dict()
    except Exception as e:
        logger.error(f"generate_article failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    try:
        save_analysis(
            user_id=user_id, analysis_type="seo_article", company_name=req.brief.business_name,
            url=req.brief.url, market=req.brief.target_audience, industry=req.brief.industry,
            result=article.model_dump(), request_data=req.model_dump(), token_usage=token_usage,
        )
    except Exception as e:
        logger.error(f"[articles] failed to save seo_article to history: {e}", exc_info=True)
        # Non-fatal — the generated article is still returned even if saving
        # to history failed.

    return article
