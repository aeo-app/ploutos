import { useState, useEffect } from 'react';
import { BASE } from '../../../api/seoApi';
import { JsonLd } from '../../../components/JsonLd';
import { buildSoftwareApplicationSchema } from '../schema';
import { scrollToSection } from '../scrollUtils';

const CHECK = (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M13.5 4L6 11.5L2.5 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// USD is the only one we KNOW is right without asking — anything else
// falls back to showing the currency code itself (e.g. "SGD 50") rather
// than guessing a symbol that might be wrong.
const CURRENCY_SYMBOLS = { USD: '$', SGD: 'S$', INR: '₹', EUR: '€', GBP: '£' };

// Mirrors the public backend catalog for offline/error rendering. Normal
// renders use /payment/plans, which is the authoritative catalog for checkout.
const FALLBACK_PLANS = [
  {
    plan_id: 'starter',
    name: 'Starter',
    prompts: 5,
    blurb: 'For founders putting AI search on the map.',
    amount: '50',
    currency: 'SGD',
    features: [
      '1 domain · 5 prompts',
      '3 weekly posts',
      'Facebook, Instagram, LinkedIn, Google Business Profile',
      'Monthly AEO/SEO audit · technical site audit',
      'Competitor analysis',
      'No videos or blogs',
    ],
    highlight: false,
  },
  {
    plan_id: 'growth',
    name: 'Growth',
    prompts: 15,
    blurb: 'For marketing teams shipping content weekly.',
    amount: '150',
    currency: 'SGD',
    features: [
      '1 domain · 15 prompts',
      '7 weekly posts',
      'Facebook, Instagram, LinkedIn, Google Business Profile',
      'Technical site audit · automated audit fixes',
      'Competitor analysis',
      '2 videos/reels monthly · 2 blogs weekly',
    ],
    highlight: true,
  },
  {
    plan_id: 'scale',
    name: 'Scale',
    prompts: 15,
    blurb: 'For agencies and multi-brand portfolios.',
    amount: '500',
    currency: 'SGD',
    features: [
      '4 domains · 15 prompts each',
      '7 weekly posts per domain',
      'Technical site audit + automated fixes per domain',
      'Competitor analysis',
      '2 videos/reels monthly per domain',
      '2 blogs weekly per domain',
    ],
    highlight: false,
  },
];

export default function Pricing({ onStartTrial, initialPlans }) {
  const [plans, setPlans] = useState(initialPlans || null);

  const getBrowserCountry = () => {
    if (typeof window === 'undefined') return '';
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const timezoneCountry = {
      'Asia/Singapore': 'SG',
      'Asia/Kolkata': 'IN',
      'Asia/Calcutta': 'IN',
      'America/New_York': 'US',
      'America/Los_Angeles': 'US',
      'Europe/London': 'GB',
      'Australia/Sydney': 'AU',
      'Pacific/Auckland': 'NZ',
    }[timezone];
    if (timezoneCountry) return timezoneCountry;

    const locale = window.navigator.language || '';
    return locale.match(/[-_]([A-Z]{2})$/i)?.[1]?.toUpperCase() || '';
  };

  useEffect(() => {
    if (initialPlans) return;
    const country = getBrowserCountry();
    const query = country ? `?country=${encodeURIComponent(country)}` : '';

    fetch(`${BASE}/payment/plans${query}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`status ${res.status}`))))
      .then((data) => setPlans(data.plans || FALLBACK_PLANS))
      .catch((err) => {
        console.error('[Pricing] Could not load plans from', `${BASE}/payment/plans`, '—', err.message);
        setPlans(FALLBACK_PLANS);
      });
    // eslint-disable-next-line
  }, []);

  return (
    <section id="pricing" style={{ background: 'var(--white)' }}>
      <JsonLd data={buildSoftwareApplicationSchema(plans)} />
      <div className="wrap">
        <div className="head center">
          <span className="eyebrow">Pricing</span>
          <h2>Pricing is based on how often you publish.</h2>
        </div>

        {!plans && <p className="price-loading">Loading plans…</p>}

        {plans && plans.length > 0 && (
          <div className="price-grid">
            {plans.map((plan) => {
              const symbol = CURRENCY_SYMBOLS[plan.currency] || `${plan.currency} `;
              return (
                <div key={plan.plan_id} className={'price-card' + (plan.highlight ? ' pop' : '')}>
                  {plan.highlight && <span className="price-badge">Most popular</span>}
                  <div className="tier">{plan.name}</div>
                  <span className="quota">{plan.prompts} tracked prompts / mo</span>
                  <p className="desc">{plan.blurb}</p>
                  <div className="amount">
                    <span className="cur">{symbol}</span>
                    <span className="num">{Math.round(parseFloat(plan.amount))}</span>
                    <span className="per">/mo</span>
                  </div>
                  <div className="billed">billed annually</div>
                  <hr />
                  <ul>
                    {plan.features.map((feature) => (
                      <li key={feature}>{CHECK}{feature}</li>
                    ))}
                  </ul>
                  <a
                    className={'btn' + (plan.highlight ? ' btn-primary' : ' btn-ghost-light')}
                    href="#cta" onClick={(e) => { e.preventDefault(); onStartTrial?.(plan.plan_id); }}
                  >
                    Start 14-day trial
                  </a>
                </div>
              );
            })}
          </div>
        )}

        <p className="price-note">
          Need more domains or a custom rollout? <button type="button" onClick={(e) => scrollToSection('cta', e)}>Talk to us.</button>
        </p>
      </div>
    </section>
  );
}
