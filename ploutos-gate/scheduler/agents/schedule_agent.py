from langchain_core.prompts import ChatPromptTemplate

from common.llm import build_llm
from common.models import CompanyProfile

SYSTEM_PROMPT = """You are a social media content scheduler. Generate a list of post objects for a specific month/phase of a content calendar.

Each post must be a JSON object with:
- id (string): unique identifier like "post_w{{week}}_{{day}}_{{platform}}"
- week (int)
- month (int)
- phase (string): "foundation", "growth", or "acceleration"
- day (string)
- date (string, YYYY-MM-DD)
- platform (string)
- post_type (string)
- content_pillar (string)
- topic_headline (string)
- caption (string): copy-paste ready, no placeholders
- visual_description (string)
- hashtags (list of strings)
- target_audience (string)
- post_time (string)
- timezone (string)
- automation_tool (string)
- is_paid (bool)
- budget_type (string): "organic", "paid", or "boosted"
- goal (string)
- cta (string)

Rules:
- Every post must reference actual products/services/audience from the company profile
- No placeholder text like [INSERT] — all captions must be ready to publish
- Hashtags must be drawn from the company's terms and categories
- For paid posts, budget fields will be added later — set budget_type to "paid" and is_paid to true
- CTAs must reference real action types (get quote, learn more, contact us, etc.)"""

HUMAN_PROMPT = """Company Profile:
- Name: {company_name}
- Domain: {business_domain}
- Products: {products}
- Audience: {audience}
- Categories: {categories}
- Terms: {terms}

Phase: {phase}
Month: {month}
Week Range: {week_start}–{week_end}
Platforms: {platforms}
Total Posts Needed: {total_posts}

Strategy Context:
- Tone: {tone}
- Content Mix: {content_mix}
- Posting Times: {posting_times}
- Primary Goal: {primary_goal}

Generate exactly {total_posts} posts for this month across all platforms. Distribute posts evenly across the platforms."""


async def generate_month_schedule(
    profile: CompanyProfile,
    month: int,
    phase: str,
    week_start: int,
    week_end: int,
    platforms: list[str],
    total_posts: int,
    tone: str,
    content_mix: dict,
    posting_times: list[str],
    primary_goal: str,
) -> list[dict]:
    llm = build_llm()
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", HUMAN_PROMPT),
    ])
    chain = prompt | llm
    result = await chain.ainvoke({
        "company_name": profile.company_name,
        "business_domain": profile.business_domain,
        "products": ", ".join(profile.products),
        "audience": ", ".join(profile.audience),
        "categories": ", ".join(profile.categories),
        "terms": ", ".join(profile.terms),
        "phase": phase,
        "month": month,
        "week_start": week_start,
        "week_end": week_end,
        "platforms": ", ".join(platforms),
        "total_posts": total_posts,
        "tone": tone,
        "content_mix": str(content_mix),
        "posting_times": "; ".join(posting_times),
        "primary_goal": primary_goal,
    })
    content = result.content if hasattr(result, "content") else str(result)
    import json
    try:
        posts = json.loads(content) if isinstance(content, str) else content
        if isinstance(posts, dict) and "posts" in posts:
            return posts["posts"]
        if isinstance(posts, list):
            return posts
        return []
    except (json.JSONDecodeError, TypeError):
        return []
