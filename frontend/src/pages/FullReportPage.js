import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { seoApi } from '../api/seoApi';
import { AnalyseForm } from '../components/forms/AnalyseForm';
import { Card, Badge, DataTable, ProgressBar, SectionHeader, SkeletonCard, Empty, ErrorCard, InsightCard, StatTile, Tag, CopyButton } from '../components/ui/UI';
import { UnlockModal } from '../components/payment/UnlockModal';
import { UnlockBanner } from '../components/payment/UnlockBanner';
import { CompetitorsResultView } from './CompetitorsPage';
import { KeywordsResultView } from './KeywordsPage';
import { ProfileResultView } from './ProfilePage';
import { DomainAuthorityResultView } from './DomainAuthorityPage';
import s from './DataPage.module.css';

const SECTIONS = [
  { id: 'overview',   label: '📊 Overview' },
  { id: 'competitors',label: '⚔ Competitors' },
  { id: 'keywords',   label: '🔑 Keywords' },
  { id: 'profile',    label: '📋 Profile' },
  { id: 'da',         label: '📈 DA Strategy' },
];

const DIFF_BADGE  = { Easy: 'success', Medium: 'warning', Hard: 'danger' };
const COMP_V      = { 'Very High': 'danger', High: 'warning', Medium: 'info', Low: 'success' };
const INTENT_V    = { Transactional: 'success', Informational: 'info', Navigational: 'warning' };
const rankColor   = v => { const n = parseInt(v?.replace(/\D.*$/, '')); return n <= 3 ? 'var(--c-success)' : n <= 8 ? 'var(--c-warning)' : 'var(--c-danger)'; };

/* ── Static result view — renders a saved FullSEOReport (e.g. from History)
   using the SAME full-fidelity components as each individual analysis page,
   stacked with section dividers, rather than the live page's condensed tabs. */
export function FullReportResultView({ result }) {
  if (!result) return null;
  const { competitor_analysis, keyword_volume, company_profile, domain_authority_strategy } = result;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {competitor_analysis && (
        <div>
          <SectionHeader title="⚔ Competitors" />
          <CompetitorsResultView data={competitor_analysis} />
        </div>
      )}
      {keyword_volume && (
        <div>
          <SectionHeader title="🔑 Keywords" />
          <KeywordsResultView data={keyword_volume} />
        </div>
      )}
      {company_profile && (
        <div>
          <SectionHeader title="📋 Company Profile" />
          <ProfileResultView data={company_profile} />
        </div>
      )}
      {domain_authority_strategy && (
        <div>
          <SectionHeader title="📈 Domain Authority" />
          <DomainAuthorityResultView data={domain_authority_strategy} />
        </div>
      )}
    </div>
  );
}

export function FullReportPage() {
  const { state, runApi, toast } = useApp();
  const [section, setSection] = useState('overview');
  const loading = state.loading.fullReport;
  const error   = state.errors.fullReport;
  const report  = state.results.fullReport;
  const [showUnlock, setShowUnlock] = useState(false);

  const run = async (req) => {
    try {
      await runApi('fullReport', seoApi.fullReport, req);
      toast({ type: 'success', message: '✓ Full report complete — all 4 analyses ready.' });
      setSection('overview');
    } catch (_) {}
  };

  const comp = report?.competitor_analysis;
  const kw   = report?.keyword_volume;
  const prof = report?.company_profile;
  const da   = report?.domain_authority_strategy;
  const totalKws = kw ? (kw.high_volume_head_terms?.length||0)+(kw.mid_volume_service_terms?.length||0)+(kw.long_tail_high_intent?.length||0) : null;

  const lockedCount = report ? [
    ...(comp?.competitor_overview || []), ...(comp?.seo_visibility || []), ...(comp?.keyword_rankings || []),
    ...(comp?.competitor_scores || []), ...(comp?.key_takeaways || []),
    ...(kw?.high_volume_head_terms || []), ...(kw?.mid_volume_service_terms || []), ...(kw?.long_tail_high_intent || []),
    ...(kw?.strategic_priority_summary || []),
    ...(da?.gap_analysis || []), ...(da?.backlink_opportunities || []), ...(da?.top_5_priority_actions || []),
  ].filter(r => r.locked).length + (prof?.locked_fields?.length || 0) : 0;

  return (
    <div className={s.page}>
      <AnalyseForm onSubmit={run} loading={loading} buttonLabel="⚡ Generate Full Report" compact={!!report} />

      {loading && (
        <div className={s.loadingWrap}>
          <div className={s.loadingSpinner} />
          <div className={s.loadingTitle}>Generating Full SEO Report</div>
          <div className={s.loadingSteps}>Running 4 Claude AI analyses sequentially…</div>
          <div style={{ fontSize: '13px', color: 'var(--c-slate-400)', marginBottom: '20px' }}>
            Competitor Analysis → Keywords → Company Profile → Domain Authority
          </div>
          <div className={s.loadingProgressTrack}>
            <div className={s.loadingProgressFill} />
          </div>
        </div>
      )}

      {error && !loading && <ErrorCard message={error} />}

      {report && !loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {/* Section nav */}
          <div className={s.reportNav}>
            {SECTIONS.map(sec => (
              <button key={sec.id} className={`${s.reportNavBtn} ${section === sec.id ? s.reportNavActive : ''}`} onClick={() => setSection(sec.id)}>
                {sec.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
              className={s.sections}
            >
              {/* ── Overview ── */}
              {section === 'overview' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: '12px' }}>
                    <StatTile label="Competitors"   value={comp?.competitor_overview?.length} sub="mapped" icon="⚔" />
                    <StatTile label="Keywords"      value={totalKws} sub="tracked" icon="🔑" color="var(--c-violet-600)" />
                    <StatTile label="Current DA"    value={da?.current_da} sub="estimated" icon="📊" color="var(--c-info)" />
                    <StatTile label="Target DA"     value={da?.target_da_12m} sub="12-month goal" icon="🎯" color="var(--c-success)" />
                  </div>

                  {prof && (
                    <Card>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c-slate-400)', marginBottom: '6px' }}>Generated Tagline</div>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--c-slate-900)' }}>"{prof.tagline}"</div>
                        </div>
                        <CopyButton text={prof.tagline} />
                      </div>
                    </Card>
                  )}

                  {comp && (
                    <Card>
                      <SectionHeader title="Competitor Score Leaderboard" />
                      {(comp?.competitor_scores || []).slice(0, 6).map((c, i) => (
                        <div key={c.company} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: i < 5 ? '1px solid var(--c-slate-100)' : 'none' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--c-slate-400)', width: '20px' }}>{c.rank}</span>
                          <span style={{ flex: 1, fontSize: '14px', fontWeight: 500, color: 'var(--c-slate-800)' }}>{c.company}</span>
                          <div style={{ width: '140px' }}><ProgressBar value={c.score} max={100} color={c.score >= 80 ? 'var(--c-success)' : c.score >= 60 ? 'var(--c-indigo-500)' : 'var(--c-warning)'} /></div>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '15px', color: c.score >= 80 ? 'var(--c-success)' : c.score >= 60 ? 'var(--c-indigo-600)' : 'var(--c-warning)', width: '36px', textAlign: 'right' }}>{c.score}</span>
                        </div>
                      ))}
                    </Card>
                  )}

                  {da && (
                    <Card>
                      <SectionHeader title="Top 5 DA Priority Actions" />
                      <div className={s.insights}>
                        {(da?.top_5_priority_actions || []).map((a, i) => <InsightCard key={i} {...a} index={i} />)}
                      </div>
                    </Card>
                  )}

                  {comp && (
                    <Card>
                      <SectionHeader title="Strategic Takeaways" />
                      <div className={s.insights}>
                        {(comp?.key_takeaways || []).map((t, i) => <InsightCard key={i} {...t} index={i} />)}
                      </div>
                    </Card>
                  )}
                </>
              )}

              {/* ── Competitors ── */}
              {section === 'competitors' && comp && (
                <>
                  <Card padded={false}>
                    <div className={s.cardHead}><SectionHeader title="Competitor Overview" /></div>
                    <DataTable rows={comp?.competitor_overview || []} keyFn={r => r.company} cols={[
                      { key: 'rank', label: '#', render: v => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--c-slate-400)' }}>{v}</span> },
                      { key: 'company', label: 'Company', render: v => <strong>{v}</strong> },
                      { key: 'hq', label: 'HQ' },
                      { key: 'focus', label: 'Focus' },
                      { key: 'accreditation', label: 'Accreditation', render: v => <Badge>{v}</Badge> },
                    ]} />
                  </Card>
                  <Card padded={false}>
                    <div className={s.cardHead}><SectionHeader title="SEO Visibility" /></div>
                    <DataTable rows={comp?.seo_visibility || []} keyFn={r => r.company} cols={[
                      { key: 'company', label: 'Company', render: v => <strong>{v}</strong> },
                      { key: 'seo_visibility_score', label: 'SEO Score', render: v => <div style={{ minWidth: '120px' }}><ProgressBar value={v} max={100} /></div> },
                      { key: 'domain_authority_estimate', label: 'DA', render: v => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--c-indigo-600)' }}>{v}</span> },
                      { key: 'google_rating', label: '★', render: v => <span style={{ color: 'var(--c-warning)', fontWeight: 600 }}>{v}★</span> },
                    ]} />
                  </Card>
                </>
              )}

              {/* ── Keywords ── */}
              {section === 'keywords' && kw && (
                <>
                  {[
                    { title: 'High-Volume Head Terms',  rows: kw?.high_volume_head_terms || [] },
                    { title: 'Mid-Volume Service Terms', rows: kw?.mid_volume_service_terms || [] },
                    { title: 'Long-Tail High-Intent',   rows: kw?.long_tail_high_intent || [] },
                  ].map(({ title, rows }) => (
                    <Card key={title} padded={false}>
                      <div className={s.cardHead}><SectionHeader title={title} /></div>
                      <DataTable rows={rows} keyFn={(r, i) => i} cols={[
                        { key: 'keyword', label: 'Keyword', render: v => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{v}</span> },
                        { key: 'monthly_volume_estimate', label: 'Volume', render: v => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--c-indigo-600)' }}>{v}</span> },
                        { key: 'competition', label: 'Competition', render: v => <Badge variant={COMP_V[v]||'default'}>{v}</Badge> },
                        { key: 'intent', label: 'Intent', render: v => <Badge variant={INTENT_V[v]||'default'}>{v}</Badge> },
                        { key: 'apac_estimated_position', label: 'Position', render: v => <strong style={{ fontFamily: 'var(--font-mono)', color: rankColor(v) }}>{v}</strong> },
                      ]} />
                    </Card>
                  ))}
                </>
              )}

              {/* ── Profile ── */}
              {section === 'profile' && prof && (
                <>
                  <Card>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, flex: 1, color: 'var(--c-slate-900)' }}>"{prof.tagline}"</div>
                      <CopyButton text={prof.tagline} />
                    </div>
                  </Card>
                  {[
                    { title: '🔵 LinkedIn Overview', text: prof.linkedin_overview, max: 2000 },
                    { title: '🔴 Google Business Description', text: prof.google_business_description, max: 750 },
                  ].map(({ title, text, max }) => (
                    <Card key={title}>
                      <div className={s.profileBlockHead}>
                        <div className={s.profileBlockTitle}>{title}</div>
                        <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--c-slate-400)' }}>{text?.length}/{max}</span>
                        <CopyButton text={text || ''} />
                      </div>
                      <div className={s.profileText}>{text}</div>
                    </Card>
                  ))}
                  <Card>
                    <SectionHeader title="LinkedIn Specialties" />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {prof.linkedin_specialties?.map((t, i) => <Tag key={i}>{t}</Tag>)}
                    </div>
                  </Card>
                </>
              )}

              {/* ── DA ── */}
              {section === 'da' && da && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }}>
                    <StatTile label="Current DA"    value={da?.current_da}    color="var(--c-danger)" />
                    <StatTile label="6-Month Target" value={da?.target_da_6m}  color="var(--c-warning)" />
                    <StatTile label="12-Month Target"value={da?.target_da_12m} color="var(--c-success)" />
                  </div>
                  <Card padded={false}>
                    <div className={s.cardHead}><SectionHeader title="Gap Analysis" /></div>
                    <DataTable rows={da?.gap_analysis || []} keyFn={r => r.metric} cols={[
                      { key: 'metric', label: 'Metric', render: v => <strong>{v}</strong> },
                      { key: 'current', label: 'Current', render: v => <span style={{ color: 'var(--c-danger)', fontFamily: 'var(--font-mono)' }}>{v}</span> },
                      { key: 'six_month_target', label: '6-Month', render: v => <span style={{ color: 'var(--c-warning)', fontFamily: 'var(--font-mono)' }}>{v}</span> },
                      { key: 'twelve_month_target', label: '12-Month', render: v => <span style={{ color: 'var(--c-success)', fontFamily: 'var(--font-mono)' }}>{v}</span> },
                      { key: 'benchmark', label: 'Benchmark', render: v => <span style={{ color: 'var(--c-slate-500)' }}>{v}</span> },
                    ]} />
                  </Card>
                  <Card padded={false}>
                    <div className={s.cardHead}><SectionHeader title="Backlink Opportunities" /></div>
                    <DataTable rows={da?.backlink_opportunities || []} keyFn={(_,i) => i} cols={[
                      { key: 'pillar', label: 'Pillar', render: v => <Badge variant="brand">{v}</Badge> },
                      { key: 'action', label: 'Action' },
                      { key: 'platform_or_target', label: 'Target' },
                      { key: 'estimated_da', label: 'DA', render: v => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--c-indigo-600)' }}>{v}</span> },
                      { key: 'difficulty', label: 'Effort', render: v => <Badge variant={DIFF_BADGE[v]||'default'}>{v}</Badge> },
                    ]} />
                  </Card>
                  <Card>
                    <SectionHeader title="Top 5 Priority Actions" />
                    <div className={s.insights}>
                      {(da?.top_5_priority_actions || []).map((a, i) => <InsightCard key={i} {...a} index={i} />)}
                    </div>
                  </Card>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}

      {report && !loading && lockedCount > 0 && (
        <UnlockBanner count={lockedCount} label="insight" onUnlock={() => setShowUnlock(true)} />
      )}

      {!report && !loading && !error && (
        <Empty icon="⚡" title="No full report yet" body="Run a Full Report to get all 4 analyses — competitor intelligence, keywords, company profile, and domain authority — in one call." />
      )}

      {showUnlock && (
        <UnlockModal
          title="Unlock full report"
          onClose={() => setShowUnlock(false)}
          onUnlocked={() => { setShowUnlock(false); run(state.request); }}
        />
      )}
    </div>
  );
}
