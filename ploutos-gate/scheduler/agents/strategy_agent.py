from langchain_core.prompts import ChatPromptTemplate

from common.llm import build_llm
from common.models import CompanyProfile

SYSTEM_PROMPT = """You are a social media strategy consultant. Given a company's business profile, generate a comprehensive content strategy.

Output a JSON object with these fields:
- primary_goal: string
- secondary_goal: string
- posting_frequency: string
- best_posting_times: dict (audience segment -> time string)
- content_mix: dict (pillar -> percentage)
- tone_of_voice: string
- primary_audience: string
- secondary_audience: string
- kpis: list of monthly KPI objects
- summary: dict with total_organic_posts, total_paid_campaigns, total_posts, by_phase"""

HUMAN_PROMPT = """Company Profile:
- Name: {company_name}
- Domain: {business_domain}
- Products/Services: {products}
- Target Audience: {audience}
- Business Categories: {categories}
- Key Terms: {terms}

Platforms: {platforms}
Duration: {duration_days} days
Tone: {tone}
Content Mix: {content_mix}
Posting Times: {posting_times}

Generate a content strategy for this company. Use the derived tone and content mix above as guidance."""


async def generate_strategy(
    profile: CompanyProfile,
    platforms: list[str],
    duration_days: int,
    tone: str,
    content_mix: dict,
    posting_times: list[str],
) -> dict:
    llm = build_llm()
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", HUMAN_PROMPT),
    ])
    chain = prompt | llm.with_structured_output(dict)  # type: ignore
    result = await chain.ainvoke({
        "company_name": profile.company_name,
        "business_domain": profile.business_domain,
        "products": ", ".join(profile.products),
        "audience": ", ".join(profile.audience),
        "categories": ", ".join(profile.categories),
        "terms": ", ".join(profile.terms),
        "platforms": ", ".join(platforms),
        "duration_days": duration_days,
        "tone": tone,
        "content_mix": str(content_mix),
        "posting_times": "; ".join(posting_times),
    })
    return result
