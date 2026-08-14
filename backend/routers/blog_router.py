"""
routers/blog_router.py — SEO-informed blog topic planning + generation
===========================================================================
No payment required to CALL these endpoints — unpaid users get a couple of
real topic suggestions (real Bedrock cost) and the rest come back as
zero-cost locked placeholders, same free-preview pattern as the other
single-call analyses (competitors/keywords/profile/domain-authority).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from core.security import get_current_user_id
from db import check_and_lock_domain, DomainMismatchError, is_user_paid
from db.dynamo import save_analysis
from models.blog_models import (
    GenerateBlogRequest,
    GenerateBlogResponse,
    SuggestBlogTopicsRequest,
    SuggestBlogTopicsResponse,
)
from services.bedrock_service import TokenUsageTracker, generate_blog_post, suggest_blog_topics

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/blog", tags=["Blog Topics"])


def _enforce_domain(user_id: str, req) -> None:
    """Same one-to-one user<->domain mapping as every other analysis
    endpoint (see routers/seo_router.py)."""
    try:
        check_and_lock_domain(user_id, req.url, req.company_name)
    except DomainMismatchError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.post(
    "/suggest-topics",
    response_model=SuggestBlogTopicsResponse,
    summary="Suggest SEO-informed blog topic ideas for a company",
)
async def suggest_topics(req: SuggestBlogTopicsRequest, user_id: str = Depends(get_current_user_id)):
    _enforce_domain(user_id, req)
    try:
        tracker = TokenUsageTracker()
        topics = suggest_blog_topics(req, usage_tracker=tracker, is_paid=is_user_paid(user_id))
    except Exception as e:
        logger.error(f"suggest_topics failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    return SuggestBlogTopicsResponse(company=req.company_name, url=req.url, topics=topics)


@router.post(
    "/generate",
    response_model=GenerateBlogResponse,
    summary="Write a full, ready-to-publish blog post for one topic",
)
async def generate(req: GenerateBlogRequest, user_id: str = Depends(get_current_user_id)):
    _enforce_domain(user_id, req)
    try:
        tracker = TokenUsageTracker()
        post = generate_blog_post(req, usage_tracker=tracker)
        token_usage = tracker.as_dict()
    except Exception as e:
        logger.error(f"generate_blog failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    response = GenerateBlogResponse(topic=req.topic, target_keyword=req.target_keyword, post=post)
    try:
        save_analysis(
            user_id=user_id, analysis_type="blog_post", company_name=req.company_name, url=req.url,
            market=req.market, industry=req.industry, result=response.model_dump(),
            request_data=req.model_dump(), token_usage=token_usage,
        )
    except Exception as e:
        logger.error(f"[blog] failed to save blog_post to history: {e}", exc_info=True)
        # Non-fatal — the generated post is still returned to the caller even
        # if saving to history failed.

    return response
