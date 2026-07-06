from langchain_core.prompts import ChatPromptTemplate

from website_analyzer.llm import build_llm
from website_analyzer.models import CompanyProfile

SYSTEM_PROMPT = """You are a business intelligence analyst. Your task is to analyze website content and search results about a company, then extract structured information.

Extract the following fields from the provided content:

1. **company_name** — The official name of the company.
2. **domain_url** — The domain URL of the company website.
3. **business_domain** — The primary business domain / industry (e.g. "e-commerce", "SaaS", "healthcare", "fintech").
4. **products** — An array of products or services the company offers. Be specific.
5. **audience** — An array of target customer segments or audiences (e.g. "small businesses", "enterprise", "developers", "consumers").
6. **categories** — An array of business categories relevant to the company (e.g. "cloud computing", "payment processing", "CRM").
7. **terms** — An array of relevant terms or multi-word phrases that are important for understanding the company's business (e.g. keywords for SEO/marketing, industry jargon, technologies used).

Only extract information that is explicitly present or can be clearly inferred from the provided content. Do not make up information. If a field cannot be determined, use an empty string or empty list as appropriate."""

HUMAN_PROMPT = """## Website Content

{crawl_content}

## Search Context

{search_context}

---

Analyze the content above and extract the company's business profile."""


async def analyze_company(
    url: str,
    crawl_content: str,
    search_context: str,
) -> CompanyProfile:
    llm = build_llm()
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", HUMAN_PROMPT),
    ])
    structured_llm = llm.with_structured_output(CompanyProfile)
    chain = prompt | structured_llm
    result = await chain.ainvoke({
        "crawl_content": crawl_content or "No content could be extracted from the website.",
        "search_context": search_context or "No search results available.",
    })
    return result
