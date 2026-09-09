import React from 'react';
import s from './PlanCards.module.css';

// Real, computed 20% annual discount (not fabricated numbers) — see the
// CycleToggle note: the backend only supports one monthly price per plan
// today, so "Annual" is shown for visual/pricing-preview purposes only and
// checkout is disabled for it rather than silently charging the monthly
// rate for something displayed as a discounted annual price.
const ANNUAL_DISCOUNT = 0.8;

const Tick = () => (
  <svg className={s.featTick} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M13 4L6 11L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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

export function CycleToggle({ cycle, onChange }) {
  return (
    <div className={s.cycleRow}>
      <div className={s.cycle}>
        <button type="button" className={`${s.cycleBtn} ${cycle === 'monthly' ? s.cycleBtnOn : ''}`} onClick={() => onChange('monthly')}>
          Monthly
        </button>
        <button type="button" className={`${s.cycleBtn} ${cycle === 'annual' ? s.cycleBtnOn : ''}`} onClick={() => onChange('annual')}>
          Annual <span className={s.cycleSave}>−20%</span>
        </button>
      </div>
      {cycle === 'annual' && (
        <span className={s.cycleNote}>Annual billing is coming soon — showing preview pricing, checkout stays monthly for now.</span>
      )}
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

export function PlanCards({
  plans, cycle = 'monthly', selectedPlanId, currentPlanId, onSelect, disabled, ctaLabel = 'Choose plan',
}) {
  if (!plans || plans.length === 0) return null;

  return (
    <div className={s.grid}>
      {plans.map(plan => {
        const monthly = parseFloat(plan.amount);
        const displayPrice = cycle === 'annual' ? Math.round(monthly * ANNUAL_DISCOUNT) : Math.round(monthly);
        const isSelected = selectedPlanId === plan.plan_id;
        const isCurrent = currentPlanId === plan.plan_id;
        // Checkout can only ever charge the real monthly price the backend
        // knows about — don't let someone "buy" the discounted annual
        // preview price, which isn't actually wired up to a charge yet.
        const ctaDisabled = disabled || cycle === 'annual';

        return (
          <article key={plan.plan_id} className={`${s.card} ${plan.highlight ? s.cardHi : ''} ${isSelected ? s.cardSelected : ''}`}>
            {plan.highlight && <span className={s.badge}>Most popular</span>}
            {isSelected && <span className={s.checkmark}>✓</span>}

            <div className={s.planName}>{plan.name}</div>
            <div className={s.planPrompts}><span>{plan.prompts}</span> prompts / mo</div>
            <div className={s.planBlurb}>{plan.blurb}</div>

            <div className={s.priceRow}>
              <span className={s.priceCurrency}>{plan.currency === 'USD' ? '$' : `${plan.currency} `}</span>
              <span className={s.priceAmount}>{displayPrice}</span>
              <span className={s.pricePeriod}>/ mo</span>
            </div>
            <div className={s.priceCycle}>{cycle === 'annual' ? 'billed annually (preview)' : 'billed monthly'}</div>

            {isCurrent && <span className={s.currentBadge}>✓ Current plan</span>}

            <ul className={s.featList}>
              {plan.features.map(f => <li key={f}><Tick />{f}</li>)}
            </ul>

            <button
              type="button"
              disabled={ctaDisabled}
              className={`${s.cta} ${plan.highlight ? s.ctaPrimary : s.ctaGhost}`}
              onClick={() => onSelect?.(plan.plan_id)}
            >
              {isCurrent ? 'Current plan' : cycle === 'annual' ? 'Coming soon' : ctaLabel}
            </button>
          </article>
        );
      })}
    </div>
  );
}
