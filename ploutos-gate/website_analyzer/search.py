import os

from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate
from tavily import TavilyClient

from website_analyzer.llm import build_llm
from website_analyzer.models import SearchQuery, SearchQueryList

load_dotenv()

SEARCH_QUERY_SYSTEM_PROMPT = """You are a search query strategist. Your job is to analyze website content and generate highly targeted search queries that would return results specifically about this company and its domain.

For each query, explain why it would help find relevant information about this company. Queries should be diverse, covering different aspects such as:
- Company name variants and branding keywords
- Product and service names
- Technology stack and platforms
- Industry categories and verticals
- Competitors and market position
- News and recent developments"""

SEARCH_QUERY_HUMAN_PROMPT = """Based on the following website content, generate {max_terms} search queries that would return results specifically about this company.

Website content:
{crawl_content}

Generate exactly {max_terms} search queries. Each query must be designed to find information about THIS specific company (not the general topic). Include a reason for each query explaining why it is relevant."""


async def generate_search_queries(crawl_content: str, max_terms: int = 5) -> list[SearchQuery]:
    if not crawl_content or max_terms < 1:
        return []

    llm = build_llm()
    prompt = ChatPromptTemplate.from_messages([
        ("system", SEARCH_QUERY_SYSTEM_PROMPT),
        ("human", SEARCH_QUERY_HUMAN_PROMPT),
    ])
    structured_llm = llm.with_structured_output(SearchQueryList)
    chain = prompt | structured_llm
    result = await chain.ainvoke({
        "crawl_content": crawl_content[:15000],
        "max_terms": str(max_terms),
    })
    return result.queries[:max_terms]


def execute_search(query: str, max_results: int = 3) -> list[dict]:
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return []
    try:
        client = TavilyClient(api_key=api_key)
        response = client.search(query=query, max_results=max_results)
        return response.get("results", [])
    except Exception:
        return []


def format_search_context(queries: list[SearchQuery]) -> str:
    parts = []
    for q in queries:
        results = execute_search(q.query, max_results=3)
        snippets = [r.get("content", "") for r in results if r.get("content")]
        if not snippets:
            continue
        block = f"Query: {q.query}\nReason: {q.reason}\nResults:\n" + "\n".join(f"- {s}" for s in snippets)
        parts.append(block)
    return "\n\n---\n\n".join(parts)
