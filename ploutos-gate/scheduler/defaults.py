from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from scheduler.models import (
    CampaignBudgets,
    PlatformEnum,
    Post,
    ScheduleRequest,
    ScheduleOutput,
)
from common.models import CompanyProfile

PLATFORM_CONSTRAINTS: dict[str, dict] = {
    "facebook":   {"max_caption": 63206, "max_hashtags": 30, "supports_paid": True},
    "instagram":  {"max_caption": 2200,  "max_hashtags": 30, "supports_paid": True},
    "linkedin":   {"max_caption": 3000,  "max_hashtags": 5,  "supports_paid": True},
    "twitter_x":  {"max_caption": 280,   "max_hashtags": 2,  "supports_paid": True},
    "tiktok":     {"max_caption": 2200,  "max_hashtags": 10, "supports_paid": False},
    "youtube":    {"max_caption": 5000,  "max_hashtags": 15, "supports_paid": True},
    "pinterest":  {"max_caption": 500,   "max_hashtags": 10, "supports_paid": True},
}

CAMPAIGN_UNLOCK: dict[int, dict] = {
    30: {"campaign_count": 1, "phases": ["foundation"]},
    60: {"campaign_count": 2, "phases": ["foundation", "growth"]},
    90: {"campaign_count": 3, "phases": ["foundation", "growth", "acceleration"]},
}

DEFAULT_TOTAL_BUDGET = 1300.0
BUDGET_SPLIT_3 = {"campaign_1": 0.38, "campaign_2": 0.23, "campaign_3": 0.31}
BUDGET_SPLIT_2 = {"campaign_1": 0.62, "campaign_2": 0.38}
BUDGET_MINIMUM = 100.0

TONE_BY_DOMAIN: dict[str, str] = {
    "moving": "Reassuring, expert, human. Empathetic to the stress of the process.",
    "logistics": "Reassuring, expert, human. Empathetic to the stress of the process.",
    "relocation": "Reassuring, expert, human. Empathetic to the stress of the process.",
    "saas": "Clear, confident, jargon-aware but not inaccessible.",
    "tech": "Clear, confident, jargon-aware but not inaccessible.",
    "software": "Clear, confident, jargon-aware but not inaccessible.",
    "finance": "Authoritative, precise, trustworthy.",
    "legal": "Authoritative, precise, trustworthy.",
    "healthcare": "Warm, caring, evidence-led.",
    "wellness": "Warm, caring, evidence-led.",
    "e-commerce": "Energetic, benefit-led, conversational.",
    "retail": "Energetic, benefit-led, conversational.",
    "education": "Encouraging, informative, accessible.",
}

CONTENT_MIX_BY_TYPE: dict[str, dict[str, int]] = {
    "service": {"education": 40, "social_proof": 25, "brand": 20, "paid_lead_gen": 15},
    "saas":    {"education": 35, "social_proof": 20, "brand": 25, "paid_lead_gen": 20},
    "ecommerce": {"education": 25, "social_proof": 30, "brand": 20, "paid_lead_gen": 25},
    "b2b":     {"education": 45, "social_proof": 20, "brand": 25, "paid_lead_gen": 10},
}

POSTING_TIME_BY_AUDIENCE: dict[str, dict[str, str]] = {
    "professionals": {"days": "Mon/Wed/Thu", "time": "09:00–12:00"},
    "families":      {"days": "Fri/Sat",     "time": "18:00"},
    "students":      {"days": "Tue/Thu/Sun", "time": "18:00"},
}

PHASE_WEEK_RANGES: list[dict] = [
    {"phase": "foundation",    "weeks": (1, 4)},
    {"phase": "growth",       "weeks": (5, 8)},
    {"phase": "acceleration", "weeks": (9, 12)},
]

PHASE_POST_COUNTS = {
    30: {"foundation": 12},
    60: {"foundation": 12, "growth": 12},
    90: {"foundation": 12, "growth": 12, "acceleration": 11},
}


def resolve_next_monday() -> date:
    today = date.today()
    days_ahead = 0 - today.weekday()
    if days_ahead <= 0:
        days_ahead += 7
    return today + timedelta(days=days_ahead)


def resolve_platforms(platforms: Optional[list[PlatformEnum]]) -> list[PlatformEnum]:
    return list(PlatformEnum) if platforms is None else platforms


def resolve_start_date(start_date: Optional[date]) -> date:
    return start_date or resolve_next_monday()


def resolve_tone(profile: CompanyProfile, override: Optional[str] = None) -> str:
    if override:
        return override
    domain_lower = profile.business_domain.lower()
    for key, tone in TONE_BY_DOMAIN.items():
        if key in domain_lower:
            return tone
    return "Professional, approachable, clear."


def resolve_posting_times(profile: CompanyProfile) -> list[str]:
    times = []
    for seg in profile.audience:
        seg_lower = seg.lower()
        for key, mapping in POSTING_TIME_BY_AUDIENCE.items():
            if key in seg_lower:
                times.append(f"{mapping['days']} {mapping['time']} local")
    return times or ["Mon 09:00, Wed 12:00, Fri 18:00 local"]


def resolve_content_mix(profile: CompanyProfile) -> dict[str, int]:
    domain = profile.business_domain.lower()
    if any(w in domain for w in ("saas", "software", "tech")):
        return CONTENT_MIX_BY_TYPE["saas"]
    if any(w in domain for w in ("ecommerce", "retail", "shop")):
        return CONTENT_MIX_BY_TYPE["ecommerce"]
    if any(w in domain for w in ("b2b", "enterprise", "consulting")):
        return CONTENT_MIX_BY_TYPE["b2b"]
    return CONTENT_MIX_BY_TYPE["service"]


def resolve_budgets(
    duration_days: int,
    campaign_budgets: Optional[CampaignBudgets] = None,
    currency: str = "SGD",
) -> list[dict]:
    unlock = CAMPAIGN_UNLOCK.get(duration_days, CAMPAIGN_UNLOCK[90])
    campaign_count = unlock["campaign_count"]

    if campaign_budgets:
        provided = [
            ("campaign_1", campaign_budgets.campaign_1_monthly),
            ("campaign_2", campaign_budgets.campaign_2_monthly),
            ("campaign_3", campaign_budgets.campaign_3_monthly),
        ]
        budgets = []
        for cid, val in provided:
            if val is not None and val >= BUDGET_MINIMUM:
                budgets.append({"id": cid, "monthly": val, "currency": currency})
            elif val is not None and val < BUDGET_MINIMUM:
                budgets.append({"id": cid, "monthly": BUDGET_MINIMUM, "currency": currency})
        return budgets[:campaign_count]

    if campaign_count == 1:
        total = DEFAULT_TOTAL_BUDGET
        return [{"id": "campaign_1", "monthly": total, "currency": currency}]

    if campaign_count == 2:
        split = BUDGET_SPLIT_2
        return [
            {"id": "campaign_1", "monthly": round(DEFAULT_TOTAL_BUDGET * split["campaign_1"]), "currency": currency},
            {"id": "campaign_2", "monthly": round(DEFAULT_TOTAL_BUDGET * split["campaign_2"]), "currency": currency},
        ]

    split = BUDGET_SPLIT_3
    return [
        {"id": f"campaign_{i}", "monthly": round(DEFAULT_TOTAL_BUDGET * split[f"campaign_{i}"]), "currency": currency}
        for i in (1, 2, 3)
    ]


def resolve_kpis(profile: CompanyProfile) -> list[dict]:
    domain = profile.business_domain.lower()
    if any(w in domain for w in ("saas", "b2b", "enterprise")):
        return [
            {"month": 1, "followers": 800, "reach": 5000, "engagement_rate_pct": 2.5},
            {"month": 2, "followers": 1200, "leads_from_ads": 10, "cost_per_lead": 50},
            {"month": 3, "followers": 1500, "leads_from_ads": 20, "cost_per_lead": 35},
        ]
    return [
        {"month": 1, "followers": 1200, "reach": 10000, "engagement_rate_pct": 3},
        {"month": 2, "followers": 1600, "leads_from_ads": 15, "cost_per_lead": 35},
        {"month": 3, "followers": 1800, "leads_from_ads": 30, "cost_per_lead": 25},
    ]
