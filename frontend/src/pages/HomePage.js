import React from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { seoApi } from '../api/seoApi';
import { AnalyseForm } from '../components/forms/AnalyseForm';
import { Button } from '../components/ui/Button';
import { Card, StatTile, Divider, Badge } from '../components/ui/UI';
import styles from './HomePage.module.css';

function SonarPulse() {
  return (
    <div className={styles.sonarWrap}>
      <div className={styles.sonarCenter}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#fff' }}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} className={styles.sonarRing} style={{ animationDelay: `${i * 0.7}s` }} />
      ))}
    </div>
  );
}

const MODULES = [
  { id: 'compete',  icon: '⚔',  title: 'Competitors',      desc: 'SEO visibility, DA estimates, rankings', color: '#4F46E5' },
  { id: 'keywords', icon: '🔑', title: 'Keywords',          desc: 'Volume, intent & position estimates',     color: '#7C3AED' },
  { id: 'profile',  icon: '📋', title: 'Company Profile',   desc: 'LinkedIn + GBP ready-to-paste copy',      color: '#0891B2' },
  { id: 'da',       icon: '📈', title: 'Domain Authority',  desc: 'Gap analysis & backlink roadmap',          color: '#059669' },
  { id: 'contentStrategy', icon: '✍️', title: 'Content Strategy', desc: 'Competitor-informed, SEO-optimised content', color: '#DB2777' },
  { id: 'relocationCalendar', icon: '📅', title: 'Social Media Calendar', desc: 'A month of relocation posts, streamed day by day', color: '#0D9488' },
  { id: 'report',   icon: '⚡',  title: 'Full Report',       desc: 'All 4 analyses in one call',              color: '#D97706' },
];

export function HomePage() {
  const { state, setPage, runApi, toast } = useApp();
  const loading = state.loading.fullReport;
  const hasAny  = Object.values(state.results).some(Boolean);

  const fr = state.results.fullReport;
  const comp = state.results.competitors || fr?.competitor_analysis;
  const kw   = state.results.keywords    || fr?.keyword_volume;
  const da   = state.results.domainAuthority || fr?.domain_authority_strategy;

  const totalKws = kw
    ? (kw.high_volume_head_terms?.length || 0) + (kw.mid_volume_service_terms?.length || 0) + (kw.long_tail_high_intent?.length || 0)
    : null;

  const handleFullReport = async (req) => {
    try {
      await runApi('fullReport', seoApi.fullReport, req);
      toast({ type: 'success', message: '✓ Full report generated — explore each module.' });
      setPage('compete');
    } catch (_) {}
  };

  return (
    <div className={styles.page}>
      {/* Hero */}
      <motion.div className={styles.hero} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
        <div className={styles.heroContent}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Badge variant="brand">AI-Powered · Claude Sonnet · Asia-Pacific</Badge>
            <h1 className={styles.heroTitle}>
              SEO Intelligence<br/>
              <span className={styles.heroGrad}>for every market</span>
            </h1>
            <p className={styles.heroDesc}>
              Instant competitive analysis, keyword intelligence, domain authority strategy and company profiles — powered by Claude AI. For any company, any market, in seconds.
            </p>
          </motion.div>
          <motion.div className={styles.heroStats} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
            {[['5 APIs', 'fully integrated'],['4 modules','in one report'],['AI-generated','real-time data']].map(([v, l]) => (
              <div key={v} className={styles.heroStat}>
                <span className={styles.heroStatVal}>{v}</span>
                <span className={styles.heroStatLabel}>{l}</span>
              </div>
            ))}
          </motion.div>
        </div>
        <motion.div className={styles.heroVisual} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, duration: 0.6 }}>
          <SonarPulse />
        </motion.div>
      </motion.div>

      {/* Form */}
      <AnalyseForm
        onSubmit={handleFullReport}
        loading={loading}
        buttonLabel="⚡ Run Full Report"
        showQuickStarts={true}
      />

      {/* Results summary */}
      {hasAny && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Divider label="Results available" />
          <div className={styles.statGrid}>
            <StatTile label="Competitors" value={comp?.competitor_overview?.length ?? '—'} sub="companies mapped" icon="⚔" />
            <StatTile label="Keywords" value={totalKws ?? '—'} sub="terms tracked" icon="🔑" color="var(--c-violet-600)" />
            <StatTile label="Current DA" value={da?.current_da ?? '—'} sub="estimated" icon="📊" color="var(--c-info)" />
            <StatTile label="12-Month DA Target" value={da?.target_da_12m ?? '—'} sub="goal" icon="🎯" color="var(--c-success)" />
          </div>
        </motion.div>
      )}

      {/* Module cards */}
      <Divider label="Modules" />
      <div className={styles.moduleGrid}>
        {MODULES.map((m, i) => {
          const done = m.id === 'report' ? !!state.results.fullReport
            : m.id === 'compete' ? !!(state.results.competitors || fr)
            : m.id === 'da'     ? !!(state.results.domainAuthority || fr)
            : m.id === 'contentStrategy' ? !!state.results.contentStrategy
            : m.id === 'relocationCalendar' ? !!state.results.relocationCalendar
            : !!(state.results[m.id] || fr);
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              whileHover={{ y: -3, boxShadow: '0 12px 32px rgba(15,23,42,0.1)' }}
            >
              <Card padded={false} className={styles.moduleCard} style={{ cursor: 'pointer' }} onClick={() => setPage(m.id)}>
                <div className={styles.moduleTop}>
                  <div className={styles.moduleIcon} style={{ background: `${m.color}15`, color: m.color }}>{m.icon}</div>
                  {done && <Badge variant="success">Ready</Badge>}
                </div>
                <div className={styles.moduleTitle}>{m.title}</div>
                <div className={styles.moduleDesc}>{m.desc}</div>
                <div className={styles.moduleArrow} style={{ color: m.color }}>Open →</div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
