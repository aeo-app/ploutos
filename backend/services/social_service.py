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
import json
import logging
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta

from services.bedrock_service import _converse, _parse_json, TokenUsageTracker

from models.social_models import (
    CATEGORIES,
    CTA_STYLES,
    DailySchedule,
    DayScheduleSlot,
    RecommendedTimes,
    RelocationSocialRequest,
    RelocationSocialResponse,
    SocialPost,
    TONES,
)

logger = logging.getLogger(__name__)

DAY_MAX_TOKENS = 2000          # 2 poster-only posts/day — comfortably bounded
# A carousel post adds 5-7 slide objects on top of the normal 4-platform
# captions + hashtags + visual suggestion + CTA every post already needs —
# a day with one or two carousel posts genuinely needs more room, and 2000
# leaves thin margin once the model writes anything more verbose than a
# terse example. This was truncating some carousel-heavy days (stopReason=
# max_tokens — see _converse's explicit truncation detection), surfacing as
# occasional day-level failures. A day's *effective* budget is picked in
# _generate_day_posts based on whether it actually contains a carousel post.
DAY_MAX_TOKENS_CAROUSEL = 3200
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


def revise_social_post(
    current_post: dict, instruction: str, usage_tracker: TokenUsageTracker | None = None,
) -> SocialPost:
    """
    Admin panel: given an EXISTING saved post and free-text guidance (e.g.
    "make the Instagram caption punchier", "add a mention of our new Dubai
    office", "this Google Business caption still reads like a testimonial,
    fix it"), returns a revised post. Same content_type/category/tone/
    cta_style are preserved unless the instruction explicitly asks to
    change them — the admin is editing, not re-rolling the whole post from
    scratch.
    """
    prompt = f"""
Here is an existing social media post (already published/scheduled) as JSON:
{json.dumps(current_post, indent=2)}

An admin has given this instruction for how to revise it:
"{instruction}"

Apply the instruction and return the COMPLETE revised post as a JSON object in
EXACTLY the same shape as the input above (same keys: post_number, content_type,
category, tone, cta_style, is_simulated_story, captions {{instagram, facebook,
linkedin, google_business}}, visual_suggestion, cta, hashtags, carousel_slides).

Keep every field the instruction doesn't mention unchanged from the original —
only change what the instruction actually asks for. Still follow the platform
rules from your system prompt (Google Business never contains a testimonial,
Customer Experience stories stay clearly illustrative, LinkedIn stays
professional with no emojis, etc.) even while applying the requested edit."""

    raw = _converse(SOCIAL_SYSTEM_PROMPT, prompt, max_tokens=DAY_MAX_TOKENS_CAROUSEL, usage_tracker=usage_tracker)
    data = _parse_json(raw)
    return SocialPost(**data)


def _generate_day_posts(
    req: RelocationSocialRequest, day: dict, usage_tracker: TokenUsageTracker | None = None
) -> DailySchedule:
    prompt = _build_day_prompt(req, day)
    has_carousel = any(p["content_type"] == "Carousel" for p in day["posts"])
    max_tokens = DAY_MAX_TOKENS_CAROUSEL if has_carousel else DAY_MAX_TOKENS
    raw = _converse(SOCIAL_SYSTEM_PROMPT, prompt, max_tokens=max_tokens, usage_tracker=usage_tracker)
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


def _locked_day_slot(day: dict) -> DayScheduleSlot:
    """Zero Bedrock cost — no generation call is made for a locked day at all."""
    return DayScheduleSlot(
        date=day["date"],
        day_of_week=day["day_of_week"],
        locked=True,
        schedule=None,
        preview_text="Both posts for this day are ready to generate — unlock to view.",
    )


def generate_relocation_calendar(
    req: RelocationSocialRequest,
    usage_tracker: TokenUsageTracker | None = None,
    is_paid: bool = True,
) -> RelocationSocialResponse:
    """
    - Paid users: every day in the requested range is fully generated
      (concurrently, bounded by MAX_CONCURRENT_DAYS).
    - Unpaid users: ONLY THE FIRST day is generated for real — a genuine,
      complete, Bedrock-backed result. Every other requested day comes back
      as a `locked` placeholder slot with NO Bedrock call made for it at all.
    """
    day_slots = _build_schedule_slots(req.start_date, req.end_date)
    period_label = _format_period_label(req.start_date, req.end_date)

    real_slots = day_slots if is_paid else day_slots[:1]
    locked_slots_src = [] if is_paid else day_slots[1:]

    logger.info(
        f"[social] relocation_calendar — {req.country} — {period_label} "
        f"({len(day_slots)} days requested, {len(real_slots)} to generate for real, is_paid={is_paid})"
    )

    days, failures = _run_days_concurrently(req, real_slots, usage_tracker=usage_tracker)
    if not days and locked_slots_src == []:
        raise RuntimeError(f"All days failed to generate: {failures}")

    slots = [DayScheduleSlot(date=d.date, day_of_week=d.day_of_week, locked=False, schedule=d) for d in days]
    slots += [_locked_day_slot(day) for day in locked_slots_src]
    slots.sort(key=lambda s: s.date)

    return RelocationSocialResponse(
        country=req.country,
        company=req.company,
        period_label=period_label,
        days=slots,
        failed_dates=failures,
    )


# ── Streaming (SSE) path ────────────────────────────────────────────────────
async def stream_relocation_calendar_events(
    req: RelocationSocialRequest, is_disconnected,
    usage_tracker: TokenUsageTracker | None = None,
    is_paid: bool = True,
):
    """Async generator yielding (event, data) tuples:
      start        — {"period_label", "total_days", "unlocked_count"}
      day_ready    — one real DailySchedule as soon as it's generated
      day_locked   — a locked placeholder day, emitted immediately (zero
                     Bedrock cost — no generation call was made for it)
      day_error    — a day failed; the rest keep going
      done         — {"failed_dates": {...}, "result": {...}}

    Same free-preview rule as generate_relocation_calendar: unpaid users get
    only the FIRST requested day generated for real; every other day is
    emitted immediately as `day_locked` with no Bedrock call made for it.
    """
    day_slots = _build_schedule_slots(req.start_date, req.end_date)
    period_label = _format_period_label(req.start_date, req.end_date)

    real_slots = day_slots if is_paid else day_slots[:1]
    locked_slots_src = [] if is_paid else day_slots[1:]

    sem = asyncio.Semaphore(MAX_CONCURRENT_DAYS)
    out_queue: asyncio.Queue = asyncio.Queue()
    schedules: dict[str, DailySchedule] = {}
    locked_by_date: dict[str, DayScheduleSlot] = {}
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

    tasks = [asyncio.create_task(_worker(day)) for day in real_slots]
    yield ("start", {"period_label": period_label, "total_days": len(day_slots), "unlocked_count": len(real_slots)})

    # Locked days need no worker at all — emit immediately, no Bedrock calls.
    for day in locked_slots_src:
        slot = _locked_day_slot(day)
        locked_by_date[day["date"]] = slot
        yield ("day_locked", {"date": day["date"], "slot": slot.model_dump()})

    finished = 0
    while finished < len(real_slots):
        if await is_disconnected():
            logger.info("[social] client disconnected — cancelling remaining day tasks")
            for t in tasks:
                t.cancel()
            return
        event, data = await out_queue.get()
        yield (event, data)
        finished += 1

    ordered_real = [schedules[day["date"]] for day in real_slots if day["date"] in schedules]
    all_slots = [DayScheduleSlot(date=d.date, day_of_week=d.day_of_week, locked=False, schedule=d) for d in ordered_real]
    all_slots += list(locked_by_date.values())
    all_slots.sort(key=lambda s: s.date)

    result = RelocationSocialResponse(
        country=req.country,
        company=req.company,
        period_label=period_label,
        days=all_slots,
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
