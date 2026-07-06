from langchain_core.prompts import ChatPromptTemplate

from common.llm import build_llm
from common.models import CompanyProfile

SYSTEM_PROMPT = """You are a paid media strategist. Generate paid ad campaign specifications for a social media content plan.

Output a JSON array of campaign objects. Each campaign has:
- id (string)
- name (string)
- type (string): "prospecting", "retargeting", or "lookalike"
- run_weeks_start (int)
- run_weeks_end (int)
- budget_monthly (float)
- budget_daily (float)
- budget_currency (string)
- objective (string)
- target_audience_id (string)
- ad_copy_direction (string): specific, actionable copy guidance
- creative_brief (string): visual/creative direction
- kpi_targets (dict): campaign-specific KPI goals
- optimisation_notes (string): how to optimise this campaign"""

HUMAN_PROMPT = """Company Profile:
- Name: {company_name}
- Domain: {business_domain}
- Products: {products}
- Audience: {audience}
- Categories: {categories}
- Terms: {terms}

Duration: {duration_days} days
Campaign Budgets: {budgets}
Tone: {tone}
Primary Goal: {primary_goal}

Generate exactly {campaign_count} paid campaigns. Follow the campaign unlock rules: Campaign 1 starts Week 4 minimum, Campaign 2 starts Week 8 minimum, Campaign 3 starts Week 10 minimum.

Budget assignments:
{campaign_budget_details}"""


async def generate_campaigns(
    profile: CompanyProfile,
    duration_days: int,
    campaign_count: int,
    budgets: list[dict],
    tone: str,
    primary_goal: str,
) -> list[dict]:
    llm = build_llm()
    budget_details = "\n".join(
        f"- {b['id']}: S${b['monthly']}/month ({b['currency']})"
        for b in budgets
    )
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
        "duration_days": duration_days,
        "budgets": str(budgets),
        "tone": tone,
        "primary_goal": primary_goal,
        "campaign_count": campaign_count,
        "campaign_budget_details": budget_details,
    })
    content = result.content if hasattr(result, "content") else str(result)
    import json
    try:
        campaigns = json.loads(content) if isinstance(content, str) else content
        if isinstance(campaigns, list):
            return campaigns
        if isinstance(campaigns, dict) and "campaigns" in campaigns:
            return campaigns["campaigns"]
        return []
    except (json.JSONDecodeError, TypeError):
        return []
