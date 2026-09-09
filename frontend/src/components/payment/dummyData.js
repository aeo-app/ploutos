// Static, hand-written placeholder data — NOT AI-generated, NOT fetched from
// the backend. Shown blurred, only to preview the STRUCTURE of a report
// (columns, sections, layout) to unpaid users, never real content. Because
// this never calls the API, unpaid users cost zero Bedrock tokens for these
// five analyses — the same principle as the content-strategy/relocation-
// calendar teaser, just implemented client-side since these endpoints
// return one flat result rather than a list of per-item slots.

const maskedCo = (i) => `Company ${String.fromCharCode(65 + i)}`;
const maskedText = (n) => '█████████ ██████ █████████████ ███ ████████'.slice(0, n);

export const DUMMY_COMPETITORS = {
  competitor_overview: [1, 2, 3, 4, 5].map(i => ({
    rank: i, company: maskedCo(i), hq: '████', focus: '████████', scale: '████', accreditation: '████',
  })),
  seo_visibility: [1, 2, 3, 4, 5].map(i => ({
    company: maskedCo(i), seo_visibility_score: 0, organic_traffic_estimate: '████',
    domain_authority_estimate: 0, has_blog: true, google_rating: 0,
  })),
  keyword_rankings: [1, 2, 3, 4, 5].map(() => ({
    keyword: '████████████', monthly_searches_estimate: '████', apac_rank: '██',
    crown_rank: '██', allied_rank: '██', asiatic_rank: '██',
  })),
  competitor_scores: [1, 2, 3, 4, 5].map(i => ({
    rank: i, company: maskedCo(i), score: 0, key_strengths: maskedText(30), key_weaknesses: maskedText(28),
  })),
  key_takeaways: [1, 2, 3, 4, 5].map(() => ({ insight: maskedText(24), detail: maskedText(60) })),
};

const kwRow = () => ({
  keyword: '████████████', monthly_volume_estimate: '████', competition: '████',
  intent: '████████', apac_estimated_position: '#██',
});
export const DUMMY_KEYWORDS = {
  high_volume_head_terms: Array.from({ length: 5 }, kwRow),
  mid_volume_service_terms: Array.from({ length: 5 }, kwRow),
  long_tail_high_intent: Array.from({ length: 5 }, kwRow),
  strategic_priority_summary: [1, 2, 3].map(() => ({ insight: maskedText(24), detail: maskedText(60) })),
};

export const DUMMY_PROFILE = {
  company_name: '████████████', url: 'https://████████.com',
  tagline: maskedText(40),
  linkedin_overview: maskedText(45) + ' ' + maskedText(45) + ' ' + maskedText(45),
  google_business_description: maskedText(45) + ' ' + maskedText(45),
  linkedin_specialties: ['████████', '██████', '███████████', '████'],
  google_business_categories: ['████████ ████████', '██████ ███████', '████████'],
};

export const DUMMY_DOMAIN_AUTHORITY = {
  current_da: 0, target_da_6m: 0, target_da_12m: 0,
  gap_analysis: [1, 2, 3, 4].map(() => ({
    metric: '████████████', current: '████', six_month_target: '████',
    twelve_month_target: '████', benchmark: '████',
  })),
  backlink_opportunities: [1, 2, 3, 4, 5].map(() => ({
    pillar: '████████', action: maskedText(30), platform_or_target: '████████',
    estimated_da: '██', difficulty: '████', estimated_monthly_links: '█',
  })),
  top_5_priority_actions: [1, 2, 3, 4, 5].map(() => ({ insight: maskedText(24), detail: maskedText(60) })),
};

export const DUMMY_FULL_REPORT = {
  competitor_analysis: DUMMY_COMPETITORS,
  keyword_volume: DUMMY_KEYWORDS,
  company_profile: DUMMY_PROFILE,
  domain_authority_strategy: DUMMY_DOMAIN_AUTHORITY,
};
