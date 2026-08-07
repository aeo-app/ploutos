"""
models/social_models.py — Relocation Social Media Content Calendar
====================================================================
Separate from seo_models.py: this is a distinct content domain (social
media calendars for relocation services), not SEO competitive analysis.

Generic for any relocation company — nothing here is tied to one specific
business's history or corridors. `company` carries whatever contact
details the requesting company wants baked into captions/CTAs.

Design note: the SCHEDULE (which dates, which content type/category/tone
goes on which day, recommended posting times) is decided deterministically
in Python — see services/social_service.py `_build_schedule_slots`. That
guarantees genuine variety (no repeated category within 3 days, no fixed
weekly pattern) instead of hoping an LLM "randomizes" on request. Bedrock's
job is only the creative writing for each pre-assigned slot.
"""

from datetime import date as date_type
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional

CATEGORIES = [
    "Relocation Insights",
    "Helpful Moving Guides",
    "Customer Experience",
    "Country-Specific",
]
TONES = ["emotional", "professional", "educational", "storytelling"]
CTA_STYLES = ["soft", "urgent", "informative"]

# One Bedrock call per day (bounded, concurrent) — cap the range so a single
# request can't ask for an unbounded number of calls. ~2 months is generous;
# split longer campaigns into multiple requests.
MAX_DATE_RANGE_DAYS = 62


# ── Request ─────────────────────────────────────────────────────────────────
class CompanyDetails(BaseModel):
    """Whatever contact/brand details this company wants reflected in
    captions and CTAs. Every field but `name` is optional — generic enough
    for any relocation company, not tied to one business's specific setup."""
    name: str = Field(..., min_length=1, example="Your Relocation Company")
    phone: Optional[str] = Field(default=None, example="+65 6520 1914")
    email: Optional[str] = Field(default=None, example="contact@example.com")
    website: Optional[str] = Field(default=None, example="www.example.com")
    instagram: Optional[str] = None
    facebook: Optional[str] = None
    linkedin: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("company name cannot be empty")
        return v


class RelocationSocialRequest(BaseModel):
    country: str = Field(..., min_length=1, example="Canada",
                          description="Destination country the content is about")
    company: CompanyDetails
    start_date: date_type = Field(..., description="First day of the content calendar (inclusive).")
    end_date: date_type = Field(..., description="Last day of the content calendar (inclusive).")

    @field_validator("country")
    @classmethod
    def _strip_country(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("country cannot be empty")
        return v

    @model_validator(mode="after")
    def _validate_range(self) -> "RelocationSocialRequest":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        span_days = (self.end_date - self.start_date).days + 1
        if span_days > MAX_DATE_RANGE_DAYS:
            raise ValueError(
                f"Date range spans {span_days} days — max is {MAX_DATE_RANGE_DAYS} "
                "(each day costs one Bedrock call). Split longer campaigns into "
                "multiple requests."
            )
        return self


# ── Per-post content ─────────────────────────────────────────────────────────
class PlatformCaptions(BaseModel):
    instagram: str
    facebook: str
    linkedin: str
    google_business: str
    # google_business must NEVER contain a testimonial/review, even when the
    # post's category is "Customer Experience" — enforced via prompt
    # instruction (see social_service.py SOCIAL_SYSTEM_PROMPT).


class CarouselSlide(BaseModel):
    slide_number: int
    role: str        # "hook" | "content" | "cta"
    text: str


class SocialPost(BaseModel):
    post_number: int             # 1 or 2 for that day — assigned in Python
    content_type: str            # "Poster" | "Carousel" — assigned in Python
    category: str                # one of CATEGORIES — assigned in Python
    tone: str                    # one of TONES — assigned in Python
    cta_style: str                # one of CTA_STYLES — assigned in Python
    is_simulated_story: bool     # true only for "Customer Experience" posts
    captions: PlatformCaptions
    visual_suggestion: str
    cta: str
    hashtags: list[str]          # 10-15 Instagram-style hashtags
    carousel_slides: Optional[list[CarouselSlide]] = None  # only if content_type == "Carousel"


# ── Per-day schedule ──────────────────────────────────────────────────────────
class RecommendedTimes(BaseModel):
    instagram: list[str]          # e.g. ["9:00 AM", "7:00 PM"]
    facebook: list[str]           # e.g. ["1:00 PM", "6:00 PM"]
    linkedin: Optional[str]       # "10:00 AM" on weekdays, null on weekends
    google_business: str          # "11:00 AM"


class DailySchedule(BaseModel):
    date: str                    # ISO date "2026-09-01"
    day_of_week: str
    recommended_times: RecommendedTimes
    posts: list[SocialPost]      # exactly 2


# Shown prominently by any client rendering this response.
CONTENT_DISCLAIMER = (
    "Posts in the 'Customer Experience' category are illustrative, AI-generated "
    "narratives written for engagement — they are NOT real customer testimonials "
    "or verified accounts. Label them clearly as illustrative, or replace them "
    "with a genuine customer story, before publishing. 'Visual Suggestion' fields "
    "are creative direction only (not generated images) — you choose or create "
    "the final visual for each post."
)


class DayScheduleSlot(BaseModel):
    """
    One day's slot in the response. Unpaid users get exactly ONE real day
    fully generated (token cost incurred) — every other day they asked for
    comes back `locked=True` with no `schedule` at all (zero Bedrock cost).
    Paid users get every day unlocked. See
    services.social_service.generate_relocation_calendar for where this is
    decided — always checked server-side via db.dynamo.is_user_paid.
    """
    date: str
    day_of_week: str
    locked: bool
    schedule: Optional[DailySchedule] = None
    preview_text: Optional[str] = None  # shown only when locked


class RelocationSocialResponse(BaseModel):
    country: str
    company: CompanyDetails
    period_label: str            # e.g. "Sep 1 - Sep 14, 2026"
    content_disclaimer: str = CONTENT_DISCLAIMER
    days: list[DayScheduleSlot]
    failed_dates: dict[str, str] = {}   # ISO date -> error message, for partial failures
