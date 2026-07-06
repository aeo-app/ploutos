from langchain_core.prompts import ChatPromptTemplate

from website_analyzer.llm import build_llm
from website_analyzer.models import CompetitorGroup, CompetitorResult, CompetitorSelection, FilteredCompanyList
from website_analyzer.search_sources import get_source, list_sources

BLOCKED_DOMAINS = {
    "reddit.com", "www.reddit.com",
    "facebook.com", "www.facebook.com",
    "twitter.com", "www.twitter.com", "x.com",
    "instagram.com", "www.instagram.com",
    "linkedin.com", "www.linkedin.com",
    "youtube.com", "www.youtube.com",
    "tiktok.com", "www.tiktok.com",
    "wikipedia.org", "www.wikipedia.org",
    "quora.com", "www.quora.com",
    "pinterest.com", "www.pinterest.com",
    "tumblr.com", "www.tumblr.com",
    "medium.com", "www.medium.com",
    "news.ycombinator.com",
    "stackoverflow.com", "www.stackoverflow.com",
    "github.com", "www.github.com",
}

FILTER_SYSTEM_PROMPT = """You are a business filter. Examine raw search results and identify which entries represent actual companies or their official pages.

KEEP entries that appear to be:
- A company's official website or service page (even if it's a landing page about their services)
- A business listing for a specific company (e.g. on a directory site, but referencing a specific company)

REMOVE entries that are:
- Social media posts (Facebook, LinkedIn, TikTok, etc.)
- Wikipedia articles
- Video platforms
- Job boards
- Government websites
- Generic blog articles or guides that don't represent a specific company
- "Top 10" listicles (unless on a company's own site)
- Review sites that aren't the company itself

Derive the proper company name from the title/URL/description, not from the raw title field. Write a clean short description of what the company does. Preserve the original URL, domain, and source."""

FILTER_HUMAN_PROMPT = """Examine these search results. Keep only entries representing actual companies. Remove blogs, guides, social media, Wikipedia, video platforms, job boards, and government sites.

{raw_results}

Return only the company entries with cleaned names and descriptions."""


def _build_queries(sel: CompetitorSelection) -> list[str]:
    parts = []
    if sel.products:
        parts.append(" ".join(sel.products))
    if sel.categories:
        parts.append(" ".join(sel.categories))
    if sel.terms:
        parts.append(" ".join(sel.terms))
    if sel.audience:
        parts.append(" ".join(sel.audience))

    base = " ".join(parts) if parts else ""
    if not base:
        return []

    return [
        f"{base} companies",
        f"top {base} providers",
    ]


def _deduplicate(results: list[CompetitorResult]) -> list[CompetitorResult]:
    seen: set[str] = set()
    out = []
    for r in results:
        key = r.domain.lower().strip()
        if key and key not in seen and key not in BLOCKED_DOMAINS:
            seen.add(key)
            out.append(r)
    return out


async def _filter_with_llm(results: list[CompetitorResult]) -> list[CompetitorResult]:
    if not results:
        return []

    try:
        llm = build_llm()
    except Exception:
        return results

    raw_text = "\n\n".join(
        f"Name: {r.name}\nDomain: {r.domain}\nURL: {r.url}\nDescription: {r.description}\nSource: {r.source}"
        for r in results
    )

    try:
        prompt = ChatPromptTemplate.from_messages([
            ("system", FILTER_SYSTEM_PROMPT),
            ("human", FILTER_HUMAN_PROMPT),
        ])
        structured_llm = llm.with_structured_output(FilteredCompanyList)
        chain = prompt | structured_llm
        filtered = await chain.ainvoke({"raw_results": raw_text[:30000]})
        return filtered.companies
    except Exception:
        return results


async def search_competitors(
    selections: list[CompetitorSelection],
    sources: list[str] | None = None,
    max_results: int = 5,
) -> list[CompetitorGroup]:
    if sources is None:
        sources = list_sources()
    else:
        sources = [s for s in sources if s in list_sources()]

    if not sources:
        return []

    groups: list[CompetitorGroup] = []
    for sel in selections:
        queries = _build_queries(sel)
        if not queries:
            groups.append(CompetitorGroup(selection=sel, companies=[]))
            continue

        all_results = []
        for query in queries:
            for source_name in sources:
                try:
                    source = get_source(source_name)
                    results = await source.search(query, max_results=max_results)
                    all_results.extend(results)
                except Exception:
                    continue

        deduped = _deduplicate(all_results)
        filtered = await _filter_with_llm(deduped) if deduped else []
        groups.append(CompetitorGroup(selection=sel, companies=filtered[:max_results]))

    return groups
