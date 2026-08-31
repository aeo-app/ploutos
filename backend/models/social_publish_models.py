"""
models/social_publish_models.py — Direct posting to Facebook, Instagram,
LinkedIn, and Google Business Profile, including scheduled posts and
user-uploaded (non-Canva) images.
"""
from pydantic import BaseModel, Field, model_validator
from typing import Optional


class SocialPlatformStatus(BaseModel):
    platform: str  # facebook | instagram | linkedin | google_business
    connected: bool
    account_label: str = ""  # Page/org/location name, for display


class SocialConnectionsStatusResponse(BaseModel):
    platforms: list[SocialPlatformStatus]


class ConnectResponse(BaseModel):
    authorize_url: str


class UploadMediaResponse(BaseModel):
    image_url: str


class _ImageSourceMixin(BaseModel):
    """Every publish/schedule request needs exactly one image source:
    either an existing Canva poster (its current export is fetched fresh),
    or a directly-uploaded image's URL (see POST /social-publish/uploads).
    Never both, never neither."""
    poster_id: Optional[str] = Field(None, description="An existing Canva poster (see routers/canva_router.py)")
    image_url: Optional[str] = Field(None, description="A URL from POST /social-publish/uploads, for a user's own image instead of a Canva poster")

    @model_validator(mode="after")
    def _exactly_one_image_source(self):
        if bool(self.poster_id) == bool(self.image_url):
            raise ValueError("Provide exactly one of poster_id or image_url, not both and not neither.")
        return self


class PublishRequest(_ImageSourceMixin):
    caption: str = Field(..., min_length=1)
    platforms: list[str] = Field(..., min_length=1, example=["facebook", "instagram", "linkedin", "google_business"])
    cta_url: Optional[str] = Field(None, description="Used for Google Business Profile's 'Learn more' button, if provided")


class PlatformPublishResult(BaseModel):
    platform: str
    success: bool
    post_id: Optional[str] = None
    error: Optional[str] = None


class PublishResponse(BaseModel):
    results: list[PlatformPublishResult]


# ── Scheduling (Facebook + Instagram only — see services/social_publish/
# scheduler.py for why LinkedIn/Google Business aren't included yet) ────────
SCHEDULABLE_PLATFORMS = {"facebook", "instagram"}


class ScheduleRequest(_ImageSourceMixin):
    day_date: str = Field(..., example="2026-09-03", description="Which calendar day this post belongs to")
    caption: str = Field(..., min_length=1)
    platforms: list[str] = Field(..., min_length=1, example=["facebook", "instagram"])
    scheduled_time: str = Field(..., description="ISO 8601 datetime, must be in the future (e.g. 2026-09-03T09:00:00Z)")
    cta_url: Optional[str] = None

    @model_validator(mode="after")
    def _only_schedulable_platforms(self):
        bad = set(self.platforms) - SCHEDULABLE_PLATFORMS
        if bad:
            raise ValueError(f"Scheduling isn't supported for: {', '.join(sorted(bad))}. Only {', '.join(sorted(SCHEDULABLE_PLATFORMS))} can be scheduled — post to other platforms immediately instead.")
        return self


class ScheduleResponse(BaseModel):
    schedule_id: str
    scheduled_time: str
    status: str


class ScheduledPostSummary(BaseModel):
    schedule_id: str
    day_date: str
    platforms: list[str]
    caption: str
    image_url: str
    scheduled_time: str
    status: str  # pending | posted | failed | cancelled
    results: list[PlatformPublishResult] = []


class ScheduledPostListResponse(BaseModel):
    items: list[ScheduledPostSummary]


class CancelScheduledPostResponse(BaseModel):
    cancelled: bool
