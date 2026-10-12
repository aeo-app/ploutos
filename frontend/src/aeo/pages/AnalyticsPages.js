import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAeo, usePromptRows } from '../AeoContext';
import { CompetitorsMini, EmptyAnalysis, Kpi, PromptsCard, SelectionBar, SocialChannelsCard, useCompetitorRows } from '../parts';
import { ENGINES, citedCount, engineStats, hostOf, isReal, overallVis, sovRank, youSov } from '../utils';

const delta = (cur, prev, unit = '') => {
  if (cur == null || prev == null) return { text: '', color: '#059669' };
  const d = cur - prev;
  if (d === 0) return { text: '±0' + unit, color: '#6b6a85' };
  return { text: (d > 0 ? '+' : '−') + Math.abs(d) + unit, color: d > 0 ? '#059669' : '#dc2626' };
};

export function DashboardPage() {
  const { state } = useApp();
  const { analysis, prev } = useAeo();
  const { rows } = usePromptRows();
  const r = state.request;
  const domain = hostOf(r.url);

  const real = rows.filter(isReal);
  const vis = overallVis(analysis?.prompts), pvis = overallVis(prev?.prompts);
  const sov = youSov(analysis), psov = youSov(prev), rk = sovRank(analysis);
  const cited = citedCount(analysis?.prompts), pcited = prev ? citedCount(prev.prompts) : null;
  const top10 = (analysis?.prompts || []).filter(p => !p.locked).slice(0, 10);
  const covered = top10.filter(p => p.engines.some(e => e != null && e !== 0)).length;
  const dv = delta(vis, pvis), ds = delta(sov, psov, ' pts'), dc = delta(cited, pcited);

  return (
    <>
      <section className="ae-card ae-facts" style={{ display: 'grid', flexDirection: 'unset' }}>
        <div className="ae-fact"><span className="ae-eyebrow">Website</span><b>{domain ? <a href={`https://${domain}`} target="_blank" rel="noreferrer">{domain}</a> : '—'}</b><span>Your account's locked domain</span></div>
        <div className="ae-fact"><span className="ae-eyebrow">Country</span><b>{r.market || '—'}</b><span>Market analysed</span></div>
        <div className="ae-fact"><span className="ae-eyebrow">Industry</span><b>{r.industry || '—'}</b><span>From your last analysis</span></div>
        <div className="ae-fact"><span className="ae-eyebrow">Engines tracked</span><b>{ENGINES.join(', ')}</b></div>
      </section>

      {analysis ? (
        <section className="ae-kpis">
          <Kpi label="AI VISIBILITY SCORE" value={vis ?? '—'} color="#4f46e5" delta={dv.text} deltaColor={dv.color} sub={`of 100, across 4 engines · ${real.length} prompts`} />
          <Kpi label="SHARE OF VOICE" value={sov != null ? sov + '%' : '—'} delta={ds.text} deltaColor={ds.color} sub={rk ? `#${rk.rank} of ${rk.of} in ${r.market || 'your market'}` : 'vs tracked competitors'} />
          <Kpi label="PROMPTS WITH PRESENCE" value={`${covered}/${top10.length}`} sub={`in current Top ${top10.length}`} />
          <Kpi label="CITED ANSWERS" value={cited} color="#0e9f6e" delta={dc.text} deltaColor={dc.color} sub={`of ${real.length * 4} engine answers (estimate)`} />
        </section>
      ) : null}

      {analysis ? <><PromptsCard /><div className="ae-grid2"><CompetitorsMini /><SocialChannelsCard /></div></> : <><EmptyAnalysis /><div className="ae-grid2"><CompetitorsMini /><SocialChannelsCard /></div></>}
      <SelectionBar />
    </>
  );
}

export function PromptsPage() {
  return <><PromptsCard /><SelectionBar /></>;
}

export function CompetitorsAeoPage() {
  const { analysis, addCompetitor, removeCompetitor } = useAeo();
  const { state } = useApp();
  const { rows, max } = useCompetitorRows();
  const [name, setName] = useState('');
  const [dom, setDom] = useState('');
  const add = () => { addCompetitor(name, dom); setName(''); setDom(''); };
  if (!analysis && !rows.length) return <EmptyAnalysis />;
  const total = analysis?.prompts_total || (analysis?.prompts || []).filter(p => !p.locked).length;
  return (
    <section className="ae-card" style={{ gap: 16 }}>
      <div className="ae-col"><h2>Who AI recommends instead of you</h2><span className="ae-sub">Across the {total ? `Top ${total}` : 'tracked'} prompts in {state.request.market || 'your market'}</span></div>
      <div className="ae-scroll">
        <div className="ae-cthead"><span>COMPANY</span><span>SHARE OF VOICE</span><span style={{ textAlign: 'right' }}>DA</span><span style={{ textAlign: 'right' }}>PROMPTS CITED</span><span>STRONGEST ENGINE</span><span /></div>
        {rows.map(c => (
          <div key={c.name} className="ae-ctrow">
            <div className="ae-col" style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontWeight: 700, color: c.is_you ? '#3730a3' : 'inherit' }}>{c.name}{c.is_you ? ' (you)' : ''}</span>{c.custom && <span className="ae-chip">ADDED</span>}</div>
              <span style={{ fontSize: 12, color: 'var(--ae-faint)' }}>{c.domain}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="ae-bar" style={{ flex: 1 }}><i style={{ width: (c.share_of_voice / max * 100) + '%', background: c.is_you ? '#4f46e5' : '#c7c9e8' }} /></div>
              <span className="ae-mono" style={{ fontSize: 12.5, fontWeight: 700, width: 36, textAlign: 'right' }}>{c.pending ? '…' : c.share_of_voice + '%'}</span>
            </div>
            <span className="ae-mono" style={{ textAlign: 'right', fontWeight: 700 }}>{c.pending ? '…' : c.domain_authority}</span>
            <span className="ae-mono" style={{ textAlign: 'right' }}>{c.pending ? '…' : `${c.prompts_cited}/${total}`}</span>
            <span style={{ fontWeight: 600 }}>{c.pending ? 'Pending next run' : c.top_engine || '—'}</span>
            <span style={{ textAlign: 'right' }}>{!c.is_you && <button className="ae-linkbtn" onClick={() => removeCompetitor(c.name)}>Remove</button>}</span>
          </div>
        ))}
      </div>
      <div className="ae-add" style={{ gap: 8 }}>
        <input className="ae-input" style={{ minWidth: 160 }} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Competitor name" maxLength={120} />
        <input className="ae-input" style={{ minWidth: 160 }} value={dom} onChange={e => setDom(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="website.com" maxLength={120} />
        <button className="ae-btn primary" onClick={add}>Add competitor</button>
        <span className="ae-note" style={{ flexBasis: '100%' }}>Added competitors are included in share of voice on the next run.</span>
      </div>
      {analysis?.disclaimer && <span className="ae-note">{analysis.disclaimer}</span>}
    </section>
  );
}

export function EnginesPage() {
  const { analysis } = useAeo();
  if (!analysis) return <EmptyAnalysis />;
  return (
    <>
      <section className="ae-engs">
        {ENGINES.map((name, j) => {
          const st = engineStats(analysis.prompts, j);
          return (
            <div key={name} className="ae-card" style={{ padding: 22, gap: 16 }}>
              <div className="ae-row" style={{ alignItems: 'baseline', flexWrap: 'nowrap' }}><span style={{ fontSize: 17, fontWeight: 800 }}>{name}</span><span style={{ fontSize: 26, fontWeight: 800, color: '#4f46e5' }}>{st.vis}%</span></div>
              <div className="ae-3">
                <div style={{ background: '#ecfdf5', color: '#065f46' }}><b>{st.cited}</b>Cited</div>
                <div style={{ background: '#fffbeb', color: '#92400e' }}><b>{st.mentioned}</b>Mentioned</div>
                <div style={{ background: '#f6f6fb', color: '#4a4966' }}><b>{st.absent}</b>Absent</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div className="ae-row" style={{ flexWrap: 'nowrap' }}><span style={{ color: 'var(--ae-mute)' }}>Average position when cited</span><b>{st.avg}</b></div>
                <div className="ae-row" style={{ flexWrap: 'nowrap' }}><span style={{ color: 'var(--ae-mute)' }}>Most-recommended competitor</span><b style={{ textAlign: 'right' }}>{analysis.engine_leaders?.[j] || '—'}</b></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--ae-line2)', paddingTop: 14 }}>
                <span className="ae-eyebrow">Biggest gaps</span>
                {st.gaps.length === 0 && <span className="ae-sub">No gaps — you appear for every tracked prompt.</span>}
                {st.gaps.map(g => <div key={g.text} className="ae-row" style={{ flexWrap: 'nowrap', fontSize: 13, gap: 10 }}><b style={{ fontWeight: 600 }}>{g.text}</b><span className="ae-mono" style={{ color: 'var(--ae-mute)', flexShrink: 0 }}>{g.volume_estimate.toLocaleString()}/mo</span></div>)}
              </div>
            </div>
          );
        })}
      </section>
      {analysis.disclaimer && <span className="ae-note">{analysis.disclaimer}</span>}
    </>
  );
}
