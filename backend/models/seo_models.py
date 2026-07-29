"""
seo_models.py — Restored to v1 schema
======================================
All fields fully populated — no Optional nulls for numeric/string metrics.
Matches the original apac_seo_api.zip response format exactly.
Bedrock prompts are engineered to always produce complete, useful estimates.
"""
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional

# Hard cap on total keywords (primary + additional) analysed per content-strategy
# request — keeps latency/cost bounded (each keyword costs ~1 Bedrock call).
MAX_TOTAL_KEYWORDS = 8


# ── Competitor Overview ────────────────────────────────────────────────────────

class CompetitorOverview(BaseModel):
    rank: int
    company: str
    hq: str
    focus: str
    scale: str
    accreditation: str


# ── SEO Visibility ─────────────────────────────────────────────────────────────

class SEOVisibility(BaseModel):
    company: str
    seo_visibility_score: int = Field(..., ge=0, le=100)
    organic_traffic_estimate: str
    domain_authority_estimate: int
    has_blog: bool
    google_rating: float


# ── Keyword Ranking ────────────────────────────────────────────────────────────

class KeywordRanking(BaseModel):
    keyword: str
    monthly_searches_estimate: str
    apac_rank: str
    crown_rank: str
    allied_rank: str
    asiatic_rank: str


# ── Competitor Score ───────────────────────────────────────────────────────────

class CompetitorScore(BaseModel):
    rank: int
    company: str
    score: int = Field(..., ge=0, le=100)
    key_strengths: str
    key_weaknesses: str


# ── SEO Insight ────────────────────────────────────────────────────────────────

class SEOInsight(BaseModel):
    insight: str
    detail: str


# ── Full Competitor Analysis Response ─────────────────────────────────────────

class CompetitorAnalysisResponse(BaseModel):
    company: str
    url: str
    competitor_overview: list[CompetitorOverview]
    seo_visibility: list[SEOVisibility]
    keyword_rankings: list[KeywordRanking]
    competitor_scores: list[CompetitorScore]
    key_takeaways: list[SEOInsight]


# ── Keyword Volume ─────────────────────────────────────────────────────────────

class KeywordVolumeEntry(BaseModel):
    rank: int
    keyword: str
    monthly_volume_estimate: str
    competition: str
    intent: str
    apac_estimated_position: str


class KeywordVolumeResponse(BaseModel):
    company: str
    market: str
    high_volume_head_terms: list[KeywordVolumeEntry]
    mid_volume_service_terms: list[KeywordVolumeEntry]
    long_tail_high_intent: list[KeywordVolumeEntry]
    strategic_priority_summary: list[SEOInsight]


# ── Company Profile ────────────────────────────────────────────────────────────

class CompanyProfile(BaseModel):
    company_name: str
    url: str
    tagline: str
    linkedin_overview: str
    google_business_description: str
    linkedin_specialties: list[str]
    google_business_categories: list[str]


# ── Domain Authority Strategy ──────────────────────────────────────────────────

class DomainAuthorityGap(BaseModel):
    metric: str
    current: str
    six_month_target: str
    twelve_month_target: str
    benchmark: str


class BacklinkOpportunity(BaseModel):
    pillar: str
    action: str
    platform_or_target: str
    estimated_da: str
    difficulty: str
    estimated_monthly_links: Optional[str] = None


class DomainAuthorityResponse(BaseModel):
    company: str
    current_da: int
    target_da_6m: int
    target_da_12m: int
    gap_analysis: list[DomainAuthorityGap]
    backlink_opportunities: list[BacklinkOpportunity]
    top_5_priority_actions: list[SEOInsight]


# ── Full SEO Report (all-in-one) ───────────────────────────────────────────────

class FullSEOReport(BaseModel):
    competitor_analysis: CompetitorAnalysisResponse
    keyword_volume: KeywordVolumeResponse
    company_profile: CompanyProfile
    domain_authority_strategy: DomainAuthorityResponse


# ── Keyword → Competitor → Content Strategy Generator ──────────────────────────
# "For each primary/additional keyword: find top-ranking competitors, analyse
#  their backlinks / content strategy / on-page SEO, explain how they rank,
#  then generate an original, SEO-optimised, conversion-ready content piece."

class KeywordCompetitor(BaseModel):
    rank: int
    company: str
    url: str
    why_ranking: str


class BacklinkSource(BaseModel):
    source_type: str
    examples: str
    notes: str


class ContentStrategyAnalysis(BaseModel):
    dominant_content_types: str
    typical_tone: str
    typical_structure: str
    publishing_cadence_estimate: str


class SEOFactorAnalysis(BaseModel):
    keyword_usage_pattern: str
    heading_structure_pattern: str
    meta_title_pattern: str
    meta_description_pattern: str
    url_structure_pattern: str


class RankingExplanation(BaseModel):
    backlink_strategy_summary: str
    content_quality_summary: str


class ContentHeading(BaseModel):
    level: str   # "H1" | "H2" | "H3"
    text: str


class GeneratedContentPiece(BaseModel):
    content_type: str
    title: str
    meta_title: str
    meta_description: str
    url_slug: str
    headings: list[ContentHeading]
    body: str
    word_count: int
    tone: str
    primary_cta: str
    engagement_elements: list[str]
    seo_optimization_notes: list[str]


class KeywordContentReport(BaseModel):
    keyword: str
    top_competitors: list[KeywordCompetitor]
    backlink_sources: list[BacklinkSource]
    content_strategy_analysis: ContentStrategyAnalysis
    seo_factor_analysis: SEOFactorAnalysis
    ranking_explanation: RankingExplanation
    generated_content: GeneratedContentPiece


class ContentStrategyResponse(BaseModel):
    company: str
    url: str
    market: str
    industry: str
    keywords_analyzed: list[str]
    keyword_reports: list[KeywordContentReport]
    executive_summary: list[SEOInsight]


# ── Request body ───────────────────────────────────────────────────────────────

class AnalyseRequest(BaseModel):
    company_name: str = Field(..., example="APAC Relocation")
    url: str = Field(..., example="https://www.apacrelocation.com")
    market: str = Field(default="Singapore", example="Singapore")
    industry: str = Field(default="International Relocation / Moving Services")


class ContentStrategyRequest(AnalyseRequest):
    """Request body for POST /api/v1/seo/content-strategy."""

    primary_keywords: list[str] = Field(
        ...,
        min_length=1,
        max_length=5,
        example=["international movers Singapore", "corporate relocation Singapore"],
        description="Up to 5 primary keywords to build the content strategy around.",
    )
    additional_keywords: list[str] = Field(
        default_factory=list,
        example=["moving to Singapore checklist"],
        description=(
            "Optional extra keywords the user adds from Keyword Intelligence "
            "(e.g. suggestions surfaced by POST /api/v1/seo/keywords)."
        ),
    )

    @field_validator("primary_keywords", "additional_keywords")
    @classmethod
    def _clean_keywords(cls, value: list[str]) -> list[str]:
        cleaned, seen = [], set()
        for kw in value:
            kw = kw.strip()
            if kw and kw.lower() not in seen:
                seen.add(kw.lower())
                cleaned.append(kw)
        return cleaned

    @model_validator(mode="after")
    def _dedupe_across_lists_and_cap(self) -> "ContentStrategyRequest":
        if not self.primary_keywords:
            raise ValueError("At least 1 primary keyword is required (max 5).")
        primary_lower = {kw.lower() for kw in self.primary_keywords}
        self.additional_keywords = [
            kw for kw in self.additional_keywords if kw.lower() not in primary_lower
        ]
        total = len(self.primary_keywords) + len(self.additional_keywords)
        if total > MAX_TOTAL_KEYWORDS:
            # Keep all primary keywords, trim additional ones to fit the cap.
            keep_additional = max(0, MAX_TOTAL_KEYWORDS - len(self.primary_keywords))
            self.additional_keywords = self.additional_keywords[:keep_additional]
        return self
