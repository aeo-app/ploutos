from langchain_core.prompts import ChatPromptTemplate

from common.llm import build_llm
from common.models import CompanyProfile

SYSTEM_PROMPT = """You are a copywriting template specialist. Generate reusable caption prompt templates for a company's ongoing social media content creation.

Output a JSON array of caption template objects. Each template has:
- id (string): "template_{{post_type}}"
- post_type (string)
- platform (string)
- prompt_template (string): a Claude/LLM prompt pre-filled with company facts. The user only fills in [TOPIC] or equivalent. Include {{company_name}}, {{business_domain}}, {{tone_of_voice}}, {{key_facts}} as variables.
- output_direction (string): guidance on format, tone, length
- word_count_min (int)
- word_count_max (int)

Generate templates for at least: education_post, social_proof_post, brand_awareness_post, and paid_ad_copy."""

HUMAN_PROMPT = """Company Profile:
- Name: {company_name}
- Domain: {business_domain}
- Products: {products}
- Audience: {audience}
- Categories: {categories}
- Terms: {terms}

Platforms: {platforms}
Tone: {tone}
Primary Goal: {primary_goal}

Generate caption prompt templates. Pre-fill the prompt_template with company-specific facts so the user only fills in [TOPIC] or [OFFER]. Include template variables like {{company_name}}, {{tone_of_voice}}, and {{key_facts}}."""


async def generate_templates(
    profile: CompanyProfile,
    platforms: list[str],
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
        "platforms": ", ".join(platforms),
        "tone": tone,
        "primary_goal": primary_goal,
    })
    content = result.content if hasattr(result, "content") else str(result)
    import json
    try:
        templates = json.loads(content) if isinstance(content, str) else content
        if isinstance(templates, list):
            return templates
        if isinstance(templates, dict) and "templates" in templates:
            return templates["templates"]
        return []
    except (json.JSONDecodeError, TypeError):
        return []
