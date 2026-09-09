"""
models/social_models.py — Social Media Content Calendar (any industry)
========================================================================
Generic for ANY business, not tied to one industry — the calendar is
planned around what THIS company actually does (its products/services,
target audience, industry, business activities), not a fixed assumption
about what kind of business is using it. `business_description`,
`industry`, and `target_audience` are the actual grounding for content —
`market` is just the geographic/market context (a city, region, or
country, whatever's relevant to this business), not a "destination" in
any specific-industry sense.

Design note: the SCHEDULE (which dates, which content type/category/tone/
cta_style goes on which day, recommended posting times) is decided
deterministically in Python — see services/social_service.py
`_build_schedule_slots`. That guarantees genuine variety (no repeated
category within 3 days, no fixed weekly pattern) instead of hoping an LLM
"randomizes" on request. Bedrock's job is only the creative writing for
each pre-assigned slot, grounded in this specific company's actual
business context.
"""

from datetime import date as date_type
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional

# Generic across any industry — not "moving guides" or anything tied to one
# business type. Each category is a CONTENT ANGLE any business can fill
# with its own actual products/services/expertise.
CATEGORIES = [
    "Educational / Tips",
    "Product or Service Spotlight",
    "Customer Experience",
    "Industry & Local Context",
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
    for any business, not tied to one industry's typical setup."""
    name: str = Field(..., min_length=1, example="Your Company")
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


class SocialCalendarRequest(BaseModel):
    company: CompanyDetails
    industry: str = Field(
        ..., min_length=1, max_length=200, example="Bakery & Café",
        description="What kind of business this is — drives what content actually makes sense to write.",
    )
    business_description: str = Field(
        ..., min_length=1, max_length=1500,
        example="A boutique bakery specializing in artisan sourdough, custom celebration cakes, and "
                "daily-fresh pastries, with a strong focus on locally-sourced ingredients.",
        description="What this specific company actually does — its products, services, and what makes "
                    "it distinct. This is the main grounding for content when there's no website to analyze; "
                    "still used even when one exists, since a URL alone doesn't capture tone or positioning.",
    )
    target_audience: str = Field(
        ..., min_length=1, max_length=500, example="Local families, young professionals, and event planners",
        description="Who this content should actually speak to.",
    )
    market: str = Field(
        ..., min_length=1, example="Austin, Texas",
        description="Geographic market this content targets — a city, region, or country, whatever's "
                    "relevant to this business. Not assumed to mean a relocation 'destination'.",
    )
    start_date: date_type = Field(..., description="First day of the content calendar (inclusive).")
    end_date: date_type = Field(..., description="Last day of the content calendar (inclusive).")
    content_suggestions: str = Field(
        "", max_length=2000, example="Focus more on our weekend workshop series, and mention our new "
                                      "downtown location opening next month.",
        description="Optional free-text guidance from the user — themes, angles, offers, or "
                    "anything else to weave into this calendar's posts. Applied to every day.",
    )

    @field_validator("industry", "business_description", "target_audience", "market")
    @classmethod
    def _strip_required_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("this field cannot be empty")
        return v

    @model_validator(mode="after")
    def _validate_range(self) -> "SocialCalendarRequest":
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
    services.social_service.generate_social_calendar for where this is
    decided — always checked server-side via db.payments_dynamo.is_user_paid.
    """
    date: str
    day_of_week: str
    locked: bool
    schedule: Optional[DailySchedule] = None
    preview_text: Optional[str] = None  # shown only when locked


class SocialCalendarResponse(BaseModel):
    industry: str
    market: str
    company: CompanyDetails
    period_label: str            # e.g. "Sep 1 - Sep 14, 2026"
    content_disclaimer: str = CONTENT_DISCLAIMER
    days: list[DayScheduleSlot]
    failed_dates: dict[str, str] = {}   # ISO date -> error message, for partial failures


# ── Backward-compatible aliases ──────────────────────────────────────────────
# Older stored history/request_data may reference the previous relocation-
# specific class names — kept as aliases so existing code that hasn't been
# updated yet (or old saved request_data blobs deserialized generically)
# doesn't break outright. New code should use the names above.
RelocationSocialRequest = SocialCalendarRequest
RelocationSocialResponse = SocialCalendarResponse
