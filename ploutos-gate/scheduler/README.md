## Module: Social Media Content Scheduler

## 1. Overview

### 1.1 What This Module Does

The Scheduler is a new module in the Ploutos Gateway pipeline. It sits **downstream of the existing website analyzer** — it takes the `CompanyProfile` already produced by the analysis pipeline and generates a complete, platform-specific social media content plan for that company.

No re-crawling. No re-analysis. The Scheduler's only job is to take what we already know about the company and turn it into a ready-to-execute content calendar.

### 1.2 Where It Fits in the Existing Pipeline

```
[EXISTING — ploutos-gate/website_analyzer/]

User submits URL
       │
       ▼
  crawler.py          HTTP crawl → markdown (up to 5 pages)
       │
       ▼
  search.py           LLM query generation → Tavily search → search context
       │
       ▼
  analyzer.py         LLM structured extraction → CompanyProfile
       │
       ▼
  CompanyProfile ─────────────────────────────────────────────────┐
                                                                   │
[NEW — ploutos-gate/scheduler/]                                    │
                                                                   ▼
  generator.py        Takes CompanyProfile + user preferences → ScheduleOutput
       │
       ├──► strategy_agent.py       Generates strategy & overview
       ├──► schedule_agent.py       Generates post schedule (batched by month)
       ├──► campaigns_agent.py      Generates paid ad campaign specs
       ├──► audience_agent.py       Generates audience targeting guide
       └──► templates_agent.py      Generates caption prompt templates
                                                                   │
                                                                   ▼
                                                          JSON API Response
```

### 1.3 The Reference Output

The file `APAC_Facebook_Scheduler_1.xlsx` — generated for APAC Relocation, a Singapore-based international moving company — is the canonical example of what this module produces. Every field in that document maps to either a `CompanyProfile` input, a user preference, or an LLM-generated output. This BRD specifies all three for every field.

---

## 2. Inputs

### 2.1 Required Input — CompanyProfile

Produced by the existing `analyzer.py`. All fields are available at the time the scheduler is called.

| Field | Type | How Scheduler Uses It |
|---|---|---|
| `company_name` | string | All headings, captions, ad copy, hashtags |
| `domain_url` | string | CTA links throughout (quote form, blog, contact page) |
| `business_domain` | string | Drives tone of voice, goal setting, KPI calibration |
| `products` | list[str] | Post topics, campaign subjects, hashtag generation |
| `audience` | list[str] | Audience targeting sheet, posting times, tone, ad targeting |
| `categories` | list[str] | Content pillars, hashtags, search query types |
| `terms` | list[str] | Caption language, hashtags, ad copy jargon |

### 2.2 Optional User Inputs — ScheduleRequest

All optional. If not provided, the system applies smart defaults (see Section 4).

| Parameter | Type | Default | Description |
|---|---|---|---|
| `platforms` | list[PlatformEnum] | All supported platforms | Which platforms to generate content for |
| `duration_days` | int (30, 60, or 90) | 90 | Length of the content plan |
| `start_date` | date | Next Monday from today | First day of the schedule |
| `posts_per_week` | int | 3 | Organic posts per week (fixed for now, reserved for future) |
| `campaign_budgets` | CampaignBudgets (optional object) | Auto-balanced defaults | Per-campaign ad spend in local currency |
| `currency` | string | "SGD" | Currency for budget display |
| `tone_override` | string | Auto-derived | Override the LLM-derived tone (e.g. "more formal", "humorous") |

**CampaignBudgets object:**

```json
{
  "campaign_1_monthly": 500,
  "campaign_2_monthly": 300,
  "campaign_3_monthly": 400
}
```

If `campaign_budgets` is omitted entirely, the system derives a balanced default (see Section 4.3).

### 2.3 Supported Platforms

The API exposes a static endpoint listing supported platforms. Users pass platform identifiers from this list as optional input.

| Platform ID | Platform Name | Post Types Supported |
|---|---|---|
| `facebook` | Facebook | Image, Video, Carousel, Link, Poll, Testimonial, Story, Paid Ad, Boosted, Event |
| `instagram` | Instagram | Image, Video, Carousel, Reel, Story |
| `linkedin` | LinkedIn | Image, Video, Carousel, Article, Poll, Testimonial |
| `twitter_x` | X (Twitter) | Image, Video, Thread, Poll |
| `tiktok` | TikTok | Video, Duet |
| `youtube` | YouTube | Video, Short |
| `pinterest` | Pinterest | Image, Idea Pin, Video |

> **Default behaviour:** If `platforms` is not specified in the request, the schedule is generated for **all supported platforms**.

> **Platform-specific rules:** Post types, caption lengths, hashtag counts, and best posting times vary per platform. The scheduler applies platform-specific constraints automatically (see Section 5.3).

---

## 3. Output — ScheduleOutput

The API returns a single JSON response. Structure:

```json
{
  "company_name": "...",
  "domain_url": "...",
  "generated_at": "2026-06-27T10:00:00Z",
  "duration_days": 90,
  "start_date": "2026-06-30",
  "end_date": "2026-09-27",
  "platforms": ["facebook", "instagram", "linkedin"],
  "strategy": { ... },
  "schedule": [ ... ],
  "campaigns": [ ... ],
  "audiences": [ ... ],
  "caption_templates": [ ... ]
}
```

Each section is described in full below.

---

### 3.1 `strategy` Object

Top-level campaign strategy. Generated once per schedule. Platform-agnostic.

```json
{
  "primary_goal": "Generate qualified leads for international relocation quotes",
  "secondary_goal": "Build trust and social proof via testimonials and case studies",
  "posting_frequency": "3 organic posts/week per platform + 3 paid campaigns from Week 4",
  "best_posting_times": {
    "professionals": "Mon/Wed 09:00–12:00 local",
    "families": "Fri/Sat 18:00 local"
  },
  "content_mix": {
    "education_tips": 40,
    "social_proof": 25,
    "brand_awareness": 20,
    "paid_lead_gen": 15
  },
  "tone_of_voice": "Reassuring, expert, human. Empathetic to the stress of moving.",
  "primary_audience": "Singapore residents aged 28–55, HHI S$80K+, planning international moves",
  "secondary_audience": "HR/Global Mobility professionals, Indian NRI community, Australian expats",
  "kpis": {
    "month_1": { "followers": 1200, "reach": 10000, "engagement_rate_pct": 3 },
    "month_2": { "followers": 1600, "leads_from_ads": 15, "cost_per_lead": 35 },
    "month_3": { "followers": 1800, "leads_from_ads": 30, "cost_per_lead": 25 }
  },
  "post_type_legend": { ... },
  "summary": {
    "total_organic_posts": 35,
    "total_paid_campaigns": 3,
    "total_posts": 38,
    "by_phase": [
      { "phase": "Foundation", "weeks": "1–4", "organic": 12, "paid": 0, "total": 12 },
      { "phase": "Growth",     "weeks": "5–8", "organic": 12, "paid": 1, "total": 13 },
      { "phase": "Acceleration","weeks":"9–12","organic": 11, "paid": 2, "total": 13 }
    ]
  }
}
```

> All values are LLM-generated from `CompanyProfile`, not hardcoded. KPI numbers are calibrated against `business_domain` and `audience` — a niche B2B software company will get different follower targets than a consumer relocation firm.

---

### 3.2 `schedule` Array

The core deliverable. An array of post objects — one per scheduled post across the full duration.

**Post object:**

```json
{
  "id": "post_w1_mon_facebook",
  "week": 1,
  "month": 1,
  "phase": "foundation",
  "day": "Monday",
  "date": "2026-06-30",
  "platform": "facebook",
  "post_type": "image_post",
  "content_pillar": "brand_launch",
  "topic_headline": "Meet APAC Relocation — 5,000 families moved worldwide 🌏",
  "caption": "For 20+ years we've been helping families move across borders...",
  "visual_description": "Clean branded graphic: company logo centred, world map with routes...",
  "hashtags": ["#APACRelocation", "#InternationalMovers", "#Singapore"],
  "target_audience": "Singapore residents aged 28–55, interest in expat life and relocation",
  "post_time": "09:00",
  "timezone": "Asia/Singapore",
  "automation_tool": "Buffer",
  "is_paid": false,
  "budget_type": "organic",
  "budget_amount": null,
  "campaign_id": null,
  "goal": "brand_awareness",
  "cta": "Follow us for weekly moving tips →"
}
```

**Paid ad post object** (additional fields):

```json
{
  "id": "post_w4_wed_facebook_paid",
  "is_paid": true,
  "budget_type": "paid",
  "budget_amount": 500,
  "budget_currency": "SGD",
  "budget_period": "monthly",
  "campaign_id": "campaign_1",
  "post_time": null,
  "run_schedule": "continuous",
  "run_weeks": "4–12",
  "automation_tool": "Meta Ads Manager",
  "hashtags": []
}
```

**Platform-specific fields** (appended per platform):

| Platform | Extra Fields |
|---|---|
| `instagram` | `is_reel: bool`, `story_variant: bool` |
| `linkedin` | `is_article: bool`, `professional_tone_score: int` |
| `twitter_x` | `thread_count: int`, `character_count: int` |
| `tiktok` | `video_duration_seconds: int`, `trending_sounds_note: str` |
| `youtube` | `video_duration_seconds: int`, `seo_title: str`, `description: str`, `tags: list[str]` |

---

### 3.3 `campaigns` Array

Paid ad campaign specifications. Always 3 campaigns (or fewer if `duration_days` < 60 — see Section 4.2).

```json
{
  "id": "campaign_1",
  "name": "New Quote Leads",
  "type": "prospecting",
  "run_weeks_start": 4,
  "run_weeks_end": 12,
  "budget_monthly": 500,
  "budget_daily": 16,
  "budget_currency": "SGD",
  "objective": "lead_generation",
  "target_audience_id": "audience_primary",
  "ad_copy_direction": "Headline: Moving internationally from Singapore? Body: 3 key benefits + social proof + urgency. A/B test 3 destination image variants.",
  "creative_brief": "Split image: company city skyline → destination city. Logo. CTA button 'Get free quote'.",
  "kpi_targets": {
    "leads_per_month": 15,
    "cost_per_lead": 35,
    "ctr_pct": 1.5
  },
  "optimisation_notes": "Optimise weekly. Pause underperforming ad sets. Scale winning creative variant."
}
```

**The 3 campaign types** (always in this order):

| # | Type | Unlock Condition | Default Budget |
|---|---|---|---|
| Campaign 1 | Prospecting (new leads) | Week 4 minimum | S$500/mo |
| Campaign 2 | Retargeting (warm visitors) | Week 8 minimum — pixel needs time to accumulate | S$300/mo |
| Campaign 3 | Lookalike audience (top product/route) | Week 10 minimum — needs conversion seed data | S$400/mo |

---

### 3.4 `audiences` Array

Facebook/platform audience targeting specifications. Each object is one row of targeting detail.

```json
{
  "id": "audience_primary",
  "tier": "primary",
  "segment_name": "Core buyers",
  "demographic": {
    "location": "Singapore",
    "age_min": 28,
    "age_max": 55,
    "income_bracket": "S$80K+",
    "homeowners": true
  },
  "interests": ["international travel", "expat life", "relocation companies"],
  "behaviours": ["frequent international travellers", "recently moved"],
  "exclusions": ["submitted quote form"],
  "setup_notes": "Layer demographics + interests in Meta Ads Manager."
},
{
  "id": "audience_retarget_visitors",
  "tier": "retarget",
  "segment_name": "Website visitors",
  "definition": "Anyone who visited the company website in the last 30 days and did NOT reach the quote confirmation page.",
  "setup_notes": "Install Meta Pixel. Create custom audience from pixel data. Exclude converters."
},
{
  "id": "audience_lookalike_1pct",
  "tier": "lookalike",
  "segment_name": "Quote converters (1%)",
  "definition": "1% lookalike of people who submitted the quote form.",
  "setup_notes": "Requires 100+ form submissions before this audience is viable. Create from custom converters audience."
}
```

---

### 3.5 `caption_templates` Array

Ready-to-use Claude prompt templates for ongoing caption generation beyond the schedule period.

```json
{
  "id": "template_education",
  "post_type": "education_post",
  "platform": "facebook",
  "prompt_template": "Write a Facebook post for {company_name} ({business_domain} company) about [TOPIC]. Tone: {tone_of_voice}. Include 3–5 bullet points with emojis. End with a CTA. 150–200 words. Key facts: {key_facts}.",
  "output_direction": "Informative, structured, emoji bullet markers. Hook in first line. Ends with CTA.",
  "word_count_min": 150,
  "word_count_max": 200
}
```

> Company-specific facts (`company_name`, `tone_of_voice`, `key_facts`) are pre-injected from `CompanyProfile` so the user only needs to fill in `[TOPIC]`.

---

## 4. Default Logic

### 4.1 Platform Defaults

If `platforms` is not specified → generate for all supported platforms.

Each platform gets its own slice of the `schedule` array, with platform-appropriate post types, caption lengths, and posting times applied automatically.

### 4.2 Duration Defaults and Campaign Unlocking

| Duration | Phases Active | Campaigns Generated |
|---|---|---|
| 30 days (Weeks 1–4) | Foundation only | Campaign 1 only (starts Week 4) |
| 60 days (Weeks 1–8) | Foundation + Growth | Campaign 1 + Campaign 2 |
| 90 days (Weeks 1–12) | Foundation + Growth + Acceleration | All 3 campaigns |

Campaign unlock rules are enforced regardless of user input:
- Campaign 1 cannot start before Week 4
- Campaign 2 cannot start before Week 8
- Campaign 3 cannot start before Week 10

### 4.3 Budget Defaults

If `campaign_budgets` is not provided by the user, the system calculates a balanced default split:

| Rule | Logic |
|---|---|
| If no budget provided at all | Use S$1,300 total, split 38% / 23% / 31% across C1/C2/C3 |
| If partial (e.g. only C1 provided) | Apply provided value for C1, auto-balance remaining budget across C2 and C3 |
| If duration is 30 days | Only C1 runs — full budget goes to C1 |
| If duration is 60 days | C1 + C2 — split 62% / 38% |
| Currency | Always display in `currency` param (default SGD) |

The LLM is prompted to justify the default budget split based on `business_domain` — a high-ticket B2B product gets a different recommended split than a high-volume consumer service.

### 4.4 Posting Time Defaults

Derived from `CompanyProfile.audience`:

| Audience Signal | Default Posting Times |
|---|---|
| Contains "professionals", "HR", "B2B", "managers" | Mon/Wed/Thu: 09:00–12:00 local |
| Contains "families", "parents", "homeowners" | Fri 18:00, Sat 10:00 local |
| Contains "students", "young" | Tue/Thu 18:00, Sun 11:00 local |
| Mixed / unclear | Mon 09:00, Wed 12:00, Fri 18:00 local |

### 4.5 Tone of Voice Defaults

Derived from `CompanyProfile.business_domain`:

| Business Domain Signal | Default Tone |
|---|---|
| Moving / logistics / relocation | Reassuring, expert, human. Empathetic to stress of the process. |
| SaaS / tech / software | Clear, confident, jargon-aware but not inaccessible. |
| Finance / legal / professional services | Authoritative, precise, trustworthy. |
| Healthcare / wellness | Warm, caring, evidence-led. |
| E-commerce / retail | Energetic, benefit-led, conversational. |
| Education | Encouraging, informative, accessible. |

If `tone_override` is provided in the request, it replaces the auto-derived tone entirely.

### 4.6 Content Pillar Defaults

The 4-pillar content mix is adjusted by `business_domain`:

| Business Type | Education | Social Proof | Brand | Paid Lead Gen |
|---|---|---|---|---|
| Service business (relocation, legal, finance) | 40% | 25% | 20% | 15% |
| SaaS / tech product | 35% | 20% | 25% | 20% |
| E-commerce | 25% | 30% | 20% | 25% |
| B2B / enterprise | 45% | 20% | 25% | 10% |

---

## 5. Generation Architecture

### 5.1 Module Structure

```
ploutos-gate/scheduler/
├── __init__.py
├── MODULE.md
├── models.py              # Pydantic schemas (ScheduleRequest, ScheduleOutput, Post, Campaign, etc.)
├── generator.py           # Orchestrator — calls all agents, assembles final output
├── agents/
│   ├── __init__.py
│   ├── strategy_agent.py  # Generates strategy & overview section
│   ├── schedule_agent.py  # Generates post schedule (batched by month)
│   ├── campaigns_agent.py # Generates paid campaign specs
│   ├── audience_agent.py  # Generates audience targeting rows
│   └── templates_agent.py # Generates caption templates
├── platforms/
│   ├── __init__.py        # Platform registry (same pattern as search_sources/)
│   ├── base.py            # PlatformAdapter ABC
│   ├── facebook.py        # Facebook-specific rules and post type constraints
│   ├── instagram.py
│   ├── linkedin.py
│   ├── twitter_x.py
│   ├── tiktok.py
│   ├── youtube.py
│   └── pinterest.py
└── defaults.py            # All default logic (budgets, tones, timings, content mix)
```

> The `platforms/` plugin registry mirrors the existing `search_sources/` pattern — new platforms can be added without modifying existing code.

### 5.2 Generation Flow (inside `generator.py`)

```
ScheduleRequest + CompanyProfile
         │
         ▼
  1. defaults.py          Resolve all defaults (platform, duration, budget, tone, timings)
         │
         ▼
  2. strategy_agent       Single LLM call → strategy object
         │
         ▼
  3. audience_agent       Single LLM call → audience segments
         │
         ├──────────────────────────────────────────┐
         ▼                                          ▼
  4. schedule_agent                         5. campaigns_agent
     Batched by MONTH (3 LLM calls)            Single LLM call → 3 campaign specs
     Each call: "Generate posts for
     Month N given this context..."
         │                                          │
         └────────────────────┬─────────────────────┘
                              ▼
                    6. templates_agent     Single LLM call → caption templates
                              │
                              ▼
                    7. generator.py        Assemble all outputs → ScheduleOutput
                              │
                              ▼
                         JSON response
```

### 5.3 Batched Schedule Generation

The post schedule is the most expensive section. It is generated in **3 sequential LLM calls** — one per month/phase — to:
- Stay within token limits per call
- Allow each month to be informed by the phase before it
- Minimise cost (only regenerate failed months, not the whole schedule)

Each call receives:
- The full `CompanyProfile`
- The resolved strategy object (from step 2)
- The phase name and week range
- Posts already generated in previous months (as context, truncated)
- Platform list and constraints
- Number of posts required for this month

**Per-platform multiplication:** If 3 platforms are requested, each monthly call generates posts for all 3 platforms for that month. Platform-specific constraints (caption length, post types, hashtag count) are injected into the prompt per platform.

### 5.4 LLM Client

Uses the existing `build_llm()` from `llm.py` — the same AWS Bedrock / Claude Haiku singleton already used by the analyzer. No new LLM infrastructure required.

Temperature: 0.7 (slightly creative for content generation, vs 0 for structured extraction in the analyzer).

---

## 6. API Endpoints

### 6.1 New Endpoints

```
GET  /scheduler/platforms          List all supported platforms with metadata
POST /scheduler/generate           Generate a full content schedule
POST /scheduler/generate/stream    Same, SSE-streamed (section by section)
```

### 6.2 `GET /scheduler/platforms`

No auth required. Returns the static list of supported platforms.

**Response:**
```json
{
  "platforms": [
    {
      "id": "facebook",
      "name": "Facebook",
      "post_types": ["image_post", "video", "carousel", "link_post", "poll", "testimonial", "story", "paid_ad", "boosted_post", "event"],
      "max_caption_length": 63206,
      "max_hashtags": 30,
      "supports_paid_ads": true
    },
    {
      "id": "instagram",
      "name": "Instagram",
      "post_types": ["image_post", "video", "carousel", "reel", "story"],
      "max_caption_length": 2200,
      "max_hashtags": 30,
      "supports_paid_ads": true
    }
  ]
}
```

### 6.3 `POST /scheduler/generate`

Requires auth (Bearer token via existing `deps.py`).

**Request body:**
```json
{
  "company_profile": { ...CompanyProfile... },
  "platforms": ["facebook", "instagram"],
  "duration_days": 90,
  "start_date": "2026-07-01",
  "campaign_budgets": {
    "campaign_1_monthly": 500,
    "campaign_2_monthly": 300,
    "campaign_3_monthly": 400
  },
  "currency": "SGD",
  "tone_override": null
}
```

**Response:** Full `ScheduleOutput` JSON (see Section 3).

### 6.4 `POST /scheduler/generate/stream`

Same request body. Returns Server-Sent Events, one section at a time:

```
data: {"section": "strategy", "status": "complete", "data": {...}}
data: {"section": "audiences", "status": "complete", "data": [...]}
data: {"section": "schedule_month_1", "status": "complete", "data": [...]}
data: {"section": "schedule_month_2", "status": "complete", "data": [...]}
data: {"section": "schedule_month_3", "status": "complete", "data": [...]}
data: {"section": "campaigns", "status": "complete", "data": [...]}
data: {"section": "templates", "status": "complete", "data": [...]}
data: {"section": "done", "status": "complete", "data": null}
```

Mirrors the existing `/analyze/stream` pattern already in `api.py`.

---

## 7. Data Models (`scheduler/models.py`)

```python
class PlatformEnum(str, Enum):
    facebook   = "facebook"
    instagram  = "instagram"
    linkedin   = "linkedin"
    twitter_x  = "twitter_x"
    tiktok     = "tiktok"
    youtube    = "youtube"
    pinterest  = "pinterest"

class CampaignBudgets(BaseModel):
    campaign_1_monthly: Optional[float] = None
    campaign_2_monthly: Optional[float] = None
    campaign_3_monthly: Optional[float] = None

class ScheduleRequest(BaseModel):
    company_profile: CompanyProfile                        # from existing models.py
    platforms: Optional[list[PlatformEnum]] = None        # None = all platforms
    duration_days: Literal[30, 60, 90] = 90
    start_date: Optional[date] = None                     # None = next Monday
    campaign_budgets: Optional[CampaignBudgets] = None    # None = auto-balanced
    currency: str = "SGD"
    tone_override: Optional[str] = None

class Post(BaseModel):
    id: str
    week: int
    month: int
    phase: Literal["foundation", "growth", "acceleration"]
    day: str
    date: date
    platform: PlatformEnum
    post_type: str
    content_pillar: str
    topic_headline: str
    caption: str
    visual_description: str
    hashtags: list[str]
    target_audience: str
    post_time: Optional[str]
    timezone: str
    automation_tool: str
    is_paid: bool
    budget_type: Literal["organic", "paid", "boosted"]
    budget_amount: Optional[float]
    budget_currency: Optional[str]
    campaign_id: Optional[str]
    goal: str
    cta: str

class Campaign(BaseModel):
    id: str
    name: str
    type: Literal["prospecting", "retargeting", "lookalike"]
    run_weeks_start: int
    run_weeks_end: int
    budget_monthly: float
    budget_daily: float
    budget_currency: str
    objective: str
    target_audience_id: str
    ad_copy_direction: str
    creative_brief: str
    kpi_targets: dict
    optimisation_notes: str

class AudienceSegment(BaseModel):
    id: str
    tier: Literal["primary", "secondary", "retarget", "lookalike"]
    segment_name: str
    demographic: Optional[dict]
    interests: Optional[list[str]]
    behaviours: Optional[list[str]]
    exclusions: Optional[list[str]]
    definition: Optional[str]
    setup_notes: str

class CaptionTemplate(BaseModel):
    id: str
    post_type: str
    platform: PlatformEnum
    prompt_template: str
    output_direction: str
    word_count_min: int
    word_count_max: int

class ScheduleOutput(BaseModel):
    company_name: str
    domain_url: str
    generated_at: datetime
    duration_days: int
    start_date: date
    end_date: date
    platforms: list[PlatformEnum]
    strategy: dict
    schedule: list[Post]
    campaigns: list[Campaign]
    audiences: list[AudienceSegment]
    caption_templates: list[CaptionTemplate]
```

---

## 8. Platform-Specific Constraints

Each platform adapter in `platforms/` enforces these rules when the LLM generates posts:

| Platform | Max Caption | Hashtags | Notes |
|---|---|---|---|
| Facebook | 63,206 chars | Up to 30 (5–8 recommended) | None for paid ads |
| Instagram | 2,200 chars | Up to 30 (20–30 for reach) | Reels get separate caption |
| LinkedIn | 3,000 chars | 3–5 only | Professional tone enforced |
| X (Twitter) | 280 chars | 1–2 | Thread format for long content |
| TikTok | 2,200 chars | 5–10 trending tags | Video-only platform — all posts are video |
| YouTube | 5,000 chars (description) | 15 tags (not hashtags) | SEO title required separately |
| Pinterest | 500 chars | 5–10 | Image/video only; CTA in description |

---

## 9. Constraints & Rules

### Content Rules
- Every post must reference actual products, services, or audience segments from `CompanyProfile` — no generic placeholder content
- Captions must be copy-paste ready — no `[INSERT X HERE]` gaps in the generated schedule
- Hashtags must be drawn from `terms` + `categories` — not invented
- Paid ad rows must never include hashtags
- CTAs must reference real destination types (quote form, contact page, blog — resolved from `domain_url`)

### Structural Rules
- 3 organic posts per week minimum per platform
- Phase structure always: Foundation (organic only) → Growth (C1 launched) → Acceleration (C2+C3 launched)
- Campaign unlock week rules are hard constraints, not overridable by user input
- For 30-day plans: Foundation phase only, Campaign 1 only
- For 60-day plans: Foundation + Growth, Campaign 1 + Campaign 2
- For 90-day plans: All phases, all 3 campaigns

### Budget Rules
- Minimum campaign budget: S$100/month (or currency equivalent) — below this, that campaign is excluded
- If user-supplied budget for a campaign is below minimum, warn and apply minimum or skip that campaign
- Daily budget = monthly ÷ 30, rounded to nearest whole number

### Technical Rules
- Uses existing `build_llm()` — no new LLM infrastructure
- Platform registry mirrors `search_sources/` plugin pattern — new platforms added without touching existing code
- No data is persisted by default (matches existing pipeline behaviour) — stateless API response
- Total generation time target: under 90 seconds for a 90-day, all-platform schedule

---

## 10. Success Criteria

A valid scheduler output must satisfy all of the following:

- [ ] All 5 sections present with no null or empty fields
- [ ] Every post caption references the specific company by name, product, or service
- [ ] Captions are platform-appropriate in length and format
- [ ] Posting times are appropriate for the derived audience type
- [ ] Phase structure respected (no paid ads in Foundation, correct campaign unlock weeks)
- [ ] Budget totals match user input or auto-balanced defaults
- [ ] Platform constraints enforced (no hashtags on LinkedIn paid ads, thread format on X for long content, etc.)
- [ ] Caption templates are pre-filled with company facts — user only fills `[TOPIC]` or equivalent
- [ ] Streamed response emits sections in order and completes cleanly
- [ ] Generation completes in under 90 seconds (90-day, all platforms)

---

## 11. Out of Scope (v1)

These are explicitly excluded from this version:

- Actual post scheduling / publishing to platforms (this module generates the plan; publishing is a separate integration)
- Image or video generation (visual descriptions are text only — Canva AI is the suggested tool)
- Performance tracking or analytics ingestion
- Multi-language output (English only in v1)
- Persistent storage of schedules (stateless response only)
- User editing of individual posts via API (regenerate the full schedule or edit client-side)

---

*The file `APAC_Facebook_Scheduler_1.xlsx` remains the canonical output reference for the Facebook platform. All other platforms follow the same structural pattern with platform-appropriate constraints applied.*
