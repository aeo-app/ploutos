from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from scheduler.agents.audience_agent import generate_audiences
from scheduler.agents.campaigns_agent import generate_campaigns
from scheduler.agents.schedule_agent import generate_month_schedule
from scheduler.agents.strategy_agent import generate_strategy
from scheduler.agents.templates_agent import generate_templates
from scheduler.defaults import (
    CAMPAIGN_UNLOCK,
    PHASE_POST_COUNTS,
    PHASE_WEEK_RANGES,
    resolve_budgets,
    resolve_content_mix,
    resolve_kpis,
    resolve_platforms,
    resolve_posting_times,
    resolve_start_date,
    resolve_tone,
)
from scheduler.models import (
    AudienceSegment,
    Campaign,
    CaptionTemplate,
    PlatformEnum,
    Post,
    ScheduleOutput,
    ScheduleRequest,
)
from scheduler.platforms import list_platform_ids
from common.models import CompanyProfile

logger = logging.getLogger(__name__)

POST_TYPES = [
    "image_post", "carousel", "video", "testimonial",
    "link_post", "poll", "story", "paid_ad",
]
CONTENT_PILLARS = ["education", "social_proof", "brand_awareness", "engagement", "lead_generation"]
DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
BUDGET_TYPES = ["organic", "paid", "boosted"]
POST_TIMES = ["09:00", "10:00", "12:00", "14:00", "15:00", "16:00", "18:00"]
PLATFORM_AUTOMATION = {
    "facebook": "Meta Business Suite",
    "instagram": "Meta Business Suite",
    "linkedin": "Buffer",
    "twitter_x": "Buffer",
    "tiktok": "CapCut",
    "youtube": "YouTube Studio",
    "pinterest": "Tailwind",
}
CAMPAIGN_TYPES = ["prospecting", "retargeting", "lookalike"]
CAMPAIGN_OBJECTIVES = ["lead_generation", "conversions", "traffic", "brand_awareness", "engagement"]
CTA_VARIANTS = [
    "Get your free quote",
    "Learn more",
    "Contact us today",
    "Book a consultation",
    "Download the guide",
    "Start your journey",
    "Get started",
    "Claim your offer",
]
GOALS = [
    "Lead generation",
    "Brand awareness",
    "Community engagement",
    "Trust building",
    "B2B outreach",
    "Retargeting",
    "Education",
]


def _calculate_end_date(start_date, duration_days):
    return start_date + timedelta(days=duration_days - 1)


def _tone_summary(tone: str) -> str:
    summary = tone.split(".")[0].strip() if tone else "Professional, approachable, clear"
    return summary


def _build_fallback_strategy(profile, tone, content_mix, posting_times):
    domain = profile.business_domain.lower()
    tone_s = _tone_summary(tone)
    primary = profile.audience[0] if profile.audience else "Target audience"
    secondary = profile.audience[1] if len(profile.audience) > 1 else "Broader market segment"

    return {
        "primary_goal": "Generate qualified leads and build brand authority",
        "secondary_goal": "Build trust and social proof through testimonials and case studies",
        "posting_frequency": "3 organic posts/week across platforms with paid campaigns running continuously from Week 4",
        "best_posting_times": {
            "professionals": "Mon/Wed/Thu 9:00–12:00 SGT",
            "families": "Fri/Sat 6:00 PM SGT",
        },
        "content_mix": content_mix,
        "tone_of_voice": tone_s,
        "primary_audience": primary,
        "secondary_audience": secondary,
        "ad_budget": "Month 1: S$0 · Month 2: S$500 · Month 3: S$800 (total S$1,300)",
        "automation_tool": "Buffer / Meta Business Suite for scheduling. Claude for caption generation. Canva for visuals.",
        "post_type_legend": {
            "image_post": "Static graphic. Best for education, tips, announcements. High-reach format.",
            "video": "Native video. Best for storytelling, tutorials, brand personality. Highest engagement.",
            "carousel": "Multi-slide swipe post. Best for guides, checklists, multi-step content.",
            "link_post": "Drives traffic to blog or landing page. Use for content amplification.",
            "paid_ad": "Sponsored post targeting specific audiences. Requires Ads Manager.",
            "testimonial": "Review or client story post. Core trust-builder for service businesses.",
            "poll": "Native platform poll. Drives high engagement. Great for audience research.",
        },
        "kpis": resolve_kpis(profile),
        "summary": {},
    }


def _build_fallback_audiences(profile):
    domain = profile.business_domain.lower()
    primary_name = profile.audience[0] if profile.audience else f"{domain.title()} Buyers"
    secondary_name = profile.audience[1] if len(profile.audience) > 1 else f"{domain.title()} Enthusiasts"

    return [
        {
            "id": "audience_primary",
            "tier": "primary",
            "segment_name": f"Core {primary_name}",
            "demographic": {
                "location": profile.audience_location if hasattr(profile, "audience_location") and profile.audience_location else "Singapore",
                "age_min": 25, "age_max": 55,
                "income_bracket": "SGD 50K+",
            },
            "interests": [domain, "business growth", "industry innovation", "digital transformation"],
            "behaviours": ["Online shoppers", "Content consumers", "Research-driven buyers"],
            "exclusions": ["Existing customers", "Current leads in CRM"],
            "setup_notes": f"Create saved audience in Ads Manager. Target {domain} professionals with interest layering.",
        },
        {
            "id": "audience_secondary",
            "tier": "secondary",
            "segment_name": f"{secondary_name}",
            "demographic": {
                "location": "Singapore",
                "age_min": 30, "age_max": 55,
                "income_bracket": "SGD 80K+",
            },
            "interests": [domain, "industry events", "professional development"],
            "behaviours": ["B2B decision makers", "Frequent business travellers"],
            "exclusions": [],
            "setup_notes": "Layer job title targeting (HR Manager, Director, VP) with interest targeting for B2B focus.",
        },
        {
            "id": "audience_retarget_visitors",
            "tier": "retarget",
            "segment_name": f"Website Visitors — Last 30 Days",
            "demographic": {},
            "interests": [],
            "behaviours": [],
            "definition": "Standard retargeting pixel for all website visitors in the last 30 days who did not convert.",
            "setup_notes": "Install platform pixel on all pages. Create custom audience from pixel data. Exclude converters.",
        },
        {
            "id": "audience_lookalike_1pct",
            "tier": "lookalike",
            "segment_name": f"Lookalike — Best Converters (1%)",
            "demographic": {},
            "interests": [],
            "behaviours": [],
            "definition": "1% lookalike based on customer list or purchase event data. Facebook finds similar high-intent users.",
            "setup_notes": "Upload customer email list or CRM export (min 100+ records). Use purchase/conversion pixel event as source.",
        },
    ]


def _post_type_for_phase(phase, post_index):
    cycle = ["image_post", "carousel", "video", "link_post", "testimonial", "poll", "image_post", "carousel"]
    idx = post_index % len(cycle)
    pt = cycle[idx]
    if phase == "foundation":
        if pt in ("carousel", "link_post"):
            return pt
        return "image_post"
    if phase == "growth":
        return pt
    return cycle[(post_index + 2) % len(cycle)]


def _pillar_for_post_type(post_type, profile):
    if post_type == "testimonial":
        return "social_proof"
    if post_type == "paid_ad":
        return "lead_generation"
    if post_type == "poll":
        return "engagement"
    if post_type == "link_post":
        return "content_amplification"
    return "education"


def _headline_for(profile, post_type, phase, index, total_posts):
    domain_t = profile.business_domain.title()
    company = profile.company_name
    product = profile.products[index % len(profile.products)] if profile.products else "our services"
    if post_type == "image_post":
        return f"{domain_t} Insights: What You Need to Know — Post {index + 1}"
    if post_type == "carousel":
        return f"The Complete {domain_t} Guide — Swipe Through! #{index + 1}"
    if post_type == "video":
        return f"Behind the Scenes with {company} — Episode {index + 1}"
    if post_type == "testimonial":
        return f"Client Story: How {product} Transformed Their Business"
    if post_type == "link_post":
        return f"NEW: {domain_t} Trends 2026 — Full Report"
    if post_type == "poll":
        return f"What's Your Biggest {domain_t} Challenge?"
    return f"{domain_t} Update — Post {index + 1} of {total_posts}"


def _caption_for(profile, post_type, phase, index):
    company = profile.company_name
    domain = profile.business_domain.lower()
    product = profile.products[index % len(profile.products)] if profile.products else "solutions"
    audience = profile.audience[index % len(profile.audience)] if profile.audience else "professionals"
    if post_type == "image_post":
        return (f"Discover how {company} helps {audience} navigate {domain}. "
                f"Our {product} delivers measurable results. Learn more about our approach today.")
    if post_type == "carousel":
        return (f"Planning your {domain} strategy? We've broken it down step by step. "
                f"Swipe through for actionable insights from {company}. Save this for later!")
    if post_type == "video":
        return (f"Watch how {company} delivers exceptional {domain} solutions. "
                f"In this episode: {product} in action. 🎬")
    if post_type == "testimonial":
        return (f"⭐⭐⭐⭐⭐\n\n'{company} completely transformed our approach to {domain}. "
                f"The team's expertise and dedication made all the difference. Highly recommended!'")
    if post_type == "link_post":
        return (f"We just published our latest guide on {domain} trends in 2026. "
                f"Packed with data, insights, and actionable strategies for {audience}.")
    if post_type == "poll":
        return (f"We want to hear from you! What matters most when choosing a {domain} partner? "
                f"Vote below and share your thoughts in the comments 👇")
    return (f"Discover how {company} is transforming {domain} for {audience}. "
            f"Learn more about our {product} today.")


def _visual_for(profile, post_type, phase):
    company = profile.company_name
    domain = profile.business_domain.lower()
    if post_type == "image_post":
        return f"Branded graphic with key statistic about {domain}. {company} logo and brand colors."
    if post_type == "carousel":
        return f"Multi-slide carousel: cover slide with '{domain} Guide' headline, then one insight per slide."
    if post_type == "video":
        return f"60-second talking head or process walkthrough video. Professional lighting, {company} branded."
    if post_type == "testimonial":
        return f"Quote graphic with client testimonial overlay. {company} branding, star rating, warm tones."
    if post_type == "link_post":
        return f"Blog link preview with custom graphic. Route map or data visualization style."
    if post_type == "poll":
        return f"Simple branded graphic with poll question and 4 answer options. {company} colours."
    return f"Branded visual asset for {company}. Aligned with {phase} phase strategy."


def _hashtags_for(profile, platform, index):
    tags = list(profile.terms) if profile.terms else [profile.business_domain]
    if profile.categories:
        tags.extend(profile.categories[:2])
    tags.append(profile.company_name.replace(" ", ""))
    platform_tags = {
        "facebook": ["SocialMediaMarketing", "DigitalStrategy"],
        "instagram": ["DailyInspiration", "InstaBusiness"],
        "linkedin": ["B2BMarketing", "IndustryInsights"],
        "twitter_x": ["MarketingTwitter", "GrowthHacking"],
        "tiktok": ["LearnOnTikTok", "BusinessTok"],
        "youtube": ["SubscribeNow", "LearnMore"],
        "pinterest": ["BusinessIdeas", "MarketingTips"],
    }
    tags.extend(platform_tags.get(platform, ["Marketing"])[:2])
    tags = [t.lower().replace(" ", "") for t in tags]
    seen = set()
    return [t for t in tags if not (t in seen or seen.add(t))][:10]


def _build_fallback_posts(profile, platforms, duration_days, tone, start_date):
    platform_ids = [p.value for p in platforms]
    posts = []
    post_id = 0
    for phase_info in PHASE_WEEK_RANGES:
        phase = phase_info["phase"]
        week_start, week_end = phase_info["weeks"]
        month = (week_start // 4) + 1
        post_count = PHASE_POST_COUNTS.get(duration_days, PHASE_POST_COUNTS[90]).get(phase, 0)
        if post_count == 0:
            continue
        posts_per_platform = max(1, post_count // len(platform_ids))
        remaining = post_count % len(platform_ids)
        for pi, pid in enumerate(platform_ids):
            count = posts_per_platform + (1 if pi < remaining else 0)
            for i in range(count):
                post_id += 1
                day_offset = (week_start - 1) * 7 + (i % 7)
                post_date = start_date + timedelta(days=day_offset)
                day_name = DAYS_OF_WEEK[(start_date.weekday() + day_offset) % 7]
                pt = _post_type_for_phase(phase, post_id)
                posts.append({
                    "id": f"post_w{week_start}_{post_id}_{pid}",
                    "week": week_start + (day_offset // 7),
                    "month": month,
                    "phase": phase,
                    "day": day_name,
                    "date": post_date.isoformat(),
                    "platform": pid,
                    "post_type": pt,
                    "content_pillar": _pillar_for_post_type(pt, profile),
                    "topic_headline": _headline_for(profile, pt, phase, post_id, post_count),
                    "caption": _caption_for(profile, pt, phase, post_id),
                    "visual_description": _visual_for(profile, pt, phase),
                    "hashtags": _hashtags_for(profile, pid, post_id),
                    "target_audience": profile.audience[post_id % len(profile.audience)] if profile.audience else "General",
                    "post_time": POST_TIMES[post_id % len(POST_TIMES)],
                    "timezone": "Asia/Singapore",
                    "automation_tool": PLATFORM_AUTOMATION.get(pid, "Buffer"),
                    "is_paid": False,
                    "budget_type": "organic",
                    "goal": GOALS[post_id % len(GOALS)],
                    "cta": CTA_VARIANTS[post_id % len(CTA_VARIANTS)],
                    "automation_level": ["✅ Full automation", "⚡ Partial", "★ AI-assisted", "✅ Full automation"][post_id % 4],
                    "team": ["Marketing", "Developer", "Social Media", "Auto", "Video"][post_id % 5],
                    "est_hours": round(0.5 + (post_id % 6) * 0.5, 1),
                    "status": "Not started",
                    "notes": "",
                })
    return posts


def _build_fallback_campaigns(profile, duration_days, budgets):
    unlock = CAMPAIGN_UNLOCK.get(duration_days, CAMPAIGN_UNLOCK[90])
    campaign_count = unlock["campaign_count"]
    campaigns = []
    domain = profile.business_domain.lower()
    for i in range(campaign_count):
        budget = budgets[i] if i < len(budgets) else {"monthly": 500, "currency": "SGD"}
        ctype = CAMPAIGN_TYPES[i]
        ctype_label = ctype.replace("_", " ").title()
        cpa_target = 35 if i == 2 else (50 if i == 1 else 25)
        campaigns.append({
            "id": f"campaign_{i + 1}",
            "name": f"{'New Lead Gen' if ctype == 'prospecting' else 'Retargeting' if ctype == 'retargeting' else 'Lookalike Scale'} — {profile.business_domain.title()}",
            "type": ctype,
            "run_weeks_start": max(4, 8 - (campaign_count - i) * 2),
            "run_weeks_end": duration_days // 7,
            "budget_monthly": budget["monthly"],
            "budget_daily": round(budget["monthly"] / 30, 2),
            "budget_currency": budget["currency"],
            "objective": CAMPAIGN_OBJECTIVES[i % len(CAMPAIGN_OBJECTIVES)],
            "target_audience_id": f"audience_{ctype}",
            "ad_copy_direction": (
                f"Benefit-led copy targeting {profile.audience[0] if profile.audience else 'audience'}. "
                f"Highlight {profile.company_name}'s expertise in {domain}. "
                f"Use social proof and specific results/ROI figures."
            ),
            "creative_brief": (
                f"{ctype_label} creative: {'Split image with destination' if ctype == 'prospecting' else 'Warmer, personal tone with real imagery'}. "
                f"APAC brand colours. Clear CTA button. A/B test 3 variants."
            ),
            "kpi_targets": {"cpa": cpa_target, "ctr": 0.015, "frequency": 3, "cpl": cpa_target * 0.8},
            "optimisation_notes": (
                f"Optimise weekly. Pause underperforming ad sets. "
                f"Refresh creative every 3 weeks. Scale winning destination/lookalike."
            ),
        })
    return campaigns


def _build_fallback_templates(profile, platforms, tone):
    platform_ids = [p.value for p in platforms]
    domain = profile.business_domain.lower()
    tone_s = _tone_summary(tone)
    product_list = ", ".join(profile.products[:3]) if profile.products else "services"
    audience_list = ", ".join(profile.audience[:2]) if profile.audience else "target audience"
    templates = []

    template_defs = [
        {
            "post_type": "education_post",
            "direction": f"Informative, structured. 150–200 words for {platform_ids[0] if platform_ids else 'facebook'}.",
            "min_words": 100, "max_words": 300,
        },
        {
            "post_type": "testimonial_post",
            "direction": "Short, emotional, authentic. Let the client's words lead. 100–150 words.",
            "min_words": 80, "max_words": 200,
        },
        {
            "post_type": "carousel_cover",
            "direction": "Punchy opening. Explains value of swiping. Ends with clear CTA. 80–120 words.",
            "min_words": 60, "max_words": 150,
        },
        {
            "post_type": "video_caption",
            "direction": "Creates curiosity. Makes people want to watch. Short. 100–150 words.",
            "min_words": 80, "max_words": 200,
        },
        {
            "post_type": "paid_ad_copy",
            "direction": "Benefit-led. Addresses specific audience. Clear CTA. No flowery language. 80–100 words.",
            "min_words": 60, "max_words": 150,
        },
    ]

    for pid in platform_ids:
        for td in template_defs:
            templates.append({
                "id": f"template_{td['post_type']}_{pid}",
                "post_type": td["post_type"],
                "platform": pid,
                "prompt_template": (
                    f"Write a {pid} {td['post_type'].replace('_', ' ')} for {profile.company_name}, "
                    f"a {domain} company serving {audience_list}. "
                    f"Products: {product_list}. "
                    f"Tone: {tone_s}. "
                    f"Topic: [TOPIC]. "
                    f"Include a hook, key insight, and CTA. "
                    f"Max 3 paragraphs."
                ),
                "output_direction": td["direction"],
                "word_count_min": td["min_words"],
                "word_count_max": td["max_words"],
            })

    return templates


async def generate_schedule(req: ScheduleRequest) -> ScheduleOutput:
    profile: CompanyProfile = req.company_profile
    duration_days = req.duration_days

    platforms = resolve_platforms(req.platforms)
    platform_ids = [p.value for p in platforms]
    start_date = resolve_start_date(req.start_date)
    end_date = _calculate_end_date(start_date, duration_days)
    tone = resolve_tone(profile, req.tone_override)
    content_mix = resolve_content_mix(profile)
    posting_times = resolve_posting_times(profile)
    budgets = resolve_budgets(duration_days, req.campaign_budgets, req.currency)

    unlock = CAMPAIGN_UNLOCK.get(duration_days, CAMPAIGN_UNLOCK[90])
    campaign_count = unlock["campaign_count"]

    try:
        strategy = await generate_strategy(
            profile, platform_ids, duration_days, tone, content_mix, posting_times,
        )
    except Exception as e:
        logger.warning("Strategy agent failed, using fallback: %s", e)
        strategy = _build_fallback_strategy(profile, tone, content_mix, posting_times)

    kpis = resolve_kpis(profile)
    strategy.setdefault("kpis", kpis)

    try:
        audiences = await generate_audiences(profile, tone, strategy.get("primary_goal", ""))
    except Exception as e:
        logger.warning("Audience agent failed, using fallback: %s", e)
        audiences = _build_fallback_audiences(profile)

    all_posts: list[dict] = []
    for phase_info in PHASE_WEEK_RANGES:
        phase = phase_info["phase"]
        week_start, week_end = phase_info["weeks"]
        month = (week_start // 4) + 1
        post_count = PHASE_POST_COUNTS.get(duration_days, PHASE_POST_COUNTS[90]).get(phase, 0)
        if post_count == 0:
            continue

        try:
            posts = await generate_month_schedule(
                profile, month, phase, week_start, week_end,
                platform_ids, post_count, tone, content_mix, posting_times,
                strategy.get("primary_goal", ""),
            )
        except Exception as e:
            logger.warning("Schedule agent failed for %s, using fallback: %s", phase, e)
            posts = []
        if posts:
            all_posts.extend(posts)

    if not all_posts:
        all_posts = _build_fallback_posts(profile, platforms, duration_days, tone, start_date)

    try:
        campaigns = await generate_campaigns(
            profile, duration_days, campaign_count, budgets,
            tone, strategy.get("primary_goal", ""),
        )
    except Exception as e:
        logger.warning("Campaigns agent failed, using fallback: %s", e)
        campaigns = _build_fallback_campaigns(profile, duration_days, budgets)

    try:
        templates = await generate_templates(
            profile, platform_ids, tone, strategy.get("primary_goal", ""),
        )
    except Exception as e:
        logger.warning("Templates agent failed, using fallback: %s", e)
        templates = _build_fallback_templates(profile, platforms, tone)

    post_models = [Post(**p) for p in all_posts if isinstance(p, dict)]
    campaign_models = [Campaign(**c) for c in campaigns if isinstance(c, dict)]
    audience_models = [AudienceSegment(**a) for a in audiences if isinstance(a, dict)]
    template_models = [CaptionTemplate(**t) for t in templates if isinstance(t, dict)]

    strategy_summary = strategy.get("summary", {})
    total_organic = strategy_summary.get("total_organic_posts", len(post_models))
    total_paid = strategy_summary.get("total_paid_campaigns", len(campaign_models))

    strategy.setdefault("summary", {
        "total_organic_posts": total_organic,
        "total_paid_campaigns": total_paid,
        "total_posts": total_organic + total_paid,
        "by_phase": [
            {"phase": p["phase"], "weeks": f"{p['weeks'][0]}–{p['weeks'][1]}",
             "organic": PHASE_POST_COUNTS.get(duration_days, PHASE_POST_COUNTS[90]).get(p["phase"], 0),
             "paid": 0, "total": PHASE_POST_COUNTS.get(duration_days, PHASE_POST_COUNTS[90]).get(p["phase"], 0)}
            for p in PHASE_WEEK_RANGES
            if p["phase"] in PHASE_POST_COUNTS.get(duration_days, PHASE_POST_COUNTS[90])
        ],
    })

    return ScheduleOutput(
        company_name=profile.company_name,
        domain_url=profile.domain_url,
        generated_at=datetime.now(timezone.utc),
        duration_days=duration_days,
        start_date=start_date,
        end_date=end_date,
        platforms=[PlatformEnum(p) for p in platform_ids] if platform_ids else list(PlatformEnum),
        strategy=strategy,
        schedule=post_models,
        campaigns=campaign_models,
        audiences=audience_models,
        caption_templates=template_models,
    )
