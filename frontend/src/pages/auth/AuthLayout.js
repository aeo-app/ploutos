import React from 'react';
import { motion } from 'framer-motion';
import s from './Auth.module.css';

const FEATURES = [
  { icon: '⚔', title: 'Competitor Intelligence', text: 'SEO scores, DA estimates & keyword rankings' },
  { icon: '🔑', title: 'Keyword Volume',          text: 'Intent, competition & position data' },
  { icon: '📈', title: 'Domain Authority',        text: 'Gap analysis & backlink roadmap' },
];

function SearchIcon() {
  return (
    <svg className={s.sonarCenterIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  );
}

export function AuthLayout({ children }) {
  return (
    <div className={s.shell}>
      {/* ── Left brand panel ── */}
      <div className={s.brand}>
        <div className={s.blob + ' ' + s.blob1} />
        <div className={s.blob + ' ' + s.blob2} />

        {/* Logo */}
        <div className={s.brandLogo}>
          <div className={s.brandLogoMark}>
            <SearchIcon />
          </div>
          <div>
            <div className={s.brandLogoText}>APAC<span style={{ color: '#C7D2FE' }}>Intel</span></div>
            <div className={s.brandLogoSub}>SEO Intelligence Platform</div>
          </div>
        </div>

        {/* Sonar animation */}
        <div className={s.sonarArea}>
          <div className={s.sonarCenter}><SearchIcon /></div>
          {[0.7, 1.4, 2.1].map((delay, i) => (
            <div key={i} className={s.sonarRing} style={{ animationDelay: `${delay}s` }} />
          ))}
        </div>

        {/* Headline */}
        <h1 className={s.brandHeadline}>
          SEO Intelligence<br/>
          <span className={s.brandGrad}>for Asia-Pacific</span>
        </h1>
        <p className={s.brandDesc}>
          Competitive analysis, keyword data, domain authority strategy and company profiles — powered by Claude AI.
        </p>

        {/* Features */}
        <div className={s.features}>
          {FEATURES.map(f => (
            <div key={f.icon} className={s.feature}>
              <div className={s.featureIcon}>{f.icon}</div>
              <div className={s.featureText}>
                <span className={s.featureTitle}>{f.title}</span>
                {f.text}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel with glass card ── */}
      <div className={s.right}>
        <motion.div
          className={s.card}
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.42, ease: [0.34, 1.06, 0.64, 1] }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
