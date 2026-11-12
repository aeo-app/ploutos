import React from 'react';
import { motion } from 'framer-motion';
import s from './Auth.module.css';
import aeoIcon from '../../assets/screens/aeo-icon.png';

const FEATURES = [
  { icon: '⚔', title: 'Answer-Engine Ranking', text: 'See where you surface across ChatGPT, Perplexity, Claude & Gemini' },
  { icon: '🔑', title: 'Citation Tracking',     text: 'Daily crawls of the sources every engine cites' },
  { icon: '📈', title: 'Content Automation',    text: 'Audits, briefs & social posts shipped on a schedule' },
];

/** The AEO icon, used wherever the sign-in pages used to show a search icon. */
function AeoIcon({ className }) {
  return <img src={aeoIcon} alt="AEO-APP.ai" className={className} draggable="false" />;
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
            <AeoIcon className={s.brandLogoImg} />
          </div>
          <div>
            <div className={s.brandLogoText}>AEO_APP<span style={{ color: '#B5AEFF' }}>.com</span></div>
            <div className={s.brandLogoSub}>Your AI Growth Hacker</div>
          </div>
        </div>

        {/* Sonar animation */}
        {/* <div className={s.sonarArea}>
          <div className={s.sonarCenter}><AeoIcon className={s.sonarCenterImg} /></div>
          {[0.7, 1.4, 2.1].map((delay, i) => (
            <div key={i} className={s.sonarRing} style={{ animationDelay: `${delay}s` }} />
          ))}
        </div> */}

        {/* Headline */}
        <h1 className={s.brandHeadline}>
          Rank in the answers,<br/>
          <span className={s.brandGrad}>not just the links</span>
        </h1>
        <p className={s.brandDesc}>
          Audit, track and automate your visibility across every AI model — ChatGPT, Claude, Perplexity and Gemini.
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
