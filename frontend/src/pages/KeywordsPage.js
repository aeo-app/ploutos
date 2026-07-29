import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { seoApi } from '../api/seoApi';
import { AnalyseForm } from '../components/forms/AnalyseForm';
import { Card, Badge, DataTable, SectionHeader, SkeletonCard, Empty, ErrorCard, InsightCard, StatTile } from '../components/ui/UI';
import s from './DataPage.module.css';

const INTENT_V = { Transactional: 'success', Informational: 'info', Navigational: 'warning' };
const COMP_V   = { 'Very High': 'danger', High: 'warning', Medium: 'info', Low: 'success' };

function rankColor(v) {
  const n = parseInt(v?.replace(/\D.*$/, ''));
  return n <= 3 ? 'var(--c-success)' : n <= 8 ? 'var(--c-warning)' : 'var(--c-danger)';
}

const KW_COLS = [
  { key: 'rank', label: '#', render: v => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--c-slate-400)', fontWeight: 600 }}>{v}</span> },
  { key: 'keyword', label: 'Keyword', render: v => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{v}</span> },
  { key: 'monthly_volume_estimate', label: 'Monthly Vol.', render: v => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--c-indigo-600)' }}>{v}</span> },
  { key: 'competition', label: 'Competition', render: v => <Badge variant={COMP_V[v] || 'default'}>{v}</Badge> },
  { key: 'intent', label: 'Intent', render: v => <Badge variant={INTENT_V[v] || 'default'}>{v}</Badge> },
  { key: 'apac_estimated_position', label: 'Your Position', render: v => <strong style={{ fontFamily: 'var(--font-mono)', color: rankColor(v) }}>{v}</strong> },
];

export function KeywordsPage() {
  const { state, runApi, toast } = useApp();
  const [tab, setTab] = useState('all');
  const loading = state.loading.keywords;
  const error   = state.errors.keywords;
  const data    = state.results.keywords || state.results.fullReport?.keyword_volume;

  const run = async (req) => {
    try { await runApi('keywords', seoApi.keywords, req); toast({ type: 'success', message: '✓ Keyword data ready.' }); }
    catch (_) {}
  };

  const all   = data ? [...(data.high_volume_head_terms||[]),...(data.mid_volume_service_terms||[]),...(data.long_tail_high_intent||[])] : [];
  const top5  = all.filter(k => parseInt(k.apac_estimated_position?.replace(/\D.*$/, '')) <= 5);
  const count = (arr) => arr?.length ?? 0;

  return (
    <div className={s.page}>
      <AnalyseForm onSubmit={run} loading={loading} buttonLabel="Analyse Keywords" compact={!!data} />
      {loading && <div className={s.skeletons}>{[1,2,3].map(i => <SkeletonCard key={i} rows={7}/>)}</div>}
      {error && !loading && <ErrorCard message={error} />}

      {data && !loading && (
        <motion.div className={s.sections} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {/* Stat tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '12px' }}>
            <StatTile label="Head Terms"    value={count(data.high_volume_head_terms)}  sub="high volume"   icon="🎯" />
            <StatTile label="Service Terms" value={count(data.mid_volume_service_terms)} sub="mid volume"    icon="🔑" color="var(--c-violet-600)" />
            <StatTile label="Long-Tail"     value={count(data.long_tail_high_intent)}   sub="high intent"   icon="💎" color="var(--c-info)" />
            <StatTile label="Top 5 Ranking" value={top5.length}                          sub="already #1–5"  icon="🏆" color="var(--c-success)" />
          </div>

          {/* Tabs */}
          <div className={s.tabs}>
            {[
              ['all',     `All (${all.length})`],
              ['head',    `High Volume (${count(data.high_volume_head_terms)})`],
              ['mid',     `Service Terms (${count(data.mid_volume_service_terms)})`],
              ['tail',    `Long-Tail (${count(data.long_tail_high_intent)})`],
              ['winners', `Top 5 (${top5.length})`],
            ].map(([id, lbl]) => (
              <button key={id} className={`${s.tab} ${tab === id ? s.tabActive : ''}`} onClick={() => setTab(id)}>{lbl}</button>
            ))}
          </div>

          {/* Tables */}
          {(tab === 'all' || tab === 'head') && (
            <Card padded={false}>
              <div className={s.cardHead}><SectionHeader title="High-Volume Head Terms" subtitle="Broadest reach — most competitive" /></div>
              <DataTable rows={data.high_volume_head_terms} cols={KW_COLS} keyFn={r => r.keyword} />
            </Card>
          )}
          {(tab === 'all' || tab === 'mid') && (
            <Card padded={false}>
              <div className={s.cardHead}><SectionHeader title="Mid-Volume Service Terms" subtitle="Core revenue keywords" /></div>
              <DataTable rows={data.mid_volume_service_terms} cols={KW_COLS} keyFn={r => r.keyword} />
            </Card>
          )}
          {(tab === 'all' || tab === 'tail') && (
            <Card padded={false}>
              <div className={s.cardHead}><SectionHeader title="Long-Tail High-Intent" subtitle="Best conversion rate — lowest competition" /></div>
              <DataTable rows={data.long_tail_high_intent} cols={KW_COLS} keyFn={r => r.keyword} />
            </Card>
          )}
          {tab === 'winners' && (
            <Card padded={false}>
              <div className={s.cardHead}><SectionHeader title="Already Ranking Top 5" subtitle="Protect and strengthen these" /></div>
              <DataTable rows={top5} cols={KW_COLS} keyFn={(r, i) => i} />
            </Card>
          )}

          {/* Strategy */}
          <Card>
            <SectionHeader title="Strategic Priority Summary" />
            <div className={s.insights}>
              {data.strategic_priority_summary.map((t, i) => <InsightCard key={i} {...t} index={i} />)}
            </div>
          </Card>
        </motion.div>
      )}
      {!data && !loading && !error && (
        <Empty icon="🔑" title="No keyword data yet" body="Run an analysis to get search volume, intent, competition and position data for your market." />
      )}
    </div>
  );
}
