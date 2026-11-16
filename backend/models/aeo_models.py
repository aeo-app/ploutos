"""
models/aeo_models.py — schemas for the AEO dashboard (prompt visibility,
per-prompt content strategy, blog drafts, social posts, saved dashboard state).

"Engine presence" convention used everywhere here (matches the dashboard UI):
    n > 0   — cited at position n
    -1      — mentioned, not linked
    0       — absent
    None    — not checked (that AI tool was not asked)
Engine order is always: ChatGPT, Claude, Gemini, AI Overviews. Every value comes from a real answer
(services/ai_checks); nothing is estimated.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from models.seo_models import AnalyseRequest

ENGINES = ["ChatGPT", "Claude", "Gemini", "AI Overviews"]
Intent = Literal["Commercial", "Informational", "Transactional"]
Channel = Literal["fb", "ig", "li", "yt", "gbp"]
CHANNELS: list[str] = ["fb", "ig", "li", "yt", "gbp"]
WEEKS_PER_MONTH = 4
# One set of CORE content per week, shared by every channel. A week holds as many posters as the customer's plan includes
# (Starter 3, Growth 5, Scale 7) plus 2 reels. Each channel gets the same core items with only the caption, hashtags and format
# adjusted. YouTube is video-only, so it carries the 2 reels of the week.
POSTER_PLANS = (3, 5, 7)
REELS_PER_WEEK = 2
_POSTER_DAYS = {3: [0, 2, 4], 5: [0, 1, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6]}     # weekday (0 = Monday) of each poster
_REEL_DAYS = {3: [1, 3], 5: [2, 5], 7: [2, 5]}


def _norm_posters(posters: int | None) -> int:
    return posters if posters in _POSTER_DAYS else 3


def week_layout(posters: int = 3) -> list[tuple[str, int]]:
    """[(kind, weekday)] of the core items of one week, in posting order (a poster comes before a reel on the same day)."""
    n = _norm_posters(posters)
    items = [("poster", d) for d in _POSTER_DAYS[n]] + [("reel", d) for d in _REEL_DAYS[n]]
    return sorted(items, key=lambda x: (x[1], x[0] != "poster"))


def core_kinds(posters: int = 3) -> list[str]:
    return [k for k, _ in week_layout(posters)]


def core_days(posters: int = 3) -> list[int]:
    return [d for _, d in week_layout(posters)]


def cores_per_week(posters: int = 3) -> int:
    return len(week_layout(posters))


CORE_KINDS = core_kinds(3)
CORES_PER_WEEK = len(CORE_KINDS)
POSTS_PER_CHANNEL = WEEKS_PER_MONTH * cores_per_week(7)      # the most any channel holds in one month (36)


def channel_cores(channel: str, limited: bool = False, posters: int = 3) -> list[tuple[int, int, str]]:
    """[(core_id, week, kind)] a channel carries, in posting order. core_id = week * cores_per_week + slot, the same on every channel.
    The free preview is one poster and one reel per channel, the SAME poster and the SAME reel everywhere (core ids 0 and 1);
    YouTube is video-only, so it carries that reel."""
    kinds = core_kinds(posters)
    out = [(w * len(kinds) + j, w, k) for w in range(WEEKS_PER_MONTH) for j, k in enumerate(kinds)]
    if channel == "yt":
        out = [c for c in out if c[2] == "reel"]
    if limited:
        return out[:1] if channel == "yt" else out[:2]
    return out


WEEKLY_PLAN: dict[str, list[str]] = {c: [k for _, w, k in channel_cores(c) if w == 0] for c in ("fb", "ig", "li", "gbp", "yt")}


def month_slots(channel: str, limited: bool = False, posters: int = 3) -> list[tuple[int, str]]:
    """[(week, kind)] in posting order for one channel."""
    return [(w, k) for _, w, k in channel_cores(channel, limited, posters)]


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
    keyword: str = ""                # the short Google search behind this question, e.g. "hire react developer"
    volume_estimate: int = 0         # real monthly Google searches for `keyword` in the market; 0 = no number from Google
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
    share_of_voice: int = 0          # % of all business mentions in the real answers that are this company
    domain_authority: Optional[int] = None   # real website strength 0-100 (DataForSEO backlink data); None = not measured
    linking_sites: Optional[int] = None      # websites that link to it (DataForSEO); None = not measured
    prompts_cited: int = 0           # tracked prompts whose answers name this company, out of prompts_total
    top_engine: str = ""
    is_you: bool = False
    custom: bool = False
    pending: bool = False            # user-added, not analysed yet


class AeoNameCount(BaseModel):
    name: str
    count: int


class AeoWebsiteStrength(BaseModel):
    """The customer's own website, measured from real backlink data (DataForSEO)."""
    score: int                       # 0-100
    linking_sites: int               # different websites that link to it
    backlinks: int                   # links in total


class AeoLinkOpportunity(BaseModel):
    """A real website that links to competitors but not to the customer."""
    site: str
    score: int                       # that website's own strength, 0-100
    links_to: list[str] = Field(default_factory=list)   # competitor names it links to


class AeoPromptsResponse(BaseModel):
    company: str
    market: str
    industry: str
    prompts: list[AeoPrompt]
    competitors: list[AeoCompetitor]
    engine_leaders: list[str] = Field(default_factory=list)   # who each engine recommends most, per ENGINES order
    prompts_total: int = 0
    checked_engines: list[str] = Field(default_factory=list)  # AI tools actually asked; the others show as not checked
    platforms: list[AeoNameCount] = Field(default_factory=list)      # marketplaces / directories the answers name
    source_sites: list[AeoNameCount] = Field(default_factory=list)   # websites the answers used as sources
    website: Optional[AeoWebsiteStrength] = None                     # real strength of the customer's website
    link_opportunities: list[AeoLinkOpportunity] = Field(default_factory=list)   # free plan: the first few only
    link_opportunities_total: int = 0                                # how many DataForSEO found in all
    checked_at: str = ""
    disclaimer: str = (
        "Results are real answers from the AI tools listed in checked_engines, asked on the date of this "
        "analysis. AI answers change over time."
    )


# ── Per-prompt strategy + blog topics ─────────────────────────────────────────

class AeoStrategyRequest(AnalyseRequest):
    prompt: str = Field(..., min_length=3, max_length=300)
    refresh: bool = False


class StrategyPillar(BaseModel):
    """One page we suggest the business publishes for this question."""
    type: str = ""                   # plain-English template name, e.g. "Complete guide"
    title: str
    detail: str
    meta: str = ""
    template: str = ""               # template id (see PAGE_TEMPLATES in aeo_service)
    slug: str = ""                   # suggested URL ending
    link: str = ""                   # full suggested page address on the customer's own site


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

CALENDAR_PROMPT = "Social media calendar"   # the calendar is built from keywords, not from one AI prompt — this is its fixed name/key


class AeoSocialRequest(AnalyseRequest):
    prompt: str = Field(default=CALENDAR_PROMPT, min_length=3, max_length=300)
    refresh: bool = False
    keywords: list[str] = Field(default_factory=list, max_length=20)   # empty -> top 10 are taken from the website
    cycle: int = Field(default=0, ge=0, le=23)                           # 0 = the first month, 1 = the next month, ...


class AeoSocialPost(BaseModel):
    kind: str = "poster"             # "poster" (image post) or "reel" (vertical video)
    week: Optional[int] = None       # 0-3: which week of the month. None for calendars made before the weekly plan
    day: Optional[int] = None        # 0-6: weekday (0 = Monday) the item is posted on. None for calendars made before plan-based weeks
    core: Optional[int] = None       # which core item this is (week * 5 + slot). The same core on different channels is the same content
    text: str
    cta: str = ""
    tags: str = ""
    visual: str = ""                 # short description of the image the post should carry
    title: str = ""                  # YouTube only
    heading: str = ""                # posters: the main heading printed on the image (never empty)
    subheading: str = ""             # posters: the supporting line under it (never empty)
    duration: str = ""               # YouTube only


class AeoSocialResponse(BaseModel):
    prompt: str
    channels: dict[str, list[AeoSocialPost]]
    cached: bool = False
    limited: bool = False            # True for the free preview (1 post per channel)
    team: str = ""                   # "" | "edited" | "verified"
    keywords: list[str] = Field(default_factory=list)   # the keywords this calendar was built around
    cycle: int = 0                   # which month of the calendar this is (0 = first)
    posters_per_week: int = 3        # how many poster items each week holds (3 / 5 / 7, from the plan the calendar was made on)
    generated_at: str = ""           # when this calendar was created (it cannot be recreated until the month ends)


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
    brand: dict = Field(default_factory=dict)                                       # logo_url, phone, email, website, address (server-owned; see /aeo/brand)
    calendar_keywords: list[str] = Field(default_factory=list, max_length=20)       # keywords the social calendar is built around
    calendar_start: str = Field(default="", max_length=10)                           # YYYY-MM-DD: the Monday month 1 of the calendar starts on
    custom_blog_topics: list[dict] = Field(default_factory=list, max_length=100)    # topics typed in by the customer/admin: [{"prompt","title","type"}]
    company_photos: list[dict] = Field(default_factory=list, max_length=12)         # the customer's real company photos: [{"url","name"}]; posters are built from them


class AeoStatePatch(BaseModel):
    """Any subset of AeoState's fields — only the ones sent are replaced."""
    custom_prompts: Optional[list[str]] = Field(default=None, max_length=50)
    custom_competitors: Optional[list[dict]] = Field(default=None, max_length=25)
    hidden_competitors: Optional[list[str]] = Field(default=None, max_length=60)
    hidden_prompts: Optional[list[str]] = Field(default=None, max_length=80)
    selected_prompts: Optional[list[str]] = Field(default=None, max_length=20)
    calendar_keywords: Optional[list[str]] = Field(default=None, max_length=20)
    calendar_start: Optional[str] = Field(default=None, max_length=10)
    custom_blog_topics: Optional[list[dict]] = Field(default=None, max_length=100)
    company_photos: Optional[list[dict]] = Field(default=None, max_length=12)
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


# ── A finished, designed web page: content written for a template the customer picked ───────────────────────────
class AeoPillarAssetRequest(AnalyseRequest):
    prompt: str = Field(..., min_length=3, max_length=300)
    template: str = Field(default="", max_length=40)        # template id, e.g. "faq"
    pillar_type: str = Field(default="", max_length=40)     # older name for the same thing; still accepted
    title: str = Field(..., min_length=3, max_length=300)
    detail: str = Field(default="", max_length=600)
    answer: str = Field(default="", max_length=1200)        # the strategy's "answer we want AI to give" — the page must support it
    refresh: bool = False


class PillarFaq(BaseModel):
    q: str
    a: str


class PillarTable(BaseModel):
    headers: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)


class PageItem(BaseModel):
    """A short title + sentence: a benefit, a key takeaway, a step, or an item to prepare."""
    title: str
    text: str = ""


class PageCta(BaseModel):
    headline: str = ""
    text: str = ""
    button: str = ""


class AeoPillarAsset(BaseModel):
    prompt: str
    template: str = ""
    template_name: str = ""
    title: str
    slug: str = ""
    link: str = ""                               # full address the page will have on the customer's site
    page_title: str = ""
    meta_description: str = ""
    where: str = ""                              # where on the site this page belongs
    link_from: list[str] = Field(default_factory=list)
    eyebrow: str = ""                            # short label above the headline
    headline: str = ""                           # the page's main heading
    intro: str = ""                              # opening lead paragraph
    highlights: list[PageItem] = Field(default_factory=list)   # benefits / key takeaways / what you need
    steps: list[PageItem] = Field(default_factory=list)        # how it works / numbered steps
    sections: list[BlogSection] = Field(default_factory=list)
    areas: list[str] = Field(default_factory=list)             # places covered (local page)
    faqs: list[PillarFaq] = Field(default_factory=list)
    table: Optional[PillarTable] = None
    cta: Optional[PageCta] = None
    checklist: list[str] = Field(default_factory=list)  # what to fill in before publishing
    cached: bool = False


# ── The look of the customer's own website (colours + fonts), so a new page can match it ─────────────────────────
class SiteStyleRequest(BaseModel):
    url: str = Field(..., min_length=3, max_length=300)
    company_name: str = Field(default="Company", max_length=200)


class SiteStyleResponse(BaseModel):
    found: bool = False
    primary: str = ""                 # main brand colour, #rrggbb
    secondary: str = ""               # second brand colour, #rrggbb (may be empty)
    palette: list[str] = Field(default_factory=list)   # brand-like colours found, most used first
    text: str = ""                    # body text colour if it is dark and readable
    font: str = ""                    # body font family name, e.g. "Poppins"
    heading_font: str = ""
    font_kind: str = "sans"           # "sans" or "serif"
    note: str = ""                    # plain-language explanation when nothing usable was found
    # Company details read from the same website. Anything not found is "" — never a placeholder.
    logo: str = ""                    # data: URI (or https URL) of the company logo
    phone: str = ""
    email: str = ""
    address: str = ""
    socials: dict = Field(default_factory=dict)
