import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { seoApi } from '../../api/seoApi';
import { aeoApi } from '../../api/aeoApi';
import { useAeo } from '../AeoContext';
import { copyToClipboard, hostOf } from '../utils';
import { BrandKitCard } from '../BrandKit';

function RunCard({ title, text, label, loading, onRun }) {
  return (
    <div className="ae-empty">
      <h2>{loading ? 'Working on it…' : title}</h2>
      <p>{loading ? 'This usually takes under a minute.' : text}</p>
      {loading ? <div className="ae-dots"><i /><i /><i /></div> : <button className="ae-btn primary" onClick={onRun}>{label}</button>}
    </div>
  );
}

/* ── Domain authority ───────────────────────────────────────────────────── */
export function DomainAuthorityAeoPage() {
  const { state, runApi, requirePayment } = useApp();
  const { analysis } = useAeo();
  const da = state.results.domainAuthority || state.results.fullReport?.domain_authority_strategy;
  const loading = state.loading.domainAuthority;
  const run = () => runApi('domainAuthority', seoApi.domainAuthority, state.request).catch(() => {});

  if (!da) {
    return <RunCard loading={loading} title="Analyse your domain authority" label="Run domain authority analysis"
      text="We estimate your domain authority, set 6 and 12-month targets, and list the backlink opportunities most likely to move it." onRun={run} />;
  }

  const me = (analysis?.competitors || []).find(c => c.is_you);
  const bars = [
    { name: 'You', da: da.current_da, you: true },
    ...(analysis?.competitors || []).filter(c => !c.is_you).map(c => ({ name: c.name, da: c.domain_authority })),
  ].sort((a, b) => b.da - a.da);
  const leader = bars.find(b => !b.you);

  return (
    <>
      <section className="ae-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
        <div className="ae-kpi"><span className="ae-eyebrow">Current DA</span><b style={{ fontSize: 38, fontWeight: 800, color: '#4f46e5' }}>{da.current_da}</b><span className="ae-sub">Estimated{me ? '' : ''}</span></div>
        <div className="ae-kpi"><span className="ae-eyebrow">6-month target</span><b style={{ fontSize: 38, fontWeight: 800 }}>{da.target_da_6m}</b><span className="ae-sub">Realistic with steady link building</span></div>
        <div className="ae-kpi"><span className="ae-eyebrow">12-month target</span><b style={{ fontSize: 38, fontWeight: 800, color: '#0e9f6e' }}>{da.target_da_12m}</b><span className="ae-sub">{leader ? `Top rival is ${leader.da}` : 'Long-term goal'}</span></div>
      </section>

      <div className="ae-grid2">
        <section className="ae-card">
          <h2>Domain authority vs competitors</h2>
          {bars.length === 1 && <span className="ae-sub">Run the AI visibility analysis to compare against competitors.</span>}
          {bars.map(d => (
            <div key={d.name} className="ae-dabar">
              <span style={{ fontWeight: 700, color: d.you ? '#3730a3' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
              <div className="ae-bar" style={{ height: 10 }}><i style={{ width: d.da + '%', background: d.you ? '#4f46e5' : '#c7c9e8' }} /></div>
              <span className="ae-mono" style={{ textAlign: 'right', fontWeight: 700 }}>{d.da}</span>
            </div>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--ae-line2)', paddingTop: 14 }}>
            <span className="ae-eyebrow">Roadmap to {da.target_da_12m}</span>
            <div className="ae-road">
              {(da.gap_analysis || []).slice(0, 4).map(g => (
                <div key={g.metric} onClick={g.locked ? () => requirePayment('domainAuthority') : undefined} style={g.locked ? { cursor: 'pointer', opacity: .7 } : undefined}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#4f46e5' }}>{g.metric}</span>
                  <b style={{ fontSize: 18, fontWeight: 800 }}>{g.locked ? '🔒' : `${g.current} → ${g.twelve_month_target}`}</b>
                  <span style={{ fontSize: 11.5, color: 'var(--ae-mute)' }}>{g.locked ? 'Unlock' : `6 mo: ${g.six_month_target}`}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="ae-card">
          <div className="ae-col"><h2>Backlink opportunities</h2><span className="ae-sub">Where to earn links that lift your domain authority</span></div>
          {(da.backlink_opportunities || []).map((b, i) => (
            <div key={i} onClick={b.locked ? () => requirePayment('domainAuthority') : undefined}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 50px 90px', gap: 12, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--ae-line2)', fontSize: 13.5, cursor: b.locked ? 'pointer' : 'default', opacity: b.locked ? .7 : 1 }}>
              <div className="ae-col"><b>{b.locked ? '🔒 Locked' : b.platform_or_target}</b><span style={{ fontSize: 12, color: 'var(--ae-faint)' }}>{b.locked ? 'Unlock to see this opportunity' : `${b.pillar} · ${b.action}`}</span></div>
              <span className="ae-mono" style={{ fontWeight: 700, textAlign: 'right' }}>{b.locked ? '' : b.estimated_da}</span>
              <span style={{ fontSize: 12, color: 'var(--ae-mute)', textAlign: 'right' }}>{b.locked ? '' : b.difficulty}</span>
            </div>
          ))}
        </section>
      </div>

      {(da.top_5_priority_actions || []).length > 0 && (
        <section className="ae-card">
          <h2>Priority actions</h2>
          {da.top_5_priority_actions.map((a, i) => (
            <div key={i} className="ae-line" style={{ flexDirection: 'column', gap: 2 }}><b>{a.locked ? '🔒 Locked' : a.insight}</b>{!a.locked && <span className="ae-sub">{a.detail}</span>}</div>
          ))}
        </section>
      )}
    </>
  );
}

/* ── Company profile ────────────────────────────────────────────────────── */
const CHECK_COLOR = { good: '#059669', warn: '#d97706', bad: '#dc2626', info: '#1c1b3a' };

function SiteChecks({ url }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = useCallback(async () => {
    if (!url) return;
    setBusy(true); setErr('');
    try { setData(await aeoApi.siteChecks(url)); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }, [url]);
  useEffect(() => { run(); }, [run]);

  return (
    <>
      <div className="ae-row" style={{ gap: 8 }}>
        <span className="ae-eyebrow">AI-readiness checks</span>
        <button className="ae-btn sm" disabled={busy} onClick={run}>{busy ? 'Checking…' : 'Re-check'}</button>
      </div>
      {err && <span className="ae-err">{err}</span>}
      {data?.error && <span className="ae-err">{data.error}</span>}
      {(data?.checks || []).map(c => (
        <div key={c.key} className="ae-line"><span style={{ color: '#4a4966' }}>{c.label}</span><b style={{ color: CHECK_COLOR[c.status] || CHECK_COLOR.info, textAlign: 'right' }}>{c.value}</b></div>
      ))}
      {!data && busy && <span className="ae-sub">Fetching your website…</span>}
    </>
  );
}

export function CompanyAeoPage() {
  const { state, runApi, requirePayment, toast } = useApp();
  const [copied, setCopied] = useState(null);
  const r = state.request;
  const prof = state.results.profile || state.results.fullReport?.company_profile;
  const loading = state.loading.profile;
  const domain = hostOf(r.url);
  const run = () => runApi('profile', seoApi.profile, r).catch(() => {});
  const locked = new Set(prof?.locked_fields || []);

  const facts = [
    ['COMPANY', r.company_name], ['WEBSITE', domain], ['COUNTRY / MARKET', r.market], ['INDUSTRY', r.industry],
    ['TAGLINE', prof?.tagline],
  ].filter(([, v]) => v);

  const descs = prof ? [
    ['Tagline · short', prof.tagline, false],
    ['Google Business Profile description', prof.google_business_description, locked.has('google_business_description')],
    ['LinkedIn About', prof.linkedin_overview, locked.has('linkedin_overview')],
  ].filter(([, t]) => t) : [];

  const copy = async (i, text) => {
    const ok = await copyToClipboard(text);
    if (ok) { setCopied(i); setTimeout(() => setCopied(null), 1500); } else toast({ type: 'error', message: 'Could not copy — select the text and copy it manually.' });
  };

  return (
    <>
      <BrandKitCard />
      <div className="ae-grid2">
        <section className="ae-card">
          <div className="ae-row" style={{ alignItems: 'baseline' }}><h2>Website</h2>{domain && <a href={`https://${domain}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700 }}>{domain} ↗</a>}</div>
          <SiteChecks url={r.url} />
        </section>
        <section className="ae-card">
          <h2>Company details</h2>
          <div className="ae-facts" style={{ gap: '14px 20px' }}>
            {facts.map(([l, v]) => <div key={l} className="ae-fact"><span className="ae-eyebrow">{l}</span><span style={{ fontSize: 14, fontWeight: 600 }}>{v}</span></div>)}
          </div>
          {prof && (
            <>
              <div className="ae-fact"><span className="ae-eyebrow">Services &amp; specialties</span><div className="ae-tags">{(prof.linkedin_specialties || []).map(s => <span key={s}>{s}</span>)}</div></div>
              <div className="ae-fact"><span className="ae-eyebrow">Google Business categories</span><div className="ae-tags">{(prof.google_business_categories || []).map(s => <span key={s}>{s}</span>)}</div></div>
            </>
          )}
        </section>
      </div>

      {!prof ? (
        <RunCard loading={loading} title="Generate your ready-to-paste descriptions"
          text="We write a short description, a Google Business Profile description and a LinkedIn About section — worded so AI engines see one consistent entity."
          label="Generate descriptions" onRun={run} />
      ) : (
        <section className="ae-card">
          <div className="ae-row"><div className="ae-col"><h2>Ready-to-paste descriptions</h2><span className="ae-sub">Use the same wording everywhere so AI engines see a consistent entity</span></div>
            <button className="ae-btn sm" disabled={loading} onClick={run}>{loading ? 'Regenerating…' : 'Regenerate'}</button></div>
          {descs.map(([label, text, isLocked], i) => (
            <div key={label} className="ae-desc">
              <div className="ae-row" style={{ flexWrap: 'nowrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5' }}>{label}{text && !isLocked ? ` · ${text.length} characters` : ''}</span>
                {isLocked ? <button className="ae-btn sm" onClick={() => requirePayment('profile')}>🔒 Unlock</button>
                  : <button className="ae-btn sm" onClick={() => copy(i, text)}>{copied === i ? 'Copied' : 'Copy'}</button>}
              </div>
              <span style={{ fontSize: 14, lineHeight: 1.55, filter: isLocked ? 'blur(4px)' : 'none', userSelect: isLocked ? 'none' : 'auto' }}>{text}</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
