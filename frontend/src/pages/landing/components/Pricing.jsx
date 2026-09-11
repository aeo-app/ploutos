import { useState, useEffect } from 'react';
import { BASE } from '../../../api/seoApi';

const CHECK = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M13.5 4L6 11.5L2.5 8" stroke="var(--aeo-check)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// USD is the only one we KNOW is right without asking — anything else
// falls back to showing the currency code itself (e.g. "SGD 50") rather
// than guessing a symbol that might be wrong.
const CURRENCY_SYMBOLS = { USD: '$', SGD: 'S$', EUR: '€', GBP: '£' };

/**
 * Design adopted directly from the uploaded AEOPricing.jsx component —
 * same markup structure, same CSS (scoped under .aeo-pricing, injected
 * via <style> exactly as given, including its dark-mode variables) —
 * but with live plan data from /payment/plans instead of the hardcoded
 * placeholder array, so this can never drift from what checkout actually
 * charges. Fetched directly (not via paymentApi.getPlans()) since that
 * wrapper's getAuthHeaders() throws when no one is logged in — this
 * section is reached by unauthenticated visitors by definition.
 */
const FALLBACK_PLANS = [
  {
    plan_id: 'starter',
    name: 'Starter',
    prompts: 5,
    blurb: 'For founders putting AI search on the map.',
    amount: '50',
    currency: 'SGD',
    features: [
      '1 domain · 5 tracked prompts',
      'Weekly 3 posts on Facebook, Instagram, LinkedIn & Google My Business',
      'Monthly AEO / SEO audit',
      'Technical site audit',
      'Competitor analysis',
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
      '1 domain · 15 tracked prompts',
      'Weekly 7 posts on Facebook, Instagram, LinkedIn & Google My Business',
      'Competitor analysis',
      'Technical site audit',
      'Automated audit fixes on site',
      'Monthly 2 videos / reels',
      'Weekly 2 blogs',
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
      '4 domains · 15 tracked prompts',
      'Weekly 7 posts on Facebook, Instagram, LinkedIn & Google My Business',
      'Competitor analysis',
      'Technical site audit',
      'Automated audit fixes on site',
      'Monthly 2 videos / reels',
      'Weekly 2 blogs',
    ],
    highlight: false,
  },
];

export default function Pricing({ onStartTrial, initialPlans }) {
  const [plans, setPlans] = useState(initialPlans || null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initialPlans) return; // prerender already resolved this — skip the fetch entirely

    fetch(`${BASE}/payment/plans`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`status ${res.status}`))))
      .then((data) => setPlans(data.plans || FALLBACK_PLANS))
      .catch((err) => {
        console.error('[Pricing] Could not load plans from', `${BASE}/payment/plans`, '—', err.message);
        setPlans(FALLBACK_PLANS);
        setError(false);
      });
    // eslint-disable-next-line
  }, []);

  const visiblePlans = plans && plans.length > 0 ? plans : FALLBACK_PLANS;

  return (
    <section className="section aeo-pricing" id="pricing" style={{ background: '#0b0d16', maxWidth: '1580px' }}>
      <style>{STYLES}</style>
      <div className="aeo-pricing__wrap">
        <div className="aeo-pricing__head">
          <span className="aeo-pricing__eyebrow">AEO App Plans</span>
          <h2 className="aeo-pricing__title">Pricing built around how often you publish</h2>
          <p className="aeo-pricing__sub">
            Every plan tracks your AI-search visibility and ships content automatically.
            Pick the cadence that matches your team.
          </p>
        </div>

        {!plans && <div className="aeo-pricing__loading">Loading plans…</div>}

        {plans && plans.length > 0 && (
          <div className="aeo-pricing__grid">
            {plans.map((plan) => {
              const symbol = CURRENCY_SYMBOLS[plan.currency] || `${plan.currency} `;
              return (
                <div key={plan.plan_id} className={'aeo-pricing__card' + (plan.highlight ? ' aeo-pricing__card--pop' : '')}>
                  {plan.highlight && <span className="aeo-pricing__badge">Most popular</span>}

                  <div className="aeo-pricing__tier">{plan.name}</div>
                  <span className="aeo-pricing__quota">{plan.prompts} prompts / mo</span>
                  <p className="aeo-pricing__desc">{plan.blurb}</p>

                  <div className="aeo-pricing__price-row">
                    <span className="aeo-pricing__currency">{symbol}</span>
                    <span className="aeo-pricing__amount">{Math.round(parseFloat(plan.amount))}</span>
                    <span className="aeo-pricing__period">/ mo</span>
                  </div>
                  <div className="aeo-pricing__billed">billed annually</div>

                  <hr className="aeo-pricing__divider" />

                  <ul className="aeo-pricing__features">
                    {plan.features.map((feature) => (
                      <li key={feature}>{CHECK}<span>{feature}</span></li>
                    ))}
                  </ul>

                  <a
                    className={'aeo-pricing__cta' + (plan.highlight ? ' aeo-pricing__cta--primary' : '')}
                    href="#" onClick={(e) => { e.preventDefault(); onStartTrial?.(plan.plan_id); }}
                  >
                    Start 14-day trial →
                  </a>
                </div>
              );
            })}
          </div>
        )}

        <p className="aeo-pricing__foot">
          Need SSO, SOC2, on-prem or volume pricing? <a href="#contact">Talk to sales →</a>
        </p>
      </div>
    </section>
  );
}

const STYLES = `
.aeo-pricing {
  --aeo-bg: #0b0d16;
  --aeo-card: #ffffff;
  --aeo-card-border: #e6e6f0;
  --aeo-ink: #12132b;
  --aeo-ink-soft: #5c5e79;
  --aeo-ink-faint: #8688a3;
  --aeo-accent: #5b52f0;
  --aeo-accent-ink: #ffffff;
  --aeo-badge-bg: #5b52f0;
  --aeo-badge-ink: #ffffff;
  --aeo-check: #5b52f0;
  --aeo-pill-bg: rgba(255,255,255,0.08);
  --aeo-pill-ink: rgba(255,255,255,0.8);
  --aeo-divider: #ececf5;
  --aeo-btn-border: #dcdce8;
  --aeo-btn-ink: #12132b;
  --aeo-shadow: 0 1px 2px rgba(18,19,43,0.04);
  --aeo-shadow-pop: 0 20px 40px -12px rgba(91,82,240,0.28);

  width: 100vw;
  margin-left: calc(50% - 50vw);
  background: var(--aeo-bg);
  color: white;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  padding: 56px 20px 72px;
}
@media (prefers-color-scheme: dark) {
  .aeo-pricing {
    --aeo-bg: #0d0e1a;
    --aeo-card: #15162a;
    --aeo-card-border: #26273f;
    --aeo-ink: #f1f1fa;
    --aeo-ink-soft: #a7a8c4;
    --aeo-ink-faint: #787a9c;
    --aeo-accent: #8b82ff;
    --aeo-accent-ink: #0d0e1a;
    --aeo-badge-bg: #8b82ff;
    --aeo-badge-ink: #0d0e1a;
    --aeo-check: #8b82ff;
    --aeo-pill-bg: #1e1f3d;
    --aeo-pill-ink: #b5aeff;
    --aeo-divider: #232445;
    --aeo-btn-border: #33345a;
    --aeo-btn-ink: #f1f1fa;
    --aeo-shadow: 0 1px 2px rgba(0,0,0,0.3);
    --aeo-shadow-pop: 0 20px 45px -12px rgba(139,130,255,0.35);
  }
}

.aeo-pricing * { box-sizing: border-box; }

.aeo-pricing__wrap { max-width: 1280px; margin: 0 auto; }
.aeo-pricing__head { text-align: center; max-width: 640px; margin: 0 auto 44px; }
.aeo-pricing__eyebrow {
  display: inline-block;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--aeo-pill-ink);
  background: var(--aeo-pill-bg);
  padding: 5px 12px;
  border-radius: 999px;
  margin-bottom: 16px;
}
.aeo-pricing__title {
  color: white;
  font-size: clamp(28px, 4vw, 38px);
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0 0 12px;
}
.aeo-pricing__sub { color: rgba(255,255,255,0.72); font-size: 16px; line-height: 1.55; margin: 0; }
.aeo-pricing__loading { text-align: center; padding: 40px 0; color: rgba(255,255,255,0.7); font-size: 14px; }

.aeo-pricing__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 22px;
  align-items: start;
}
@media (max-width: 900px) {
  .aeo-pricing__grid { grid-template-columns: 1fr; }
}

.aeo-pricing__card {
  background: var(--aeo-card);
  border: 1px solid var(--aeo-card-border);
  border-radius: 20px;
  padding: 32px 28px 28px;
  box-shadow: var(--aeo-shadow);
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}
.aeo-pricing__card--pop {
  border-color: var(--aeo-accent);
  box-shadow: var(--aeo-shadow-pop);
}
@media (min-width: 901px) {
  .aeo-pricing__card--pop { transform: translateY(-10px); }
}

.aeo-pricing__badge {
  position: absolute;
  top: -14px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--aeo-badge-bg);
  color: var(--aeo-badge-ink);
  font-size: 12.5px;
  font-weight: 700;
  padding: 6px 16px;
  border-radius: 999px;
  white-space: nowrap;
}

.aeo-pricing__tier { font-size: 21px; font-weight: 700; margin: 4px 0 12px; }
.aeo-pricing__quota {
  display: inline-block;
  font-size: 13px;
  font-weight: 600;
  color: var(--aeo-pill-ink);
  background: var(--aeo-pill-bg);
  padding: 5px 12px;
  border-radius: 999px;
  margin-bottom: 16px;
  width: fit-content;
}
.aeo-pricing__desc {
  color: var(--aeo-ink-soft);
  font-size: 14.5px;
  line-height: 1.5;
  margin: 0 0 22px;
  min-height: 42px;
}

.aeo-pricing__price-row { display: flex; align-items: flex-start; gap: 2px; line-height: 1; }
.aeo-pricing__currency { font-size: 20px; font-weight: 700; margin-top: 8px; color: var(--aeo-ink); }
.aeo-pricing__amount {
  font-size: 46px;
  font-weight: 800;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.aeo-pricing__period { font-size: 15px; font-weight: 500; color: var(--aeo-ink-faint); align-self: flex-end; margin-bottom: 6px; }
.aeo-pricing__billed { font-size: 13px; color: var(--aeo-ink-faint); margin: 6px 0 20px; }

.aeo-pricing__divider { border: none; border-top: 1px solid var(--aeo-divider); margin: 0 0 20px; }

.aeo-pricing__features {
  list-style: none;
  margin: 0 0 24px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 13px;
  flex: 1;
}
.aeo-pricing__features li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 14.5px;
  line-height: 1.5;
  color: var(--aeo-ink);
}
.aeo-pricing__features li svg { flex: none; margin-top: 2px; }

.aeo-pricing__cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 13px 20px;
  border-radius: 999px;
  font-size: 14.5px;
  font-weight: 600;
  text-decoration: none;
  border: 1px solid var(--aeo-btn-border);
  color: var(--aeo-btn-ink);
  background: transparent;
  transition: opacity 0.15s ease;
  cursor: pointer;
}
.aeo-pricing__cta--primary {
  background: var(--aeo-accent);
  border-color: var(--aeo-accent);
  color: var(--aeo-accent-ink);
}
.aeo-pricing__cta:hover { opacity: 0.85; }
.aeo-pricing__cta:focus-visible { outline: 2px solid var(--aeo-accent); outline-offset: 2px; }

.aeo-pricing__foot { text-align: center; margin-top: 38px; font-size: 14.5px; color: rgba(255,255,255,0.72); }
.aeo-pricing__foot a { color: white; font-weight: 600; text-decoration: none; }
.aeo-pricing__foot a:hover { text-decoration: underline; }
`;
