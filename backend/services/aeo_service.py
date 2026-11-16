"""
services/aeo_service.py — the AEO (Answer Engine Optimisation) dashboard's
generators and checks.

What is real and what is AI-written
-----------------------------------
* The analysis (`run_aeo_analysis`) is real: our AI only suggests the questions
  people ask, then each question is asked to ChatGPT, Claude, Gemini and Google
  AI Overviews for real (services/ai_checks) and every dashboard number comes
  from those answers. Nothing about visibility or competitors is estimated.
* `run_site_checks` and `normalise_social_link` do real work (an HTTP fetch
  of the customer's own site / URL validation).
* Strategy, blog drafts and social posts are AI-written content; the prompts
  tell the model not to invent client names, statistics, quotes or reviews.
"""
from __future__ import annotations

import ipaddress
import json
import threading
import os
from concurrent.futures import ThreadPoolExecutor
import logging
from datetime import datetime, timezone
import re
import socket
import time
from collections import Counter
from typing import Callable, Optional
from urllib.parse import urljoin, urlparse

import requests

from models.aeo_models import (
    CHANNELS,
    ENGINES,
    POSTS_PER_CHANNEL,
    CALENDAR_PROMPT,
    month_slots,
    channel_cores,
    core_kinds,
    core_days,
    cores_per_week,
    WEEKS_PER_MONTH,
    AeoBlogDraftRequest,
    AeoBlogDraftResponse,
    AeoCompetitor,
    AeoNameCount,
    AeoPrompt,
    AeoPromptsRequest,
    AeoPromptsResponse,
    AeoSocialPost,
    AeoSocialRequest,
    AeoSocialResponse,
    AeoStrategyRequest,
    AeoStrategyResponse,
    SiteCheck,
    SiteChecksResponse,
)
from services.ai_checks.reader import name_key
from services.ai_checks.runner import answers_doc, run_checks, summarize
from services.ai_checks.search_volume import clean_keyword, monthly_searches
from services.bedrock_service import TokenUsageTracker, _converse, _parse_json

logger = logging.getLogger(__name__)

FREE_PREVIEW_PROMPTS = 5
PAID_PROMPT_COUNT = 20
MASK = "••••••••"

_SYSTEM = """You are an Answer Engine Optimisation (AEO) strategist. You help businesses get
recommended by AI answer engines (ChatGPT, Claude, Gemini, Google AI Overviews).

CRITICAL RULES:
- Respond with ONLY valid JSON — no markdown fences, no preamble, no commentary.
- Every number you give is a labelled ESTIMATE from your general knowledge of the market. You
  cannot see live engine answers; do not claim you can.
- Only name real companies you know exist in the given industry and market. Never invent companies.
- NEVER invent client names, customer quotes, testimonials, review counts, awards, statistics or
  case-study facts about the user's company. Where a proof point is needed, write it as something
  the company should collect or publish (for example "a case study with named, dated outcomes"),
  not as a fact that already exists.
- Keep every string concise and specific to the company, market and industry given."""


# ═════════════════════════════════════════════════════════════════════════════
# Prompt visibility
# ═════════════════════════════════════════════════════════════════════════════

def _domain_of(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    if "//" not in value:
        value = "https://" + value
    host = (urlparse(value).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def _clamp(n, lo, hi, default=0) -> int:
    try:
        return max(lo, min(hi, int(round(float(n)))))
    except (TypeError, ValueError):
        return default


def _locked_prompt(rank: int) -> AeoPrompt:
    return AeoPrompt(rank=rank, text=f"{MASK} {MASK} {MASK}", intent="Commercial",
                     volume_estimate=0, engines=[0, 0, 0, 0], locked=True)



# ═════════════════════════════════════════════════════════════════════════════
# What the company's website actually says — grounds every prompt so the model
# does not guess the business from the brand name alone.
# ═════════════════════════════════════════════════════════════════════════════
_SITE_CACHE: dict[str, tuple[float, str]] = {}
_SITE_TTL = 6 * 3600


def _clean(t: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t or "")).strip()


def _site_summary(url: str) -> str:
    u = (url or "").strip()
    if not u:
        return ""
    if not u.startswith(("http://", "https://")):
        u = "https://" + u
    key = _domain_of(u)
    hit = _SITE_CACHE.get(key)
    if hit and time.time() - hit[0] < _SITE_TTL:
        return hit[1]
    out = ""
    try:
        r = _safe_get(u, timeout=6.0)
        if r.ok:
            html = r.text[:600_000]
            title = _clean((re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I) or [None, ""])[1])
            desc = ""
            for pat in (r'<meta[^>]+name=["\']description["\'][^>]*content=["\'](.*?)["\']',
                        r'<meta[^>]+property=["\']og:description["\'][^>]*content=["\'](.*?)["\']'):
                m = re.search(pat, html, re.S | re.I)
                if m:
                    desc = _clean(m.group(1))
                    break
            heads = [_clean(h) for h in re.findall(r"<h[12][^>]*>(.*?)</h[12]>", html, re.S | re.I)]
            heads = [h for h in heads if 3 < len(h) < 140][:10]
            body = re.sub(r"<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
            text = _clean(body)[:1200]
            parts = []
            if title: parts.append(f"Title: {title[:160]}")
            if desc: parts.append(f"Description: {desc[:400]}")
            if heads: parts.append("Headings: " + " | ".join(heads))
            if text: parts.append(f"Page text: {text}")
            out = "\n".join(parts)
    except Exception as e:  # noqa: BLE001 — never block generation on a site fetch
        logger.info(f"[aeo] site summary unavailable for {key}: {e}")
    if out:
        _SITE_CACHE[key] = (time.time(), out)
    return out


def _site_block(url: str, company: str) -> str:
    s = _site_summary(url)
    if not s:
        return ("Website content could not be read. Do NOT guess the business from the name alone "
                "(brand names are often invented words); keep suggestions generic to the stated industry.")
    return ("WHAT THE WEBSITE SAYS (authoritative — describe and position the business ONLY from this, "
            f"never from what the name '{company}' sounds like; competitors must sell the same products/services):\n{s}")


MAX_RIVALS = 6


def run_aeo_analysis(
    req: AeoPromptsRequest, usage_tracker: TokenUsageTracker | None = None, is_paid: bool = True,
    on_progress: Optional[Callable[[int, int], None]] = None,
) -> tuple[AeoPromptsResponse, dict]:
    """The questions people ask AI about this kind of business, each asked to every ready AI tool for real.

    Our AI only suggests the questions; every result on the dashboard comes from the real answers
    (services/ai_checks). Free accounts get real checks on the questions they can see, paid accounts on all.
    Returns the dashboard result and the real answers (saved so customers can read them).
    """
    n = PAID_PROMPT_COUNT if is_paid else FREE_PREVIEW_PROMPTS
    domain = _domain_of(req.url)
    custom = list(req.extra_prompts)
    taken = {t.lower() for t in custom}
    questions = [q for q in _suggest_questions(req, n, usage_tracker) if q["text"].lower() not in taken]
    custom_keywords = _keywords_for(custom, req.market, usage_tracker)
    logger.info(f"[aeo] analysis — {req.company_name} / {req.market} questions={len(questions)} custom={len(custom)} paid={is_paid}")

    # Google's real search counts for every candidate keyword (one request), fetched while the AI tools are asked.
    candidates = [k for kws in [*custom_keywords.values(), *(q["keywords"] for q in questions)] for k in kws]
    with ThreadPoolExecutor(max_workers=1) as pool:
        lookup = pool.submit(monthly_searches, candidates, req.market)
        checks = run_checks(custom + [q["text"] for q in questions], req.company_name, domain, req.market,
                            usage_tracker=usage_tracker, on_progress=on_progress)
        volumes = lookup.result()
    summary = summarize(checks, req.company_name, domain)
    not_checked = [None] * len(ENGINES)

    def row(rank: int, text: str, intent: str, keywords: list[str], custom_row: bool = False) -> AeoPrompt:
        keyword, searches = _best_keyword(keywords, volumes)
        return AeoPrompt(rank=rank, text=text, intent=intent, keyword=keyword, volume_estimate=searches,
                         engines=summary.cells.get(text, not_checked), custom=custom_row)

    custom_rows = [row(0, t, "Commercial", custom_keywords.get(t, []), custom_row=True) for t in custom]
    rows = [row(i + 1, q["text"], q["intent"], q["keywords"]) for i, q in enumerate(questions)]
    if not is_paid:
        while len(rows) < PAID_PROMPT_COUNT:
            rows.append(_locked_prompt(len(rows) + 1))

    checked_engines = [e for e in ENGINES if any(c.engine == e and c.reading for c in checks)]
    result = AeoPromptsResponse(
        company=req.company_name, market=req.market, industry=req.industry,
        prompts=custom_rows + rows,
        competitors=_competitors(req, domain, summary),
        engine_leaders=summary.engine_leaders,
        prompts_total=sum(1 for p in custom_rows + rows if not p.locked and any(e is not None for e in p.engines)),
        checked_engines=checked_engines,
        platforms=[AeoNameCount(name=name, count=k) for name, k in summary.platforms],
        source_sites=[AeoNameCount(name=site, count=k) for site, k in summary.source_sites],
        checked_at=datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    )
    return result, answers_doc(checks)


KEYWORDS_PER_QUESTION = 3
_KEYWORDS_ASK = f"""For each question also give {KEYWORDS_PER_QUESTION} different short searches (2-4 words each, in the order people
type them) that people use on Google for the same need, closest match first, e.g. "hire react developer",
"react developer india", "react js developer". Every search must name what the person is looking for (the
product or service itself); never a generic phrase such as "hire immediately", "proven track record" or a
technique name on its own. Prefer popular wording."""


def _keyword_list(value, fallback: str = "") -> list[str]:
    """Up to KEYWORDS_PER_QUESTION short searches from the model's reply (a list, or a single string)."""
    items = value if isinstance(value, list) else [value]
    out = list(dict.fromkeys(str(k).strip()[:80] for k in items if k and str(k).strip()))
    return out[:KEYWORDS_PER_QUESTION] or ([fallback] if fallback else [])


def _best_keyword(keywords: list[str], volumes: dict[str, int]) -> tuple[str, int]:
    """The closest-matching candidate Google has a search count for, with that count (the first one when none has).

    Candidates come closest match first, so a broader search with a bigger number never wins over a closer one.
    """
    for k in keywords:
        if volumes.get(clean_keyword(k)):
            return k, volumes[clean_keyword(k)]
    return (keywords[0], 0) if keywords else ("", 0)


def _suggest_questions(req: AeoPromptsRequest, n: int, usage_tracker: TokenUsageTracker | None) -> list[dict]:
    """The n questions real customers would ask an AI assistant, most common first: [{"text", "intent", "keywords"}].

    The keywords are short Google searches for the same need, closest match first; Google only has search counts
    for short searches, so the dashboard shows the real count of the closest one Google has a number for.
    """
    prompt = f"""
Company: {req.company_name}
Website: {req.url}
Market: {req.market}
Industry: {req.industry}
{_site_block(req.url, req.company_name)}

Task: list the {n} questions people in {req.market} are most likely to type into an AI assistant (ChatGPT, Claude,
Gemini) when they want to find, compare or buy what {req.company_name} offers, most commonly asked first.
Write each one from the customer's side (someone looking for this product or service), the way a real person
types it. Never phrase it as a job search. Include the location when people would. Do not name {req.company_name}.

{_KEYWORDS_ASK}

Return ONE JSON object: {{"questions": [{{"text": "the question", "intent": "Commercial | Informational | Transactional",
"keywords": ["short search 1", "short search 2", "short search 3"]}}]}} with exactly {n} items."""
    data = _parse_json(_converse(_SYSTEM, prompt, max_tokens=3500, usage_tracker=usage_tracker))
    out, seen = [], set()
    for d in data.get("questions") or []:
        text = str(d.get("text", "")).strip()[:300]
        if text and text.lower() not in seen:
            seen.add(text.lower())
            intent = d.get("intent") if d.get("intent") in ("Commercial", "Informational", "Transactional") else "Commercial"
            out.append({"text": text, "intent": intent, "keywords": _keyword_list(d.get("keywords") or d.get("keyword"), text)})
    return out[:n]


def _keywords_for(questions: list[str], market: str, usage_tracker: TokenUsageTracker | None) -> dict[str, list[str]]:
    """Short Google searches for each question the customer added: {question: [keyword, ...]}."""
    if not questions:
        return {}
    listed = "\n".join(f"{i + 1}. {q}" for i, q in enumerate(questions))
    prompt = f"""
Market: {market}
Questions people in {market} ask:
{listed}

{_KEYWORDS_ASK}

Return ONE JSON object: {{"keywords": [["search 1", "search 2", "search 3"], ...]}} with one list per question,
exactly {len(questions)} lists, in order."""
    try:
        data = _parse_json(_converse(_SYSTEM, prompt, max_tokens=1200, usage_tracker=usage_tracker))
        lists = [_keyword_list(k) for k in data.get("keywords") or []]
    except Exception as e:  # noqa: BLE001 — without keywords the question only shows no search count
        logger.warning(f"[aeo] keywords for added questions failed: {e}")
        return {}
    return {q: kws for q, kws in zip(questions, lists) if kws}


def _competitors(req: AeoPromptsRequest, domain: str, summary) -> list[AeoCompetitor]:
    """You first, then the businesses the real answers name most. User-added competitors always show (0 if never named)."""
    yours = Counter(ENGINES[j] for cells in summary.cells.values() for j, x in enumerate(cells) if x not in (None, 0))
    you = AeoCompetitor(
        name=req.company_name, domain=domain, is_you=True, share_of_voice=summary.share_of_voice,
        prompts_cited=sum(1 for cells in summary.cells.values() if any(x not in (None, 0) for x in cells)),
        top_engine=yours.most_common(1)[0][0] if yours else "—",
    )
    added = {name_key(c): c for c in req.extra_competitors}
    rivals = [r for i, r in enumerate(summary.rivals) if i < MAX_RIVALS or name_key(r["name"]) in added]
    comps = [AeoCompetitor(name=r["name"], domain=r["domain"], share_of_voice=r["share_of_voice"],
                           prompts_cited=r["questions"], top_engine=r["top_engine"], custom=name_key(r["name"]) in added)
             for r in rivals]
    named = {name_key(c.name) for c in comps}
    comps += [AeoCompetitor(name=name, custom=True) for key, name in added.items() if key not in named]
    return [you, *comps]


# ═════════════════════════════════════════════════════════════════════════════
# Per-prompt strategy + blog topics
# ═════════════════════════════════════════════════════════════════════════════

_BLOG_TYPES = ["PILLAR GUIDE", "FAQ", "CASE STUDY", "EXPLAINER", "CHECKLIST", "COMPARISON"]

# Page templates (designs) the customer can choose from. Each is both a visual design and a content structure.
# The ids and names are mirrored in the frontend (src/aeo/pageTemplates.js) — keep the two lists in step.
PAGE_TEMPLATES: dict[str, dict] = {
    "service": {
        "name": "Service landing page",
        "brief": (
            "A conversion-focused landing page for one service. Fill: eyebrow, headline, intro (what the service is and who it is for), "
            "highlights = 4 benefits, steps = 3 to 5 'how it works' steps, sections = 2 short sections (e.g. 'Why choose {company}', 'Who we help'), "
            "faqs = 5, cta. Leave areas empty and table null. About 600-900 words in total."
        ),
    },
    "guide": {
        "name": "Complete guide",
        "brief": (
            "A long, authoritative guide page. Fill: eyebrow, headline, intro (the direct answer), highlights = 4 'key takeaways', "
            "sections = 6 to 8 (each heading a real question or clear topic, direct answer first; about 1,500-2,000 words in total), faqs = 5, cta. "
            "Leave steps and areas empty and table null."
        ),
    },
    "faq": {
        "name": "FAQ page",
        "brief": (
            "A FAQ page. Fill: eyebrow, headline, intro (2 sentences), faqs = 10 to 12 (each answer 40-70 words, answering in the first sentence), cta ('Still have a question?'). "
            "Highlights 0 to 3 quick facts if useful. Leave steps, sections and areas empty and table null."
        ),
    },
    "comparison": {
        "name": "Comparison page",
        "brief": (
            "A buyer's comparison page: how to choose between the realistic options in this market. Fill: eyebrow, headline, intro, "
            "table = criteria rows (6 to 8) with 2 to 3 columns that are KINDS of option (e.g. 'DIY', 'Specialist company') — never named competitors — "
            "and the LAST column is {company}. highlights = 3 'what to look for' items, sections = 2 to 3 short sections, faqs = 4, cta. Leave steps and areas empty."
        ),
    },
    "location": {
        "name": "Local area page",
        "brief": (
            "A page for customers in one place. Fill: eyebrow (the place, e.g. 'Serving Singapore'), headline, intro, areas = 6 to 10 places or neighbourhoods covered "
            "(only places the website content supports; if it names none, return an empty list), highlights = 4 reasons local customers choose {company}, "
            "sections = 2 to 3 (e.g. 'What we do in the area', 'What to know about the area'), faqs = 4, cta. Leave steps empty and table null."
        ),
    },
    "how_to": {
        "name": "Step-by-step how-to",
        "brief": (
            "A practical how-to page. Fill: eyebrow, headline, intro (the quick answer), highlights = 3 to 6 'what you need' items, "
            "steps = 5 to 8 numbered steps (a clear action in the title, 1-2 sentences of detail), sections = 2 ('Common mistakes', 'When to call a professional'), "
            "faqs = 4, cta. Leave areas empty and table null."
        ),
    },
}
# Names used before templates existed, and templates that were folded into the six above.
_LEGACY_TEMPLATE = {"PILLAR PAGE": "guide", "FAQ CLUSTER": "faq", "COMPARISON": "comparison", "PROOF": "service",
                    "COST": "service", "CASE_STUDY": "service"}


def resolve_template(value: str, default: str = "") -> str:
    """Accepts a template id ('faq'), its display name, or an older pillar name; returns the id or `default`."""
    v = str(value or "").strip()
    if v.lower() in PAGE_TEMPLATES:
        return v.lower()
    if v.upper() in _LEGACY_TEMPLATE:
        return _LEGACY_TEMPLATE[v.upper()]
    for tid, t in PAGE_TEMPLATES.items():
        if t["name"].lower() == v.lower():
            return tid
    return default


def _slugify(text: str, limit: int = 70) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(text or "").lower()).strip("-")[:limit].strip("-")


def page_cache_key(prompt: str, template: str, title: str) -> str:
    """One saved page per (question, template, title) — a new title is a new page."""
    return f"{prompt}|{template.upper()}|{_slugify(title, 50)}"


def _site_root(url: str) -> str:
    u = str(url or "").strip().rstrip("/")
    return u if u.startswith("http") else "https://" + u



_TOPIC_STOP = {"the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "with", "your", "you", "how", "what", "why", "is", "are", "best", "guide", "complete", "ultimate"}


def _topic_words(title: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", str(title).lower()) if w not in _TOPIC_STOP and len(w) > 2}


def _two_blog_topics(raw) -> list[dict]:
    """At most 2 blog topics: well-formed, and not the same idea twice (same title, or titles that share most of their words)."""
    out: list[dict] = []
    for t in raw or []:
        if not isinstance(t, dict):
            continue
        title = " ".join(str(t.get("title", "")).split())[:200]
        if len(title) < 8:
            continue
        w = _topic_words(title)
        if any(title.lower() == o["title"].lower() or (w and _topic_words(o["title"]) and len(w & _topic_words(o["title"])) / min(len(w), len(_topic_words(o["title"]))) >= 0.6) for o in out):
            continue
        out.append({"type": str(t.get("type", "")) or "Blog", "title": title, "words": _clamp(t.get("words"), 300, 3000, 1200)})
        if len(out) == 2:
            break
    return out


def _more_blog_topics(req, have: list[dict], usage_tracker) -> list[dict]:
    got = ", ".join(f'"{t["title"]}"' for t in have) or "none yet"
    prompt = f"""
Company: {req.company_name}   Website: {req.url}   Market: {req.market}   Industry: {req.industry}
{_site_block(req.url, req.company_name)}
Target AI prompt: "{req.prompt}"
Already chosen blog topics: {got}.
Write {2 - len(have)} MORE blog topic{'s' if 2 - len(have) > 1 else ''} for this prompt: different angle and different words from the ones above, specific to this company's real business.
Return ONE JSON object: {{"blog_topics": [{{"type": "one of {json.dumps(_BLOG_TYPES)}", "title": "blog post title", "words": 1200}}]}}"""
    try:
        return _parse_json(_converse(_SYSTEM, prompt, max_tokens=500, usage_tracker=usage_tracker)).get("blog_topics") or []
    except Exception as e:  # noqa: BLE001
        logger.info(f"[aeo] extra blog topic failed: {e}")
        return []


def generate_aeo_strategy(
    req: AeoStrategyRequest, usage_tracker: TokenUsageTracker | None = None, limited: bool = False,
) -> AeoStrategyResponse:
    scope = ("\nFREE PREVIEW: return only 1 page suggestion (in the pillars list), 2 plan entries (WEEK 1, WEEK 2) and the 2 blog_topics. Keep it brief.\n" if limited else "")
    prompt = f"""
Company: {req.company_name}   Website: {req.url}   Market: {req.market}   Industry: {req.industry}
{_site_block(req.url, req.company_name)}
Target AI prompt: "{req.prompt}"

Write the plan for getting {req.company_name} recommended when someone asks that prompt.
{scope}
Return ONE JSON object with EXACTLY these keys:
{{
  "answer": "2 sentences: how an AI engine SHOULD answer this prompt, naming {req.company_name} and citing its website",
  "pillars": [
    {{"template": "one of {json.dumps(list(PAGE_TEMPLATES))} — the page type that suits this prompt best; use 4 DIFFERENT ones, most useful first",
      "title": "specific page title a customer would click", "slug": "short-url-slug-with-hyphens",
      "detail": "one plain sentence on what the page tells the customer"}}
  ],
  "plan": [
    {{"week": "WEEK 1", "task": "concrete action"}}  // exactly 4 entries, WEEK 1..WEEK 4
  ],
  "blog_topics": [
    {{"type": "one of {json.dumps(_BLOG_TYPES)} (the two topics use two DIFFERENT types)",
      "title": "blog post title", "words": 1200}}
  ]   // EXACTLY 2 topics, no more
}}
The 2 blog topics must: (1) answer the target prompt directly for this company's customers, (2) fit what the website says the company
really does and its business category, (3) each target a different angle and a different search keyword, with titles that share no
main words, (4) be specific enough that a customer would click, not generic ("Complete guide to ..." for everything).
For the CASE STUDY blog topic and any customer-story page, do not state any client name, result or number as fact —
frame them as something {req.company_name} should interview a client for and publish."""
    raw = _converse(_SYSTEM, prompt, max_tokens=1500 if limited else 3500, usage_tracker=usage_tracker)
    d = _parse_json(raw)
    pillars, seen = [], set()
    for p in (d.get("pillars") or []):
        if not isinstance(p, dict):
            continue
        tid = resolve_template(p.get("template") or p.get("type"), "guide")
        title = str(p.get("title", "")).strip()
        if not title or tid in seen:
            continue
        seen.add(tid)
        slug = _slugify(p.get("slug") or title)
        pillars.append({"type": PAGE_TEMPLATES[tid]["name"], "template": tid, "title": title, "slug": slug,
                        "link": f"{_site_root(req.url)}/{slug}", "detail": str(p.get("detail", ""))})
    pillars = pillars[:6]
    plan = [{"week": str(p.get("week", f"WEEK {i + 1}")), "task": str(p.get("task", ""))}
            for i, p in enumerate(d.get("plan") or [])][:6]
    topics = _two_blog_topics(d.get("blog_topics"))
    if len(topics) < 2:                    # the model repeated itself or skipped one: ask once more for the missing topic
        topics = _two_blog_topics((topics or []) + _more_blog_topics(req, topics, usage_tracker))
    if not (pillars and plan and len(topics) == 2):
        raise RuntimeError("The strategy response was missing sections — please try again.")
    if limited:
        pillars, plan = pillars[:1], plan[:2]
    return AeoStrategyResponse(prompt=req.prompt, answer=str(d.get("answer", "")), pillars=pillars, plan=plan,
                               blog_topics=topics, limited=limited)


_BRACKETS = re.compile(r"\s*\[[^\]\n]{2,160}\]")


def _strip_placeholders(v):
    """Safety net: the page must never contain '[add your …]' style placeholders, so any bracketed text the model
    still writes is removed (the sentence just loses that detail) rather than shown to the customer's visitors."""
    if isinstance(v, str):
        t = _BRACKETS.sub("", v)
        t = re.sub(r"\s+([.,;:!?])", r"\1", t)
        return re.sub(r"[ \t]{2,}", " ", t).strip()
    if isinstance(v, list):
        return [x for x in (_strip_placeholders(i) for i in v) if x not in ("", None)]
    if isinstance(v, dict):
        return {k: _strip_placeholders(x) for k, x in v.items()}
    return v


def _items(raw, limit: int, title_len: int = 120):
    from models.aeo_models import PageItem
    out = []
    for x in (raw or []):
        if isinstance(x, dict) and str(x.get("title", "")).strip():
            out.append(PageItem(title=str(x["title"]).strip()[:title_len], text=str(x.get("text", "")).strip()[:600]))
    return out[:limit]


def generate_aeo_pillar_asset(req, usage_tracker: TokenUsageTracker | None = None):
    """Writes the content of one designed web page for the template the customer chose. The frontend turns it into HTML."""
    from models.aeo_models import AeoPillarAsset, PageCta, PillarFaq, PillarTable
    from models.aeo_models import BlogSection as _BS
    tid = resolve_template(req.template) or resolve_template(req.pillar_type)
    if not tid:
        raise ValueError(f"Unknown page template: {(req.template or req.pillar_type)!r}")
    tpl = PAGE_TEMPLATES[tid]
    brief = tpl["brief"].replace("{company}", req.company_name)
    answer_line = f'\nThe answer this page must support (from the content strategy): "{req.answer}"' if req.answer else ""
    prompt = f"""
Company: {req.company_name}   Website: {req.url}   Market: {req.market}   Industry: {req.industry}
{_site_block(req.url, req.company_name)}
Target AI prompt: "{req.prompt}"{answer_line}
Page to write: a "{tpl['name']}" titled "{req.title}". Purpose: {req.detail or 'get the company recommended for the prompt'}

TEMPLATE: {brief}

Write it so an AI engine could quote it: answer first, then support. Use only what the website content above supports about {req.company_name}.
Do NOT invent client names, quotes, prices, statistics, awards, review counts, phone numbers, emails or addresses. If a figure or detail is not in the
website content, leave it out of the sentence completely: NEVER write square-bracket placeholders such as [add your price]. The company logo and contact
details are added to the page automatically, so do not write them out. Write for the customer, in plain words, no jargon.
Return ONE JSON object with EXACTLY these keys (use [] or null for any the template does not use):
{{
  "slug": "short-url-slug-with-hyphens",
  "page_title": "SEO title under 60 characters",
  "meta_description": "under 155 characters, includes the answer's key point",
  "where": "one sentence: where on the website this page should live (e.g. under Resources/Guides, linked from the Services menu)",
  "link_from": ["3 to 4 specific existing pages or menu spots to link to it from"],
  "eyebrow": "short label above the headline, at most 4 words",
  "headline": "the page's main heading, under 70 characters, written for the customer",
  "intro": "1 to 2 sentences that answer the question directly, under 280 characters",
  "highlights": [ {{"title": "at most 6 words", "text": "one sentence"}} ],
  "steps": [ {{"title": "a clear action, at most 8 words", "text": "1 to 2 sentences"}} ],
  "sections": [ {{"h": "heading", "p": "body, plain text, paragraphs separated by \\n\\n"}} ],
  "areas": ["place"],
  "table": {{"headers": ["..."], "rows": [["..."]]}},
  "faqs": [ {{"q": "question as a customer would ask it", "a": "direct answer"}} ],
  "cta": {{"headline": "closing call to action, under 60 characters", "text": "one sentence", "button": "button label, at most 4 words"}},
  "checklist": ["4 to 6 short facts in this page worth double-checking against the real business before publishing"]
}}
Plain text only, no markdown."""
    d = _strip_placeholders(_parse_json(_converse(_SYSTEM, prompt, max_tokens=7000, usage_tracker=usage_tracker)))
    slug = _slugify(d.get("slug") or req.title)
    sections = [_BS(h=str(x.get("h", ""))[:200], p=str(x.get("p", ""))) for x in (d.get("sections") or []) if isinstance(x, dict) and x.get("h")][:12]
    faqs = [PillarFaq(q=str(f.get("q", ""))[:300], a=str(f.get("a", ""))) for f in (d.get("faqs") or []) if isinstance(f, dict) and f.get("q") and f.get("a")][:14]
    highlights, steps = _items(d.get("highlights"), 6), _items(d.get("steps"), 10)
    t = d.get("table")
    table = None
    if tid == "comparison" and isinstance(t, dict) and t.get("headers") and t.get("rows"):
        w = len(t["headers"])
        table = PillarTable(headers=[str(h) for h in t["headers"]][:6],
                            rows=[[str(c) for c in (r + [""] * w)[:w]] for r in t["rows"] if isinstance(r, list)][:12])
    if not (sections or faqs or steps or highlights):
        raise RuntimeError("The page came back empty — please try again.")
    c = d.get("cta")
    cta = PageCta(headline=str(c.get("headline", ""))[:120], text=str(c.get("text", ""))[:300], button=str(c.get("button", ""))[:40]) if isinstance(c, dict) else None
    return AeoPillarAsset(
        prompt=req.prompt, template=tid, template_name=tpl["name"], title=req.title, slug=slug,
        link=f"{_site_root(req.url)}/{slug}" if slug else "",
        page_title=str(d.get("page_title", req.title))[:80], meta_description=str(d.get("meta_description", ""))[:170],
        where=str(d.get("where", ""))[:300], link_from=[str(x)[:200] for x in (d.get("link_from") or [])][:5],
        eyebrow=str(d.get("eyebrow", ""))[:40], headline=str(d.get("headline", "") or req.title)[:140], intro=str(d.get("intro", "")),
        highlights=highlights, steps=steps, sections=sections, faqs=faqs, table=table, cta=cta,
        areas=[str(x)[:80] for x in (d.get("areas") or []) if str(x).strip()][:12],
        checklist=[str(x)[:200] for x in (d.get("checklist") or [])][:8],
    )


def generate_aeo_blog_draft(
    req: AeoBlogDraftRequest, usage_tracker: TokenUsageTracker | None = None,
) -> AeoBlogDraftResponse:
    prompt = f"""
Company: {req.company_name}   Website: {req.url}   Market: {req.market}   Industry: {req.industry}
{_site_block(req.url, req.company_name)}
Target AI prompt: "{req.prompt}"
Blog type: {req.type}
Title: "{req.title}"
Target length: about {req.words} words in total.

Write the COMPLETE blog post, ready to publish as it stands, so an AI engine could quote it: lead with the direct answer, then
supporting sections that fully cover the topic, and finish with a short closing section that tells the reader what to do next.
Return ONE JSON object with EXACTLY these keys:
{{
  "intro": "opening paragraph (the direct answer first, 3-5 sentences)",
  "sections": [ {{"h": "section heading", "p": "section body, plain text paragraphs separated by \\n\\n (each section 120-220 words)"}} ]  // 5 to 7 sections, the last one is the conclusion with a clear call to action
}}
Rules: plain text only (no markdown). Reach the target length. Everything must be finished prose: no placeholders, no brackets, no
"insert", "add your" or "TBD". Do NOT invent client names, quotes, prices, statistics or review counts: instead of a number, explain
the point in words. Speak as {req.company_name}, using what its website really says about its services, location and approach."""
    raw = _converse(_SYSTEM, prompt, max_tokens=7000, usage_tracker=usage_tracker)
    d = _strip_placeholders(_parse_json(raw))
    sections = [{"h": str(s.get("h", "")), "p": str(s.get("p", ""))} for s in (d.get("sections") or []) if s.get("h")]
    if not sections:
        raise RuntimeError("The draft came back empty — please try again.")
    if not str(d.get("intro", "")).strip():
        raise RuntimeError("The draft came back incomplete — please try again.")
    return AeoBlogDraftResponse(prompt=req.prompt, type=req.type, title=req.title, intro=str(d.get("intro", "")), sections=sections)


# ═════════════════════════════════════════════════════════════════════════════
# Social posts per prompt
# ═════════════════════════════════════════════════════════════════════════════

CHANNEL_NAMES = {"fb": "Facebook", "ig": "Instagram", "li": "LinkedIn", "yt": "YouTube Shorts", "gbp": "Google Business Profile"}
_CHANNEL_RULES = {
    "fb": "Facebook: 250-500 characters, conversational, one clear CTA.",
    "ig": "Instagram: caption under 300 characters plus a hashtag line; `visual` describes the image or carousel.",
    "li": "LinkedIn: 300-700 characters, professional, insight-led, no emojis.",
    "yt": "YouTube Short (vertical video, 15-30 seconds): `title` under 90 characters with a hook, `text` is a 2-3 sentence description, `visual` describes the video scenes, `duration` like '0:20'.",
    "gbp": "Google Business Profile: under 300 characters, local and practical. NEVER include testimonials or ratings.",
}


def clean_keywords(values, limit: int = 20) -> list[str]:
    out, seen = [], set()
    for v in values or []:
        k = re.sub(r"\s+", " ", str(v or "")).strip().strip("#,;")[:80]
        if len(k) >= 2 and k.lower() not in seen:
            seen.add(k.lower())
            out.append(k)
    return out[:limit]


def suggest_site_keywords(
    company_name: str, url: str, market: str, industry: str, n: int = 10, usage_tracker: TokenUsageTracker | None = None,
) -> list[str]:
    """The top `n` keywords a customer of this business would search for, taken from what
    the company's own website says. Used when the user has not entered any keywords."""
    prompt = f"""
Company: {company_name}   Website: {url}   Market: {market}   Industry: {industry}
{_site_block(url, company_name)}

List the {n} most relevant search keywords for this business — what real customers in {market} type when they
want exactly what this company sells. Base them ONLY on the website content above (its real products, services,
locations and audience). Short phrases (2-5 words), no brand-name-only keywords, no duplicates, most valuable first.
Return ONE JSON object: {{"keywords": ["...", "..."]}} with exactly {n} items."""
    kws: list[str] = []
    try:
        d = _parse_json(_converse(_SYSTEM, prompt, max_tokens=700, usage_tracker=usage_tracker))
        kws = clean_keywords(d.get("keywords"), n)
    except Exception as e:  # noqa: BLE001 — fall back to what the page itself says
        logger.info(f"[aeo] keyword suggestion fell back to page headings: {e}")
    if len(kws) < n:
        summary = _site_summary(url)
        m = re.search(r"Headings: (.*)", summary or "")
        heads = [h.strip() for h in (m.group(1).split("|") if m else [])]
        kws = clean_keywords(kws + heads, n)
    return kws


_BEDROCK_SLOTS = threading.BoundedSemaphore(int(os.getenv('SOCIAL_PARALLEL_CALLS', '8')))
_WEEK_THEMES = [
    "week 1: direct answers and first impressions (who we are, what we do, why choose us)",
    "week 2: proof and trust (process, expertise, what customers can expect — no invented numbers or reviews)",
    "week 3: practical help (tips, checklists, myths vs facts, how-to)",
    "week 4: local relevance and action (who it is for, common questions, a clear next step)",
]


def _brand_context(req: AeoSocialRequest) -> str:
    goal = (f"build awareness and drive enquiries for {req.company_name} on social media, around the keywords below"
            if req.prompt == CALENDAR_PROMPT else f'make {req.company_name} the answer to the AI prompt "{req.prompt}"')
    return (f"Company: {req.company_name}   Website: {req.url}   Market: {req.market}   Industry: {req.industry}\n"
            f"{_site_block(req.url, req.company_name)}\n"
            f"Marketing objective: {goal}. One consistent brand voice across every item: "
            f"clear, trustworthy, and specific to this business. Never invent client names, quotes, numbers, prices or reviews.")


def _with_retries(fn, want: int, label: str) -> list:
    """Calls fn(done_so_far) until `want` items are collected (the model sometimes skips one). Raises only if retries run out."""
    got: list = []
    last: Exception | None = None
    for _ in range(3):
        if len(got) >= want:
            break
        try:
            got += fn(got)
        except Exception as e:  # noqa: BLE001 — a bad reply or a throttle: try again
            last = e
    if len(got) < want:
        raise RuntimeError(f"Only {len(got)} of {want} {label} were generated — please try again." + (f" ({last})" if last else ""))
    return got[:want]


def _core_week(req: AeoSocialRequest, week: int, keywords: list[str], usage_tracker: TokenUsageTracker | None, posters: int = 3) -> list[dict]:
    """The core content of one week: the plan's posters + 2 reels. Written ONCE and then adapted for every channel."""
    kinds = core_kinds(posters)
    kw = (f'KEYWORDS to target (one or two per item, naturally): {json.dumps(keywords, ensure_ascii=False)}') if keywords else ""
    month_note = f"This is month {req.cycle + 1} of an ongoing calendar. Use fresh angles, not the obvious first-month ones.\n" if req.cycle else ""

    def call(done: list) -> list[dict]:
        todo = kinds[len(done):]
        prompt = f"""
{_brand_context(req)}
{kw}
{month_note}Theme for this week — {_WEEK_THEMES[week % 4]}.
Write the CORE content for the week. These items are shared by every social channel, so write them channel-neutral: the idea, the key
message and the visual. Each item has a different angle. A "poster" is one image post. A "reel" is a vertical video of 15-20 seconds.
`topic`: the angle in a few words. `message`: the key message in 2-3 plain sentences (facts that can be said on any channel).
`cta`: a short call to action. `hook`: a punchy line under 60 characters (the on-screen hook for a reel; the MAIN HEADING printed on a poster).
`subhead`: a supporting line under 90 characters that completes the hook (the SUBHEADING printed under the heading on a poster). Both are required for every item.
`visual`: for a poster, ONE realistic photograph (real people, places, products or services; no text in the image); for a reel, 3 realistic
scenes in order. Never cartoons or illustrations. `duration`: for a reel like '0:18', for a poster empty.

Write exactly these {len(todo)} items, in this order:
{chr(10).join(f"{i + 1}. {k}" for i, k in enumerate(todo))}

Return ONE JSON object: {{"items": [{{"topic": "...", "message": "...", "cta": "...", "hook": "...", "subhead": "...", "visual": "...", "duration": "..."}}, ...]}}."""
        with _BEDROCK_SLOTS:
            raw = _converse(_SYSTEM, prompt, max_tokens=900 + 450 * len(todo), usage_tracker=usage_tracker)
        out = []
        for p in list(_parse_json(raw).get("items") or []):
            if not isinstance(p, dict) or not str(p.get("message", "")).strip():
                break
            out.append({k: str(p.get(k, "")).strip() for k in ("topic", "message", "cta", "hook", "subhead", "visual", "duration")})
        return out
    return _with_retries(call, len(kinds), f"core items for week {week + 1}")


def _first_words(text: str, n: int) -> str:
    words = re.sub(r"\s+", " ", str(text or "")).strip().strip("\"'").split(" ")
    return " ".join(words[:n]).rstrip(",;:-– ")


def _poster_lines(core: dict, company: str) -> tuple[str, str]:
    """The heading and subheading printed on a poster. Every poster has both: if the model left one out we build it from the post itself."""
    heading = (core.get("hook") or "").strip() or _first_words(core.get("topic") or core.get("message"), 7) or company
    sub = (core.get("subhead") or "").strip()
    if not sub:
        sentences = re.split(r"(?<=[.!?])\s+", str(core.get("message") or "").strip())
        sub = next((x for x in sentences if x and x.lower().rstrip(".!?") != heading.lower().rstrip(".!?")), "") or core.get("cta") or f"{company}: here to help"
    return heading[:70], _first_words(sub, 16)[:110]


def _adapt_week(req: AeoSocialRequest, c: str, week: int, items: list[tuple[int, str, dict]], keywords: list[str],
                usage_tracker: TokenUsageTracker | None) -> list[AeoSocialPost]:
    """One channel's version of one week: same core ideas, with only the caption, hashtags, CTA and format changed to suit the channel."""
    kw = (f'Keywords (use one or two, naturally): {json.dumps(keywords, ensure_ascii=False)}') if keywords else ""

    def call(done: list) -> list[AeoSocialPost]:
        todo = items[len(done):]
        listing = "\n".join(
            f"{i + 1}. [{k}] topic: {core['topic']} | key message: {core['message']} | cta: {core['cta']} | hook: {core['hook']}"
            for i, (_, k, core) in enumerate(todo))
        prompt = f"""
{_brand_context(req)}
{kw}
Adapt the shared core content below for {CHANNEL_NAMES[c]}. The idea, key message and facts stay the SAME as the core item — do not
add new claims or change the offer. Change only what the channel needs: caption length and tone, hashtags, call to action wording and format.
Channel rule — {_CHANNEL_RULES[c]}
For a "reel", `text` is the caption of the video and `title` is the on-screen hook (under 60 characters; YouTube: a video title under 90 characters).
For a "poster", `text` is the post copy and `title` stays empty.

Core items, in order:
{listing}

Return ONE JSON object: {{"posts": [{{"text": "...", "cta": "...", "tags": "#a #b", "title": "..."}}, ...]}} with exactly {len(todo)} items in the same order."""
        with _BEDROCK_SLOTS:
            raw = _converse(_SYSTEM, prompt, max_tokens=700 + 380 * len(todo), usage_tracker=usage_tracker)
        out: list[AeoSocialPost] = []
        for (cid, k, core), p in zip(todo, list(_parse_json(raw).get("posts") or [])):
            if not isinstance(p, dict) or not str(p.get("text", "")).strip():
                break
            reel = k == "reel"
            out.append(AeoSocialPost(
                kind=k, week=week, core=cid, text=str(p.get("text", ""))[:2000], cta=str(p.get("cta") or core["cta"])[:60],
                tags=str(p.get("tags", ""))[:200], visual=(core["visual"] or core["message"])[:600],
                title=(str(p.get("title") or core["hook"])[:120] if reel else ""), duration=core["duration"][:10] if reel else "",
                **({} if reel else dict(zip(("heading", "subheading"), _poster_lines(core, req.company_name)))),
            ))
        return out
    return _with_retries(call, len(items), f"{CHANNEL_NAMES[c]} items for week {week + 1}")


def generate_aeo_social(
    req: AeoSocialRequest, usage_tracker: TokenUsageTracker | None = None, limited: bool = False, posters: int = 3,
) -> AeoSocialResponse:
    """A month of content: the plan's posters + 2 reels per week on every channel (YouTube: the 2 reels), written once and adapted per channel."""
    cpw = cores_per_week(posters)
    days = core_days(posters)
    keywords = clean_keywords(req.keywords) or suggest_site_keywords(
        req.company_name, req.url, req.market, req.industry, usage_tracker=usage_tracker)
    weeks = [0] if limited else list(range(WEEKS_PER_MONTH))
    with ThreadPoolExecutor(max_workers=4) as pool:
        cores = dict(zip(weeks, [f.result() for f in [pool.submit(_core_week, req, w, keywords, usage_tracker, posters) for w in weeks]]))
    jobs: list[tuple[str, int, list[tuple[int, str, dict]]]] = []
    for c in CHANNELS:
        by_week: dict[int, list[tuple[int, str, dict]]] = {}
        for cid, w, k in channel_cores(c, limited, posters):
            by_week.setdefault(w, []).append((cid, k, cores[w][cid % cpw]))
        jobs += [(c, w, its) for w, its in by_week.items()]
    with ThreadPoolExecutor(max_workers=8) as pool:
        done = [(c, w, pool.submit(_adapt_week, req, c, w, its, keywords, usage_tracker)) for c, w, its in jobs]
        channels: dict[str, list[AeoSocialPost]] = {c: [] for c in CHANNELS}
        for c, w, f in done:
            channels[c] += f.result()
    for lst in channels.values():
        for post in lst:
            post.day = days[post.core % cpw] if post.core is not None else None
    return AeoSocialResponse(prompt=req.prompt, channels=channels, limited=limited, keywords=keywords, cycle=req.cycle, posters_per_week=posters if not limited else 3,
                             generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"))


def social_shape_ok(doc: dict, limited: bool) -> bool:
    """False for a saved calendar made before the weekly plan (4 posts per channel) — it is regenerated."""
    chans = doc.get("channels") or {}
    posters = doc.get("posters_per_week") or 3
    return all(len(chans.get(c) or []) == len(month_slots(c, limited, posters)) and all(p.get("week") is not None and p.get("core") is not None for p in chans.get(c) or [])
               for c in CHANNELS)


# ═════════════════════════════════════════════════════════════════════════════
# Social link validation
# ═════════════════════════════════════════════════════════════════════════════

_LINK_HOSTS = {
    "fb": ("facebook.com", "fb.com", "fb.me"),
    "ig": ("instagram.com", "instagr.am"),
    "li": ("linkedin.com",),
    "yt": ("youtube.com", "youtu.be"),
    "gbp": ("google.com", "g.page", "goo.gl", "business.google.com"),
}
_HANDLE_BASE = {"fb": "facebook.com/", "ig": "instagram.com/", "yt": "youtube.com/@"}
_HANDLE_RE = re.compile(r"^[A-Za-z0-9._-]{1,60}$")


def normalise_social_link(platform: str, raw: str) -> str:
    """Returns a clean 'host/path' string, or raises ValueError. Matching is on the
    parsed hostname (exact or subdomain), never a substring of the whole URL."""
    value = (raw or "").strip()
    if not value or platform not in _LINK_HOSTS:
        raise ValueError("Enter a link for this channel.")
    if value.startswith("@"):
        handle = value[1:]
        if platform not in _HANDLE_BASE or not _HANDLE_RE.match(handle):
            raise ValueError("That doesn't look like a valid handle.")
        return _HANDLE_BASE[platform] + handle
    parsed = urlparse(value if "//" in value else "https://" + value)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in ("http", "https") or not any(host == h or host.endswith("." + h) for h in _LINK_HOSTS[platform]):
        raise ValueError("That doesn't look like a link for this channel.")
    if host in ("google.com", "www.google.com") and not parsed.path.startswith(("/maps", "/search", "/business", "/local")):
        raise ValueError("Use your Google Business Profile or Google Maps link.")
    path = parsed.path.rstrip("/")
    return (host[4:] if host.startswith("www.") else host) + path


# ═════════════════════════════════════════════════════════════════════════════
# Website readiness checks (real HTTP fetches of the customer's own site)
# ═════════════════════════════════════════════════════════════════════════════

_UA = "AEO-APP-SiteCheck/1.0 (+https://www.aeo-app.ai)"
_MAX_BYTES = 1_500_000
_AI_BOTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot"]
_ORG_TYPES = {"organization", "corporation", "ngo", "educationalorganization"}


def _host_is_public(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    addrs = {i[4][0] for i in infos}
    return bool(addrs) and all(ipaddress.ip_address(a.split("%")[0]).is_global for a in addrs)


def _safe_get(url: str, timeout: float = 6.0, max_redirects: int = 3) -> requests.Response:
    """GET that refuses non-public destinations, on every redirect hop too — this
    endpoint takes a user-supplied URL, so it must not become a way to reach
    internal addresses (cloud metadata, localhost, private ranges)."""
    for _ in range(max_redirects + 1):
        p = urlparse(url)
        if p.scheme not in ("http", "https") or not p.hostname or (p.port not in (None, 80, 443)):
            raise ValueError("Only standard http(s) websites can be checked.")
        if not _host_is_public(p.hostname):
            raise ValueError("That address can't be checked.")
        r = requests.get(url, headers={"User-Agent": _UA}, timeout=timeout, allow_redirects=False, stream=True)
        if r.is_redirect or r.is_permanent_redirect:
            url = urljoin(url, r.headers.get("location", ""))
            r.close()
            continue
        body = b""
        for chunk in r.iter_content(65536):
            body += chunk
            if len(body) > _MAX_BYTES:
                break
        r._content = body  # noqa: SLF001 — cap what we keep in memory
        return r
    raise ValueError("Too many redirects.")


def _jsonld_types(html: str) -> set[str]:
    types: set[str] = set()

    def walk(node):
        if isinstance(node, dict):
            t = node.get("@type")
            for x in (t if isinstance(t, list) else [t]):
                if isinstance(x, str):
                    types.add(x.lower())
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    for m in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
        try:
            walk(json.loads(m.group(1).strip()))
        except ValueError:
            continue
    return types


def run_site_checks(url: str) -> SiteChecksResponse:
    raw = (url or "").strip()
    base = raw if "//" in raw else "https://" + raw
    p = urlparse(base)
    if not p.hostname:
        return SiteChecksResponse(url=raw, checks=[], error="Enter a valid website address.")
    root = f"{p.scheme}://{p.netloc}"
    checks: list[SiteCheck] = []

    t0 = time.monotonic()
    try:
        home = _safe_get(root + "/")
    except (ValueError, requests.RequestException) as e:
        return SiteChecksResponse(url=root, checks=[], error=f"Couldn't reach the website: {e}")
    elapsed = time.monotonic() - t0
    html = home.text if home.status_code < 400 else ""
    types = _jsonld_types(html)

    # Sitemap — count URLs, and sample a few pages for schema that isn't on the homepage.
    sitemap_urls: list[str] = []
    try:
        s = _safe_get(root + "/sitemap.xml")
        if s.status_code == 200:
            sitemap_urls = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", s.text)
    except (ValueError, requests.RequestException):
        pass
    own = [u for u in sitemap_urls if urlparse(u).hostname == p.hostname and not u.endswith(".xml")]
    prio = sorted(own, key=lambda u: 0 if re.search(r"faq|about|contact|service", u, re.I) else 1)[:3]
    for u in prio:
        try:
            types |= _jsonld_types(_safe_get(u, timeout=5.0).text)
        except (ValueError, requests.RequestException):
            continue

    checks.append(SiteCheck(key="sitemap", label="Pages in sitemap",
                            value=str(len(own)) if own else "No sitemap found", status="info" if own else "warn"))
    org = bool(types & _ORG_TYPES) or any("localbusiness" in t for t in types)
    checks.append(SiteCheck(key="org_schema", label="Organization schema", value="Found" if org else "Missing", status="good" if org else "bad"))
    lb = any("localbusiness" in t or t in {"store", "movingcompany", "professionalservice"} for t in types)
    checks.append(SiteCheck(key="local_schema", label="LocalBusiness schema", value="Found" if lb else "Missing", status="good" if lb else "bad"))
    faq = "faqpage" in types
    checks.append(SiteCheck(key="faq_schema", label="FAQPage schema", value="Found" if faq else "Missing", status="good" if faq else "bad"))

    try:
        l = _safe_get(root + "/llms.txt", timeout=5.0)
        has_llms = l.status_code == 200 and "<html" not in l.text[:300].lower()
    except (ValueError, requests.RequestException):
        has_llms = False
    checks.append(SiteCheck(key="llms_txt", label="llms.txt", value="Found" if has_llms else "Missing", status="good" if has_llms else "warn"))

    blocked: list[str] = []
    all_blocked = False
    try:
        r = _safe_get(root + "/robots.txt", timeout=5.0)
        if r.status_code == 200:
            # A robots.txt "group" is a run of User-agent lines followed by its rules.
            group: list[str] = []
            in_rules = False
            for line in r.text.splitlines():
                key, _, val = line.split("#", 1)[0].partition(":")
                key, val = key.strip().lower(), val.strip()
                if key == "user-agent":
                    if in_rules:
                        group, in_rules = [], False
                    group.append(val)
                elif key in ("disallow", "allow"):
                    in_rules = True
                    if key == "disallow" and val == "/":
                        for agent in group:
                            if agent == "*":
                                all_blocked = True
                            for bot in _AI_BOTS:
                                if agent.lower() == bot.lower() and bot not in blocked:
                                    blocked.append(bot)
    except (ValueError, requests.RequestException):
        pass
    if all_blocked:
        crawler_value, crawler_status = "All crawlers blocked in robots.txt", "bad"
    elif blocked:
        crawler_value, crawler_status = "Blocked: " + ", ".join(blocked), "bad"
    else:
        crawler_value, crawler_status = "Not blocked in robots.txt", "good"
    checks.append(SiteCheck(key="ai_crawlers", label="AI crawlers", value=crawler_value, status=crawler_status))

    viewport = bool(re.search(r'<meta[^>]+name=["\']viewport["\']', html, re.I))
    checks.append(SiteCheck(key="mobile", label="Mobile viewport", value="Set" if viewport else "Missing", status="good" if viewport else "warn"))
    checks.append(SiteCheck(key="speed", label="Homepage response", value=f"{elapsed:.1f}s",
                            status="good" if elapsed < 2.5 else "warn" if elapsed < 4.5 else "bad"))
    return SiteChecksResponse(url=root, checks=checks)
