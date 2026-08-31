"""
models/article_models.py — Article Generator
================================================================================
A two-phase content generation feature, more structured than blog_models.py's
quick topic->post flow: first generate a RESEARCH BRIEF (search intent,
content gaps, suggested subtopics, a research-source table, content-cluster
pillars), then generate the full article using that brief as grounding.

IMPORTANT — read before treating the research phase as fact-checked:
This app's Bedrock backend has no live web search tool wired in (see
main.py's startup log: "Anti-hallucination: knowledge-declaration pipeline,
no external search APIs" — the same constraint the existing content-strategy
feature already discloses via its own methodology_disclaimer). The research
brief below is Bedrock's best AI-generated SUGGESTION of what kinds of
sources would support this article and what a real competitive/SERP
analysis might find — it is NOT a live crawl, and the listed source
names/URLs are NOT verified to exist or be accurate. Treat it as a research
PLAN to go verify, not verified research. See ResearchBriefResponse's
methodology_disclaimer field, which is present in every response and should
be surfaced to the user, not just logged.
"""
from pydantic import BaseModel, Field


class ArticleBrief(BaseModel):
    """The editorial brief — reusable per business, not hardcoded to any one
    company. Mirrors the structure of a real content brief: who you're
    writing for, why, and what angle makes your content distinct from
    generic competitors covering the same topics."""
    business_name: str = Field(..., example="AEO App")
    url: str = Field(..., example="https://aeo-app.ai", description="Used for the account's one-domain-per-account lock, same as every other analysis feature")
    target_audience: str = Field(..., example="Businesses and business owners in Kerala")
    primary_goal: str = Field(..., example="Organic search traffic and qualified commercial interest")
    industry: str = Field(..., example="Digital marketing")
    core_topics: str = Field(..., example="Answer Engine Optimization (AEO), SEO, GEO, AI search, Google AI Overviews, ChatGPT, Gemini, Perplexity, Copilot, local SEO, Malayalam/Manglish search behaviour")
    editorial_angle: str = Field(..., example="Kerala businesses + local SEO + Manglish/Malayalam-English search queries + AI search platforms. Use Kerala-specific examples where they genuinely improve the explanation. Do not add Malayalam or Manglish merely for decoration.")
    target_commercial_intent: list[str] = Field(default_factory=list, example=["AEO services Kerala", "best AEO company Kerala", "how much does AEO cost in Kerala"])
    problem_aware_intent: list[str] = Field(default_factory=list, example=["Why is my website traffic dropping?", "Why is my business not showing in Google search?"])
    target_word_count: int = Field(2000, ge=800, le=4000)


# ── Phase 1: research brief ─────────────────────────────────────────────────
class ResearchSourceEntry(BaseModel):
    source_type: str = Field(..., example="Official documentation")
    name: str = Field(..., example="Google Search Central Blog")
    url: str = ""
    relevance_note: str = Field(..., example="Explains how Google surfaces content in AI Overviews")


class ContentPillar(BaseModel):
    pillar_name: str = Field(..., example="AI Search Fundamentals")
    pillar_page_topic: str = Field(..., example="What Is Answer Engine Optimization? A Complete Guide")


class ResearchBriefRequest(BaseModel):
    brief: ArticleBrief
    topic: str = Field(..., min_length=1, example="Why is my business not showing in Google AI search?")


class ResearchBriefResponse(BaseModel):
    topic: str
    primary_search_intent: str
    secondary_intents: list[str]
    content_gaps: list[str]
    suggested_subtopics: list[str]
    research_sources: list[ResearchSourceEntry]
    content_pillars: list[ContentPillar]
    methodology_disclaimer: str = (
        "This research brief is AI-generated planning guidance, not a live web "
        "crawl — source names, URLs, and claims about competitor content are "
        "suggestions of what to go verify, not confirmed facts. Check every "
        "source before citing it, and do not publish statistics or claims from "
        "this brief without independently confirming them, per the 'do not "
        "invent statistics' research standard this brief is meant to serve."
    )


# ── Phase 2: full article ───────────────────────────────────────────────────
class GenerateArticleRequest(BaseModel):
    brief: ArticleBrief
    topic: str = Field(..., min_length=1)
    research: ResearchBriefResponse


class ArticleSection(BaseModel):
    heading: str
    body: str


class ArticleFAQItem(BaseModel):
    question: str
    answer: str


class ArticleResponse(BaseModel):
    seo_title: str
    meta_title: str
    meta_description: str
    url_slug: str
    introduction: str
    sections: list[ArticleSection]
    practical_tactics: list[str]
    faq: list[ArticleFAQItem]
    final_thought: str
    word_count: int
    fact_check_reminder: str = (
        "Verify every statistic, study, and time-sensitive claim in this "
        "article against a current authoritative source before publishing — "
        "it was written to the brief's 'do not invent statistics' standard, "
        "but this generator has no live source verification, so that standard "
        "has to be enforced by a human review pass, not assumed."
    )
