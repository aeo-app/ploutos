from datetime import date, datetime, timezone
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field

from common.models import CompanyProfile


class PlatformEnum(str, Enum):
    facebook = "facebook"
    instagram = "instagram"
    linkedin = "linkedin"
    twitter_x = "twitter_x"
    tiktok = "tiktok"
    youtube = "youtube"
    pinterest = "pinterest"


class CampaignBudgets(BaseModel):
    campaign_1_monthly: Optional[float] = None
    campaign_2_monthly: Optional[float] = None
    campaign_3_monthly: Optional[float] = None


class ScheduleRequest(BaseModel):
    company_profile: CompanyProfile
    platforms: Optional[list[PlatformEnum]] = None
    duration_days: Literal[30, 60, 90] = 90
    start_date: Optional[date] = None
    campaign_budgets: Optional[CampaignBudgets] = None
    currency: str = "SGD"
    tone_override: Optional[str] = None


class Post(BaseModel):
    id: str
    week: int
    month: int
    phase: Literal["foundation", "growth", "acceleration"]
    day: str
    date: date
    platform: PlatformEnum
    post_type: str
    content_pillar: str
    topic_headline: str
    caption: str
    visual_description: str
    hashtags: list[str]
    target_audience: str
    post_time: Optional[str] = None
    timezone: str
    automation_tool: str
    is_paid: bool = False
    budget_type: Literal["organic", "paid", "boosted"] = "organic"
    budget_amount: Optional[float] = None
    budget_currency: Optional[str] = None
    campaign_id: Optional[str] = None
    goal: str
    cta: str
    automation_level: str = "⚡ Partial"
    team: str = "Marketing"
    est_hours: float = 1.0
    status: str = "Not started"
    notes: str = ""


class Campaign(BaseModel):
    id: str
    name: str
    type: Literal["prospecting", "retargeting", "lookalike"]
    run_weeks_start: int
    run_weeks_end: int
    budget_monthly: float
    budget_daily: float
    budget_currency: str
    objective: str
    target_audience_id: str
    ad_copy_direction: str
    creative_brief: str
    kpi_targets: dict
    optimisation_notes: str


class AudienceSegment(BaseModel):
    id: str
    tier: Literal["primary", "secondary", "retarget", "lookalike"]
    segment_name: str
    demographic: Optional[dict] = None
    interests: Optional[list[str]] = None
    behaviours: Optional[list[str]] = None
    exclusions: Optional[list[str]] = None
    definition: Optional[str] = None
    setup_notes: str


class CaptionTemplate(BaseModel):
    id: str
    post_type: str
    platform: PlatformEnum
    prompt_template: str
    output_direction: str
    word_count_min: int
    word_count_max: int


class ScheduleOutput(BaseModel):
    company_name: str
    domain_url: str
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    duration_days: int
    start_date: date
    end_date: date
    platforms: list[PlatformEnum]
    strategy: dict
    schedule: list[Post]
    campaigns: list[Campaign]
    audiences: list[AudienceSegment]
    caption_templates: list[CaptionTemplate]
