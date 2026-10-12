"""
models/aeo_models.py — schemas for the AEO dashboard (prompt visibility,
per-prompt content strategy, blog drafts, social posts, saved dashboard state).

"Engine presence" convention used everywhere here (matches the dashboard UI):
    n > 0   — cited at position n
    -1      — mentioned, not linked
    0       — absent
    None    — not measured yet (pending next run)
Engine order is always: ChatGPT, Perplexity, Gemini, AI Overviews.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from models.seo_models import AnalyseRequest

ENGINES = ["ChatGPT", "Perplexity", "Gemini", "AI Overviews"]
Intent = Literal["Commercial", "Informational", "Transactional"]
Channel = Literal["fb", "ig", "li", "yt", "gbp"]
CHANNELS: list[str] = ["fb", "ig", "li", "yt", "gbp"]
POSTS_PER_CHANNEL = 4


# ── Prompt visibility analysis ────────────────────────────────────────────────

class AeoPromptsRequest(AnalyseRequest):
    extra_prompts: list[str] = Field(default_factory=list, max_length=20,
                                     description="User-added prompts to track alongside the generated Top list.")
    extra_competitors: list[str] = Field(default_factory=list, max_length=10,
                                         description="User-added competitor names to include in share-of-voice.")

    @field_validator("extra_prompts", "extra_competitors")
    @classmethod
    def _clean(cls, v: list[str]) -> list[str]:
        out, seen = [], set()
        for item in v:
            item = (item or "").strip()[:200]
            if item and item.lower() not in seen:
                seen.add(item.lower())
                out.append(item)
        return out


class AeoPrompt(BaseModel):
    rank: int
    text: str
    intent: Intent = "Commercial"
    volume_estimate: int = 0
    engines: list[Optional[int]] = Field(default_factory=lambda: [0, 0, 0, 0])
    custom: bool = False
    locked: bool = False

    @field_validator("engines")
    @classmethod
    def _four(cls, v: list[Optional[int]]) -> list[Optional[int]]:
        v = list(v)[:4]
        while len(v) < 4:
            v.append(0)
        return v


class AeoCompetitor(BaseModel):
    name: str
    domain: str = ""
    share_of_voice: int = 0          # % of tracked prompts where this company is recommended
    domain_authority: int = 0
    prompts_cited: int = 0           # out of prompts_total
    top_engine: str = ""
    is_you: bool = False
    custom: bool = False
    pending: bool = False            # user-added, not analysed yet


class AeoPromptsResponse(BaseModel):
    company: str
    market: str
    industry: str
    prompts: list[AeoPrompt]
    competitors: list[AeoCompetitor]
    engine_leaders: list[str] = Field(default_factory=list)   # who each engine recommends most, per ENGINES order
    prompts_total: int = 0
    disclaimer: str = (
        "Engine positions are AI-generated estimates based on the model's knowledge of this market, "
        "not live queries to ChatGPT, Perplexity, Gemini or Google AI Overviews."
    )


# ── Per-prompt strategy + blog topics ─────────────────────────────────────────

class AeoStrategyRequest(AnalyseRequest):
    prompt: str = Field(..., min_length=3, max_length=300)
    refresh: bool = False


class StrategyPillar(BaseModel):
    type: str
    title: str
    detail: str
    meta: str = ""


class StrategyStep(BaseModel):
    week: str
    task: str


class BlogTopicIdea(BaseModel):
    type: str
    title: str
    words: int = 1000


class AeoStrategyResponse(BaseModel):
    prompt: str
    answer: str
    pillars: list[StrategyPillar]
    plan: list[StrategyStep]
    blog_topics: list[BlogTopicIdea]
    cached: bool = False
    limited: bool = False            # True for the free preview (trimmed content)


class AeoBlogDraftRequest(AnalyseRequest):
    prompt: str = Field(..., min_length=3, max_length=300)
    type: str = Field(..., max_length=40)
    title: str = Field(..., min_length=3, max_length=300)
    words: int = Field(default=1000, ge=300, le=3000)
    refresh: bool = False


class BlogSection(BaseModel):
    h: str
    p: str


class AeoBlogDraftResponse(BaseModel):
    prompt: str
    type: str
    title: str
    intro: str
    sections: list[BlogSection]
    cached: bool = False
    team: str = ""                   # "" | "edited" | "verified" — set when our team has worked on it


# ── Social posts for a prompt ────────────────────────────────────────────────

class AeoSocialRequest(AnalyseRequest):
    prompt: str = Field(..., min_length=3, max_length=300)
    refresh: bool = False


class AeoSocialPost(BaseModel):
    text: str
    cta: str = ""
    tags: str = ""
    visual: str = ""                 # short description of the image the post should carry
    title: str = ""                  # YouTube only
    duration: str = ""               # YouTube only


class AeoSocialResponse(BaseModel):
    prompt: str
    channels: dict[str, list[AeoSocialPost]]
    cached: bool = False
    limited: bool = False            # True for the free preview (1 post per channel)
    team: str = ""                   # "" | "edited" | "verified"


# ── Saved dashboard state (custom prompts/competitors, selection, links, approvals) ──

class AeoState(BaseModel):
    custom_prompts: list[str] = Field(default_factory=list, max_length=50)
    custom_competitors: list[dict] = Field(default_factory=list, max_length=25)   # [{"name": str, "domain": str}]
    hidden_competitors: list[str] = Field(default_factory=list, max_length=60)      # competitors the customer removed
    hidden_prompts: list[str] = Field(default_factory=list, max_length=80)          # prompts the customer removed
    selected_prompts: list[str] = Field(default_factory=list, max_length=20)
    social_links: dict[str, str] = Field(default_factory=dict)                      # platform -> normalised link
    blog_state: dict[str, dict] = Field(default_factory=dict)                       # "<prompt>|<idx>" -> {drafted, approved, pending}
    post_state: dict[str, dict] = Field(default_factory=dict)                       # "<prompt>|<channel>|<idx>" -> {approved, img, v}


class AeoStatePatch(BaseModel):
    """Any subset of AeoState's fields — only the ones sent are replaced."""
    custom_prompts: Optional[list[str]] = Field(default=None, max_length=50)
    custom_competitors: Optional[list[dict]] = Field(default=None, max_length=25)
    hidden_competitors: Optional[list[str]] = Field(default=None, max_length=60)
    hidden_prompts: Optional[list[str]] = Field(default=None, max_length=80)
    selected_prompts: Optional[list[str]] = Field(default=None, max_length=20)
    blog_state: Optional[dict[str, dict]] = None
    post_state: Optional[dict[str, dict]] = None


class SocialLinkRequest(BaseModel):
    platform: Channel
    url: str = Field(..., min_length=2, max_length=300)


# ── Website readiness checks ─────────────────────────────────────────────────

class SiteChecksRequest(BaseModel):
    url: str = Field(..., min_length=3, max_length=300)


class SiteCheck(BaseModel):
    key: str
    label: str
    value: str
    status: Literal["good", "warn", "bad", "info"] = "info"


class SiteChecksResponse(BaseModel):
    url: str
    checks: list[SiteCheck]
    error: Optional[str] = None
