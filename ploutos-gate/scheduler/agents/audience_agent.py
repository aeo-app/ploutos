from langchain_core.prompts import ChatPromptTemplate

from common.llm import build_llm
from common.models import CompanyProfile

SYSTEM_PROMPT = """You are a social media targeting specialist. Generate audience targeting specifications for a company's social media campaigns.

Output a JSON array of audience segment objects. Each segment has:
- id (string): "audience_primary", "audience_retarget_visitors", "audience_lookalike_1pct"
- tier (string): "primary", "secondary", "retarget", or "lookalike"
- segment_name (string)
- demographic (dict): location, age_min, age_max, income_bracket (optional)
- interests (list of strings)
- behaviours (list of strings)
- exclusions (list of strings, optional)
- definition (string, optional): only for retarget/lookalike tiers
- setup_notes (string)"""

HUMAN_PROMPT = """Company Profile:
- Name: {company_name}
- Business Domain: {business_domain}
- Products: {products}
- Target Audience: {audience}
- Categories: {categories}
- Terms: {terms}

Tone: {tone}
Primary Goal: {primary_goal}

Generate 3 audience segments: one primary, one retargeting (website visitors), and one lookalike (best converters). Use the company's audience and business domain to derive realistic demographics and interests."""


async def generate_audiences(
    profile: CompanyProfile,
    tone: str,
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
        "tone": tone,
        "primary_goal": primary_goal,
    })
    content = result.content if hasattr(result, "content") else str(result)
    import json
    try:
        segments = json.loads(content) if isinstance(content, str) else content
        if isinstance(segments, list):
            return segments
        if isinstance(segments, dict) and "audiences" in segments:
            return segments["audiences"]
        return []
    except (json.JSONDecodeError, TypeError):
        return []
