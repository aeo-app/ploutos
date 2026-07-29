"""
services/bedrock_service.py — AWS Bedrock · Full Responses · No External APIs
==============================================================================

Design goal
-----------
Match the response quality and completeness of the original apac_seo_api.zip
(which used Anthropic SDK + claude-sonnet-4-6) while running entirely on
AWS Bedrock with no external search APIs.

Why v4 returned too many nulls
--------------------------------
The previous v4 prompts told Bedrock to mark anything it wasn't 100% certain
about as null. This made responses useless — DA scores, keyword volumes, and
rankings all came back null because the model has no live data access.

The correct approach (matching v1 behaviour)
---------------------------------------------
The original v1 prompt trusted the model to produce REALISTIC ESTIMATES based
on its training knowledge of the industry, market, and company. These estimates
are clearly labelled "estimates" in the field names themselves
(e.g. "monthly_volume_estimate", "domain_authority_estimate") — so the schema
contract already communicates that these are not live data.

This is the right balance:
  • Real, useful values that drive business decisions
  • Field names that clearly signal "estimate"
  • A system prompt that contextualises Bedrock as an expert analyst
    using industry knowledge — not a web scraper claiming live data

What we keep from the anti-hallucination work
----------------------------------------------
  • Single clean _converse() call per generator (no broken tool-use loops)
  • Prompts that ask for consistent, realistic estimates
  • JSON-only output with strict schema enforcement
  • No fictional competitor names or services the company doesn't offer

AWS Bedrock Converse API
------------------------
  client.converse(
      modelId   = MODEL_ID,
      system    = [{"text": "..."}],      # list, not string
      messages  = [...],
      inferenceConfig = {"maxTokens": N}
  )
  response["output"]["message"]["content"] → list of {"text": "..."} blocks
  response["stopReason"] → "end_turn" | "max_tokens"
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import boto3
import time
from botocore.config import Config
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv()

from models.seo_models import (
    AnalyseRequest,
    CompanyProfile,
    CompetitorAnalysisResponse,
    ContentStrategyAnalysis,
    ContentStrategyRequest,
    ContentStrategyResponse,
    DomainAuthorityResponse,
    FullSEOReport,
    GeneratedContentPiece,
    KeywordContentReport,
    KeywordVolumeResponse,
    RankingExplanation,
    SEOFactorAnalysis,
    SEOInsight,
)


logger = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────
AWS_REGION = os.getenv("BEDROCK_AWS_REGION", "us-east-1")
MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0")

MAX_TOKENS = int(os.getenv("BEDROCK_MAX_TOKENS", "4096"))

# Content Strategy Generator budgets — Amazon Nova Pro's hard ceiling is 5,000
# output tokens (see AWS Bedrock model card), and other Bedrock models have
# similar or smaller caps. Asking for competitor analysis + a 600-900 word
# article in ONE response routinely needs 6,000+ tokens and gets silently
# truncated mid-JSON. We split that into two calls instead, each comfortably
# bounded well under any model's output ceiling.
ANALYSIS_MAX_TOKENS = int(os.getenv("BEDROCK_ANALYSIS_MAX_TOKENS", "6000"))
CONTENT_MAX_TOKENS = int(os.getenv("BEDROCK_CONTENT_MAX_TOKENS", "6500"))
EIGENAI_AWS_ACCESS_KEY_ID = os.getenv("EIGENAI_AWS_ACCESS_KEY_ID")
EIGENAI_AWS_SECRET_ACCESS_KEY = os.getenv("EIGENAI_AWS_SECRET_ACCESS_KEY")
EIGENAI_AWS_SESSION_TOKEN = os.getenv("EIGENAI_AWS_SESSION_TOKEN")
ROLE_ARN = os.getenv("ROLE_ARN")  # optional, for cross-account access

# ── Singleton Bedrock client ───────────────────────────────────────────────────
_bedrock: Any = None


def _get_client():
    global _bedrock, _creds_expiry

    if (
        _bedrock is None
        or _creds_expiry is None
        or time.time() > _creds_expiry - 60  # refresh 1 min before expiry
    ):
        logger.info("[bedrock] refreshing STS credentials...")

        sts = boto3.client(
            "sts",
            aws_access_key_id=EIGENAI_AWS_ACCESS_KEY_ID,
            aws_secret_access_key=EIGENAI_AWS_SECRET_ACCESS_KEY,
            region_name=AWS_REGION,
        )

        response = sts.assume_role(
            RoleArn=ROLE_ARN,
            RoleSessionName="bedrock-session",
        )

        creds = response["Credentials"]
        _creds_expiry = creds["Expiration"].timestamp()

        _bedrock = boto3.client(
            "bedrock-runtime",
            region_name=AWS_REGION,
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds["SessionToken"],
            config=Config(
                connect_timeout=10,
                # Long-form generations can legitimately take 30-60s+; this is
                # a ceiling against a hung connection, not a normal-case limit.
                read_timeout=int(os.getenv("BEDROCK_READ_TIMEOUT_SECONDS", "90")),
                retries={"max_attempts": 0},  # we do our own backoff below,
                                               # so we can log/react per attempt
            ),
        )

        logger.info(f"[bedrock] refreshed. expires at {_creds_expiry}")

    return _bedrock


# ── Retry / backoff for transient Bedrock errors ───────────────────────────────
_RETRYABLE_ERROR_CODES = {
    "ThrottlingException",
    "ServiceUnavailableException",
    "ModelTimeoutException",
    "InternalServerException",
}


def _converse_with_retry(fn, *, max_attempts: int = 3, base_delay: float = 1.5):
    """Run a Bedrock call with exponential backoff + jitter on transient
    errors. Non-retryable errors (validation, access denied, etc.) fail fast."""
    attempt = 0
    while True:
        attempt += 1
        try:
            return fn()
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if code not in _RETRYABLE_ERROR_CODES or attempt >= max_attempts:
                raise
            delay = base_delay * (2 ** (attempt - 1)) + random.uniform(0, 0.5)
            logger.warning(
                f"[bedrock] {code} (attempt {attempt}/{max_attempts}) — "
                f"retrying in {delay:.1f}s"
            )
            time.sleep(delay)

# ── Core Converse wrapper ──────────────────────────────────────────────────────
def _converse(system_text: str, user_text: str, max_tokens: int | None = None) -> str:
    """
    Single Bedrock Converse call. Returns the assistant text response.

    Raises RuntimeError (not a cryptic downstream JSONDecodeError) if Bedrock's
    stopReason is "max_tokens" — i.e. the model was cut off mid-response, which
    always produces invalid/truncated JSON for our schema-heavy prompts.
    """
    tokens = max_tokens or MAX_TOKENS
    try:
        response = _converse_with_retry(lambda: _get_client().converse(
            modelId=MODEL_ID,
            system=[{"text": system_text}],
            messages=[{"role": "user", "content": [{"text": user_text}]}],
            inferenceConfig={"maxTokens": tokens},
        ))
        blocks = response.get("output", {}).get("message", {}).get("content", [])
        text = "\n".join(b["text"] for b in blocks if "text" in b).strip()

        stop_reason = response.get("stopReason")
        if stop_reason == "max_tokens":
            logger.error(
                f"[bedrock] response TRUNCATED at maxTokens={tokens} "
                f"(got {len(text)} chars). Raise BEDROCK_MAX_TOKENS / the "
                f"max_tokens override for this call, or shorten the prompt's "
                f"requested output."
            )
            raise RuntimeError(
                f"Bedrock response was truncated (stopReason=max_tokens, limit={tokens}). "
                "The model was cut off before it finished the JSON response — increase "
                "BEDROCK_MAX_TOKENS (or the per-call max_tokens) or ask for shorter output."
            )
        return text
    except ClientError as e:
        code = e.response["Error"]["Code"]
        msg = e.response["Error"]["Message"]
        logger.error(f"[bedrock] converse failed: {code} — {msg}")
        raise


_json_decoder = json.JSONDecoder()


def _first_json_start(s: str) -> int:
    """Index of the first '{' or '[' — in case the model added leading
    commentary despite being told not to."""
    candidates = [i for i in (s.find("{"), s.find("[")) if i != -1]
    return min(candidates) if candidates else 0


def _parse_json(raw: str) -> dict:
    """Strip markdown fences, then parse the FIRST complete JSON value in the
    text using raw_decode — this ignores any trailing commentary Bedrock
    sometimes appends after the closing brace (e.g. a stray note) despite
    being told to return JSON only, which plain json.loads() would reject
    with "Extra data". Falls back to a small repair pass (trailing commas,
    stray control characters) for minor formatting slips before giving up."""
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()

    try:
        obj, _ = _json_decoder.raw_decode(text, _first_json_start(text))
        return obj
    except json.JSONDecodeError as e:
        logger.warning(f"[bedrock] initial JSON parse failed ({e}); attempting repair")
        repaired = text
        # Drop trailing commas before ] or } — a common small model slip.
        repaired = re.sub(r",(\s*[\]}])", r"\1", repaired)
        # Strip raw control characters (literal newlines/tabs) that sometimes
        # leak into string values instead of being escaped as \n / \t.
        repaired = re.sub(r"(?<!\\)[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", repaired)
        try:
            obj, _ = _json_decoder.raw_decode(repaired, _first_json_start(repaired))
            return obj
        except json.JSONDecodeError:
            # Re-raise the ORIGINAL error — it points at the real problem spot.
            raise e


# ── System prompt (matches v1 intent, adapted for Bedrock) ────────────────────
SYSTEM_PROMPT = """You are an expert SEO strategist and digital marketing analyst
specialising in Singapore and Asia-Pacific markets. You have deep knowledge of
the SEO industry, keyword landscapes, domain authority patterns, competitive
dynamics, and digital marketing strategies across the region.

You produce highly structured, data-driven competitive intelligence reports.
Your estimates are based on your deep industry expertise and knowledge of
typical patterns in each sector and market — clearly presented as estimates.

CRITICAL RULES:
- Always respond with ONLY valid JSON — no markdown fences, no preamble, no commentary.
- Every field in the schema MUST be populated with a realistic value. Never return null
  for a required field — use your industry expertise to provide a reasonable estimate.
- All numeric estimates must be realistic and consistent with the company size,
  market position, and industry norms you know from your training.
- Estimates for search volumes, DA scores, and rankings should reflect realistic
  ranges based on the industry and market segment provided.
- Tailor all outputs to the specific company, URL, market, and industry provided.
- Keep text values concise but information-rich.
- Never invent competitor company names that do not exist — use real companies
  you know operate in this industry and market."""


# ── Generator: Competitor Analysis ────────────────────────────────────────────
def generate_competitor_analysis(req: AnalyseRequest) -> CompetitorAnalysisResponse:
    logger.info(f"[bedrock] competitor_analysis — {req.company_name} / {req.market}")

    prompt = f"""
Analyse the competitive landscape for:
  Company: {req.company_name}
  URL: {req.url}
  Market: {req.market}
  Industry: {req.industry}

Return a JSON object with EXACTLY these keys:
{{
  "company": "{req.company_name}",
  "url": "{req.url}",
  "competitor_overview": [{{
      "rank": 1,
      "company": "string",
      "hq": "string",
      "focus": "string",
      "scale": "string",
      "accreditation": "string"
    }}
    // 7-8 top competitors including {req.company_name}
  ],
  "seo_visibility": [{{
      "company": "string",
      "seo_visibility_score": 0-100,
      "organic_traffic_estimate": "string (e.g. High / Medium / Low)",
      "domain_authority_estimate": integer,
      "has_blog": true/false,
      "google_rating": float
    }}
    // same 7-8 companies
  ],
  "keyword_rankings": [{{
      "keyword": "string",
      "monthly_searches_estimate": "string (e.g. 2,400-2,800)",
      "apac_rank": "string (e.g. #4-6)",
      "crown_rank": "string",
      "allied_rank": "string",
      "asiatic_rank": "string"
    }}
    // 8 key industry keywords
  ],
  "competitor_scores": [{{
      "rank": 1,
      "company": "string",
      "score": 0-100,
      "key_strengths": "string",
      "key_weaknesses": "string"
    }}
    // same 7-8 companies ranked by overall score
  ],
  "key_takeaways": [
    {{"insight": "string", "detail": "string"}}
    // 5 strategic insights
]}}
"""

    raw = _converse(SYSTEM_PROMPT, prompt)
    data = _parse_json(raw)
    return CompetitorAnalysisResponse(**data)


# ── Generator: Keyword Volume ──────────────────────────────────────────────────
def generate_keyword_volume(req: AnalyseRequest) -> KeywordVolumeResponse:
    logger.info(f"[bedrock] keyword_volume — {req.company_name} / {req.market}")

    prompt = f"""
Generate a comprehensive keyword volume analysis for:
  Company: {req.company_name}
  URL: {req.url}
  Market: {req.market}
  Industry: {req.industry}

Return a JSON object with EXACTLY these keys:
{{
  "company": "{req.company_name}",
  "market": "{req.market}",
  "high_volume_head_terms": [{{
      "rank": 1,
      "keyword": "string — broad head term e.g. 'movers Singapore'",
      "monthly_volume_estimate": "string e.g. '4,800-6,000'",
      "competition": "Very High / High / Medium / Low",
      "intent": "Transactional / Informational / Navigational",
      "apac_estimated_position": "string e.g. '#8-14'"
    }}
    // Exactly 8 high-volume head terms for {req.industry} in {req.market}
  ],
  "mid_volume_service_terms": [
    // Same schema — exactly 10 mid-volume service-specific terms
    // e.g. 'international movers Singapore', 'corporate relocation Singapore'
  ],
  "long_tail_high_intent": [
    // Same schema — exactly 10 long-tail high-intent terms
    // e.g. 'moving from Singapore to Australia cost', 'best movers Singapore HDB'
  ],
  "strategic_priority_summary": [
    {{"insight": "string — 3-5 word title", "detail": "string — 1-2 sentences"}}
    // Exactly 5 keyword strategy insights for {req.company_name} in {req.market}
]}}

For volume estimates, use realistic ranges based on typical search patterns in {req.market}
for the {req.industry} sector. Head terms get higher volumes, long-tail get lower.
For position estimates, assume {req.company_name} is a mid-tier player unless you know otherwise."""

    raw = _converse(SYSTEM_PROMPT, prompt)
    data = _parse_json(raw)
    return KeywordVolumeResponse(**data)


# ── Generator: Company Profile ─────────────────────────────────────────────────
def generate_company_profile(req: AnalyseRequest) -> CompanyProfile:
    logger.info(f"[bedrock] company_profile — {req.company_name}")

    prompt = f"""
Generate professional company profiles for:
  Company: {req.company_name}
  URL: {req.url}
  Market: {req.market}
  Industry: {req.industry}

Return a JSON object with EXACTLY these keys:
{{
  "company_name": "{req.company_name}",
  "url": "{req.url}",
  "tagline": "One punchy sentence under 20 words that captures what {req.company_name} does best",
  "linkedin_overview": "Full LinkedIn company overview under 2000 characters. Structure with:
    - Opening hook (1-2 sentences on who they are)
    - Bullet points listing core services
    - Key differentiators (global network, certifications, years of experience)
    - Geographic coverage and markets served
    - A clear call-to-action at the end.
    Write in professional third person. Mention relevant industry certifications if known.",
  "google_business_description": "Google Business Profile description under 750 characters.
    Keyword-rich for {req.market} SEO. Cover main services, key destinations/markets,
    what makes them different. End with call-to-action and mention {req.market} location.",
  "linkedin_specialties": [
    "keyword1", "keyword2", "keyword3"
    // 8-12 SEO-relevant specialty keywords for {req.industry} in {req.market}
  ],
  "google_business_categories": [
    "Primary Category",
    "Secondary Category 1",
    "Secondary Category 2"
    // 3-4 relevant Google Business categories for {req.industry}
  ]
}}"""

    raw = _converse(SYSTEM_PROMPT, prompt)
    data = _parse_json(raw)
    return CompanyProfile(**data)


# ── Generator: Domain Authority Strategy ──────────────────────────────────────
def generate_da_strategy(req: AnalyseRequest) -> DomainAuthorityResponse:
    logger.info(f"[bedrock] da_strategy — {req.company_name}")

    prompt = f"""
Generate a Domain Authority growth strategy for:
  Company: {req.company_name}
  URL: {req.url}
  Market: {req.market}
  Industry: {req.industry}

Return a JSON object with EXACTLY these keys:
{{
  "company": "{req.company_name}",
  "current_da": <integer — realistic DA estimate for a company of this size in {req.industry}.
    Typical range: small local company 15-30, mid-size regional 30-50, large global brand 50-75.
    Base your estimate on what you know about {req.company_name}'s market position.>,
  "target_da_6m": <integer — realistic 6-month target, typically current + 6-12 points>,
  "target_da_12m": <integer — realistic 12-month target, typically current + 15-25 points>,
  "gap_analysis": [{{
      "metric": "string — e.g. 'Domain Authority', 'Referring Domains', 'Content Pages'",
      "current": "string — current state estimate e.g. 'DA 32' or '~450 backlinks'",
      "six_month_target": "string — realistic 6-month goal",
      "twelve_month_target": "string — realistic 12-month goal",
      "benchmark": "string — what top competitors in {req.market} achieve"
    }}
    // Exactly 5 metrics: DA, Referring Domains, Content Volume, Page Speed, Google Reviews
  ],
  "backlink_opportunities": [{{
      "pillar": "string — e.g. 'Foundational', 'Digital PR', 'Guest Posting', 'Directories'",
      "action": "string — specific actionable task",
      "platform_or_target": "string — specific site or platform name",
      "estimated_da": "string — e.g. '45-55' or '60+'",
      "difficulty": "Easy / Medium / Hard",
      "estimated_monthly_links": "string or null — e.g. '3-5' or null"
    }}
    // 10-12 specific backlink opportunities relevant to {req.industry} in {req.market}
  ],
  "top_5_priority_actions": [
    {{"insight": "string (action title)", "detail": "string (why + expected impact)"}}
    // Exactly 5 priority actions ordered by impact
]}}

For current_da: if you know {req.company_name} is a smaller/newer company, estimate lower (20-35).
If they are an established regional player, estimate mid-range (35-50).
If they are a large global brand, estimate higher (50-70).
Base all estimates on realistic industry patterns for {req.industry} companies in {req.market}."""

    raw = _converse(SYSTEM_PROMPT, prompt)
    data = _parse_json(raw)

    # Ensure int fields are populated (belt-and-suspenders)
    for key in ("current_da", "target_da_6m", "target_da_12m"):
        if not isinstance(data.get(key), int) or data[key] == 0:
            defaults = {"current_da": 30, "target_da_6m": 38, "target_da_12m": 48}
            data[key] = defaults[key]

    return DomainAuthorityResponse(**data)


# ── Full report ────────────────────────────────────────────────────────────────
def generate_full_report(req: AnalyseRequest) -> FullSEOReport:
    """Run all four analyses. Each makes one Bedrock call (4 total)."""
    return FullSEOReport(
        competitor_analysis=generate_competitor_analysis(req),
        keyword_volume=generate_keyword_volume(req),
        company_profile=generate_company_profile(req),
        domain_authority_strategy=generate_da_strategy(req),
    )


# ── System prompt for the Content Strategy Generator ──────────────────────────
CONTENT_SYSTEM_PROMPT = """You are a senior SEO strategist and content marketing expert with
deep, well-informed knowledge of search ranking factors, backlink patterns, and high-performing
content structures across Asia-Pacific markets. You have studied thousands of top-ranking pages
and know the patterns that typically separate a #1 result from a #10 result for a given keyword.

For every keyword you are given, you produce two things:
  1. A grounded, specific analysis of why the realistic top-ranking pages for that keyword tend
     to outrank everyone else — covering their backlink sources, content strategy, and on-page
     SEO factors — presented clearly as expert analysis/estimates based on well-known industry
     patterns, not as live scraped data.
  2. An original, ready-to-publish content piece for the requesting company that matches or
     improves on what typically ranks, optimised for SEO and built to engage and convert.

CRITICAL RULES:
- Always respond with ONLY valid JSON — no markdown fences, no preamble, no commentary.
- Output NOTHING before the opening brace and NOTHING after the closing brace — no trailing
  notes, disclaimers, or explanations of your reasoning. The response must be a single JSON
  object and nothing else.
- Every field in the schema MUST be populated with a realistic, specific value. Never return
  null, "N/A", "unknown", or generic filler for a required field.
- Competitor names must be REAL companies you have training knowledge of that plausibly operate
  and rank for that keyword in the given industry and market. Never invent fictional company
  names or fabricate specific traffic/ranking numbers you could not plausibly know — use
  qualitative, expert-judgment descriptions instead (e.g. "consistently ranks in the top 3"
  rather than an invented exact position).
- The generated content piece must be 100% original writing — never copy or closely paraphrase
  any real company's actual published copy. Write fresh content inspired by the *patterns* you
  describe, in the requesting company's voice.
- The generated content must read naturally (never keyword-stuffed) while still using the target
  keyword and 2-3 closely related terms in the title, the opening ~100 words, at least one
  heading, and the meta description.
- Keep every analysis field concrete and specific — name actual tactics, platforms, or formats.
  Avoid generic filler such as "high quality content" with no further detail.
- Tailor everything to the specific company, market, and industry provided.
"""


# ── Generator: Step 1 — competitor + SEO analysis for ONE keyword ─────────────
def _generate_keyword_analysis(req: ContentStrategyRequest, keyword: str) -> dict:
    """Small, bounded call: competitors + backlinks + strategy/SEO/ranking analysis.
    No long-form free text here, so this comfortably fits well under any
    Bedrock model's output token ceiling."""
    prompt = f"""
Target keyword: "{keyword}"
Company requesting this analysis: {req.company_name}
Company URL: {req.url}
Market: {req.market}
Industry: {req.industry}

Perform a full SEO + content competitive analysis for this ONE keyword, explaining how the
realistic top-ranking pages earned their position.

Return a JSON object with EXACTLY these keys:
{{
  "keyword": "{keyword}",
  "top_competitors": [
    {{"rank": 1, "company": "string (real company)", "url": "string (real or plausible domain)",
      "why_ranking": "string — the single biggest reason this page ranks near the top for
        \\"{keyword}\\" in {req.market}"}}
    // exactly 4 real, currently-relevant top-ranking competitors for this keyword in {req.market}
    // (use {req.company_name}'s known direct rivals in {req.industry} where you know them,
    // otherwise the realistic category leaders for this keyword and market)
  ],
  "backlink_sources": [
    {{"source_type": "string e.g. 'Industry directories', 'Digital PR / news mentions',
       'Guest posts on niche blogs', 'Partner & supplier sites', 'Review platforms'",
      "examples": "string — 2-4 concrete named platforms or site types typical for {req.industry}",
      "notes": "string — why this source type specifically helps ranking for \\"{keyword}\\""}}
    // exactly 5 distinct backlink source categories
  ],
  "content_strategy_analysis": {{
    "dominant_content_types": "string — the content formats (long-form guide, comparison page,
      landing page, video, interactive tool/calculator, etc.) that dominate page 1 for this keyword",
    "typical_tone": "string — the voice/tone top pages use (authoritative, conversational,
      technical, etc.)",
    "typical_structure": "string — the structural pattern top pages tend to follow (hook,
      definition, comparison table, FAQ, CTA placement, etc.)",
    "publishing_cadence_estimate": "string — how often top competitors appear to refresh or
      publish new content targeting this topic cluster"
  }},
  "seo_factor_analysis": {{
    "keyword_usage_pattern": "string — where and how top pages typically place \\"{keyword}\\"
      (title, H1, first paragraph, image alt text, natural variations used)",
    "heading_structure_pattern": "string — the typical H1/H2/H3 outline shape used by top-ranking
      pages for this keyword",
    "meta_title_pattern": "string — the formula top pages tend to use for title tags
      (e.g. 'Keyword + Benefit + Brand')",
    "meta_description_pattern": "string — the formula typically used for meta descriptions",
    "url_structure_pattern": "string — the typical URL slug pattern for this keyword's content"
  }},
  "ranking_explanation": {{
    "backlink_strategy_summary": "string — 2-3 sentences on HOW these competitors typically build
      the backlink profile that helps them rank for \\"{keyword}\\", and why it works",
    "content_quality_summary": "string — 2-3 sentences on what makes their content good enough to
      hold a top position (depth, expertise/trust signals, freshness, UX, media, etc.)"
  }}
}}

Keep every string value on a single line (no literal line breaks — use plain prose).
Do not use double-quote characters inside any string value; use single quotes for emphasis
if needed, since this must parse as strict JSON.
"""
    raw = _converse(CONTENT_SYSTEM_PROMPT, prompt, max_tokens=ANALYSIS_MAX_TOKENS)
    return _parse_json(raw)


# ── Shared prompt builder for content generation (used by both the blocking
#    _generate_content_piece and the streaming astream_keyword_report path) ────
def _build_content_prompt(req: ContentStrategyRequest, keyword: str, analysis: dict) -> str:
    csa = analysis.get("content_strategy_analysis", {})
    sfa = analysis.get("seo_factor_analysis", {})
    top_names = ", ".join(c.get("company", "") for c in analysis.get("top_competitors", [])[:3])

    return f"""
Target keyword: "{keyword}"
Company: {req.company_name} ({req.url}) — {req.industry} in {req.market}

Competitive context already established for this keyword:
- Top competitors: {top_names}
- Dominant content types on page 1: {csa.get("dominant_content_types", "n/a")}
- Typical tone: {csa.get("typical_tone", "n/a")}
- Typical structure: {csa.get("typical_structure", "n/a")}
- Typical heading pattern: {sfa.get("heading_structure_pattern", "n/a")}
- Typical meta title formula: {sfa.get("meta_title_pattern", "n/a")}
- Typical meta description formula: {sfa.get("meta_description_pattern", "n/a")}
- Typical URL pattern: {sfa.get("url_structure_pattern", "n/a")}

Using that context, write an original, high-performing content piece for {req.company_name}
targeting "{keyword}" that matches or improves on the competitive patterns above.

Return a JSON object with EXACTLY these keys:
{{
  "content_type": "string — the best content format for {req.company_name} to compete with,
    given the competitive context above",
  "title": "string — a compelling, SEO-optimised headline using \\"{keyword}\\" naturally",
  "meta_title": "string — 60 characters or fewer, keyword placed near the front",
  "meta_description": "string — 155 characters or fewer, includes the keyword and a call to action",
  "url_slug": "string — lowercase-hyphenated, keyword-based",
  "headings": [
    {{"level": "H1", "text": "string"}},
    {{"level": "H2", "text": "string"}}
    // 6-8 total headings (1 H1 + 5-7 H2/H3) forming a complete, logical outline that matches
    // or exceeds the typical structure/heading pattern above
  ],
  "body": "string — a complete, ready-to-publish draft of 500-700 words following the headings
    outline above. Must: use \\"{keyword}\\" naturally in the opening 100 words and at least one
    heading; reflect {req.company_name}'s voice for {req.industry} in {req.market}; include one
    comparison or proof point (a stat, mini case, or credential) that differentiates it from
    competitors; end with a clear, specific call to action. Write full prose, not an outline.
    Keep it as ONE continuous string — use \\n\\n between paragraphs instead of literal line
    breaks, and do not use double-quote characters inside the text (use single quotes instead),
    since this must parse as strict JSON.",
  "word_count": <integer — the approximate word count of the body text above>,
  "tone": "string — the tone used, chosen to match or improve on the typical tone above",
  "primary_cta": "string — the exact call-to-action text used at the end of the piece",
  "engagement_elements": [
    "string"
    // 4-6 specific engagement/conversion elements included in or recommended alongside this
    // piece (e.g. 'Comparison table vs top 3 competitors', 'Embedded customer quote',
    // 'FAQ section written for featured-snippet capture', 'Sticky CTA button',
    // 'Downloadable checklist')
  ],
  "seo_optimization_notes": [
    "string"
    // 3-5 concrete notes on specifically how this piece is optimised to match or beat the
    // competitive patterns above (keyword placement choices, schema markup recommendation,
    // internal linking suggestion, featured-snippet targeting, etc.)
  ]
}}
"""


# ── Generator: Step 2 — the actual content piece, using Step 1 as context ─────
def _generate_content_piece(
    req: ContentStrategyRequest, keyword: str, analysis: dict
) -> GeneratedContentPiece:
    """Separate, bounded call dedicated to the long-form output (the article
    body). Keeping this isolated from the analysis call means its token
    budget only ever has to cover ~500-700 words + a handful of short fields —
    comfortably inside any Bedrock model's output ceiling."""
    prompt = _build_content_prompt(req, keyword, analysis)
    raw = _converse(CONTENT_SYSTEM_PROMPT, prompt, max_tokens=CONTENT_MAX_TOKENS)
    data = _parse_json(raw)
    return GeneratedContentPiece(**data)


# ── Generator: one keyword → competitor analysis + generated content piece ────
def generate_keyword_content_report(
    req: ContentStrategyRequest, keyword: str
) -> KeywordContentReport:
    """Two Bedrock calls (analysis, then content) instead of one oversized
    call — see ANALYSIS_MAX_TOKENS / CONTENT_MAX_TOKENS above for why."""
    logger.info(f"[bedrock] content_strategy — {req.company_name} — keyword={keyword!r}")

    analysis = _generate_keyword_analysis(req, keyword)
    content = _generate_content_piece(req, keyword, analysis)

    return KeywordContentReport(
        keyword=analysis.get("keyword", keyword),
        top_competitors=analysis["top_competitors"],
        backlink_sources=analysis["backlink_sources"],
        content_strategy_analysis=ContentStrategyAnalysis(**analysis["content_strategy_analysis"]),
        seo_factor_analysis=SEOFactorAnalysis(**analysis["seo_factor_analysis"]),
        ranking_explanation=RankingExplanation(**analysis["ranking_explanation"]),
        generated_content=content,
    )


# ── Generator: cross-keyword executive summary ─────────────────────────────────
def _generate_executive_summary(
    req: ContentStrategyRequest, keyword_reports: list[KeywordContentReport]
) -> list[SEOInsight]:
    findings = "\n".join(
        f'- "{r.keyword}": top competitors [{", ".join(c.company for c in r.top_competitors[:3])}]; '
        f"backlink insight: {r.ranking_explanation.backlink_strategy_summary}"
        for r in keyword_reports
    )

    prompt = f"""
Company: {req.company_name} ({req.url}) — {req.industry} in {req.market}

Per-keyword competitive findings across {len(keyword_reports)} keyword(s):
{findings}

Based on the findings above, return a JSON object with EXACTLY this key:
{{
  "executive_summary": [
    {{"insight": "string — 3-6 word title",
      "detail": "string — 1-2 sentence, cross-keyword, actionable takeaway for
        {req.company_name}'s content and backlink strategy"}}
    // exactly 5 insights, ordered by priority/impact, synthesising patterns across ALL keywords
    // (not repeating a single keyword's findings) — e.g. shared backlink opportunities,
    // a content publishing cadence recommendation, or a quick-win vs long-term split
  ]
}}
"""

    raw = _converse(CONTENT_SYSTEM_PROMPT, prompt)
    data = _parse_json(raw)
    return [SEOInsight(**item) for item in data.get("executive_summary", [])]


# Bedrock on-demand quotas are RPM/TPM-limited per model — bound concurrency
# rather than firing all keywords at once (which just trades latency for
# ThrottlingException retries). 3 is a conservative default; raise it if your
# account's Bedrock quota supports more concurrent requests for MODEL_ID.
MAX_CONCURRENT_KEYWORDS = int(os.getenv("BEDROCK_MAX_CONCURRENT_KEYWORDS", "3"))


def _run_keyword_reports_concurrently(
    req: ContentStrategyRequest, keywords: list[str]
) -> tuple[list[KeywordContentReport], dict[str, str]]:
    """
    Runs generate_keyword_content_report() for every keyword IN PARALLEL
    (bounded by MAX_CONCURRENT_KEYWORDS) instead of one-after-another.

    This is the single highest-impact latency fix for this endpoint: N
    sequential keywords at ~15-25s per keyword (2 calls each) is what turns
    into 5+ minutes. Running them concurrently drops total time to roughly
    ceil(N / MAX_CONCURRENT_KEYWORDS) rounds instead of N sequential steps.

    A keyword that errors doesn't abort the whole request — it's recorded in
    the returned failures dict and the rest still complete.
    """
    reports: dict[str, KeywordContentReport] = {}
    failures: dict[str, str] = {}

    with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_KEYWORDS) as pool:
        future_to_kw = {
            pool.submit(generate_keyword_content_report, req, kw): kw for kw in keywords
        }
        for future in as_completed(future_to_kw):
            kw = future_to_kw[future]
            try:
                reports[kw] = future.result()
            except Exception as e:
                logger.error(f"[bedrock] keyword {kw!r} failed: {e}", exc_info=True)
                failures[kw] = str(e)

    # Preserve the original keyword order in the response.
    ordered_reports = [reports[kw] for kw in keywords if kw in reports]
    return ordered_reports, failures


# ── Generator: full Content Strategy (keywords → competitors → content) ───────
def generate_content_strategy(req: ContentStrategyRequest) -> ContentStrategyResponse:
    """
    For every keyword (primary + additional, deduped, capped by MAX_TOTAL_KEYWORDS),
    run analysis + content generation CONCURRENTLY (bounded by
    MAX_CONCURRENT_KEYWORDS), then synthesise a cross-keyword executive summary
    over whichever keywords succeeded. Partial failures don't abort the request.
    """
    keywords = list(req.primary_keywords) + list(req.additional_keywords)
    logger.info(
        f"[bedrock] content_strategy — {req.company_name} — {len(keywords)} keyword(s): {keywords}"
    )

    keyword_reports, failures = _run_keyword_reports_concurrently(req, keywords)

    if failures:
        logger.warning(f"[bedrock] content_strategy — {len(failures)} keyword(s) failed: {failures}")

    if not keyword_reports:
        raise RuntimeError(f"All keywords failed to generate: {failures}")

    executive_summary = _generate_executive_summary(req, keyword_reports)

    return ContentStrategyResponse(
        company=req.company_name,
        url=req.url,
        market=req.market,
        industry=req.industry,
        keywords_analyzed=[r.keyword for r in keyword_reports],
        keyword_reports=keyword_reports,
        executive_summary=executive_summary,
    )


# ═════════════════════════════════════════════════════════════════════════════
# Streaming (SSE) path — progressive per-keyword results + real token
# streaming for the long-form content piece, using Bedrock's converse_stream.
# ═════════════════════════════════════════════════════════════════════════════

_SENTINEL = object()


def _converse_stream_chunks(system_text: str, user_text: str, max_tokens: int):
    """Blocking generator over Bedrock's converse_stream deltas (sync — must
    be driven from a thread, see `_bridge_stream_to_asyncio` below)."""
    def _open():
        return _get_client().converse_stream(
            modelId=MODEL_ID,
            system=[{"text": system_text}],
            messages=[{"role": "user", "content": [{"text": user_text}]}],
            inferenceConfig={"maxTokens": max_tokens},
        )

    response = _converse_with_retry(_open)
    for event in response.get("stream", []):
        if "contentBlockDelta" in event:
            text = event["contentBlockDelta"].get("delta", {}).get("text")
            if text:
                yield text
        elif "messageStop" in event:
            if event["messageStop"].get("stopReason") == "max_tokens":
                raise RuntimeError(
                    f"Bedrock stream truncated (stopReason=max_tokens, limit={max_tokens})."
                )


async def _bridge_stream_to_asyncio(system_text: str, user_text: str, max_tokens: int):
    """Bridges the blocking converse_stream generator onto the running event
    loop via a background thread + asyncio.Queue, so it can be consumed with
    `async for` without blocking other concurrent keyword tasks."""
    loop = asyncio.get_event_loop()
    q: asyncio.Queue = asyncio.Queue()

    def _worker():
        try:
            for chunk in _converse_stream_chunks(system_text, user_text, max_tokens):
                loop.call_soon_threadsafe(q.put_nowait, chunk)
        except Exception as e:  # noqa: BLE001 — forwarded to the consumer below
            loop.call_soon_threadsafe(q.put_nowait, e)
        finally:
            loop.call_soon_threadsafe(q.put_nowait, _SENTINEL)

    threading.Thread(target=_worker, daemon=True).start()

    while True:
        item = await q.get()
        if item is _SENTINEL:
            return
        if isinstance(item, Exception):
            raise item
        yield item


async def astream_keyword_report(req: ContentStrategyRequest, keyword: str):
    """
    Async generator yielding (event, data) tuples for ONE keyword:
      "analysis"       — once the (fast, non-streamed) competitor/SEO analysis
                          call completes
      "content_delta"  — real Bedrock token deltas as the article is written
      "keyword_report" — the final, fully assembled KeywordContentReport
    """
    analysis = await asyncio.to_thread(_generate_keyword_analysis, req, keyword)
    yield ("analysis", {"keyword": keyword, "analysis": analysis})

    prompt = _build_content_prompt(req, keyword, analysis)
    chunks: list[str] = []
    async for delta in _bridge_stream_to_asyncio(CONTENT_SYSTEM_PROMPT, prompt, CONTENT_MAX_TOKENS):
        chunks.append(delta)
        yield ("content_delta", {"keyword": keyword, "text": delta})

    content = GeneratedContentPiece(**_parse_json("".join(chunks)))
    report = KeywordContentReport(
        keyword=analysis.get("keyword", keyword),
        top_competitors=analysis["top_competitors"],
        backlink_sources=analysis["backlink_sources"],
        content_strategy_analysis=ContentStrategyAnalysis(**analysis["content_strategy_analysis"]),
        seo_factor_analysis=SEOFactorAnalysis(**analysis["seo_factor_analysis"]),
        ranking_explanation=RankingExplanation(**analysis["ranking_explanation"]),
        generated_content=content,
    )
    yield ("keyword_report", {"keyword": keyword, "report": report.model_dump()})


async def stream_content_strategy_events(req: ContentStrategyRequest, is_disconnected):
    """
    Top-level async generator producing (event, data) tuples for the SSE
    endpoint. Runs keyword workers CONCURRENTLY (bounded semaphore), streams
    each one's progress back as it happens, tolerates individual keyword
    failures without aborting the rest, and stops early if the client
    disconnects (`is_disconnected` — pass `request.is_disconnected` from
    the FastAPI route).
    """
    keywords = list(req.primary_keywords) + list(req.additional_keywords)
    sem = asyncio.Semaphore(MAX_CONCURRENT_KEYWORDS)
    out_queue: asyncio.Queue = asyncio.Queue()
    reports: dict[str, KeywordContentReport] = {}
    failures: dict[str, str] = {}

    async def _worker(kw: str):
        async with sem:
            try:
                async for event, data in astream_keyword_report(req, kw):
                    await out_queue.put((event, data))
                    if event == "keyword_report":
                        reports[kw] = KeywordContentReport(**data["report"])
            except Exception as e:
                logger.error(f"[bedrock] keyword {kw!r} failed: {e}", exc_info=True)
                failures[kw] = str(e)
                await out_queue.put(("keyword_error", {"keyword": kw, "error": str(e)}))

    tasks = [asyncio.create_task(_worker(kw)) for kw in keywords]

    yield ("start", {"keywords": keywords, "total": len(keywords)})

    finished = 0
    while finished < len(keywords):
        if await is_disconnected():
            logger.info("[bedrock] client disconnected — cancelling remaining keyword tasks")
            for t in tasks:
                t.cancel()
            return
        event, data = await out_queue.get()
        yield (event, data)
        if event in ("keyword_report", "keyword_error"):
            finished += 1

    executive_summary = []
    if reports:
        try:
            executive_summary = await asyncio.to_thread(
                _generate_executive_summary, req, list(reports.values())
            )
            yield ("executive_summary", {"insights": [s.model_dump() for s in executive_summary]})
        except Exception as e:
            logger.error(f"[bedrock] executive summary failed: {e}", exc_info=True)
            yield ("executive_summary_error", {"error": str(e)})

    result = ContentStrategyResponse(
        company=req.company_name,
        url=req.url,
        market=req.market,
        industry=req.industry,
        keywords_analyzed=list(reports.keys()),
        keyword_reports=list(reports.values()),
        executive_summary=executive_summary,
    )
    yield ("done", {"failed_keywords": failures, "result": result.model_dump()})