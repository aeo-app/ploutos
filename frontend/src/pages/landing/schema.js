const SITE_URL = 'https://www.aeo-app.ai';

/**
 * schema.org Organization — describes the company itself. Deliberately
 * does NOT include a `sameAs` (social profile links) field: that field
 * is supposed to link to REAL, verifiable social accounts, and none
 * currently exist anywhere on this site (Footer's social links are all
 * still "#" placeholders) — fabricating URLs there would be actively
 * incorrect structured data, not just an incomplete one. Add sameAs once
 * real profile URLs exist.
 */
export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'AEO-APP.ai',
  url: SITE_URL,
  logo: `${SITE_URL}/aeo-logo.png`,
  description: "AEO-APP.ai tracks a business's visibility across AI answer engines (ChatGPT, Perplexity, Google AI Overviews) and generates the site fixes, content, and social posts needed to close the gap.",
};

/**
 * schema.org SoftwareApplication — describes the product itself.
 * `offers` is built from the SAME live plan data (from /payment/plans)
 * that the visible Pricing section on the page actually renders — see
 * Pricing.jsx, which builds and passes this in once real plan data is
 * resolved, rather than this file hardcoding prices that could drift
 * from what checkout actually charges.
 */
export function buildSoftwareApplicationSchema(plans) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'AEO-APP.ai',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    description: organizationSchema.description,
  };

  if (Array.isArray(plans) && plans.length > 0) {
    schema.offers = plans.map((p) => ({
      '@type': 'Offer',
      name: p.name,
      price: String(parseFloat(p.amount)),
      priceCurrency: p.currency,
      description: p.blurb,
      url: `${SITE_URL}/#pricing`,
    }));
  }

  return schema;
}

/**
 * schema.org FAQPage — built from the SAME array of {question, answer}
 * pairs the visible Faq.jsx component renders. Google's own structured
 * data guidelines require the content described to actually be visible
 * on the page, not schema-only — see Faq.jsx, which renders this exact
 * same list as real, readable content, not a hidden duplicate.
 */
export function buildFaqPageSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}
