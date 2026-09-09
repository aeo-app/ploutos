"""
services/article_service.py — Article Generator (research brief + full article)
================================================================================
Two Bedrock calls, matching the two-phase flow the editorial brief this was
built from explicitly asks for: research first (search intent, content
gaps, subtopics, a research-source table, content-cluster pillars), THEN
write the article using that research as grounding.

See models/article_models.py's module docstring for the important caveat on
the research phase — it's AI-suggested planning guidance, not a live web
crawl, since this app's Bedrock backend has no web search tool wired in.
"""
from __future__ import annotations

import os

from models.article_models import (
    ArticleBrief,
    ArticleResponse,
    GenerateArticleRequest,
    ResearchBriefRequest,
    ResearchBriefResponse,
)
from services.bedrock_service import TokenUsageTracker, _converse_and_validate

ARTICLE_MAX_TOKENS = int(os.getenv("BEDROCK_ARTICLE_MAX_TOKENS", "7000"))

RESEARCH_SYSTEM_PROMPT = """You are a senior SEO content strategist doing pre-writing research \
and planning for a specific article. You are thorough, honest about the limits of your \
knowledge, and never invent specific facts, statistics, or sources that could be checked and \
found wrong. When you name a source (a publication, a forum, a documentation page), name a \
REALISTIC, PLAUSIBLE one for that category — real organizations and real types of pages that \
would genuinely be worth checking — but do not claim to have actually read or verified any \
specific current statistic, study, or live page content, since you have no live web access in \
this task. Your job is to produce a research PLAN a human will go verify, not a finished, \
fact-checked report."""

ARTICLE_SYSTEM_PROMPT = """You are a senior content writer and SEO/AEO (Answer Engine \
Optimization) strategist, writing a real article for a real business's blog — not a generic \
AI-sounding SEO article. You write for intelligent readers who are not specialists in the \
topic. You follow the brief's style rules exactly, especially the ones about NOT sounding like \
generic AI content: no filler phrases, no rhetorical-question headings, no "in conclusion"-\
style generic takeaways after every section, varied sentence and paragraph structure, and at \
least one genuine, specific, evidence-based opinion rather than presenting every issue as \
perfectly balanced. You never invent statistics, studies, quotes, customer examples, results, \
or pricing — where a specific number would strengthen the article, you say what kind of source \
would need to confirm it rather than making one up."""


def _brief_block(brief: ArticleBrief) -> str:
    lines = [
        f"Business: {brief.business_name}",
        f"Target audience: {brief.target_audience}",
        f"Primary goal: {brief.primary_goal}",
        f"Industry: {brief.industry}",
        f"Core topics: {brief.core_topics}",
        f"Unique editorial angle: {brief.editorial_angle}",
    ]
    if brief.target_commercial_intent:
        lines.append("Target commercial intent keywords: " + "; ".join(brief.target_commercial_intent))
    if brief.problem_aware_intent:
        lines.append("Problem-aware intent queries: " + "; ".join(brief.problem_aware_intent))
    return "\n".join(lines)


def generate_research_brief(req: ResearchBriefRequest, usage_tracker: TokenUsageTracker | None = None) -> ResearchBriefResponse:
    prompt = f"""
{_brief_block(req.brief)}

Article topic to research and plan for: "{req.topic}"

Do the following, in order, and return it all as ONE JSON object:

1. Identify the PRIMARY search intent this topic serves, and 2-4 relevant SECONDARY intents
   a reader searching this topic might also have.
2. Identify CONTENT GAPS — specific things pages currently ranking for this topic likely
   under-cover or get wrong, based on how this kind of topic is typically covered versus what
   this business's editorial angle could cover better.
3. Suggest 5-8 specific SUBTOPICS this ~{req.brief.target_word_count}-word article should
   include to be genuinely comprehensive, not generic.
4. Build a RESEARCH-SOURCE TABLE: 6-10 entries, each a REALISTIC, PLAUSIBLE source (official
   documentation, government/regulatory sources, industry reports, credible publications,
   Google Trends, relevant forum/Reddit discussions, YouTube content, social platforms, and
   at least one competitor page) — for EACH, give its type, a real-sounding name, a URL if you
   can give a genuine one (leave blank rather than inventing one you're not confident is real),
   and a one-line note on why it's relevant to THIS article.
5. Group this topic into 3-4 CONTENT-CLUSTER PILLARS (broader themes this article's topic
   belongs to) and suggest ONE pillar-page topic (a broader, evergreen article title) for each.

Return a JSON object with EXACTLY these keys:
{{
  "topic": "{req.topic}",
  "primary_search_intent": "string",
  "secondary_intents": ["string", ...],
  "content_gaps": ["string", ...],
  "suggested_subtopics": ["string", ... 5-8 items],
  "research_sources": [
    {{"source_type": "string", "name": "string", "url": "string (may be empty)", "relevance_note": "string"}}
    // 6-10 entries, covering the source categories listed above
  ],
  "content_pillars": [
    {{"pillar_name": "string", "pillar_page_topic": "string"}}
    // exactly 3-4 entries
  ]
}}"""
    return _converse_and_validate(RESEARCH_SYSTEM_PROMPT, prompt, ResearchBriefResponse, max_tokens=3000, usage_tracker=usage_tracker)


def generate_article(req: GenerateArticleRequest, usage_tracker: TokenUsageTracker | None = None) -> ArticleResponse:
    research = req.research
    research_block = f"""
Primary search intent: {research.primary_search_intent}
Secondary intents: {'; '.join(research.secondary_intents)}
Content gaps to address: {'; '.join(research.content_gaps)}
Subtopics to cover: {'; '.join(research.suggested_subtopics)}
Content-cluster context: {'; '.join(f"{p.pillar_name} (pillar page: {p.pillar_page_topic})" for p in research.content_pillars)}"""

    prompt = f"""
{_brief_block(req.brief)}

Article topic: "{req.topic}"

Research brief to write from (see below) — use it to decide what to cover and how to frame it,
but write the article in your own words; do not just restate the brief:
{research_block}

Write the full article now, approximately {req.brief.target_word_count} words, following ALL of
these rules:

STYLE:
- Professional, clear, and natural — written for an intelligent reader in the target audience,
  not a specialist in {req.brief.industry}.
- Polished but simple English. Define any acronym from the core topics the first time it
  appears (spell it out, then use the acronym after).
- Use the second person ("you") where it reads naturally.
- Prefer concrete, specific examples over generic explanations.
- Short paragraphs, varied sentence length — not a uniform wall of similar-length sentences.
- Mix prose with bullet points only where bullets genuinely improve readability — do not
  convert every list of ideas into bullets by default.
- Avoid storytelling/anecdote unless this specific topic calls for it.
- Avoid repetitive section structures — don't make every section follow the identical
  "explain, then bullet list, then takeaway" pattern.
- NEVER use a rhetorical question as a heading.
- Avoid generic AI-writing phrases and filler ("in today's digital landscape", "it's important
  to note that", "unlock the power of", etc.) — write like a knowledgeable person, not a
  template.
- Do not force the target keywords in or repeat them unnaturally — write for the reader first.
- Editorial angle to follow: {req.brief.editorial_angle}
- Include at least ONE clear, specific, evidence-based opinion or judgment somewhere in the
  article — do not present every issue as perfectly balanced with no point of view.
- Do NOT end every section with a generic "key takeaway" — only summarize where it actually
  adds something.
- Do not invent statistics, studies, quotes, customer examples, results, or pricing. Where a
  specific figure would help, describe what kind of source would need to confirm it instead of
  making one up.

SEO/AEO:
- Match the article to the primary search intent above, and naturally cover the secondary
  intents and related questions/entities a reader or an AI answer engine would expect.
- Structure the article clearly enough that both search engines and AI answer systems (Google
  AI Overviews, ChatGPT, Perplexity, etc.) can extract clean, accurate answers from it.
- Include practical, testable tactics the reader could actually act on.
- Prioritize genuine usefulness and topical depth over keyword density.

Return a JSON object with EXACTLY these keys:
{{
  "seo_title": "string — the article's H1, SEO-friendly",
  "meta_title": "string — under 60 characters",
  "meta_description": "string — under 155 characters",
  "url_slug": "string — lowercase, hyphenated",
  "introduction": "string — the opening section, 2-4 short paragraphs, no heading of its own",
  "sections": [
    {{"heading": "string — a real heading, never a rhetorical question", "body": "string — the section's full prose/content"}}
    // enough sections to comprehensively cover the subtopics above — do not pad with filler sections
  ],
  "practical_tactics": ["string", ... 4-8 concrete, testable tactics the reader can act on],
  "faq": [
    {{"question": "string — a real question a reader would search or ask an AI assistant", "answer": "string — a direct, complete answer"}}
    // 4-6 FAQs, covering the secondary intents and genuinely common follow-up questions
  ],
  "final_thought": "string — a concise, genuinely engaging closing thought, not a generic summary paragraph",
  "word_count": <integer — your best actual count of introduction + all section bodies + final_thought>
}}"""
    return _converse_and_validate(ARTICLE_SYSTEM_PROMPT, prompt, ArticleResponse, max_tokens=ARTICLE_MAX_TOKENS, usage_tracker=usage_tracker)
