import React from 'react';
import s from './PlanCards.module.css';

const CHECK = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M13.5 4L6 11.5L2.5 8" stroke="var(--aeo-check)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
// USD is the only one we KNOW is right without asking — anything else
// falls back to the currency code itself rather than guessing a symbol.
const CURRENCY_SYMBOLS = { USD: '$', SGD: 'S$', EUR: '€', GBP: '£' };

/**
 * Same visual design as the landing page's Pricing.jsx (adopted directly
 * from the uploaded AEOPricing.jsx component) — kept as a self-contained
 * inline <style> block here too, rather than converting to this file's
 * CSS Modules, so both instances stay visually identical by construction
 * instead of by two separately-maintained stylesheets drifting apart.
 * Extended with three states the marketing page's version doesn't need:
 * a selected-plan indicator (mid-checkout), a current-plan badge
 * (already subscribed), and a disabled button (checkout in progress).
 */
export function PlanCards({ plans, selectedPlanId, currentPlanId, onSelect, disabled, ctaLabel = 'Choose plan' }) {
  if (!plans || plans.length === 0) return null;

  return (
    <div className="aeo-pricing">
      <style>{CARD_STYLES}</style>
      <div className="aeo-pricing__grid">
        {plans.map(plan => {
          const price = Math.round(parseFloat(plan.amount));
          const symbol = CURRENCY_SYMBOLS[plan.currency] || `${plan.currency} `;
          const isSelected = selectedPlanId === plan.plan_id;
          const isCurrent = currentPlanId === plan.plan_id;

          return (
            <div
              key={plan.plan_id}
              className={'aeo-pricing__card' + (plan.highlight ? ' aeo-pricing__card--pop' : '') + (isSelected ? ' aeo-pricing__card--selected' : '')}
            >
              {plan.highlight && <span className="aeo-pricing__badge">Most popular</span>}
              {isSelected && <span className="aeo-pricing__checkmark">✓</span>}

              <div className="aeo-pricing__tier">{plan.name}</div>
              <span className="aeo-pricing__quota">{plan.prompts} prompts / mo</span>
              <p className="aeo-pricing__desc">{plan.blurb}</p>

              <div className="aeo-pricing__price-row">
                <span className="aeo-pricing__currency">{symbol}</span>
                <span className="aeo-pricing__amount">{price}</span>
                <span className="aeo-pricing__period">/ mo</span>
              </div>
              <div className="aeo-pricing__billed">billed annually</div>

              {isCurrent && <span className="aeo-pricing__current">✓ Current plan</span>}

              <hr className="aeo-pricing__divider" />

              <ul className="aeo-pricing__features">
                {plan.features.map(f => <li key={f}>{CHECK}<span>{f}</span></li>)}
              </ul>

              <button
                type="button"
                disabled={disabled}
                className={'aeo-pricing__cta' + (plan.highlight ? ' aeo-pricing__cta--primary' : '')}
                onClick={() => onSelect?.(plan.plan_id)}
              >
                {isCurrent ? 'Current plan' : ctaLabel}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const CARD_STYLES = `
.aeo-pricing {
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
  --aeo-pill-bg: #efeeff;
  --aeo-pill-ink: #4038d6;
  --aeo-divider: #ececf5;
  --aeo-btn-border: #dcdce8;
  --aeo-btn-ink: #12132b;
  --aeo-shadow: 0 1px 2px rgba(18,19,43,0.04);
  --aeo-shadow-pop: 0 20px 40px -12px rgba(91,82,240,0.28);
  color: var(--aeo-ink);
}
.aeo-pricing * { box-sizing: border-box; }

.aeo-pricing__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; align-items: stretch; }
@media (max-width: 640px) { .aeo-pricing__grid { grid-template-columns: 1fr; } }

.aeo-pricing__card {
  background: var(--aeo-card);
  border: 1px solid var(--aeo-card-border);
  border-radius: 20px;
  padding: 28px 24px 24px;
  box-shadow: var(--aeo-shadow);
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  text-align: left;
}
.aeo-pricing__card--pop { border-color: var(--aeo-accent); box-shadow: var(--aeo-shadow-pop); }
.aeo-pricing__card--selected { border-color: var(--aeo-accent); border-width: 2px; }

.aeo-pricing__badge, .aeo-pricing__checkmark {
  position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
  background: var(--aeo-badge-bg); color: var(--aeo-badge-ink);
  font-size: 12.5px; font-weight: 700; padding: 6px 16px; border-radius: 999px; white-space: nowrap;
}
.aeo-pricing__checkmark { left: auto; right: 16px; top: 16px; transform: none; padding: 4px 9px; }

.aeo-pricing__tier { font-size: 19px; font-weight: 700; margin: 4px 0 10px; }
.aeo-pricing__quota {
  display: inline-block; font-size: 12.5px; font-weight: 600; color: var(--aeo-pill-ink);
  background: var(--aeo-pill-bg); padding: 4px 11px; border-radius: 999px; margin-bottom: 14px; width: fit-content;
}
.aeo-pricing__desc { color: var(--aeo-ink-soft); font-size: 13.5px; line-height: 1.5; margin: 0 0 18px; min-height: 38px; }

.aeo-pricing__price-row { display: flex; align-items: flex-start; gap: 2px; line-height: 1; }
.aeo-pricing__currency { font-size: 18px; font-weight: 700; margin-top: 7px; color: var(--aeo-ink); }
.aeo-pricing__amount { font-size: 40px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.aeo-pricing__period { font-size: 14px; font-weight: 500; color: var(--aeo-ink-faint); align-self: flex-end; margin-bottom: 5px; }
.aeo-pricing__billed { font-size: 12.5px; color: var(--aeo-ink-faint); margin: 5px 0 16px; }
.aeo-pricing__current { display: inline-block; font-size: 12px; font-weight: 700; color: var(--aeo-accent); margin-bottom: 12px; }

.aeo-pricing__divider { border: none; border-top: 1px solid var(--aeo-divider); margin: 0 0 18px; }

.aeo-pricing__features { list-style: none; margin: 0 0 22px; padding: 0; display: flex; flex-direction: column; gap: 11px; flex: 1; }
.aeo-pricing__features li { display: flex; align-items: flex-start; gap: 9px; font-size: 13.5px; line-height: 1.5; color: var(--aeo-ink); }
.aeo-pricing__features li svg { flex: none; margin-top: 2px; }

.aeo-pricing__cta {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px 18px; border-radius: 999px; font-size: 13.5px; font-weight: 600;
  border: 1px solid var(--aeo-btn-border); color: var(--aeo-btn-ink); background: transparent;
  transition: opacity 0.15s ease; cursor: pointer; width: 100%;
}
.aeo-pricing__cta--primary { background: var(--aeo-accent); border-color: var(--aeo-accent); color: var(--aeo-accent-ink); }
.aeo-pricing__cta:hover:not(:disabled) { opacity: 0.85; }
.aeo-pricing__cta:disabled { opacity: 0.5; cursor: not-allowed; }
.aeo-pricing__cta:focus-visible { outline: 2px solid var(--aeo-accent); outline-offset: 2px; }
`;

/** Mirrors the landing page's pricing section header hierarchy — eyebrow
 * tag, big title with an italicised accent phrase, centered subtitle —
 * scaled to the dashboard's own typography rather than the marketing
 * hero size, so it reads as part of the app, not a pasted-in section. */
export function PricingSectionHeader({ eyebrow = 'Pricing', title, accent, subtitle }) {
  return (
    <div className={s.head}>
      <div className={s.eyebrow}><span className={s.eyebrowDot} />{eyebrow}</div>
      <h2 className={s.title}>{title} {accent && <em>{accent}</em>}</h2>
      {subtitle && <p className={s.subtitle}>{subtitle}</p>}
    </div>
  );
}

export function PricingFooter() {
  return (
    <div className={s.foot}>
      Need SSO, SOC2, on-prem or volume pricing? <a href="#contact">Talk to sales →</a>
    </div>
  );
}

