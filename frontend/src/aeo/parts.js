import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { socialPublishApi } from '../api/socialPublishApi';
import { rememberPageBeforeOAuthRedirect } from '../utils/oauthReturn';
import { useAeo, usePromptRows } from './AeoContext';
import { ENG_SHORT, INTENT, SOCIAL_HELP, SOCIAL_ORDER, CHANNELS, engCell, isReal, promptVis, num } from './utils';

export function EngCell({ x, j }) {
  const c = engCell(x, j);
  return <span className={`ae-eng ${c.cls}`} title={c.title}>{c.label}</span>;
}

export function Kpi({ label, value, color, delta, deltaColor, sub }) {
  return (
    <div className="ae-kpi">
      <span className="ae-eyebrow">{label}</span>
      <div className="ae-kpi-v"><b style={{ color: color || 'var(--ae-text)' }}>{value}</b>{delta ? <span style={{ color: deltaColor }}>{delta}</span> : null}</div>
      <span className="ae-sub">{sub}</span>
    </div>
  );
}

export function EmptyAnalysis({ title, text }) {
  const { runAnalysis, loading } = useAeo();
  return (
    <div className="ae-empty">
      <h2>{loading ? 'Analysing how AI sees your business…' : (title || 'Run your first analysis')}</h2>
      <p>{loading ? 'This usually takes under a minute. We are building your prompt list, estimating visibility in each engine and sizing up your competitors.'
        : (text || 'We will build the list of questions people ask AI about your business, estimate where you appear in ChatGPT, Perplexity, Gemini and AI Overviews, and compare you with competitors.')}</p>
      {loading ? <div className="ae-dots"><i /><i /><i /></div>
        : <button className="ae-btn primary" onClick={runAnalysis}>Run analysis</button>}
    </div>
  );
}

/* ── Top prompts ─────────────────────────────────────────────────────────── */
export function PromptsCard() {
  const { analysis, saved, addPrompt, removePrompt, togglePrompt, loading } = useAeo();
  const { rows, pendingCount } = usePromptRows();
  const { setPage, requirePayment } = useApp();
  const [topN, setTopN] = useState(10);
  const [draft, setDraft] = useState('');

  if (!analysis && !pendingCount) return <EmptyAnalysis />;

  const shown = [...rows.filter(r => r.pending), ...rows.filter(r => !r.pending).slice(0, topN)];
  const sel = saved.selected_prompts;
  const add = () => { addPrompt(draft); setDraft(''); };
  const rank = () => { if (sel.length) { setPage('aeoStrategy'); window.scrollTo(0, 0); } };

  return (
    <section className="ae-card" style={{ gap: 16 }}>
      <div className="ae-row">
        <div className="ae-col"><h2>Top prompts for your business</h2><span className="ae-sub">Select the prompts you want to win, then click Rank Me High</span></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div className="ae-tabs">
            {[5, 10, 20].map(n => <button key={n} className={n === topN ? 'on' : ''} onClick={() => setTopN(n)}>Top {n}</button>)}
          </div>
          <button className="ae-btn primary" style={{ fontWeight: 800, padding: '10px 18px', ...(sel.length ? {} : { background: '#e8e8f0', color: '#9a99b0' }) }} onClick={rank} disabled={!sel.length}>Rank Me High</button>
        </div>
      </div>

      <div className="ae-add">
        <input className="ae-input" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Add your own prompt, e.g. “Best [your service] near me?”" maxLength={200} />
        <button className="ae-btn primary" onClick={add}>Add prompt</button>
        <span className="ae-note" style={{ flexBasis: '100%' }}>Your prompts are tracked alongside the Top list and analysed on the next run{loading ? ' (running now…)' : ''}.</span>
      </div>

      <div className="ae-scroll">
        <div className="ae-phead">
          <span /><span>#</span><span>PROMPT</span><span>INTENT</span><span style={{ textAlign: 'right' }}>VOL/MO</span>
          <div className="ae-eng4">{ENG_SHORT.map(e => <span key={e}>{e}</span>)}</div>
          <span style={{ textAlign: 'right' }}>VISIBILITY</span>
        </div>
        {shown.map((p, i) => {
          const on = sel.includes(p.text);
          const real = isReal(p);
          const vis = real ? promptVis(p) : null;
          const ic = INTENT[p.intent] || ['#f1f1f7', '#4a4966'];
          return (
            <div key={p.text + i} className={`ae-prow ${on ? 'sel' : ''} ${p.locked ? 'locked' : ''}`}
              onClick={() => (p.locked ? requirePayment('aeoPrompts') : togglePrompt(p.text))}>
              <span className="ae-box">{on ? '✓' : ''}</span>
              <span className="ae-mono" style={{ fontSize: 12, color: 'var(--ae-faint)' }}>{p.pending || p.custom ? '★' : String(p.rank || i + 1).padStart(2, '0')}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{p.text}</span>
                {p.custom && <span className="ae-chip">YOURS</span>}
                {p.locked && <span className="ae-chip" style={{ background: '#b45309' }}>🔒 UNLOCK</span>}
                {p.custom && <button className="ae-linkbtn" onClick={e => { e.stopPropagation(); removePrompt(p.text); }}>Remove</button>}
              </div>
              <span><span className="ae-pill" style={{ background: ic[0], color: ic[1] }}>{p.intent}</span></span>
              <span className="ae-mono" style={{ textAlign: 'right', fontSize: 12.5, color: '#4a4966' }}>{p.volume_estimate ? num(p.volume_estimate) : '—'}</span>
              <div className="ae-eng4">{(p.locked ? [null, null, null, null] : p.engines).map((x, j) => <EngCell key={j} x={x} j={j} />)}</div>
              <div className="ae-vis"><i><s style={{ width: (vis || 0) + '%' }} /></i><b style={{ fontSize: 12.5, width: 34, textAlign: 'right' }}>{vis == null ? '—' : vis + '%'}</b></div>
            </div>
          );
        })}
      </div>

      <div className="ae-legend">
        <span><em style={{ background: '#d1fae5' }} />Cited (position shown)</span>
        <span><em style={{ background: '#fef3c7' }} />Mentioned, not linked</span>
        <span><em style={{ background: '#f1f1f7' }} />Absent</span>
        <span><em style={{ border: '1px dashed #a5a4c4' }} />Pending next run</span>
      </div>
      {analysis?.disclaimer && <span className="ae-note">{analysis.disclaimer}</span>}
    </section>
  );
}

export function SelectionBar() {
  const { saved, clearSelection } = useAeo();
  const { setPage } = useApp();
  const n = saved.selected_prompts.length;
  if (!n) return null;
  return (
    <div className="ae-selbar">
      <span style={{ fontSize: 14, fontWeight: 600 }}>{n} {n === 1 ? 'prompt' : 'prompts'} selected</span>
      <button className="clr" onClick={clearSelection}>Clear</button>
      <button className="go" onClick={() => { setPage('aeoStrategy'); window.scrollTo(0, 0); }}>Rank Me High →</button>
    </div>
  );
}

/* ── Competitors ─────────────────────────────────────────────────────────── */
export function useCompetitorRows() {
  const { analysis, saved } = useAeo();
  const base = analysis?.competitors || [];
  const have = new Set(base.map(c => c.name.toLowerCase()));
  const pending = saved.custom_competitors.filter(c => !have.has(c.name.toLowerCase()))
    .map(c => ({ name: c.name, domain: c.domain || 'Domain pending', share_of_voice: 0, domain_authority: 0, prompts_cited: 0, top_engine: '', is_you: false, custom: true, pending: true }));
  const rows = [...base, ...pending];
  const max = Math.max(1, ...rows.map(r => r.share_of_voice));
  return { rows, max };
}

export function CompetitorsMini() {
  const { setPage } = useApp();
  const { analysis } = useAeo();
  const { rows, max } = useCompetitorRows();
  return (
    <section className="ae-card">
      <div className="ae-row" style={{ alignItems: 'baseline' }}><h2>Competitors</h2><a onClick={() => { setPage('aeoCompetitors'); window.scrollTo(0, 0); }} style={{ fontSize: 13, fontWeight: 700 }}>View all →</a></div>
      {!analysis && !rows.length && <span className="ae-sub">Run an analysis to see who AI recommends in your category.</span>}
      {rows.map(c => (
        <div key={c.name} className="ae-crow">
          <div className="ae-col" style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: c.is_you ? '#3730a3' : 'inherit' }}>{c.name}{c.is_you ? ' (you)' : ''}</span>{c.custom && <span className="ae-chip">ADDED</span>}
            </div>
            <span style={{ fontSize: 12, color: 'var(--ae-faint)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.domain}</span>
          </div>
          <div className="ae-bar"><i style={{ width: (c.share_of_voice / max * 100) + '%', background: c.is_you ? '#4f46e5' : '#c7c9e8' }} /></div>
          <span className="ae-mono" style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: c.pending ? '#a5a4c4' : 'inherit' }}>{c.pending ? '…' : c.share_of_voice + '%'}</span>
        </div>
      ))}
    </section>
  );
}

/* ── Social channels ─────────────────────────────────────────────────────── */
export function SocialChannelsCard() {
  const { saved, linkSocial, unlinkSocial } = useAeo();
  const { setPage, state, toast } = useApp();
  const [status, setStatus] = useState({});
  const [connecting, setConnecting] = useState(null);
  const GROUP = { facebook: 'meta', instagram: 'meta', linkedin: 'linkedin', google_business: 'google_business', youtube: 'youtube' };
  const connect = async (ch) => {
    setConnecting(ch.id);
    try {
      const { authorize_url } = await socialPublishApi.connect(GROUP[ch.platform] || ch.platform);
      rememberPageBeforeOAuthRedirect(state.page);
      window.location.href = authorize_url;
    } catch (e) { toast({ type: 'info', message: 'We could not open the connection just now. Please try again in a moment.' }); setConnecting(null); }
  };
  const disconnect = async (ch) => {
    try { await socialPublishApi.disconnect(ch.platform); setStatus(m => ({ ...m, [ch.platform]: { ...m[ch.platform], connected: false } })); }
    catch (e) { toast({ type: 'error', message: e.message || 'Could not disconnect.' }); }
  };
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    socialPublishApi.status().then(d => {
      if (off) return;
      const m = {}; (d?.platforms || []).forEach(p => { m[p.platform] = p; });
      setStatus(m);
    }).catch(() => {});
    return () => { off = true; };
  }, []);

  const save = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    const r = await linkSocial(editing, draft.trim());
    setBusy(false);
    if (r.ok) { setEditing(null); setDraft(''); setErr(''); } else setErr(r.message || 'That link was not accepted.');
  };

  return (
    <section className="ae-card" style={{ gap: 12 }}>
      <div className="ae-row" style={{ alignItems: 'baseline' }}><h2>Social media channels</h2><a onClick={() => { setPage('aeoCalendar'); window.scrollTo(0, 0); }} style={{ fontSize: 13, fontWeight: 700 }}>Open calendar →</a></div>
      {SOCIAL_ORDER.map(id => {
        const ch = CHANNELS.find(c => c.id === id);
        const st = status[ch.platform];
        const manual = saved.social_links[id];
        const connected = st?.connected;
        const linked = connected || manual;
        const handle = connected ? (st.account_label || 'Connected account') : manual || (!ch.live ? 'Connection being set up' : 'Not linked yet');
        const inProgress = !ch.live && !connected;
        const statusTxt = inProgress ? 'In progress' : connected ? (st.needs_reconnect ? 'Reconnect needed' : 'Connected for posting') : manual ? 'Link saved · not connected for posting' : 'Not connected';
        const statusColor = inProgress ? '#4f46e5' : connected ? (st.needs_reconnect ? '#b45309' : '#059669') : manual ? '#4f46e5' : '#b45309';
        const isEd = editing === id;
        return (
          <div key={id} className="ae-social">
            <div className="ae-social-top">
              <div className="ae-ico" style={{ background: ch.bg, color: ch.fg }}>{ch.abbr}</div>
              <div className="ae-col" style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{SOCIAL_HELP[id].label}</span>
                <span style={{ fontSize: 12, color: linked || inProgress ? 'var(--ae-faint)' : '#b45309', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{handle}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: statusColor }}>{statusTxt}</span>
                {ch.live && (!connected || st?.needs_reconnect) && <button className="ae-btn sm primary" disabled={connecting === id} onClick={() => connect(ch)}>{connecting === id ? 'Opening…' : st?.needs_reconnect ? 'Reconnect' : 'Connect account'}</button>}
                {connected && !st?.needs_reconnect && <button className="ae-btn sm" onClick={() => disconnect(ch)}>Disconnect</button>}
                <button className="ae-btn sm" onClick={() => { setEditing(isEd ? null : id); setDraft(manual || ''); setErr(''); }}>
                  {isEd ? 'Close' : manual ? 'Edit link' : 'Add page link'}
                </button>
              </div>
            </div>
            {isEd && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#f8f8fd', border: '1px dashed #d6d5ea', borderRadius: 12, padding: 12 }}>
                <span style={{ fontSize: 12, color: '#4a4966' }}>Paste your {SOCIAL_HELP[id].label} page URL. We check that it is a genuine {SOCIAL_HELP[id].label} address before saving it.</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <input className="ae-input" style={{ padding: '9px 12px' }} value={draft} onChange={e => { setDraft(e.target.value); setErr(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') save(); else if (e.key === 'Escape') setEditing(null); }} placeholder={SOCIAL_HELP[id].placeholder} />
                  <button className="ae-btn primary" disabled={busy} onClick={save}>Save link</button>
                  {manual && <button className="ae-btn" onClick={() => { unlinkSocial(id); setEditing(null); }}>Remove</button>}
                  <button className="ae-btn" onClick={() => setEditing(null)}>Cancel</button>
                </div>
                {err && <span className="ae-err">{err}</span>}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
