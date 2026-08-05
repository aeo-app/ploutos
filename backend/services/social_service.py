"""
services/social_service.py — Relocation Social Media Content Calendar
========================================================================
Reuses the Bedrock plumbing (_converse, _parse_json, retry/timeout config)
already built in bedrock_service.py rather than duplicating a second
client — this module only adds the social-calendar-specific prompts and
the deterministic scheduling logic.

Architecture (same lessons as the content-strategy feature):
  - A 30-day month asked for in ONE Bedrock call would need 10,000+ output
    tokens — guaranteed truncation. Instead: one bounded call PER DAY
    (2 posts each, ~800-1200 tokens), run CONCURRENTLY (bounded semaphore/
    thread pool), same as content-strategy's per-keyword calls.
  - The SCHEDULE itself (which date gets which content_type/category/tone/
    cta_style, recommended posting times, LinkedIn weekday-only slots) is
    decided deterministically in Python — see `_build_month_slots` and
    `_recommended_times`. This guarantees genuine variety and correct
    calendar logic instead of relying on the model to "randomize" and do
    date arithmetic reliably.
"""

from __future__ import annotations

import asyncio
import logging
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta

from services.bedrock_service import _converse, _parse_json, TokenUsageTracker

from models.social_models import (
    CATEGORIES,
    CTA_STYLES,
    DailySchedule,
    RecommendedTimes,
    RelocationSocialRequest,
    RelocationSocialResponse,
    SocialPost,
    TONES,
)

logger = logging.getLogger(__name__)

DAY_MAX_TOKENS = 2000          # 2 posts/day — comfortably bounded
MAX_CONCURRENT_DAYS = 5        # bounded concurrency, same reasoning as content-strategy


def _format_period_label(start: date, end: date) -> str:
    if start.year == end.year:
        if start.month == end.month:
            return f"{start.strftime('%b')} {start.day} - {end.day}, {end.year}"
        return f"{start.strftime('%b')} {start.day} - {end.strftime('%b')} {end.day}, {end.year}"
    return f"{start.strftime('%b')} {start.day}, {start.year} - {end.strftime('%b')} {end.day}, {end.year}"


def _recommended_times(weekday_index: int) -> RecommendedTimes:
    """weekday_index: 0=Monday ... 6=Sunday (Python's date.weekday())."""
    is_weekend = weekday_index >= 5
    return RecommendedTimes(
        instagram=["9:00 AM", "7:00 PM"],
        facebook=["1:00 PM", "6:00 PM"],
        linkedin=None if is_weekend else "10:00 AM",
        google_business="11:00 AM",
    )


def _build_schedule_slots(start_date: date, end_date: date, seed: int | None = None) -> list[dict]:
    """
    Assigns content_type / category / tone / cta_style for every post slot
    across [start_date, end_date] inclusive, with real (not LLM-hoped-for)
    variety guarantees:
      - no category repeats within the trailing 3 post-slots
      - no more than 2 consecutive slots of the same content_type
      - carousel days are scattered, not on a fixed cadence
    Generic for any date range — no month/calendar assumptions.
    """
    rng = random.Random(seed)
    total_days = (end_date - start_date).days + 1

    days: list[dict] = []
    recent_categories: list[str] = []
    recent_content_types: list[str] = []

    for offset in range(total_days):
        d = start_date + timedelta(days=offset)
        posts = []
        for post_number in (1, 2):
            # content_type: ~25% carousel, but hard-cap at 2 carousels in a row
            # (posters repeating is fine — carousel is meant to be the
            # occasional, scattered format, not alternating on a fixed beat)
            carousel_prob = 0.25
            if len(recent_content_types) >= 2 and recent_content_types[-1] == recent_content_types[-2] == "Carousel":
                carousel_prob = 0.0
            content_type = "Carousel" if rng.random() < carousel_prob else "Poster"
            recent_content_types.append(content_type)

            # category: avoid repeats within the trailing 3 slots
            choices = [c for c in CATEGORIES if c not in recent_categories[-3:]] or CATEGORIES
            category = rng.choice(choices)
            recent_categories.append(category)

            posts.append({
                "post_number": post_number,
                "content_type": content_type,
                "category": category,
                "tone": rng.choice(TONES),
                "cta_style": rng.choice(CTA_STYLES),
            })

        days.append({
            "date": d.isoformat(),
            "day_of_week": d.strftime("%A"),
            "weekday_index": d.weekday(),
            "posts": posts,
        })

    return days


# ── System prompt ───────────────────────────────────────────────────────────
SOCIAL_SYSTEM_PROMPT = """You are an advanced social media strategist and copywriter
specialised in relocation services, writing platform-native captions for Instagram,
Facebook, LinkedIn, and Google Business Profile.

CRITICAL RULES:
- Always respond with ONLY valid JSON — no markdown fences, no preamble, no commentary,
  nothing before the opening brace or after the closing brace.
- Every field MUST be populated with specific, non-generic content. Never write filler
  like "Great tips for moving!" with no substance.
- INSTAGRAM: hook-based opening line, emojis welcome, short and punchy, 10-15 hashtags.
- FACEBOOK: a bit more detail than Instagram, warm and informative tone.
- LINKEDIN: professional register, positions the company as a credible authority,
  insight-driven — no emojis, no hashtag spam.
- GOOGLE BUSINESS: short, SEO-focused, must naturally include the country name and a
  relocation-related keyword, ends with a strong call to action.
- GOOGLE BUSINESS CAPTIONS MUST NEVER CONTAIN A CUSTOMER TESTIMONIAL, REVIEW, OR QUOTE
  FROM A CUSTOMER — this is a hard rule with NO exceptions, even when the post's category
  is "Customer Experience". For that category, write the Google Business caption as a
  plain informative/service-focused post instead (e.g. about the service or destination),
  never as a retelling of "a customer said...".
- If the assigned category is "Customer Experience", the story must read as an engaging,
  illustrative, ILLUSTRATIVE narrative — never claim it is a specific real, verified person's
  account, never invent a real name presented as fact. Write it in a way that is honestly
  presentable as a simulated/illustrative story, not a fabricated real testimonial.
- Match the assigned tone, content_type, and cta_style exactly as given for each post —
  these were already decided; your job is the creative writing within them.
- If content_type is "Carousel", write 5-7 slides: slide 1 is the hook, the middle slides
  carry the content, the final slide is the CTA. If "Poster", omit carousel_slides entirely.
- Hashtags: 10-15 relevant, non-repetitive Instagram-style tags (no spaces, include the
  country name and relocation-relevant terms).
- Never fabricate specific verifiable facts (exact prices, named real people, named real
  competitor claims) — keep content engaging and specific to the *service and country*
  without inventing unverifiable data points.
- If contact details (phone/email/website/social handles) are provided, weave the most
  relevant one naturally into the CTA or caption where it fits (e.g. Google Business ending
  with the phone number or website) — never invent contact details that weren't given, and
  don't force all of them into every single post.
"""


def _company_contact_line(req: RelocationSocialRequest) -> str:
    c = req.company
    parts = []
    if c.phone:
        parts.append(f"Phone: {c.phone}")
    if c.email:
        parts.append(f"Email: {c.email}")
    if c.website:
        parts.append(f"Website: {c.website}")
    if c.instagram:
        parts.append(f"Instagram: {c.instagram}")
    if c.facebook:
        parts.append(f"Facebook: {c.facebook}")
    if c.linkedin:
        parts.append(f"LinkedIn: {c.linkedin}")
    return " | ".join(parts) if parts else "(none provided — don't invent any)"


def _build_day_prompt(req: RelocationSocialRequest, day: dict) -> str:
    posts_spec = "\n".join(
        f"""  Post {p['post_number']}: content_type="{p['content_type']}", """
        f"""category="{p['category']}", tone="{p['tone']}", cta_style="{p['cta_style']}\""""
        for p in day["posts"]
    )
    return f"""
Country: {req.country}
Company: {req.company.name}
Contact details available (use naturally where relevant, don't invent others): {_company_contact_line(req)}
Date: {day['date']} ({day['day_of_week']})

Write the creative content for exactly 2 posts today, matching these pre-assigned specs
EXACTLY (content_type/category/tone/cta_style are fixed — do not change them):
{posts_spec}

Return a JSON object with EXACTLY this shape:
{{
  "posts": [
    {{
      "post_number": 1,
      "content_type": "{day['posts'][0]['content_type']}",
      "category": "{day['posts'][0]['category']}",
      "tone": "{day['posts'][0]['tone']}",
      "cta_style": "{day['posts'][0]['cta_style']}",
      "is_simulated_story": {str(day['posts'][0]['category'] == 'Customer Experience').lower()},
      "captions": {{
        "instagram": "string", "facebook": "string", "linkedin": "string",
        "google_business": "string — NEVER a testimonial, see rules"
      }},
      "visual_suggestion": "string — background idea + text overlay idea + icon idea, all in one string",
      "cta": "string — the exact call-to-action text, matching cta_style",
      "hashtags": ["string", "..."],
      "carousel_slides": null
      // if content_type is "Carousel": replace null with
      // [{{"slide_number":1,"role":"hook","text":"..."}}, ... 5-7 total, last role="cta"]
    }},
    {{ "post_number": 2, ... same shape, using post 2's assigned specs ... }}
  ]
}}
"""


def _generate_day_posts(
    req: RelocationSocialRequest, day: dict, usage_tracker: TokenUsageTracker | None = None
) -> DailySchedule:
    prompt = _build_day_prompt(req, day)
    raw = _converse(SOCIAL_SYSTEM_PROMPT, prompt, max_tokens=DAY_MAX_TOKENS, usage_tracker=usage_tracker)
    data = _parse_json(raw)
    posts = [SocialPost(**p) for p in data["posts"]]
    return DailySchedule(
        date=day["date"],
        day_of_week=day["day_of_week"],
        recommended_times=_recommended_times(day["weekday_index"]),
        posts=posts,
    )


def _run_days_concurrently(
    req: RelocationSocialRequest, day_slots: list[dict],
    usage_tracker: TokenUsageTracker | None = None,
) -> tuple[list[DailySchedule], dict[str, str]]:
    schedules: dict[str, DailySchedule] = {}
    failures: dict[str, str] = {}

    with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_DAYS) as pool:
        future_to_date = {
            pool.submit(_generate_day_posts, req, day, usage_tracker=usage_tracker): day["date"]
            for day in day_slots
        }
        for future in as_completed(future_to_date):
            d = future_to_date[future]
            try:
                schedules[d] = future.result()
            except Exception as e:
                logger.error(f"[social] day {d} failed: {e}", exc_info=True)
                failures[d] = str(e)

    ordered = [schedules[day["date"]] for day in day_slots if day["date"] in schedules]
    return ordered, failures


def generate_relocation_calendar(
    req: RelocationSocialRequest, usage_tracker: TokenUsageTracker | None = None
) -> RelocationSocialResponse:
    day_slots = _build_schedule_slots(req.start_date, req.end_date)
    period_label = _format_period_label(req.start_date, req.end_date)
    logger.info(f"[social] relocation_calendar — {req.country} — {period_label} ({len(day_slots)} days)")

    days, failures = _run_days_concurrently(req, day_slots, usage_tracker=usage_tracker)
    if not days:
        raise RuntimeError(f"All days failed to generate: {failures}")

    return RelocationSocialResponse(
        country=req.country,
        company=req.company,
        period_label=period_label,
        days=days,
        failed_dates=failures,
    )


# ── Streaming (SSE) path ────────────────────────────────────────────────────
async def stream_relocation_calendar_events(
    req: RelocationSocialRequest, is_disconnected,
    usage_tracker: TokenUsageTracker | None = None,
):
    """Async generator yielding (event, data) tuples:
      start        — {"period_label", "total_days"}
      day_ready    — one DailySchedule as soon as it's generated
      day_error    — a day failed; the rest keep going
      done         — {"failed_dates": {...}, "result": {...}}
    """
    day_slots = _build_schedule_slots(req.start_date, req.end_date)
    period_label = _format_period_label(req.start_date, req.end_date)

    sem = asyncio.Semaphore(MAX_CONCURRENT_DAYS)
    out_queue: asyncio.Queue = asyncio.Queue()
    schedules: dict[str, DailySchedule] = {}
    failures: dict[str, str] = {}

    async def _worker(day: dict):
        async with sem:
            try:
                schedule = await asyncio.to_thread(_generate_day_posts, req, day, usage_tracker=usage_tracker)
                schedules[day["date"]] = schedule
                await out_queue.put(("day_ready", schedule.model_dump()))
            except Exception as e:
                logger.error(f"[social] day {day['date']} failed: {e}", exc_info=True)
                failures[day["date"]] = str(e)
                await out_queue.put(("day_error", {"date": day["date"], "error": str(e)}))

    tasks = [asyncio.create_task(_worker(day)) for day in day_slots]
    yield ("start", {"period_label": period_label, "total_days": len(day_slots)})

    finished = 0
    while finished < len(day_slots):
        if await is_disconnected():
            logger.info("[social] client disconnected — cancelling remaining day tasks")
            for t in tasks:
                t.cancel()
            return
        event, data = await out_queue.get()
        yield (event, data)
        finished += 1

    ordered_days = [schedules[day["date"]] for day in day_slots if day["date"] in schedules]
    result = RelocationSocialResponse(
        country=req.country,
        company=req.company,
        period_label=period_label,
        days=ordered_days,
        failed_dates=failures,
    )
    yield (
        "done",
        {
            "failed_dates": failures,
            "result": result.model_dump(),
            "token_usage": usage_tracker.as_dict() if usage_tracker else None,
        },
    )
