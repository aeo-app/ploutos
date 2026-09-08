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
from models.social_models import CompanyDetails, SocialCalendarRequest
from services.bedrock_service import TokenUsageTracker, generate_blog_post, revise_blog_post
from services.social_service import generate_social_calendar, revise_social_post

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
        market=item.get("market", ""), created_at=item.get("created_at", ""), status=item.get("status", ""),
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
            market=i.get("market", ""), created_at=i.get("created_at", ""), status=i.get("status", ""),
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
    summary="Admin creates a new social media calendar ON BEHALF OF a customer, saved under their account",
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
        social_req = SocialCalendarRequest(
            industry=req.industry, business_description=req.business_description,
            target_audience=req.target_audience, market=req.market,
            company=CompanyDetails(
                name=target.get("company_name") or "Your Company",
                phone=req.phone or None, email=req.email or None, website=req.website or target.get("domain") or None,
                instagram=req.instagram or None, facebook=req.facebook or None, linkedin=req.linkedin or None,
            ),
            start_date=req.start_date, end_date=req.end_date,
            content_suggestions=req.content_suggestions,
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid calendar request: {e}")

    try:
        tracker = TokenUsageTracker()
        result = generate_social_calendar(social_req, usage_tracker=tracker, is_paid=True)
        token_usage = tracker.as_dict()
    except Exception as e:
        logger.error(f"[admin] create_calendar_for_user failed: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Could not create this calendar: {e}")

    result_dict = json.loads(result.model_dump_json())
    analysis_id = save_analysis(
        user_id=user_id, analysis_type=CALENDAR_TYPE, company_name=social_req.company.name,
        url=social_req.company.website or "", market=social_req.market, industry=social_req.industry,
        result=result_dict, request_data=social_req.model_dump(mode="json"),
        status="partial" if result.failed_dates else "success", token_usage=token_usage,
    )
    logger.info(f"[admin] {admin_id} created calendar {analysis_id} for user {user_id}, industry={req.industry!r}, market={req.market!r}")
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


# ── Social publishing (Facebook, Instagram — post/schedule on behalf of a
# customer, using THEIR connected accounts, not the admin's own) ───────────
from db import (
    cancel_scheduled_post as _cancel_scheduled_post,
    get_social_connection as _get_social_connection,
    list_scheduled_posts_for_user as _list_scheduled_posts_for_user,
    list_social_connections as _list_social_connections,
    save_scheduled_post as _save_scheduled_post,
)
from models.social_publish_models import (
    CancelScheduledPostResponse,
    PublishRequest as SocialPublishRequest,
    PublishResponse as SocialPublishResponse,
    ScheduledPostListResponse,
    ScheduledPostSummary,
    ScheduleRequest as SocialScheduleRequest,
    ScheduleResponse as SocialScheduleResponse,
    SocialConnectionsStatusResponse,
    SocialPlatformStatus,
    UploadMediaResponse,
)
from services.media_upload_service import MediaUploadError, upload_image as _upload_image
from services.social_publish.publish_service import publish_to_platforms as _publish_to_platforms
from routers.social_publish_router import _resolve_image_url as _resolve_social_image_url
from fastapi import File as _File, UploadFile as _UploadFile
import uuid as _uuid
from datetime import datetime as _datetime, timezone as _timezone


@router.get(
    "/users/{user_id}/social-publish/status",
    response_model=SocialConnectionsStatusResponse,
    summary="Which social platforms this customer has connected",
)
async def user_social_status(user_id: str, admin_id: str = Depends(require_admin)):
    connections = {c["platform"]: c for c in _list_social_connections(user_id)}
    platforms = []
    for platform in ("facebook", "instagram", "linkedin", "google_business"):
        conn = connections.get(platform)
        platforms.append(SocialPlatformStatus(
            platform=platform, connected=conn is not None,
            account_label=(conn or {}).get("extra", {}).get("label", ""),
        ))
    return SocialConnectionsStatusResponse(platforms=platforms)


@router.post(
    "/users/{user_id}/social-publish/uploads",
    response_model=UploadMediaResponse,
    summary="Upload an image on behalf of a customer, to post/schedule to their connected accounts",
)
async def admin_upload_media(user_id: str, admin_id: str = Depends(require_admin), file: _UploadFile = _File(...)):
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=422, detail="Uploaded file is empty")
    try:
        url = _upload_image(contents, file.filename or "upload.jpg", user_id)
    except MediaUploadError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return UploadMediaResponse(image_url=url)


@router.post(
    "/users/{user_id}/social-publish/publish",
    response_model=SocialPublishResponse,
    summary="Post to a customer's connected Facebook/Instagram/LinkedIn/Google Business right now",
)
async def admin_publish(user_id: str, req: SocialPublishRequest, admin_id: str = Depends(require_admin)):
    image_url = _resolve_social_image_url(user_id, req.poster_id, req.image_url)
    results = _publish_to_platforms(user_id, req.platforms, image_url, req.caption, cta_url=req.cta_url)

    # Same persistence the customer-facing /publish endpoint has — without
    # this, an admin's "post now" on a customer's behalf left no history
    # trace at all, identical to the bug fixed for the customer-facing path.
    successes = sum(1 for r in results if r["success"])
    overall_status = "posted" if successes == len(results) else ("partial" if successes > 0 else "failed")
    schedule_id = str(_uuid.uuid4())
    now_iso = _datetime.now(_timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    _save_scheduled_post(
        schedule_id=schedule_id, user_id=user_id,
        day_date=req.day_date or _datetime.now(_timezone.utc).date().isoformat(), post_number=req.post_number,
        platforms=req.platforms, caption=req.caption, image_url=image_url, cta_url=req.cta_url or "",
        scheduled_time_iso=now_iso, status=overall_status, results=results,
    )
    logger.info(f"[admin] {admin_id} published to {req.platforms} on behalf of user {user_id}: {overall_status}")
    return SocialPublishResponse(results=results)


@router.post(
    "/users/{user_id}/social-publish/schedule",
    response_model=SocialScheduleResponse,
    summary="Schedule a post to a customer's Facebook/Instagram for a future time",
)
async def admin_schedule(user_id: str, req: SocialScheduleRequest, admin_id: str = Depends(require_admin)):
    try:
        scheduled_dt = _datetime.fromisoformat(req.scheduled_time.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid scheduled_time: {req.scheduled_time!r} — use ISO 8601")
    if scheduled_dt <= _datetime.now(_timezone.utc):
        raise HTTPException(status_code=422, detail="scheduled_time must be in the future")

    image_url = _resolve_social_image_url(user_id, req.poster_id, req.image_url)
    schedule_id = str(_uuid.uuid4())
    scheduled_iso = scheduled_dt.astimezone(_timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    _save_scheduled_post(
        schedule_id=schedule_id, user_id=user_id, day_date=req.day_date, post_number=req.post_number, platforms=req.platforms,
        caption=req.caption, image_url=image_url, cta_url=req.cta_url or "", scheduled_time_iso=scheduled_iso,
    )
    logger.info(f"[admin] {admin_id} scheduled a post for user {user_id} at {scheduled_iso}")
    return SocialScheduleResponse(schedule_id=schedule_id, scheduled_time=scheduled_iso, status="pending")


@router.get(
    "/users/{user_id}/social-publish/scheduled",
    response_model=ScheduledPostListResponse,
    summary="List a customer's scheduled posts",
)
async def admin_list_scheduled(user_id: str, admin_id: str = Depends(require_admin)):
    items = _list_scheduled_posts_for_user(user_id)
    return ScheduledPostListResponse(items=[
        ScheduledPostSummary(
            schedule_id=i["schedule_id"], day_date=i.get("day_date", ""), post_number=i.get("post_number"), platforms=i.get("platforms", []),
            caption=i.get("caption", ""), image_url=i.get("image_url", ""), scheduled_time=i.get("scheduled_time", ""),
            status=i.get("status", "pending"), results=i.get("results", []),
        )
        for i in items
    ])


@router.delete(
    "/users/{user_id}/social-publish/scheduled/{schedule_id}",
    response_model=CancelScheduledPostResponse,
    summary="Cancel a customer's pending scheduled post",
)
async def admin_cancel_scheduled(user_id: str, schedule_id: str, admin_id: str = Depends(require_admin)):
    ok = _cancel_scheduled_post(schedule_id, user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="No pending scheduled post found with that id for this customer")
    return CancelScheduledPostResponse(cancelled=True)


@router.post(
    "/users/{user_id}/social-publish/scheduled/{schedule_id}/retry",
    response_model=ScheduledPostSummary,
    summary="Retry a customer's failed or partially-failed post",
)
async def admin_retry_scheduled(user_id: str, schedule_id: str, admin_id: str = Depends(require_admin)):
    from db import get_scheduled_post as _get_scheduled_post, update_scheduled_post_status as _update_scheduled_post_status
    from services.social_publish.publish_service import publish_to_platforms as _publish_to_platforms

    post = _get_scheduled_post(schedule_id)
    if not post or post.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="No scheduled post found with that id for this customer")
    if post.get("status") not in ("failed", "partial"):
        raise HTTPException(status_code=409, detail=f"Only failed or partially-failed posts can be retried (this one is {post.get('status')!r}).")

    results = _publish_to_platforms(user_id, post["platforms"], post["image_url"], post["caption"], cta_url=post.get("cta_url") or None)
    successes = sum(1 for r in results if r["success"])
    overall_status = "posted" if successes == len(results) else ("partial" if successes > 0 else "failed")
    _update_scheduled_post_status(schedule_id, overall_status, results=results)
    logger.info(f"[admin] {admin_id} retried post {schedule_id} for user {user_id}: {overall_status} ({successes}/{len(results)} succeeded)")

    return ScheduledPostSummary(
        schedule_id=schedule_id, day_date=post.get("day_date", ""), post_number=post.get("post_number"), platforms=post.get("platforms", []),
        caption=post.get("caption", ""), image_url=post.get("image_url", ""), scheduled_time=post.get("scheduled_time", ""),
        status=overall_status, results=results,
    )


# ── Canva poster auto-generation (template rotation + AI image, on behalf of
# a customer, using THEIR connected Canva account) ──────────────────────────
from routers.canva_router import _auto_generate_poster as _canva_auto_generate_poster
from models.canva_models import AutoGeneratePosterRequest, PosterResponse as CanvaPosterResponse


@router.post(
    "/users/{user_id}/canva/posters/auto-generate",
    response_model=CanvaPosterResponse,
    summary="Auto-generate a poster (rotated template + AI-generated image) for a customer, saved under their account",
)
async def admin_auto_generate_poster(user_id: str, req: AutoGeneratePosterRequest, admin_id: str = Depends(require_admin)):
    result = await _canva_auto_generate_poster(user_id, req)
    logger.info(f"[admin] {admin_id} auto-generated a poster for user {user_id}, day={req.day_date} post={req.post_number}")
    return result
