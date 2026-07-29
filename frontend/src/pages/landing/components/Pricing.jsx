import { useState } from 'react';
import { Tick, Arrow } from './icons.jsx';

const PLANS = [
  {
    id: 'p10',
    name: 'Starter',
    prompts: '10',
    blurb: 'For founders putting AI search on the map.',
    monthly: 29, annual: 50,
    features: [
      '1 domain · 10 tracked prompts',
      'Weekly visibility refresh',
      'Tracks 5 answer engines',
      'Monthly site audit',
      'AI agent · 10 messages / day',
      'Email support',
      'Weekly 2 posts on Facebook, Instagram, Google My Business & LinkedIn',
      'Monthly 2 videos'
    ]
  },
  {
    id: 'p50',
    name: 'Growth',
    prompts: '50',
    blurb: 'For marketing teams shipping content weekly.',
    monthly: 99, annual: 150,
    features: [
      '3 domains · 50 tracked prompts',
      'Daily refresh · all engines',
      'Automated audit fixes',
      'Content engine + brand voice',
      'Unlimited AI agent + Slack alerts',
      'Competitor benchmarking (3 rivals)',
      'Priority support · 4h SLA',
      'Weekly 8 posts on Facebook, Instagram, Google My Business & LinkedIn',
      'Monthly 5 videos'
    ],
    highlight: true
  },
  {
    id: 'p100',
    name: 'Scale',
    prompts: '100',
    blurb: 'For agencies and multi-brand portfolios.',
    monthly: 179, annual: 500,
    features: [
      '10 domains · 100 tracked prompts',
      'Hourly refresh + custom engines',
      'Unlimited automations + pull requests',
      'White-label reports + client portal',
      'API, webhooks & Postgres mirror',
      'Dedicated AEO strategist · 1h SLA',
      'Weekly 15 posts on Facebook, Instagram, Google My Business & LinkedIn',
      'Monthly 8 videos'
    ]
  }
];

export default function Pricing({ onStartTrial }) {
  const [cycle, setCycle] = useState('annual');
  return (
    <section className="section" id="pricing">
      <div className="pricing-head">
        <div className="section-eyebrow"><span className="mono">05</span><span>Pricing</span></div>
        <h2 className="section-title">
          Simple pricing, <em>priced by prompts.</em>
        </h2>
        <p className="section-sub" style={{ margin: '20px auto 0', textAlign: 'center' }}>
          Pick the number of prompts you want tracked — 10, 50 or 100. Every plan includes site
          audits, automated fixes and your own AI agent. No overage fees. Cancel anytime.
        </p>
        <div className="cycle">
          <button className={cycle === 'monthly' ? 'on' : ''} onClick={() => setCycle('monthly')}>Monthly</button>
          <button className={cycle === 'annual' ? 'on' : ''} onClick={() => setCycle('annual')}>
            Annual <span className="cycle-save">−20%</span>
          </button>
        </div>
      </div>

      <div className="plans">
        {PLANS.map((p) => (
          <article className={`plan ${p.highlight ? 'plan-hi' : ''}`} key={p.id}>
            {p.highlight && <span className="plan-badge">Most popular</span>}
            <div className="plan-name">{p.name}</div>
            <div className="plan-prompts"><span>{p.prompts}</span> prompts / mo</div>
            <div className="plan-blurb">{p.blurb}</div>
            <div className="plan-price">
              <span className="plan-currency">$</span>
              <span className="plan-amount">{cycle === 'annual' ? p.annual : p.monthly}</span>
              <span className="plan-period">/ mo</span>
            </div>
            <div className="plan-cycle">{cycle === 'annual' ? 'billed annually' : 'billed monthly'}</div>
            <ul className="plan-feats">
              {p.features.map((f) => <li key={f}><Tick /> <span>{f}</span></li>)}
            </ul>
            <button
              type="button"
              className={`btn ${p.highlight ? 'btn-primary' : 'btn-ghost'} btn-lg`}
              style={{ justifyContent: 'center', width: '100%' }}
              onClick={() => onStartTrial?.(p.id)}
            >
              Start 14-day trial <Arrow className="btn-arrow" size={13} />
            </button>
          </article>
        ))}
      </div>

      <div className="plans-foot">
        Need SSO, SOC2, on-prem or volume pricing? <a href="#contact">Talk to sales →</a>
      </div>
    </section>
  );
}
