"""
models/social_publish_models.py — Direct posting to Facebook, Instagram,
LinkedIn, and Google Business Profile.
"""
from pydantic import BaseModel, Field
from typing import Optional


class SocialPlatformStatus(BaseModel):
    platform: str  # facebook | instagram | linkedin | google_business
    connected: bool
    account_label: str = ""  # Page/org/location name, for display


class SocialConnectionsStatusResponse(BaseModel):
    platforms: list[SocialPlatformStatus]


class ConnectResponse(BaseModel):
    authorize_url: str


class PublishRequest(BaseModel):
    poster_id: str = Field(..., description="An existing Canva poster (see routers/canva_router.py)")
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
