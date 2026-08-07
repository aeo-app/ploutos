import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { seoApi } from '../api/seoApi';
import { AnalyseForm } from '../components/forms/AnalyseForm';
import { Card, Badge, DataTable, ProgressBar, SectionHeader, SkeletonCard, Empty, ErrorCard, InsightCard, StatTile } from '../components/ui/UI';
import { UnlockModal } from '../components/payment/UnlockModal';
import { UnlockBanner } from '../components/payment/UnlockBanner';
import s from './DataPage.module.css';

const DIFF_BADGE = { Easy: 'success', Medium: 'warning', Hard: 'danger' };

function DAGauge({ current, t6, t12 }) {
  const max = Math.max(t12 + 15, 100);
  const pct = v => `${Math.min(100, (v / max) * 100).toFixed(1)}%`;
  return (
    <Card>
      <SectionHeader title="Domain Authority Trajectory" subtitle="Estimated current DA vs 6 and 12-month targets" />
      <div className={s.daGaugeRow}>
        {[
          { label: 'Current DA',      val: current, color: 'var(--c-danger)' },
          { label: '6-Month Target',  val: t6,      color: 'var(--c-warning)' },
          { label: '12-Month Target', val: t12,     color: 'var(--c-success)' },
        ].map(item => (
          <Card key={item.label} className={s.daMilestone} padded={false}>
            <div className={s.daMilestoneVal} style={{ color: item.color }}>{item.val}</div>
            <div className={s.daMilestoneLbl}>{item.label}</div>
          </Card>
        ))}
      </div>

      {/* Visual bar */}
      <div className={s.daBar}>
        <motion.div
          className={s.daBarFill}
          style={{ background: 'var(--grad-brand)' }}
          initial={{ width: 0 }}
          animate={{ width: pct(current) }}
          transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
        />
        {/* 6m marker */}
        <div className={s.daMarker} style={{ left: pct(t6), background: 'var(--c-warning)' }}>
          <div className={s.daMarkerLabel} style={{ color: 'var(--c-warning)', left: '50%' }}>6m: {t6}</div>
        </div>
        {/* 12m marker */}
        <div className={s.daMarker} style={{ left: pct(t12), background: 'var(--c-success)' }}>
          <div className={s.daMarkerLabel} style={{ color: 'var(--c-success)', left: '50%' }}>12m: {t12}</div>
        </div>
      </div>

      <p style={{ fontSize: '13px', color: 'var(--c-slate-500)', textAlign: 'center' }}>
        +{t6 - current} pts in 6 months · +{t12 - current} pts in 12 months
      </p>
    </Card>
  );
}

export function DomainAuthorityResultView({ data }) {
  // Group backlinks by pillar
  const pillars = data?.backlink_opportunities?.reduce((acc, b) => {
    (acc[b.pillar] = acc[b.pillar] || []).push(b);
    return acc;
  }, {}) || {};

  return (
    <motion.div className={s.sections} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

      <DAGauge current={data.current_da} t6={data.target_da_6m} t12={data.target_da_12m} />

      {/* Gap Analysis */}
      <Card padded={false}>
        <div className={s.cardHead}>
          <SectionHeader title="Gap Analysis" subtitle="Current state vs 6-month, 12-month targets and competitor benchmark" />
        </div>
        <DataTable
          rows={data.gap_analysis}
          keyFn={r => r.metric}
          cols={[
            { key: 'metric',             label: 'Metric',         render: v => <strong style={{ color: 'var(--c-slate-800)' }}>{v}</strong> },
            { key: 'current',            label: 'Current',        render: v => <span style={{ color: 'var(--c-danger)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{v}</span> },
            { key: 'six_month_target',   label: '6-Month Target', render: v => <span style={{ color: 'var(--c-warning)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{v}</span> },
            { key: 'twelve_month_target',label: '12-Month Target',render: v => <span style={{ color: 'var(--c-success)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{v}</span> },
            { key: 'benchmark',          label: 'Benchmark',      render: v => <span style={{ color: 'var(--c-slate-500)' }}>{v}</span> },
          ]}
        />
      </Card>

      {/* Backlinks by pillar */}
      {Object.entries(pillars).map(([pillar, ops]) => (
        <Card key={pillar} padded={false}>
          <div className={s.cardHead}>
            <SectionHeader
              title={`${pillar} Links`}
              subtitle={`${ops.length} opportunities`}
              right={<Badge variant="brand">{ops.length}</Badge>}
            />
          </div>
          <DataTable
            rows={ops}
            keyFn={(_, i) => `${pillar}-${i}`}
            cols={[
              { key: 'action',                 label: 'Action',       render: v => <span style={{ color: 'var(--c-slate-800)' }}>{v}</span> },
              { key: 'platform_or_target',     label: 'Target',       render: v => <span style={{ color: 'var(--c-slate-600)' }}>{v}</span> },
              { key: 'estimated_da',           label: 'Est. DA',      render: v => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--c-indigo-600)' }}>{v}</span> },
              { key: 'difficulty',             label: 'Difficulty',   render: v => <Badge variant={DIFF_BADGE[v] || 'default'}>{v}</Badge> },
              { key: 'estimated_monthly_links',label: 'Links/Mo.',    render: v => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--c-slate-500)' }}>{v ?? '—'}</span> },
            ]}
          />
        </Card>
      ))}

      {/* Priority actions */}
      <Card>
        <SectionHeader title="Top 5 Priority Actions" subtitle="Highest-impact moves to grow domain authority" />
        <div className={s.insights}>
          {data.top_5_priority_actions.map((a, i) => <InsightCard key={i} {...a} index={i} />)}
        </div>
      </Card>
    </motion.div>
  );
}

export function DomainAuthorityPage() {
  const { state, runApi, toast } = useApp();
  const loading = state.loading.domainAuthority;
  const error   = state.errors.domainAuthority;
  const data    = state.results.domainAuthority || state.results.fullReport?.domain_authority_strategy;
  const [showUnlock, setShowUnlock] = useState(false);

  const run = async (req) => {
    try { await runApi('domainAuthority', seoApi.domainAuthority, req); toast({ type: 'success', message: '✓ DA strategy generated.' }); }
    catch (_) {}
  };

  const lockedCount = data
    ? [...(data.gap_analysis || []), ...(data.backlink_opportunities || []), ...(data.top_5_priority_actions || [])]
        .filter(r => r.locked).length
    : 0;

  return (
    <div className={s.page}>
      <AnalyseForm onSubmit={run} loading={loading} buttonLabel="Build DA Strategy" compact={!!data} />
      {loading && <div className={s.skeletons}>{[1,2,3].map(i => <SkeletonCard key={i} rows={5}/>)}</div>}
      {error && !loading && <ErrorCard message={error} />}

      {data && !loading && <DomainAuthorityResultView data={data} />}
      {data && !loading && lockedCount > 0 && (
        <UnlockBanner count={lockedCount} label="insight" onUnlock={() => setShowUnlock(true)} />
      )}

      {!data && !loading && !error && (
        <Empty icon="📈" title="No DA strategy yet" body="Run an analysis to get a full domain authority growth plan with backlink opportunities and a 12-month roadmap." />
      )}

      {showUnlock && (
        <UnlockModal
          title="Unlock domain authority strategy"
          onClose={() => setShowUnlock(false)}
          onUnlocked={() => { setShowUnlock(false); run(state.request); }}
        />
      )}
    </div>
  );
}
