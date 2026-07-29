import React from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { seoApi } from '../api/seoApi';
import { AnalyseForm } from '../components/forms/AnalyseForm';
import { Card, Badge, DataTable, ProgressBar, SectionHeader, SkeletonCard, Empty, ErrorCard, InsightCard } from '../components/ui/UI';
import s from './DataPage.module.css';

const DIFF_BADGE = { 'Very High': 'danger', High: 'warning', Medium: 'info', Low: 'success' };

function rankColor(v) {
  const n = parseInt(v?.replace(/\D.*$/, ''));
  if (n <= 3)  return 'var(--c-success)';
  if (n <= 7)  return 'var(--c-warning)';
  return 'var(--c-danger)';
}

export function CompetitorsPage() {
  const { state, runApi, toast } = useApp();
  const loading = state.loading.competitors;
  const error   = state.errors.competitors;
  const data    = state.results.competitors || state.results.fullReport?.competitor_analysis;

  const run = async (req) => {
    try { await runApi('competitors', seoApi.competitors, req); toast({ type: 'success', message: '✓ Competitor analysis complete.' }); }
    catch (_) {}
  };

  return (
    <div className={s.page}>
      <AnalyseForm onSubmit={run} loading={loading} buttonLabel="Analyse Competitors" compact={!!data} />

      {loading && <div className={s.skeletons}>{[1,2,3].map(i => <SkeletonCard key={i} rows={6} />)}</div>}
      {error && !loading && <ErrorCard message={error} />}

      {data && !loading && (
        <motion.div className={s.sections} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

          {/* Overview */}
          <Card padded={false}>
            <div className={s.cardHead}><SectionHeader title="Competitor Overview" subtitle={`${data.competitor_overview.length} companies mapped`} /></div>
            <DataTable
              rows={data.competitor_overview}
              keyFn={r => r.company}
              cols={[
                { key: 'rank', label: '#', render: v => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--c-slate-400)' }}>{v}</span> },
                { key: 'company', label: 'Company', bold: true, render: v => <strong style={{ color: 'var(--c-slate-900)' }}>{v}</strong> },
                { key: 'hq', label: 'HQ' },
                { key: 'focus', label: 'Focus' },
                { key: 'scale', label: 'Scale' },
                { key: 'accreditation', label: 'Accreditation', render: v => <Badge variant="default">{v}</Badge> },
              ]}
            />
          </Card>

          {/* SEO Visibility */}
          <Card padded={false}>
            <div className={s.cardHead}><SectionHeader title="SEO Visibility & Digital Presence" subtitle="Domain authority, traffic and content signals" /></div>
            <DataTable
              rows={data.seo_visibility}
              keyFn={r => r.company}
              cols={[
                { key: 'company', label: 'Company', render: v => <strong style={{ color: 'var(--c-slate-900)' }}>{v}</strong> },
                { key: 'seo_visibility_score', label: 'SEO Score', render: (v) => (
                  <div style={{ minWidth: '140px' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--c-indigo-600)', marginBottom: '4px' }}>{v}/100</div>
                    <ProgressBar value={v} max={100} color={v >= 70 ? 'var(--c-success)' : v >= 50 ? 'var(--c-indigo-500)' : 'var(--c-warning)'} />
                  </div>
                )},
                { key: 'domain_authority_estimate', label: 'Est. DA', mono: true, render: v => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--c-indigo-600)' }}>{v}</span> },
                { key: 'organic_traffic_estimate', label: 'Traffic', render: v => <Badge variant={DIFF_BADGE[v] || 'default'}>{v}</Badge> },
                { key: 'has_blog', label: 'Blog', render: v => <span style={{ color: v ? 'var(--c-success)' : 'var(--c-danger)', fontWeight: 700 }}>{v ? '✓' : '✕'}</span> },
                { key: 'google_rating', label: 'Google ★', render: v => <span style={{ color: 'var(--c-warning)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{v}★</span> },
              ]}
            />
          </Card>

          {/* Keyword Rankings */}
          <Card padded={false}>
            <div className={s.cardHead}><SectionHeader title="Keyword Ranking Comparison" subtitle="Estimated SERP positions across key terms" /></div>
            <DataTable
              rows={data.keyword_rankings}
              keyFn={r => r.keyword}
              cols={[
                { key: 'keyword', label: 'Keyword', render: v => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{v}</span> },
                { key: 'monthly_searches_estimate', label: 'Monthly Vol.', render: v => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--c-indigo-600)' }}>{v}</span> },
                { key: 'apac_rank', label: 'Your Co.', render: v => <strong style={{ color: rankColor(v), fontFamily: 'var(--font-mono)' }}>{v}</strong> },
                { key: 'crown_rank', label: 'Crown', render: v => <span style={{ color: 'var(--c-slate-500)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{v}</span> },
                { key: 'allied_rank', label: 'Allied', render: v => <span style={{ color: 'var(--c-slate-500)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{v}</span> },
                { key: 'asiatic_rank', label: 'Asiatic', render: v => <span style={{ color: 'var(--c-slate-500)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{v}</span> },
              ]}
            />
          </Card>

          {/* Competitor Scores */}
          <Card>
            <SectionHeader title="Overall Competitor Scores" subtitle="Composite ranking with strengths and weaknesses" />
            <div className={s.scoreList}>
              {data.competitor_scores.map((c, i) => (
                <motion.div key={c.company} className={s.scoreItem} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
                  <div className={s.scoreRank}>{c.rank}</div>
                  <div className={s.scoreInfo}>
                    <div className={s.scoreName}>{c.company}</div>
                    <div className={s.scoreDetails}>
                      <span className={s.strength}><span className={s.dot} style={{ background: 'var(--c-success)' }} />  {c.key_strengths}</span>
                      <span className={s.weakness}><span className={s.dot} style={{ background: 'var(--c-danger)' }} /> {c.key_weaknesses}</span>
                    </div>
                  </div>
                  <div className={s.scoreRight}>
                    <div className={s.scoreNum} style={{ color: c.score >= 80 ? 'var(--c-success)' : c.score >= 60 ? 'var(--c-indigo-600)' : 'var(--c-warning)' }}>{c.score}</div>
                    <div style={{ width: '100px' }}><ProgressBar value={c.score} max={100} color={c.score >= 80 ? 'var(--c-success)' : c.score >= 60 ? 'var(--c-indigo-500)' : 'var(--c-warning)'} /></div>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>

          {/* Takeaways */}
          <Card>
            <SectionHeader title="Strategic Takeaways" />
            <div className={s.insights}>
              {data.key_takeaways.map((t, i) => <InsightCard key={i} {...t} index={i} />)}
            </div>
          </Card>
        </motion.div>
      )}

      {!data && !loading && !error && (
        <Empty icon="⚔" title="No competitor analysis yet" body="Fill in the company details above and click Analyse Competitors to generate a full competitive intelligence report." />
      )}
    </div>
  );
}
