"""
routers/admin_router.py — Admin panel
=========================================
Every endpoint here requires core.security.require_admin — a DynamoDB-backed
role (db.dynamo.is_admin/set_admin), bootstrapped via the ADMIN_EMAILS env
var at signup/login (see routers/auth_router.py). Not tied to Cognito custom
attributes, so it doesn't hit the schema-immutability constraints documented
in infra/cognito.tf.

Scope: user directory, and centralized review/editing of every user's saved
relocation social media calendars ("scheduling") AND blog posts, including
AI-assisted revisions — admin supplies a free-text instruction, Bedrock
revises the specific post/blog accordingly, admin reviews before it's saved.
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException

from core.security import require_admin
from db import is_admin as db_is_admin
from db import is_user_paid
from db.dynamo import get_analysis, list_all_users, list_analyses, save_analysis, set_admin, update_analysis_result
from models.blog_models import GenerateBlogRequest
from models.admin_models import (
    AdminBlogDetailResponse,
    AdminBlogListResponse,
    AdminBlogSummary,
    AdminCalendarDetailResponse,
    AdminCalendarListResponse,
    AdminCalendarSummary,
    CreateBlogForUserRequest,
    CreateCalendarForUserRequest,
    ReviseBlogRequest,
    ReviseCalendarPostRequest,
    SetAdminRequest,
    UpdateBlogRequest,
    UpdateCalendarRequest,
    UserListResponse,
    UserSummary,
)
from models.social_models import CompanyDetails, RelocationSocialRequest
from services.bedrock_service import TokenUsageTracker, generate_blog_post, revise_blog_post
from services.social_service import generate_relocation_calendar, revise_social_post

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/admin", tags=["Admin"])

CALENDAR_TYPE = "relocation_social_calendar"
BLOG_TYPE = "blog_post"


def _require_analysis(user_id: str, analysis_id: str, expected_type: str, label: str) -> dict:
    item = get_analysis(user_id, analysis_id)
    if not item or item.get("analysis_type") != expected_type:
        raise HTTPException(status_code=404, detail=f"No {label} {analysis_id} found for user {user_id}")
    return item


def _to_calendar_detail(analysis_id: str, user_id: str, item: dict) -> AdminCalendarDetailResponse:
    return AdminCalendarDetailResponse(
        analysis_id=analysis_id, user_id=user_id, company_name=item.get("company_name", ""),
        country=item.get("market", ""), created_at=item.get("created_at", ""), status=item.get("status", ""),
        result=item.get("result", {}), request=item.get("request", {}),
    )


def _to_blog_detail(analysis_id: str, user_id: str, item: dict) -> AdminBlogDetailResponse:
    return AdminBlogDetailResponse(
        analysis_id=analysis_id, user_id=user_id, company_name=item.get("company_name", ""),
        created_at=item.get("created_at", ""), status=item.get("status", ""),
        result=item.get("result", {}), request=item.get("request", {}),
    )


# ── Users ────────────────────────────────────────────────────────────────────
@router.get("/users", response_model=UserListResponse, summary="List every registered user")
async def list_users(admin_id: str = Depends(require_admin)):
    """
    Pulled from the registry written at signup/login (see
    db.dynamo.register_user) — accounts that predate this feature are
    backfilled into the registry the next time they log in, so this list
    may briefly miss very old, inactive accounts until their next login.
    """
    users = list_all_users()
    return UserListResponse(users=[
        UserSummary(
            user_id=u["user_id"], email=u.get("email", ""), full_name=u.get("full_name", ""),
            company_name=u.get("company_name", ""), domain=u.get("domain", ""),
            created_at=u.get("created_at", ""),
            is_admin=db_is_admin(u["user_id"]),
            is_paid=is_user_paid(u["user_id"]),
        )
        for u in users
    ])


@router.post("/users/{user_id}/set-admin", response_model=UserSummary, summary="Grant or revoke admin access for a user")
async def set_user_admin(user_id: str, req: SetAdminRequest, admin_id: str = Depends(require_admin)):
    if user_id == admin_id and not req.is_admin:
        raise HTTPException(status_code=400, detail="You can't revoke your own admin access.")

    users = {u["user_id"]: u for u in list_all_users()}
    u = users.get(user_id)
    if not u:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found in the registry")

    # Cognito Groups is the canonical mechanism (see core.security.require_admin)
    # — best-effort here, since local/dev environments may not have real
    # Cognito configured at all. DynamoDB below is what actually takes
    # effect immediately regardless of whether this succeeds.
    try:
        from services.cognito_service import add_user_to_group, remove_user_from_group
        email = u.get("email", "")
        if email:
            if req.is_admin:
                add_user_to_group(email)
            else:
                remove_user_from_group(email)
    except Exception as e:
        logger.warning(f"[admin] Cognito group sync failed for {user_id} (non-fatal, DynamoDB still updated): {e}")

    set_admin(user_id, req.is_admin)
    return UserSummary(
        user_id=u["user_id"], email=u.get("email", ""), full_name=u.get("full_name", ""),
        company_name=u.get("company_name", ""), domain=u.get("domain", ""),
        created_at=u.get("created_at", ""), is_admin=req.is_admin, is_paid=is_user_paid(user_id),
    )


# ── Scheduling (relocation social media calendars) ──────────────────────────
@router.get(
    "/users/{user_id}/calendars",
    response_model=AdminCalendarListResponse,
    summary="List a user's saved relocation social media calendars",
)
async def list_user_calendars(user_id: str, admin_id: str = Depends(require_admin)):
    page = list_analyses(user_id, analysis_type=CALENDAR_TYPE, limit=100)
    return AdminCalendarListResponse(items=[
        AdminCalendarSummary(
            analysis_id=i["analysis_id"], user_id=user_id, company_name=i.get("company_name", ""),
            country=i.get("market", ""), created_at=i.get("created_at", ""), status=i.get("status", ""),
        )
        for i in page["items"]
    ])


@router.get(
    "/users/{user_id}/calendars/{analysis_id}",
    response_model=AdminCalendarDetailResponse,
    summary="Get the full saved payload of one user's calendar, for editing",
)
async def get_user_calendar(user_id: str, analysis_id: str, admin_id: str = Depends(require_admin)):
    item = _require_analysis(user_id, analysis_id, CALENDAR_TYPE, "relocation calendar")
    return _to_calendar_detail(analysis_id, user_id, item)


@router.put(
    "/users/{user_id}/calendars/{analysis_id}",
    response_model=AdminCalendarDetailResponse,
    summary="Edit and save a user's relocation calendar (e.g. fix a caption, swap a day)",
)
async def update_user_calendar(user_id: str, analysis_id: str, req: UpdateCalendarRequest, admin_id: str = Depends(require_admin)):
    _require_analysis(user_id, analysis_id, CALENDAR_TYPE, "relocation calendar")
    updated = update_analysis_result(user_id, analysis_id, req.result)
    if not updated:
        raise HTTPException(status_code=404, detail=f"No relocation calendar {analysis_id} found for user {user_id}")
    logger.info(f"[admin] {admin_id} edited calendar {analysis_id} for user {user_id}")
    return _to_calendar_detail(analysis_id, user_id, updated)


@router.post(
    "/users/{user_id}/calendars/{analysis_id}/revise-post",
    response_model=AdminCalendarDetailResponse,
    summary="AI-assisted edit: give an instruction, Bedrock revises one post in the calendar, saves it",
)
async def revise_user_calendar_post(
    user_id: str, analysis_id: str, req: ReviseCalendarPostRequest, admin_id: str = Depends(require_admin),
):
    item = _require_analysis(user_id, analysis_id, CALENDAR_TYPE, "relocation calendar")
    result = item.get("result", {})
    days = result.get("days", [])

    day_slot = next((d for d in days if d.get("date") == req.date), None)
    if not day_slot or day_slot.get("locked") or not day_slot.get("schedule"):
        raise HTTPException(status_code=404, detail=f"No unlocked day {req.date} found in this calendar")
    posts = day_slot["schedule"].get("posts", [])
    post_idx = next((i for i, p in enumerate(posts) if p.get("post_number") == req.post_number), None)
    if post_idx is None:
        raise HTTPException(status_code=404, detail=f"No post #{req.post_number} found on {req.date}")

    try:
        tracker = TokenUsageTracker()
        revised = revise_social_post(posts[post_idx], req.instruction, usage_tracker=tracker)
    except Exception as e:
        logger.error(f"[admin] revise_social_post failed: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Could not revise this post: {e}")

    posts[post_idx] = revised.model_dump()
    updated = update_analysis_result(user_id, analysis_id, result)
    logger.info(f"[admin] {admin_id} AI-revised {req.date} post #{req.post_number} for user {user_id}: {req.instruction!r}")
    return _to_calendar_detail(analysis_id, user_id, updated)


@router.post(
    "/users/{user_id}/calendars/create",
    response_model=AdminCalendarDetailResponse,
    summary="Admin creates a new relocation social media calendar ON BEHALF OF a customer, saved under their account",
)
async def create_calendar_for_user(user_id: str, req: CreateCalendarForUserRequest, admin_id: str = Depends(require_admin)):
    """
    Same "create, not just revise" capability POST /blogs/create gives for
    blogs — uses the customer's own company_name (from the registry) unless
    the admin overrides contact details, generates the FULL calendar
    unlocked (is_paid=True) regardless of the customer's own paid status,
    since the admin is deliberately creating this for them. Saved under
    `user_id`, not the admin's own account.
    """
    users = {u["user_id"]: u for u in list_all_users()}
    target = users.get(user_id)
    if not target:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found in the registry")

    try:
        social_req = RelocationSocialRequest(
            country=req.country,
            company=CompanyDetails(
                name=target.get("company_name") or "Your Company",
                phone=req.phone or None, email=req.email or None, website=req.website or target.get("domain") or None,
                instagram=req.instagram or None, facebook=req.facebook or None, linkedin=req.linkedin or None,
            ),
            start_date=req.start_date, end_date=req.end_date,
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid calendar request: {e}")

    try:
        tracker = TokenUsageTracker()
        result = generate_relocation_calendar(social_req, usage_tracker=tracker, is_paid=True)
        token_usage = tracker.as_dict()
    except Exception as e:
        logger.error(f"[admin] create_calendar_for_user failed: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Could not create this calendar: {e}")

    result_dict = json.loads(result.model_dump_json())
    analysis_id = save_analysis(
        user_id=user_id, analysis_type=CALENDAR_TYPE, company_name=social_req.company.name,
        url=social_req.company.website or "", market=social_req.country, industry="Relocation Services",
        result=result_dict, request_data=social_req.model_dump(mode="json"),
        status="partial" if result.failed_dates else "success", token_usage=token_usage,
    )
    logger.info(f"[admin] {admin_id} created calendar {analysis_id} for user {user_id}, country={req.country!r}")
    return _to_calendar_detail(analysis_id, user_id, get_analysis(user_id, analysis_id))


# ── Blogs ────────────────────────────────────────────────────────────────────
@router.get(
    "/users/{user_id}/blogs",
    response_model=AdminBlogListResponse,
    summary="List a user's saved blog posts",
)
async def list_user_blogs(user_id: str, admin_id: str = Depends(require_admin)):
    page = list_analyses(user_id, analysis_type=BLOG_TYPE, limit=100)
    return AdminBlogListResponse(items=[
        AdminBlogSummary(
            analysis_id=i["analysis_id"], user_id=user_id, company_name=i.get("company_name", ""),
            created_at=i.get("created_at", ""), status=i.get("status", ""),
        )
        for i in page["items"]
    ])


@router.get(
    "/users/{user_id}/blogs/{analysis_id}",
    response_model=AdminBlogDetailResponse,
    summary="Get the full saved payload of one user's blog post, for editing",
)
async def get_user_blog(user_id: str, analysis_id: str, admin_id: str = Depends(require_admin)):
    item = _require_analysis(user_id, analysis_id, BLOG_TYPE, "blog post")
    return _to_blog_detail(analysis_id, user_id, item)


@router.put(
    "/users/{user_id}/blogs/{analysis_id}",
    response_model=AdminBlogDetailResponse,
    summary="Edit and save a user's blog post directly",
)
async def update_user_blog(user_id: str, analysis_id: str, req: UpdateBlogRequest, admin_id: str = Depends(require_admin)):
    _require_analysis(user_id, analysis_id, BLOG_TYPE, "blog post")
    updated = update_analysis_result(user_id, analysis_id, req.result)
    if not updated:
        raise HTTPException(status_code=404, detail=f"No blog post {analysis_id} found for user {user_id}")
    logger.info(f"[admin] {admin_id} edited blog {analysis_id} for user {user_id}")
    return _to_blog_detail(analysis_id, user_id, updated)


@router.post(
    "/users/{user_id}/blogs/{analysis_id}/revise",
    response_model=AdminBlogDetailResponse,
    summary="AI-assisted edit: give an instruction, Bedrock revises the blog post, saves it",
)
async def revise_user_blog(user_id: str, analysis_id: str, req: ReviseBlogRequest, admin_id: str = Depends(require_admin)):
    item = _require_analysis(user_id, analysis_id, BLOG_TYPE, "blog post")
    result = item.get("result", {})
    current_post = result.get("post")
    if not current_post:
        raise HTTPException(status_code=422, detail="This blog record has no `post` content to revise")

    try:
        tracker = TokenUsageTracker()
        revised = revise_blog_post(current_post, req.instruction, usage_tracker=tracker)
    except Exception as e:
        logger.error(f"[admin] revise_blog_post failed: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Could not revise this blog post: {e}")

    result["post"] = revised.model_dump()
    updated = update_analysis_result(user_id, analysis_id, result)
    logger.info(f"[admin] {admin_id} AI-revised blog {analysis_id} for user {user_id}: {req.instruction!r}")
    return _to_blog_detail(analysis_id, user_id, updated)


@router.post(
    "/users/{user_id}/blogs/create",
    response_model=AdminBlogDetailResponse,
    summary="Admin creates a new blog post ON BEHALF OF a customer, saved under their account",
)
async def create_blog_for_user(user_id: str, req: CreateBlogForUserRequest, admin_id: str = Depends(require_admin)):
    """
    Uses the customer's own company_name/domain (from the registry) and
    their most recent market/industry (from their own history, if any) —
    the admin only supplies the topic/keyword/instruction. Saved under
    `user_id`, not the admin's own account, so it shows up in this
    customer's normal History/Blog Topics pages exactly like anything
    they'd generated themselves.
    """
    users = {u["user_id"]: u for u in list_all_users()}
    target = users.get(user_id)
    if not target:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found in the registry")

    recent = list_analyses(user_id, limit=1)
    latest = recent["items"][0] if recent["items"] else {}

    gen_req = GenerateBlogRequest(
        company_name=target.get("company_name", ""),
        url=target.get("domain", ""),
        market=latest.get("market", ""),
        industry=latest.get("industry", ""),
        topic=req.topic,
        target_keyword=req.target_keyword,
    )
    if req.instruction:
        gen_req.topic = f"{req.topic} (additional guidance: {req.instruction})"

    try:
        tracker = TokenUsageTracker()
        post = generate_blog_post(gen_req, usage_tracker=tracker)
        token_usage = tracker.as_dict()
    except Exception as e:
        logger.error(f"[admin] create_blog_for_user failed: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Could not create this blog post: {e}")

    result = {"topic": req.topic, "target_keyword": req.target_keyword, "post": post.model_dump()}
    analysis_id = save_analysis(
        user_id=user_id, analysis_type=BLOG_TYPE, company_name=gen_req.company_name, url=gen_req.url,
        market=gen_req.market, industry=gen_req.industry, result=result,
        request_data=gen_req.model_dump(), token_usage=token_usage,
    )
    logger.info(f"[admin] {admin_id} created blog {analysis_id} for user {user_id}, topic={req.topic!r}")
    return _to_blog_detail(analysis_id, user_id, get_analysis(user_id, analysis_id))
