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
_PILLAR_TYPES = ["PILLAR PAGE", "FAQ CLUSTER", "COMPARISON", "PROOF"]


def generate_aeo_strategy(
    req: AeoStrategyRequest, usage_tracker: TokenUsageTracker | None = None,
) -> AeoStrategyResponse:
    prompt = f"""
Company: {req.company_name}   Website: {req.url}   Market: {req.market}   Industry: {req.industry}
Target AI prompt: "{req.prompt}"

Write the plan for getting {req.company_name} recommended when someone asks that prompt.

Return ONE JSON object with EXACTLY these keys:
{{
  "answer": "2 sentences: how an AI engine SHOULD answer this prompt, naming {req.company_name} and citing its website",
  "pillars": [
    {{"type": "one of {json.dumps(_PILLAR_TYPES)} (use each once, in this order)",
      "title": "specific content asset title", "detail": "one sentence on what it contains",
      "meta": "format hint e.g. '1,800 words · Article + FAQPage schema'"}}
  ],
  "plan": [
    {{"week": "WEEK 1", "task": "concrete action"}}  // exactly 4 entries, WEEK 1..WEEK 4
  ],
  "blog_topics": [
    {{"type": "one of {json.dumps(_BLOG_TYPES)} (use each once, in this order)",
      "title": "blog post title", "words": 1200}}
  ]
}}
For the CASE STUDY topic and the PROOF pillar, do not state any client name, result or number as fact —
frame them as something {req.company_name} should interview a client for and publish."""
    raw = _converse(_SYSTEM, prompt, max_tokens=3500, usage_tracker=usage_tracker)
    d = _parse_json(raw)
    pillars = [{"type": str(p.get("type", "")), "title": str(p.get("title", "")), "detail": str(p.get("detail", "")),
                "meta": str(p.get("meta", ""))} for p in (d.get("pillars") or [])][:6]
    plan = [{"week": str(p.get("week", f"WEEK {i + 1}")), "task": str(p.get("task", ""))}
            for i, p in enumerate(d.get("plan") or [])][:6]
    topics = [{"type": str(t.get("type", "")), "title": str(t.get("title", "")),
               "words": _clamp(t.get("words"), 300, 3000, 1000)} for t in (d.get("blog_topics") or [])][:8]
    if not (pillars and plan and topics):
        raise RuntimeError("The strategy response was missing sections — please try again.")
    return AeoStrategyResponse(prompt=req.prompt, answer=str(d.get("answer", "")), pillars=pillars, plan=plan, blog_topics=topics)


def generate_aeo_blog_draft(
    req: AeoBlogDraftRequest, usage_tracker: TokenUsageTracker | None = None,
) -> AeoBlogDraftResponse:
    prompt = f"""
Company: {req.company_name}   Website: {req.url}   Market: {req.market}   Industry: {req.industry}
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

_CHANNEL_RULES = {
    "fb": "Facebook: 250-500 characters, conversational, one clear CTA.",
    "ig": "Instagram: caption under 300 characters plus a hashtag line; `visual` describes the image or carousel.",
    "li": "LinkedIn: 300-700 characters, professional, insight-led, no emojis.",
    "yt": "YouTube: `title` under 90 characters, `text` is a 2-3 sentence description, `duration` like '6:30'.",
    "gbp": "Google Business Profile: under 300 characters, local and practical. NEVER include testimonials or ratings.",
}


def generate_aeo_social(
    req: AeoSocialRequest, usage_tracker: TokenUsageTracker | None = None,
) -> AeoSocialResponse:
    rules = "\n".join(f"- {_CHANNEL_RULES[c]}" for c in CHANNELS)
    prompt = f"""
Company: {req.company_name}   Website: {req.url}   Market: {req.market}   Industry: {req.industry}
Target AI prompt: "{req.prompt}"

Write {POSTS_PER_CHANNEL} social posts for EACH of these channels, each post supporting the idea that
{req.company_name} is the answer to that prompt. Vary the angle across the {POSTS_PER_CHANNEL} posts
(for example: direct answer, checklist/tips, proof-point to be collected, myth vs fact).
{rules}

Return ONE JSON object: {{"channels": {{"fb": [post, ...], "ig": [...], "li": [...], "yt": [...], "gbp": [...]}}}}
where post = {{"text": "...", "cta": "short button label", "tags": "#a #b", "visual": "what the image shows",
"title": "YouTube only, else empty", "duration": "YouTube only, else empty"}}.
Exactly {POSTS_PER_CHANNEL} posts per channel. Do NOT invent client names, quotes, numbers or reviews."""
    raw = _converse(_SYSTEM, prompt, max_tokens=7000, usage_tracker=usage_tracker)
    d = _parse_json(raw)
    channels: dict[str, list[AeoSocialPost]] = {}
    for c in CHANNELS:
        posts = []
        for p in ((d.get("channels") or {}).get(c) or [])[:POSTS_PER_CHANNEL]:
            posts.append(AeoSocialPost(
                text=str(p.get("text", ""))[:2000], cta=str(p.get("cta", ""))[:60], tags=str(p.get("tags", ""))[:200],
                visual=str(p.get("visual", ""))[:300], title=str(p.get("title", ""))[:120], duration=str(p.get("duration", ""))[:10],
            ))
        if len(posts) < POSTS_PER_CHANNEL:
            raise RuntimeError(f"Only {len(posts)} {c} posts were generated — please try again.")
        channels[c] = posts
    return AeoSocialResponse(prompt=req.prompt, channels=channels)


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
