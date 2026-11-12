import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { usePayment } from '../context/PaymentContext';
import { useAeo, usePromptRows } from './AeoContext';
import { useCompetitorRows } from './parts';
import { Icon } from './Icon';
import { ENGINES, isReal, promptVis, num } from './utils';
import { aeoApi } from '../api/aeoApi';

const ENG_COLOR = ['#10a37f', '#1f8a9e', '#4f7cf7', '#ea4335'];
const INTENTS = {
  Commercial: ['#eef0ff', '#4f46e5', 'Commercial: comparing options'],
  Transactional: ['#e6f6ef', '#059669', 'Transactional: ready to buy'],
  Informational: ['#e8f1f8', '#0a66c2', 'Informational: looking for information'],
};
export const RED = '#dc2626', AMBER = '#b45309', GREEN = '#059669';
const MUTE = '#6b6a85';

/** "+2 since last update" / "−1% since last update" / "No change since last update". */
export function deltaLine(cur, prev, unit = '') {
  if (cur == null || prev == null) return null;
  const d = Math.round(cur - prev);
  if (d === 0) return { text: 'No change since last update', color: MUTE };
  return { text: `${d > 0 ? '+' : '−'}${Math.abs(d)}${unit} since last update`, color: d > 0 ? GREEN : RED };
}

export const EstimatedBadge = () => (
  <span className="dv-est" title="An estimate based on a sample of AI answers">Estimated<Icon name="info" size={13} /></span>
);

/* ── One of the four number cards ──────────────────────────────────────── */
export function KpiCard({ title, sub, value, unit, label, labelColor, delta, pct, barColor, text, linkText, onLink, children }) {
  return (
    <div className="dv-card dv-kpi" data-testid="kpi">
      <div className="dv-row-t"><div className="dv-col"><span className="dv-h3">{title}</span>{sub && <span className="dv-tiny">{sub}</span>}</div><EstimatedBadge /></div>
      {children || <>
        <div className="dv-big"><span>{value}{unit && <small>{unit}</small>}</span>{label && <span className="dv-lab" style={{ color: labelColor }}><i style={{ background: labelColor }} />{label}</span>}</div>
        {delta ? <span className="dv-delta" style={{ color: delta.color }}>{delta.text}</span> : <span className="dv-delta" style={{ color: MUTE }}>First analysis</span>}
        <div className="dv-meter"><div style={{ width: Math.max(0, Math.min(100, pct || 0)) + '%', background: barColor }} /></div>
      </>}
      <p className="dv-p">{text}</p>
      {linkText && <a className="dv-more dv-nopr" onClick={onLink} role="link" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onLink(); }}>{linkText}</a>}
    </div>
  );
}

/* ── Prompts ────────────────────────────────────────────────────────────── */
function EngCellV3({ x, j }) {
  const n = ENGINES[j];
  let cls = 'abs', tip = `${n}: does not mention you`, body = '–';
  if (x == null) { cls = 'pend'; tip = `${n}: checked in your next analysis`; body = '…'; }
  else if (x > 0) { cls = 'cited'; tip = `${n}: recommends you at position ${x}, with a link`; body = '#' + x; }
  else if (x < 0) { cls = 'ment'; tip = `${n}: mentions you by name but doesn't link to your website`; body = <Icon name="message-circle" size={13} />; }
  return <span className={`dv-eng ${cls}`} title={tip}>{body}</span>;
}

export function PromptsCard() {
  const { analysis, saved, addPrompt, removePrompt, togglePrompt, clearSelection, setSelectedPrompts } = useAeo();
  const { rows, pendingCount } = usePromptRows();
  const { setPage, requirePayment } = useApp();
  const [topN, setTopN] = useState(5);
  const [draft, setDraft] = useState('');
  if (!analysis && !pendingCount) return null;

  const open = rows.filter(r => !r.locked);
  const locked = rows.filter(r => r.locked);
  const shown = [...open.filter(r => r.pending), ...open.filter(r => !r.pending).slice(0, topN)];
  const sel = saved.selected_prompts;
  const count = sel.length;
  const allOn = shown.length > 0 && shown.every(r => sel.includes(r.text));
  const add = () => { if (draft.trim()) { addPrompt(draft); setDraft(''); } };
  const rank = () => { if (count) { setPage('aeoStrategy'); window.scrollTo(0, 0); } };

  return (
    <section className="dv-card dv-prompts" data-print-card data-testid="prompts-card">
      <div className="dv-row-t dv-phd" style={{ gap: 16 }}>
        <div className="dv-titlebox"><span className="dv-h2">What people ask AI when looking for a business like yours</span><span className="dv-tag">Prompts</span></div>
        <div className="dv-nopr dv-ptools">
          <div className="dv-seg" role="tablist" aria-label="How many prompts to show">
            {[5, 10, 20].map(n => <button key={n} type="button" role="tab" aria-selected={n === topN} className={n === topN ? 'on' : ''} onClick={() => setTopN(n)}>Top {n}</button>)}
          </div>
          <div className="dv-col" style={{ alignItems: 'flex-end', gap: 6 }}>
            <div className="dv-row-c">
              <button type="button" className="dv-btn primary lg" disabled={!count} title={count ? '' : 'Select at least 1 prompt'} onClick={rank} data-testid="rank-me"><Icon name="sparkles" size={16} />{count ? `Rank Me High (${count})` : 'Rank Me High'}</button>
              <span className="dv-help" title="We'll create a content plan, blogs and posts for the questions you selected."><Icon name="info" size={16} /></span>
            </div>
            {!count && <span className="dv-tiny">Select at least 1 prompt</span>}
          </div>
        </div>
      </div>

      <div className="dv-steps">
        <div><b>1</b><span>These are questions people are likely to ask ChatGPT, Gemini and other AI tools.</span></div>
        <div><b>2</b><span><em style={{ color: GREEN }}>✓</em> means AI mentions you. <em style={{ color: '#8e8da6' }}>–</em> means it suggests someone else.</span></div>
        <div><b>3</b><span>Tick the ones you want to win and click Rank Me High. We'll create content to help AI recommend you.</span></div>
      </div>

      <div className="dv-add dv-nopr">
        <div className="dv-addbox"><Icon name="plus" size={16} /><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} maxLength={200}
          placeholder="Add a question your customers might ask AI, e.g. best [your service] in [your city]" aria-label="Add a prompt" /></div>
        <button type="button" className="dv-btn" onClick={add}>Add prompt</button>
        <span className="dv-tiny">Added prompts are checked in your next analysis.</span>
      </div>

      <div className="dv-table" role="table">
        <div className="dv-prow dv-phead" role="row">
          <button type="button" className={`dv-chk ${allOn ? 'on' : ''}`} aria-label="Select all" aria-pressed={allOn} onClick={() => (allOn ? clearSelection() : setSelectedPrompts([...sel, ...shown.map(r => r.text)]))}><Icon name="check" size={13} /></button>
          <span className="dv-c-n">#</span><span className="dv-c-t">Prompt</span>
          <div className="dv-meta">
            <span title="What the person wants: comparing options, ready to buy, or just learning" className="dv-hi">Intent <Icon name="info" size={12} /></span>
            <span title="Estimated number of people asking this each month" className="dv-hi r">Searches/mo <Icon name="info" size={12} /></span>
          </div>
          <div className="dv-engs">{ENGINES.map((e, j) => <span key={e} className="dv-ename"><i style={{ background: ENG_COLOR[j] }} />{e}</span>)}</div>
          <span className="dv-hi dv-c-v" title="How likely AI tools are to recommend you for this question (estimate)">Visibility <Icon name="info" size={12} /></span>
        </div>
        {shown.map((p, i) => {
          const on = sel.includes(p.text);
          const real = isReal(p);
          const vis = real ? promptVis(p) : null;
          const it = INTENTS[p.intent];
          return (
            <div key={p.text + i} className={`dv-prow ${on ? 'sel' : ''}`} role="row" data-testid="prompt-row">
              <button type="button" className={`dv-chk ${on ? 'on' : ''}`} aria-label={`Select: ${p.text}`} aria-pressed={on} onClick={() => togglePrompt(p.text)}><Icon name="check" size={13} /></button>
              <span className="dv-c-n">{p.pending || p.custom ? '★' : p.rank || i + 1}</span>
              <span className="dv-c-t">{p.text}{p.custom && <> <span className="dv-tag y">Yours</span> <button type="button" className="dv-link sm dv-nopr" onClick={() => removePrompt(p.text)}>Remove</button></>}</span>
              <div className="dv-meta">
                <span><span className="dv-intent" title={it ? it[2] : 'Worked out in your next analysis'} style={{ background: it ? it[0] : '#f3f3f8', color: it ? it[1] : MUTE }}>{p.intent === 'Custom' || !p.intent ? 'Pending' : p.intent}</span></span>
                <span className="dv-c-s">{p.volume_estimate ? <>{num(p.volume_estimate)}<small> searches/mo</small></> : '—'}</span>
                <span className="dv-vt" style={{ color: vis == null ? MUTE : '#1c1b3a' }}>{vis == null ? 'Next analysis' : vis + '%'}</span>
              </div>
              <div className="dv-engs">{p.engines.map((x, j) => <span key={j} className="dv-ecell"><EngCellV3 x={x} j={j} /><small>{ENGINES[j]}</small></span>)}</div>
              <div className="dv-c-v dv-vbar"><span style={{ color: vis == null ? MUTE : '#1c1b3a' }}>{vis == null ? 'Next analysis' : vis + '%'}</span><div className="dv-meter sm"><div style={{ width: (vis || 0) + '%', background: '#4f46e5' }} /></div></div>
            </div>
          );
        })}
        {locked.length > 0 && (
          <div className="dv-locked dv-nopr">
            <div aria-hidden="true" className="dv-blur">{locked.slice(0, 2).map((p, i) => <div key={i} className="dv-prow"><span className="dv-chk" /><span className="dv-c-n">·</span><span className="dv-c-t">{p.text}</span><div className="dv-meta" /><div className="dv-engs">{[0, 1, 2, 3].map(j => <span key={j} className="dv-ecell"><span className="dv-eng abs" /></span>)}</div><span className="dv-c-v" /></div>)}</div>
            <div className="dv-lockmsg"><span><Icon name="lock" size={15} /> {locked.length} more prompt{locked.length === 1 ? '' : 's'} on paid plans</span><span style={{ color: MUTE }}>·</span><a onClick={() => requirePayment('aeoPrompts')} role="link" tabIndex={0}>Upgrade</a></div>
          </div>
        )}
      </div>

      <div className="dv-legend">
        <div>
          <span><b className="g">#2</b>Recommended with a link</span>
          <span><b className="a"><Icon name="message-circle" size={12} /></b>Mentioned, no link</span>
          <span><b className="n">–</b>Not mentioned</span>
          <span><b className="p">…</b>Checked in next analysis</span>
        </div>
        <span className="dv-foot"><Icon name="info" size={13} />Positions are AI estimates, not live checks of these tools.</span>
      </div>

      {count > 0 && (
        <div className="dv-selbar dv-nopr" data-testid="selbar">
          <span style={{ fontWeight: 600 }}>{count} prompt{count === 1 ? '' : 's'} selected</span><span style={{ opacity: .4 }} className="dv-dotsep">·</span>
          <button type="button" onClick={clearSelection}>Clear</button>
          <button type="button" className="go" onClick={rank}>Rank Me High →</button>
        </div>
      )}
    </section>
  );
}

/* ── Competitors ────────────────────────────────────────────────────────── */
export function CompetitorsCard() {
  const { setPage, state } = useApp();
  const { rows } = useCompetitorRows();
  const live = rows.filter(r => !r.pending);
  const sorted = [...live].sort((a, b) => b.share_of_voice - a.share_of_voice);
  let top = sorted.slice(0, 5);
  const me = sorted.find(c => c.is_you);
  if (me && !top.includes(me)) top = [...top.slice(0, 4), me];
  const max = Math.max(1, ...top.map(c => c.share_of_voice));
  return (
    <section className="dv-card" data-print-card>
      <div className="dv-col" style={{ gap: 4 }}>
        <div className="dv-row-t"><span className="dv-h2">Who AI recommends instead of you</span><EstimatedBadge /></div>
        <span className="dv-sub">How often AI tools suggest each business{state.request.market ? ` in ${state.request.market}` : ''}</span>
      </div>
      <div className="dv-col" style={{ gap: 18 }}>
        {top.map(c => (
          <div key={c.name} className={`dv-comp ${c.is_you ? 'me' : ''}`}>
            <div className="dv-row-b" style={{ fontSize: 14 }}><span style={{ fontWeight: c.is_you ? 700 : 500 }}>{c.name}{c.is_you ? ' (You)' : ''}</span><b>{c.share_of_voice}%</b></div>
            <div className="dv-meter lg"><div style={{ width: Math.max(c.share_of_voice / max * 100, 2) + '%', background: c.is_you ? '#4f46e5' : '#c7c6d9' }} /></div>
          </div>
        ))}
        {!top.length && <span className="dv-sub">Competitors appear after your next analysis.</span>}
      </div>
      <a className="dv-more dv-nopr" role="link" tabIndex={0} onClick={() => { setPage('aeoCompetitors'); window.scrollTo(0, 0); }}>View all competitors →</a>
    </section>
  );
}

/* ── Ideas ──────────────────────────────────────────────────────────────── */
const _checks = {};
export function useLlmsMissing(url) {
  const [missing, setMissing] = useState(_checks[url] ?? null);
  useEffect(() => {
    if (!url || _checks[url] !== undefined) return;
    let off = false;
    aeoApi.siteChecks(url).then(d => {
      const c = (d?.checks || []).find(x => x.key === 'llms_txt');
      _checks[url] = c ? c.status !== 'good' : false;
      if (!off) setMissing(_checks[url]);
    }).catch(() => { _checks[url] = false; });
    return () => { off = true; };
  }, [url]);
  return !!missing;
}

export function IdeasCard({ soc }) {
  const { setPage, state } = useApp();
  const { analysis, setSelectedPrompts, saved } = useAeo();
  const llmsMissing = useLlmsMissing(state.request.url);
  const ideas = useMemo(() => {
    const out = [];
    const gap = (analysis?.prompts || []).filter(p => isReal(p) && p.engines.every(x => x === 0)).sort((a, b) => (b.volume_estimate || 0) - (a.volume_estimate || 0))[0];
    if (gap) out.push({ title: 'Write about what people are searching for', reason: `People search '${gap.text}' ${gap.volume_estimate ? `~${num(gap.volume_estimate)} times a month` : 'often'} and AI doesn't mention you.`, action: 'Create content',
      go: () => { setSelectedPrompts([gap.text, ...saved.selected_prompts.filter(t => t !== gap.text)]); setPage('aeoStrategy'); window.scrollTo(0, 0); } });
    if (llmsMissing) out.push({ title: 'Help AI tools read your website', reason: 'Your website is missing an AI-readable file (llms.txt).', action: 'How to fix', go: () => { setPage('profile'); window.scrollTo(0, 0); } });
    const fb = soc?.channels?.find(c => c.id === 'fb');
    if (soc && soc.loaded && fb && fb.key !== 'connected' && !soc.acting) out.push({ title: 'Connect your Facebook Page', reason: 'So we can publish your approved posts for you.', action: 'Connect', go: () => soc.connect(fb) });
    return out.map((x, i) => ({ ...x, n: i + 1 }));
    // eslint-disable-next-line
  }, [analysis, llmsMissing, soc?.channels, soc?.loaded, saved.selected_prompts]);
  return (
    <section className="dv-card" data-print-card>
      <span className="dv-h2" style={{ paddingBottom: 6 }}>Ideas to improve your score</span>
      {ideas.map(i => (
        <div key={i.title} className="dv-idea">
          <div className="dv-num">{i.n}</div>
          <div className="dv-col" style={{ flex: 1, gap: 10, minWidth: 0 }}>
            <div className="dv-col" style={{ gap: 3 }}><span style={{ fontSize: 15, fontWeight: 600 }}>{i.title}</span><span className="dv-sub">{i.reason}</span></div>
            <button type="button" className="dv-btn outline dv-nopr" style={{ alignSelf: 'flex-start' }} onClick={i.go}>{i.action}</button>
          </div>
        </div>
      ))}
      {!ideas.length && <div className="dv-idea"><div className="dv-num"><Icon name="check" size={16} /></div><span className="dv-sub" style={{ alignSelf: 'center' }}>You are covering the basics. Run a new analysis next month to see what changed.</span></div>}
    </section>
  );
}
