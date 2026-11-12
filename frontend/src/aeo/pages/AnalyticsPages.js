import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAeo, usePromptRows } from '../AeoContext';
import { EmptyAnalysis, useCompetitorRows } from '../parts';
import { PromptsCard, CompetitorsCard, IdeasCard, KpiCard, deltaLine, RED, AMBER, GREEN } from '../dashParts';
import { Icon } from '../Icon';
import { ManageAccounts } from '../ManageAccounts';
import { useSocialChannels } from '../social';
import { usePayment } from '../../context/PaymentContext';
import { BrandKitCard } from '../BrandKit';
import { ENGINES, citedCount, engineStats, hostOf, isReal, overallVis, sovRank, youSov } from '../utils';

const band = (v, cuts, labels, colors) => { const i = v < cuts[0] ? 0 : v < cuts[1] ? 1 : 2; return { label: labels[i], color: colors[i] }; };

/** The signed-in customer's company: logo, website, country, industry, plan. */
function CompanyStrip({ onBrand }) {
  const { state } = useApp();
  const { isPaid, planName } = usePayment();
  const { brand } = useAeo();
  const r = state.request;
  const domain = hostOf(r.url);
  const logo = brand.data?.logo_view_url;
  return (
    <div className="dv-card dv-strip" data-print-card data-testid="company-strip">
      {logo ? <img className="dv-logo" src={logo} alt={`${r.company_name || 'Company'} logo`} /> : <div className="dv-logo ph">{(r.company_name || 'A').trim()[0]?.toUpperCase()}</div>}
      <b>{r.company_name || 'Your business'}</b>
      {domain && <a href={`https://${domain}`} target="_blank" rel="noreferrer"><Icon name="globe" size={15} />{domain}</a>}
      {r.market && <span className="dv-mute"><Icon name="map-pin" size={15} />{r.market}</span>}
      {r.industry && <span className="dv-mute"><Icon name="briefcase" size={15} />{r.industry}</span>}
      <span className="dv-strip-r">
        <span className="dv-tiny dv-trk">Tracking: {ENGINES.join(', ')}</span>
        {brand.loaded && brand.complete && <button type="button" className="dv-link sm dv-nopr" onClick={onBrand}>Brand kit ✓</button>}
        <span className="dv-plan">{isPaid ? `${planName || 'Paid'} plan` : 'Free plan'}</span>
      </span>
    </div>
  );
}

function RunningCard() {
  return (
    <div className="dv-card dv-state" data-testid="running">
      <div className="dv-col" style={{ flex: 1, gap: 16, maxWidth: 520 }}>
        <div className="dv-tile pulse"><Icon name="sparkles" size={24} /></div>
        <h2>Analysing how AI sees your business…</h2>
        <p className="dv-lead">This usually takes under a minute.</p>
        <div className="dv-loader"><div /></div>
      </div>
      <div className="dv-col" style={{ flex: 1, gap: 10 }}>
        {ENGINES.map(e => <div key={e} className="dv-eline"><span className="dv-etick">…</span><span style={{ flex: 1, fontWeight: 600 }}>{e}</span><span style={{ fontSize: 12, color: '#4f46e5', fontWeight: 600 }}>Checking</span></div>)}
      </div>
    </div>
  );
}

function FirstRun() {
  const { state } = useApp();
  const { runAnalysis, quota } = useAeo();
  const locked = !!quota && quota.can_run === false;
  const co = state.request.company_name || 'your business';
  const gets = [['eye', 'AI visibility score'], ['users', 'Competitors AI recommends'], ['lightbulb', 'Ideas to improve']];
  return (
    <div className="dv-card dv-state" data-testid="first-run">
      <div className="dv-col" style={{ flex: 1, gap: 16, maxWidth: 540 }}>
        <div className="dv-tile"><Icon name="search" size={24} /></div>
        <h2>Let's see how AI tools talk about {co}</h2>
        <p className="dv-lead">We'll estimate how often ChatGPT, Perplexity, Gemini and Google AI Overviews recommend your business, show who they suggest instead, and give you simple ideas to get mentioned more.</p>
        <div className="dv-row-c" style={{ paddingTop: 8, gap: 16, flexWrap: 'wrap' }}>
          <button type="button" className="dv-btn primary xl" disabled={locked} onClick={runAnalysis} data-testid="run-first"><Icon name="play" size={16} />Run my first analysis</button>
          <span className="dv-tiny"><Icon name="clock" size={14} /> Takes about a minute</span>
        </div>
        {locked && <span className="dv-tiny">An analysis can be run once every {quota.interval_days || 30} days.</span>}
      </div>
      <div className="dv-col" style={{ flex: 1, gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#6b6a85' }}>What you'll get</span>
        {gets.map(([ic, t]) => <div key={t} className="dv-get"><div className="dv-ico"><Icon name={ic} size={17} /></div><span>{t}</span></div>)}
      </div>
    </div>
  );
}

function SocialCard({ soc, onManage }) {
  const { setPage } = useApp();
  const { saved } = useAeo();
  const approved = Object.values(saved.post_state || {}).filter(s => s && s.approved && !s.published).length;
  return (
    <section className="dv-card" data-print-card data-testid="social-card">
      <div className="dv-row-t dv-shd" style={{ alignItems: 'center' }}>
        <div className="dv-col" style={{ gap: 4 }}>
          <span className="dv-h2">Your social media</span>
          {approved > 0
            ? <span className="dv-sub"><b style={{ color: '#1c1b3a' }}>{approved} post{approved === 1 ? '' : 's'} approved</b> · Open the calendar to publish</span>
            : <a className="dv-flink" role="link" tabIndex={0} onClick={() => { setPage('aeoCalendar'); window.scrollTo(0, 0); }}>Review your posts in the calendar →</a>}
        </div>
        <div className="dv-nopr dv-social-act">
          <button type="button" className="dv-link" onClick={onManage} data-testid="manage-btn">Manage accounts</button>
          <button type="button" className="dv-btn primary" onClick={() => { setPage('aeoCalendar'); window.scrollTo(0, 0); }}><Icon name="calendar-days" size={16} />Open calendar</button>
        </div>
      </div>
      <div className="dv-chips">
        {soc.channels.map(c => (
          <div key={c.id} className="dv-chip" data-testid={`chip-${c.id}`}>
            <div className="dv-row-c" style={{ gap: 10, minWidth: 0 }}>
              <div className="dv-ico" style={{ background: c.bg, color: c.fg }}><Icon name={c.icon} size={17} /></div>
              <div className="dv-col" style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>{c.name}</span>
                {c.key === 'connected' && <span className="dv-st" style={{ color: '#059669' }}><i />{c.account}</span>}
                {c.key === 'connect' && <span className="dv-st" style={{ color: '#6b6a85' }}>Not connected</span>}
                {c.key === 'reconnect' && <span className="dv-st b" style={{ color: '#b45309' }}>Reconnect needed</span>}
                {c.key === 'progress' && <span className="dv-st b" style={{ color: '#4f46e5' }}>In progress</span>}
              </div>
            </div>
            {!soc.acting && c.key === 'connect' && <button type="button" className="dv-btn chipb dv-nopr" disabled={soc.connecting === c.id} onClick={() => soc.connect(c)}>{soc.connecting === c.id ? 'Opening…' : 'Connect'}</button>}
            {!soc.acting && c.key === 'reconnect' && <button type="button" className="dv-btn chipb warn dv-nopr" disabled={soc.connecting === c.id} onClick={() => soc.connect(c)}>Reconnect</button>}
            {!soc.acting && c.key === 'progress' && <button type="button" className="dv-link sm dv-nopr" disabled={soc.connecting === c.id} onClick={() => soc.connect(c)}>Try again</button>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function DashboardPage() {
  const { state, setPage } = useApp();
  const { analysis, prev, brand, loading } = useAeo();
  const { rows } = usePromptRows();
  const soc = useSocialChannels();
  const [manage, setManage] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const r = state.request;
  const go = (id) => () => { setPage(id); window.scrollTo(0, 0); };

  const real = rows.filter(isReal);
  const vis = overallVis(analysis?.prompts), pvis = overallVis(prev?.prompts);
  const sov = youSov(analysis), psov = youSov(prev), rk = sovRank(analysis);
  const cited = citedCount(analysis?.prompts), pcited = prev ? citedCount(prev.prompts) : null;
  const top5 = (analysis?.prompts || []).filter(p => isReal(p)).slice(0, 5);
  const covered = top5.filter(p => p.engines.some(e => e != null && e !== 0)).length;
  const totalAnswers = real.length * 4;
  const da = state.results.domainAuthority || state.results.fullReport?.domain_authority_strategy;
  const daNow = da?.current_da != null ? Number(da.current_da) : null;
  const co = r.company_name || 'your business';

  const visB = vis == null ? null : band(vis, [20, 50], ['Low', 'Fair', 'Good'], [RED, AMBER, GREEN]);
  const visText = vis == null ? '' : `${vis < 20 ? 'AI tools rarely recommend you yet.' : vis < 50 ? 'AI tools sometimes recommend you.' : 'AI tools often recommend you.'} You appear in ${covered} of ${top5.length} top questions.`;
  const sovColor = rk && rk.rank === 1 ? GREEN : AMBER;
  const citeB = cited === 0 ? { label: 'None yet', color: RED } : cited / Math.max(totalAnswers, 1) < 0.25 ? { label: 'A few', color: AMBER } : { label: 'Often', color: GREEN };
  const daB = daNow == null ? null : band(daNow, [40, 60], ['Needs work', 'Fair', 'Strong'], [AMBER, AMBER, GREEN]);

  return (
    <div className="dv-page">
      <CompanyStrip onBrand={() => setBrandOpen(v => !v)} />
      <BrandKitCard key={brandOpen ? 'open' : 'closed'} hideWhenReady defaultOpen={brandOpen} onClose={() => setBrandOpen(false)} />

      {loading ? <RunningCard /> : !analysis ? <FirstRun /> : (
        <>
          <section className="dv-kpis">
            <KpiCard title="AI visibility" value={vis ?? '—'} unit="/100" label={visB?.label} labelColor={visB?.color} delta={deltaLine(vis, pvis)} pct={vis || 0} barColor={visB?.color} text={visText}
              linkText="View all prompts →" onLink={go('aeoPrompts')} />
            <KpiCard title="Share of voice" value={sov != null ? sov + '%' : '—'} label={rk ? `#${rk.rank} of ${rk.of}` : ''} labelColor={sovColor} delta={deltaLine(sov, psov, '%')} pct={sov || 0} barColor={sovColor}
              text={`How often AI suggests you vs your competitors${r.market ? ` in ${r.market}` : ''}.`} linkText="View all competitors →" onLink={go('aeoCompetitors')} />
            <KpiCard title="Times AI linked to you" value={cited} unit={` of ${totalAnswers}`} label={citeB.label} labelColor={citeB.color} delta={deltaLine(cited, pcited)} pct={totalAnswers ? cited / totalAnswers * 100 : 0} barColor={citeB.color}
              text="Answers where an AI tool linked to your website." linkText="Go to AI Engines →" onLink={go('aeoEngines')} />
            {daNow == null ? (
              <KpiCard title="Website strength" sub="Domain Authority" text="How much Google and AI trust your website." >
                <span className="dv-notchecked">Not checked yet</span><div className="dv-meter" />
                <button type="button" className="dv-btn dv-nopr" style={{ marginTop: 12, alignSelf: 'flex-start' }} onClick={go('da')}>Check now</button>
              </KpiCard>
            ) : (
              <KpiCard title="Website strength" sub="Domain Authority" value={daNow} unit="/100" label={daB.label} labelColor={daB.color} delta={{ text: 'Latest check', color: '#6b6a85' }} pct={daNow} barColor={daB.color}
                text="How much Google and AI trust your website." linkText="Go to Domain Authority →" onLink={go('da')} />
            )}
          </section>
          <SocialCard soc={soc} onManage={() => setManage(true)} />
          <PromptsCard />
          <div className="dv-two">
            <CompetitorsCard />
            <IdeasCard soc={soc} />
          </div>
        </>
      )}
      {manage && <ManageAccounts soc={soc} onClose={() => setManage(false)} />}
    </div>
  );
}

export function PromptsPage() {
  const { analysis } = useAeo();
  const { pendingCount } = usePromptRows();
  return analysis || pendingCount ? <PromptsCard /> : <EmptyAnalysis />;
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
