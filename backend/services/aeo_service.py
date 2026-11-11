"""
services/aeo_service.py — the AEO (Answer Engine Optimisation) dashboard's
generators and checks.

What is real and what is estimated
-----------------------------------
* `run_site_checks` and `normalise_social_link` do real work (an HTTP fetch
  of the customer's own site / URL validation).
* Everything produced by Bedrock here — prompt lists, per-engine positions,
  share of voice, strategy, blog drafts, social posts — is AI-generated.
  Engine positions in particular are ESTIMATES from the model's knowledge of
  the market; nothing here queries ChatGPT/Perplexity/Gemini/AI Overviews.
  The response carries a disclaimer saying so, and the prompts tell the model
  not to invent client names, statistics, quotes or reviews.
"""
from __future__ import annotations

import ipaddress
import json
import threading
import os
from concurrent.futures import ThreadPoolExecutor
import logging
import re
import socket
import time
from typing import Optional
from urllib.parse import urljoin, urlparse

import requests

from models.aeo_models import (
    CHANNELS,
    ENGINES,
    POSTS_PER_CHANNEL,
    CALENDAR_PROMPT,
    month_slots,
    channel_cores,
    CORE_KINDS,
    CORES_PER_WEEK,
    WEEKS_PER_MONTH,
    AeoBlogDraftRequest,
    AeoBlogDraftResponse,
    AeoCompetitor,
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
from services.bedrock_service import TokenUsageTracker, _converse, _parse_json

logger = logging.getLogger(__name__)

FREE_PREVIEW_PROMPTS = 5
PAID_PROMPT_COUNT = 20
MASK = "••••••••"

_SYSTEM = """You are an Answer Engine Optimisation (AEO) strategist. You help businesses get
recommended by AI answer engines (ChatGPT, Perplexity, Gemini, Google AI Overviews).

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


def _engine_value(x) -> Optional[int]:
    if x is None:
        return 0
    try:
        n = int(x)
    except (TypeError, ValueError):
        return 0
    return n if n > 0 else (-1 if n < 0 else 0)


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


def generate_aeo_prompts(
    req: AeoPromptsRequest, usage_tracker: TokenUsageTracker | None = None, is_paid: bool = True,
) -> AeoPromptsResponse:
    n = PAID_PROMPT_COUNT if is_paid else FREE_PREVIEW_PROMPTS
    domain = _domain_of(req.url)
    extra_p = req.extra_prompts
    extra_c = req.extra_competitors
    logger.info(f"[aeo] prompts — {req.company_name} / {req.market} n={n} extra_p={len(extra_p)} extra_c={len(extra_c)} paid={is_paid}")

    extra_prompt_block = (
        "Also evaluate EXACTLY these user-supplied prompts (put them in `custom_prompts`, same row schema, "
        "no rank needed):\n" + json.dumps(extra_p, ensure_ascii=False)
        if extra_p else "No user-supplied prompts."
    )
    extra_comp_block = (
        "Also include these user-supplied competitors in `competitors` (they are real companies the user named): "
        + json.dumps(extra_c, ensure_ascii=False)
        if extra_c else "No user-supplied competitors."
    )

    prompt = f"""
Company: {req.company_name}
Website: {req.url}
Market: {req.market}
Industry: {req.industry}
{_site_block(req.url, req.company_name)}

Task: list the {n} questions people in {req.market} are most likely to ask an AI assistant when looking for
what {req.company_name} offers, ordered by estimated monthly volume (highest first). For each, estimate how
visible {req.company_name} is in each answer engine, in this order: {json.dumps(ENGINES)}.

Engine value convention (integers only):
  1..5  = {req.company_name} is cited at that position in the answer
  -1    = mentioned but not linked
  0     = absent

{extra_prompt_block}
{extra_comp_block}

Return ONE JSON object with EXACTLY these keys:
{{
  "prompts": [
    {{"text": "the question as a user would type it", "intent": "Commercial | Informational | Transactional",
      "volume_estimate": 1200, "engines": [0, 0, 0, 0]}}
    // exactly {n} rows, ordered by volume_estimate descending
  ],
  "custom_prompts": [ /* same row schema, one per user-supplied prompt; [] if none */ ],
  "competitors": [
    {{"name": "Real company", "domain": "example.com", "share_of_voice": 24, "domain_authority": 52,
      "prompts_cited": 14, "top_engine": "ChatGPT | Perplexity | Gemini | AI Overviews"}}
    // 4 to 6 REAL competitors in {req.market} (plus any user-supplied ones), most recommended first.
    // Do NOT include {req.company_name} itself or its parent company.
    // share_of_voice = estimated % of these prompts where that company is recommended (0-100).
    // prompts_cited is out of {n}.
  ],
  "engine_leaders": ["company most recommended by ChatGPT", "...Perplexity", "...Gemini", "...AI Overviews"]
}}

Estimate {req.company_name} honestly as a mid-sized player unless you specifically know otherwise; most
prompts should show absent (0) or mentioned (-1) in at least some engines."""

    raw = _converse(_SYSTEM, prompt, max_tokens=6000, usage_tracker=usage_tracker)
    data = _parse_json(raw)

    def _row(d: dict, rank: int, custom: bool) -> AeoPrompt:
        intent = d.get("intent")
        if intent not in ("Commercial", "Informational", "Transactional"):
            intent = "Commercial"
        engines = list(d.get("engines") or [])[:4]
        engines += [0] * (4 - len(engines))
        return AeoPrompt(
            rank=rank, text=str(d.get("text", "")).strip()[:300], intent=intent,
            volume_estimate=_clamp(d.get("volume_estimate"), 0, 10_000_000),
            engines=[_engine_value(e) for e in engines], custom=custom,
        )

    rows = [_row(d, i + 1, False) for i, d in enumerate(data.get("prompts") or []) if str(d.get("text", "")).strip()]
    rows = rows[:n]
    custom_rows = [_row(d, 0, True) for d in (data.get("custom_prompts") or []) if str(d.get("text", "")).strip()]
    # Any user-supplied prompt the model skipped still shows up (as not yet measured).
    have = {r.text.lower() for r in custom_rows}
    for t in extra_p:
        if t.lower() not in have:
            custom_rows.append(AeoPrompt(rank=0, text=t, intent="Commercial", engines=[None, None, None, None], custom=True))
    if not is_paid:
        while len(rows) < PAID_PROMPT_COUNT:
            rows.append(_locked_prompt(len(rows) + 1))

    real = [r for r in rows if not r.locked] + [r for r in custom_rows if None not in r.engines]
    total_cells = max(1, len(real) * 4)
    cited_cells = sum(1 for r in real for e in r.engines if e and e > 0)
    cited_prompts = sum(1 for r in real if any(e and e > 0 for e in r.engines))
    best_engine = max(range(4), key=lambda j: sum(1 for r in real if r.engines[j] and r.engines[j] > 0)) if real else 0

    comps: list[AeoCompetitor] = [AeoCompetitor(
        name=f"{req.company_name} (you)", domain=domain, is_you=True,
        share_of_voice=round(100 * cited_cells / total_cells), prompts_cited=cited_prompts,
        top_engine=ENGINES[best_engine] if cited_cells else "—",
    )]
    extra_lc = {c.lower() for c in extra_c}
    for c in data.get("competitors") or []:
        name = str(c.get("name", "")).strip()[:120]
        if not name or name.lower().startswith(req.company_name.lower()):
            continue
        top = c.get("top_engine")
        comps.append(AeoCompetitor(
            name=name, domain=_domain_of(str(c.get("domain", ""))),
            share_of_voice=_clamp(c.get("share_of_voice"), 0, 100),
            domain_authority=_clamp(c.get("domain_authority"), 0, 100),
            prompts_cited=_clamp(c.get("prompts_cited"), 0, len(real) or n),
            top_engine=top if top in ENGINES else "",
            custom=name.lower() in extra_lc,
        ))
    # Share of voice across all companies can't exceed 100% — scale rivals down if the model overshot.
    rival_total = sum(c.share_of_voice for c in comps if not c.is_you)
    room = max(0, 100 - comps[0].share_of_voice)
    if rival_total > room and rival_total > 0:
        k = room / rival_total
        for c in comps[1:]:
            c.share_of_voice = int(c.share_of_voice * k)
    # A user-supplied competitor the model dropped still shows, flagged pending.
    seen = {c.name.lower() for c in comps}
    for name in extra_c:
        if name.lower() not in seen:
            comps.append(AeoCompetitor(name=name, custom=True, pending=True))
    comps[1:] = sorted(comps[1:], key=lambda c: (c.pending, -c.share_of_voice))

    leaders = [str(x)[:120] for x in (data.get("engine_leaders") or [])][:4]
    leaders += [""] * (4 - len(leaders))

    return AeoPromptsResponse(
        company=req.company_name, market=req.market, industry=req.industry,
        prompts=custom_rows + rows, competitors=comps, engine_leaders=leaders,
        prompts_total=len(real),
    )


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


def generate_aeo_strategy(
    req: AeoStrategyRequest, usage_tracker: TokenUsageTracker | None = None, limited: bool = False,
) -> AeoStrategyResponse:
    scope = ("\nFREE PREVIEW: return only 1 page suggestion (in the pillars list), 2 plan entries (WEEK 1, WEEK 2) and 3 blog_topics. Keep it brief.\n" if limited else "")
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
    {{"type": "one of {json.dumps(_BLOG_TYPES)} (use each once, in this order)",
      "title": "blog post title", "words": 1200}}
  ]
}}
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
    topics = [{"type": str(t.get("type", "")), "title": str(t.get("title", "")),
               "words": _clamp(t.get("words"), 300, 3000, 1000)} for t in (d.get("blog_topics") or [])][:8]
    if not (pillars and plan and topics):
        raise RuntimeError("The strategy response was missing sections — please try again.")
    if limited:
        pillars, plan, topics = pillars[:1], plan[:2], topics[:3]
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

Write the draft so an AI engine could quote it: lead with the direct answer, then supporting sections.
Return ONE JSON object with EXACTLY these keys:
{{
  "intro": "opening paragraph (the direct answer first)",
  "sections": [ {{"h": "section heading", "p": "section body, plain text paragraphs separated by \\n\\n"}} ]  // 4 to 6 sections
}}
Rules: plain text only (no markdown). Do NOT invent client names, quotes, prices, statistics or review counts
as facts. Where a specific figure or example would help, write a clearly marked placeholder such as
[add your real figure] for {req.company_name} to fill in."""
    raw = _converse(_SYSTEM, prompt, max_tokens=5000, usage_tracker=usage_tracker)
    d = _parse_json(raw)
    sections = [{"h": str(s.get("h", "")), "p": str(s.get("p", ""))} for s in (d.get("sections") or []) if s.get("h")]
    if not sections:
        raise RuntimeError("The draft came back empty — please try again.")
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


def _core_week(req: AeoSocialRequest, week: int, keywords: list[str], usage_tracker: TokenUsageTracker | None) -> list[dict]:
    """The core content of one week: 3 posters + 2 reels. Written ONCE and then adapted for every channel."""
    kw = (f'KEYWORDS to target (one or two per item, naturally): {json.dumps(keywords, ensure_ascii=False)}') if keywords else ""
    month_note = f"This is month {req.cycle + 1} of an ongoing calendar. Use fresh angles, not the obvious first-month ones.\n" if req.cycle else ""

    def call(done: list) -> list[dict]:
        todo = CORE_KINDS[len(done):]
        prompt = f"""
{_brand_context(req)}
{kw}
{month_note}Theme for this week — {_WEEK_THEMES[week % 4]}.
Write the CORE content for the week. These items are shared by every social channel, so write them channel-neutral: the idea, the key
message and the visual. Each item has a different angle. A "poster" is one image post. A "reel" is a vertical video of 15-20 seconds.
`topic`: the angle in a few words. `message`: the key message in 2-3 plain sentences (facts that can be said on any channel).
`cta`: a short call to action. `hook`: a punchy line under 60 characters (the on-screen hook for a reel; the headline for a poster).
`visual`: for a poster, ONE realistic photograph (real people, places, products or services; no text in the image); for a reel, 3 realistic
scenes in order. Never cartoons or illustrations. `duration`: for a reel like '0:18', for a poster empty.

Write exactly these {len(todo)} items, in this order:
{chr(10).join(f"{i + 1}. {k}" for i, k in enumerate(todo))}

Return ONE JSON object: {{"items": [{{"topic": "...", "message": "...", "cta": "...", "hook": "...", "visual": "...", "duration": "..."}}, ...]}}."""
        with _BEDROCK_SLOTS:
            raw = _converse(_SYSTEM, prompt, max_tokens=900 + 450 * len(todo), usage_tracker=usage_tracker)
        out = []
        for p in list(_parse_json(raw).get("items") or []):
            if not isinstance(p, dict) or not str(p.get("message", "")).strip():
                break
            out.append({k: str(p.get(k, "")).strip() for k in ("topic", "message", "cta", "hook", "visual", "duration")})
        return out
    return _with_retries(call, CORES_PER_WEEK, f"core items for week {week + 1}")


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
            ))
        return out
    return _with_retries(call, len(items), f"{CHANNEL_NAMES[c]} items for week {week + 1}")


def generate_aeo_social(
    req: AeoSocialRequest, usage_tracker: TokenUsageTracker | None = None, limited: bool = False,
) -> AeoSocialResponse:
    """A month of content: the same 3 posters + 2 reels per week on every channel (YouTube: the 2 reels), written once and adapted per channel."""
    keywords = clean_keywords(req.keywords) or suggest_site_keywords(
        req.company_name, req.url, req.market, req.industry, usage_tracker=usage_tracker)
    weeks = [0] if limited else list(range(WEEKS_PER_MONTH))
    with ThreadPoolExecutor(max_workers=4) as pool:
        cores = dict(zip(weeks, [f.result() for f in [pool.submit(_core_week, req, w, keywords, usage_tracker) for w in weeks]]))
    jobs: list[tuple[str, int, list[tuple[int, str, dict]]]] = []
    for c in CHANNELS:
        by_week: dict[int, list[tuple[int, str, dict]]] = {}
        for cid, w, k in channel_cores(c, limited):
            by_week.setdefault(w, []).append((cid, k, cores[w][cid % CORES_PER_WEEK]))
        jobs += [(c, w, its) for w, its in by_week.items()]
    with ThreadPoolExecutor(max_workers=8) as pool:
        done = [(c, w, pool.submit(_adapt_week, req, c, w, its, keywords, usage_tracker)) for c, w, its in jobs]
        channels: dict[str, list[AeoSocialPost]] = {c: [] for c in CHANNELS}
        for c, w, f in done:
            channels[c] += f.result()
    return AeoSocialResponse(prompt=req.prompt, channels=channels, limited=limited, keywords=keywords, cycle=req.cycle)


def social_shape_ok(doc: dict, limited: bool) -> bool:
    """False for a saved calendar made before the weekly plan (4 posts per channel) — it is regenerated."""
    chans = doc.get("channels") or {}
    return all(len(chans.get(c) or []) == len(month_slots(c, limited)) and all(p.get("week") is not None and p.get("core") is not None for p in chans.get(c) or [])
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
