import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAeo, usePromptRows } from './AeoContext';
import { Icon } from './Icon';
import { ENGINES, isReal, promptVis, num } from './utils';

/* The Prompts page: questions people ask AI, how each AI tool answers them, and which ones to win. */

const ENG_COLOR = ['#10a37f', '#1f8a9e', '#4f7cf7', '#ea4335'];
const MUTE = '#6b6a85';
const INTENTS = {
  Commercial: ['#eef0ff', '#4f46e5', 'Commercial: comparing options', 'Commercial: people comparing options before choosing'],
  Transactional: ['#e6f6ef', '#059669', 'Transactional: ready to buy', 'Transactional: people ready to buy or hire'],
  Informational: ['#e8f1f8', '#0a66c2', 'Informational: looking for information', 'Informational: people looking for information'],
};
const isMention = (p) => Array.isArray(p.engines) && p.engines.some(x => x != null && x !== 0);
const isOpp = (p) => isReal(p) && !isMention(p);

/** One AI tool's answer for a prompt, in the colours of the key at the bottom of the table. */
function cell(x, j) {
  const name = ENGINES[j];
  if (x == null) return { name, text: '…', cls: 'pend', plain: 'checked in your next analysis', tip: `${name}: checked in your next analysis` };
  if (x > 0) return { name, text: '#' + x, cls: 'cited', plain: `recommends you at position ${x}, with a link`, tip: `${name}: recommends you at position ${x}, with a link` };
  if (x < 0) return { name, text: '✓', cls: 'ment', plain: "names you but doesn't link to your website", tip: `${name}: mentions you, no link to your website` };
  return { name, text: '–', cls: 'abs', plain: "doesn't mention you", tip: `${name}: not mentioned` };
}

const SORTS = {
  searches: (a, b) => (b.volume_estimate || 0) - (a.volume_estimate || 0),
  high: (a, b) => (isReal(b) ? promptVis(b) : -1) - (isReal(a) ? promptVis(a) : -1) || (b.volume_estimate || 0) - (a.volume_estimate || 0),
  low: (a, b) => (isReal(a) ? promptVis(a) : 101) - (isReal(b) ? promptVis(b) : 101) || (b.volume_estimate || 0) - (a.volume_estimate || 0),
};

export function PromptsView() {
  const { analysis, rawAnalysis, saved, content, addPrompt, removePrompt, restorePrompt, togglePrompt, clearSelection, setSelectedPrompts } = useAeo();
  const { rows, pendingCount } = usePromptRows();
  const { setPage, requirePayment } = useApp();
  const [filter, setFilter] = useState('all');
  const [intent, setIntent] = useState('All');
  const [sort, setSort] = useState('searches');
  const [topN, setTopN] = useState(20);
  const [draft, setDraft] = useState('');
  const [openRow, setOpenRow] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [hiddenPop, setHiddenPop] = useState(false);
  const [showAllM, setShowAllM] = useState(false);

  const sel = saved.selected_prompts;
  const count = sel.length;
  const open = rows.filter(r => !r.locked);
  const locked = rows.filter(r => r.locked);
  const made = useMemo(() => new Set(Object.values(content.strategy || {}).map(c => c && c.prompt).filter(Boolean)), [content.strategy]);

  const counts = { all: open.length, mentions: open.filter(isMention).length, opps: open.filter(isOpp).length };
  const missing = open.filter(isOpp).reduce((t, r) => t + (r.volume_estimate || 0), 0);

  const shown = useMemo(() => {
    let l = open.filter(r => filter === 'all' || (filter === 'mentions' ? isMention(r) : isOpp(r)));
    if (intent !== 'All') l = l.filter(r => r.intent === intent);
    const yours = l.filter(r => r.pending || r.custom);
    const rest = l.filter(r => !(r.pending || r.custom)).sort(SORTS[sort]);
    return [...yours, ...rest].slice(0, Math.max(topN, yours.length));
  }, [rows, filter, intent, sort, topN]); // eslint-disable-line

  const hidden = useMemo(() => {
    const h = (saved.hidden_prompts || []);
    const byText = new Map(((rawAnalysis && rawAnalysis.prompts) || []).map(p => [String(p.text).toLowerCase(), p]));
    return h.map(t => ({ text: t, p: byText.get(String(t).toLowerCase()) })).reverse();
  }, [saved.hidden_prompts, rawAnalysis]);

  if (!analysis && !pendingCount) return null;

  const allOn = shown.length > 0 && shown.every(r => sel.includes(r.text));
  const add = () => { if (draft.trim()) { addPrompt(draft); setDraft(''); setFilter('all'); } };
  const rank = () => { if (count) { setPage('aeoStrategy'); window.scrollTo(0, 0); } };
  const createFor = (r) => { setSelectedPrompts([r.text, ...sel.filter(t => t !== r.text)]); setPage('aeoStrategy'); window.scrollTo(0, 0); };
  const remove = (r) => { setMenuFor(null); setOpenRow(o => (o === r.text ? null : o)); removePrompt(r.text); };
  const toggleOpen = (r) => { setMenuFor(null); setOpenRow(o => (o === r.text ? null : r.text)); };
  const emptyText = filter === 'mentions'
    ? "AI doesn't mention you for any of these yet. Pick a few opportunities and click Rank Me High to start."
    : 'No questions match these filters.';
  const mRows = showAllM ? shown : shown.slice(0, 5);

  const info = (r) => {
    const real = isReal(r);
    const it = INTENTS[r.intent];
    const yours = !!(r.pending || r.custom);
    const vis = real ? promptVis(r) : null;
    return {
      real, it, yours, vis, engines: (r.engines || [null, null, null, null]).map(cell),
      intentLabel: it ? r.intent : 'Pending',
      searches: yours || !r.volume_estimate ? '—' : num(r.volume_estimate),
      searchLine: yours || !r.volume_estimate ? 'Monthly searches are estimated in your next analysis' : `About ${num(r.volume_estimate)} people ask this each month (estimate)`,
      intentLine: it ? it[3] : 'Intent: worked out in your next analysis',
      visText: vis == null ? 'Next analysis' : vis + '%',
      created: made.has(r.text),
    };
  };

  const Chk = ({ on, label, onClick, big }) => (
    <button type="button" className={`dv-chk ${on ? 'on' : ''}`} aria-label={label} aria-pressed={on} onClick={onClick} style={big ? { width: 22, height: 22 } : undefined}><Icon name="check" size={13} /></button>
  );

  const stat = (label, value, tip, extra, color) => (
    <div className="dv-card pp-stat">
      <div className="pp-stathd"><span>{label}</span><span className="dv-est" title={tip}>Estimated<Icon name="info" size={12} /></span></div>
      <span className="pp-statv" style={color ? { color } : undefined}>{value}</span>
      {extra}
    </div>
  );

  return (
    <div className="pp" data-testid="prompts-page">
      <div className="pp-stats">
        {stat('Questions tracked', counts.all, 'An estimate based on a sample of AI answers', locked.length > 0 ? <a className="pp-up" role="link" tabIndex={0} onClick={() => requirePayment('aeoPrompts')}>+{locked.length} on paid plans</a> : null)}
        {stat('AI mentions you in', <>{counts.mentions} <small>of {counts.all} questions</small></>, 'An estimate based on a sample of AI answers')}
        {stat('Opportunities', counts.opps, 'An estimate based on a sample of AI answers', <span className="pp-sm">Questions where AI doesn't mention you</span>, '#4f46e5')}
        {stat('Monthly searches', missing ? '~' + num(Math.round(missing / 100) * 100) : '0', 'An estimate based on public search data', <span className="pp-sm">Monthly searches where you're missing</span>)}
      </div>

      <div className="dv-steps">
        <div><b>1</b><span>These are questions people are likely to ask ChatGPT, Gemini and other AI tools.</span></div>
        <div><b>2</b><span><em style={{ color: '#059669' }}>✓</em> means AI mentions you. <em style={{ color: '#8e8da6' }}>–</em> means it suggests someone else.</span></div>
        <div><b>3</b><span>Tick the ones you want to win and click Rank Me High. We'll create content to help AI recommend you.</span></div>
      </div>

      <section className="dv-card pp-card" data-print-card data-testid="prompts-card">
        <div className="pp-tools dv-nopr">
          <div className="dv-seg" role="tablist" aria-label="Filter questions">
            {[['all', 'All', counts.all], ['mentions', 'Mentions you', counts.mentions], ['opps', 'Opportunities', counts.opps]].map(([v, l, c]) => (
              <button key={v} type="button" role="tab" aria-selected={filter === v} className={filter === v ? 'on' : ''} onClick={() => setFilter(v)}>{l} <span className="pp-c">({c})</span></button>
            ))}
          </div>
          <label className="pp-sel">Intent
            <select value={intent} onChange={e => setIntent(e.target.value)} aria-label="Intent">
              <option>All</option><option>Commercial</option><option>Transactional</option><option>Informational</option>
            </select>
          </label>
          <label className="pp-sel">Sort
            <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
              <option value="searches">Most searched</option><option value="high">Highest visibility</option><option value="low">Lowest visibility</option>
            </select>
          </label>
          <div className="pp-show">Show
            <div className="dv-seg">{[5, 10, 20].map(n => <button key={n} type="button" className={n === topN ? 'on' : ''} onClick={() => setTopN(n)}>Top {n}</button>)}</div>
          </div>
          <div className="pp-rank">
            <div className="dv-row-c">
              <button type="button" className="dv-btn primary lg" disabled={!count} onClick={rank} data-testid="rank-me" style={{ opacity: count ? 1 : .45 }}><Icon name="sparkles" size={16} />{count ? `Rank Me High (${count})` : 'Rank Me High'}</button>
              <span className="dv-help" title="We'll create a content plan, blogs and posts for the questions you selected."><Icon name="info" size={16} /></span>
            </div>
            {!count && <span className="dv-tiny">Select at least 1 prompt</span>}
          </div>
        </div>

        <div className="dv-add dv-nopr">
          <div className="dv-addbox"><Icon name="plus" size={16} /><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} maxLength={200}
            placeholder="Add a question your customers might ask AI, e.g. best [your service] in [your city]" aria-label="Add a question" /></div>
          <button type="button" className="dv-btn" onClick={add}>Add prompt</button>
          <span className="dv-tiny">Added questions are checked in your next analysis.</span>
        </div>

        {/* desktop table */}
        <div className="pp-table" role="table">
          <div className="pp-row pp-head" role="row">
            <Chk on={allOn} label="Select all" onClick={() => (allOn ? clearSelection() : setSelectedPrompts([...sel, ...shown.map(r => r.text)]))} />
            <span>#</span><span>Question</span>
            <span className="pp-hi" title="What the person wants: comparing options, ready to buy, or just learning">Intent <Icon name="info" size={12} /></span>
            <span className="pp-hi r" title="Estimated number of people asking this each month">Searches/mo <Icon name="info" size={12} /></span>
            {ENGINES.map((e, j) => <span key={e} className="pp-en"><i style={{ background: ENG_COLOR[j] }} />{e}</span>)}
            <span className="pp-hi" title="How likely AI tools are to recommend you for this question (estimate)">Visibility <Icon name="info" size={12} /></span>
            <span>Content</span><span />
          </div>
          {shown.map((r, i) => {
            const d = info(r); const on = sel.includes(r.text); const isOpen = openRow === r.text;
            return (
              <div key={r.text + i} className={`pp-item ${on || isOpen ? 'sel' : ''}`} data-testid="prompt-row">
                <div className="pp-row" role="row" onClick={() => toggleOpen(r)}>
                  <Chk on={on} label={`Select: ${r.text}`} onClick={e => { e.stopPropagation(); togglePrompt(r.text); }} />
                  <span className="pp-n">{i + 1}</span>
                  <div className="pp-q"><span style={{ fontWeight: isOpen ? 600 : 500 }}>{r.text}</span>{d.yours && <span className="dv-tag y">Yours</span>}</div>
                  <span><span className="dv-intent" title={d.it ? d.it[2] : 'Worked out in your next analysis'} style={{ background: d.it ? d.it[0] : '#f3f3f8', color: d.it ? d.it[1] : MUTE }}>{d.intentLabel}</span></span>
                  <span className="pp-num">{d.searches}</span>
                  {d.engines.map(e => <span key={e.name} className="pp-ec"><span className={`dv-eng ${e.cls}`} title={e.tip}>{e.text}</span></span>)}
                  <div className="pp-vis"><span style={{ color: d.vis == null ? MUTE : '#1c1b3a' }}>{d.visText}</span><div className="dv-meter sm"><div style={{ width: (d.vis || 0) + '%', background: '#4f46e5' }} /></div></div>
                  <div>{d.created && <span className="pp-done">Content created ✓</span>}</div>
                  <div className="pp-act">
                    <span className="pp-chev" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}><Icon name="chevron-down" size={16} /></span>
                    <button type="button" className="pp-more dv-nopr" title="More" aria-label="More" aria-haspopup="menu" aria-expanded={menuFor === r.text} onClick={e => { e.stopPropagation(); setMenuFor(m => (m === r.text ? null : r.text)); }}><Icon name="ellipsis" size={16} /></button>
                  </div>
                  {menuFor === r.text && (
                    <>
                      <div className="pp-away" onClick={e => { e.stopPropagation(); setMenuFor(null); }} />
                      <div className="pp-menu" role="menu"><button type="button" role="menuitem" onClick={e => { e.stopPropagation(); remove(r); }}><Icon name="eye-off" size={16} />Remove question</button></div>
                    </>
                  )}
                </div>
                {isOpen && (
                  <div className="pp-exp">
                    <div className="pp-says">
                      <b>What each AI tool says</b>
                      {d.engines.map(e => <div key={e.name}><span className={`dv-eng ${e.cls}`}>{e.text}</span><span><b>{e.name}:</b> {e.plain}</span></div>)}
                    </div>
                    <div className="pp-side">
                      <div className="pp-facts"><span><Icon name="users" size={16} />{d.searchLine}</span><span><Icon name="target" size={16} />{d.intentLine}</span></div>
                      <div className="pp-btns dv-nopr">
                        <button type="button" className="dv-btn primary" onClick={() => createFor(r)}><Icon name="pen-line" size={15} />Create content for this</button>
                        <button type="button" className="dv-btn" style={{ color: '#1c1b3a' }} onClick={() => remove(r)}>Remove question</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {shown.length === 0 && (
            <div className="pp-empty"><div className="dv-tile" style={{ width: 44, height: 44 }}><Icon name="search" size={22} /></div><span>{emptyText}</span>
              <button type="button" className="dv-btn" onClick={() => { setFilter('opps'); setIntent('All'); }}>See opportunities</button></div>
          )}
          {locked.length > 0 && (
            <div className="dv-locked dv-nopr" style={{ minWidth: 0 }}>
              <div aria-hidden="true" className="dv-blur">{locked.slice(0, 2).map((p, i) => <div key={i} className="pp-row"><span className="dv-chk" /><span className="pp-n">·</span><div className="pp-q">{p.text}</div><span /><span /><span /><span /><span /><span /><span /><span /><span /></div>)}</div>
              <div className="dv-lockmsg"><span><Icon name="lock" size={15} /> {locked.length} more prompt{locked.length === 1 ? '' : 's'} on paid plans</span><span style={{ color: MUTE }}>·</span><a onClick={() => requirePayment('aeoPrompts')} role="link" tabIndex={0}>Upgrade</a></div>
            </div>
          )}
        </div>

        {/* mobile cards */}
        <div className="pp-cards">
          {mRows.map((r, i) => {
            const d = info(r); const on = sel.includes(r.text); const isOpen = openRow === r.text;
            return (
              <div key={r.text + i} className={`pp-card-m ${on || isOpen ? 'sel' : ''}`} onClick={() => toggleOpen(r)}>
                <div className="pp-mtop">
                  <button type="button" className="pp-mchk" aria-label={`Select: ${r.text}`} aria-pressed={on} onClick={e => { e.stopPropagation(); togglePrompt(r.text); }}><span className={`dv-chk ${on ? 'on' : ''}`} style={{ width: 22, height: 22 }}><Icon name="check" size={14} /></span></button>
                  <div className="pp-q" style={{ flex: 1 }}><span style={{ fontWeight: 600 }}>{r.text}</span>{d.yours && <span className="dv-tag y">Yours</span>}</div>
                  <span className="pp-chev" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}><Icon name="chevron-down" size={18} /></span>
                </div>
                <div className="pp-mengs">{d.engines.map(e => <span key={e.name} title={e.tip}><span className={`dv-eng ${e.cls}`} style={{ height: 20, minWidth: 22 }}>{e.text}</span>{e.name}</span>)}</div>
                <div className="pp-mvis"><span>Visibility</span><div className="dv-meter sm" style={{ flex: 1 }}><div style={{ width: (d.vis || 0) + '%', background: '#4f46e5' }} /></div><b style={{ color: d.vis == null ? MUTE : '#1c1b3a' }}>{d.visText}</b></div>
                {d.created && <span className="pp-done" style={{ alignSelf: 'flex-start' }}>Content created ✓</span>}
                {isOpen && (
                  <div className="pp-mopen" onClick={e => e.stopPropagation()}>
                    {d.engines.map(e => <span key={e.name}><b>{e.name}:</b> {e.plain}</span>)}
                    <span className="pp-sm">{d.searchLine}</span><span className="pp-sm">{d.intentLine}</span>
                    <button type="button" className="dv-btn primary" style={{ height: 44, justifyContent: 'flex-start' }} onClick={() => createFor(r)}>Create content for this</button>
                    <button type="button" className="dv-btn" style={{ height: 44, justifyContent: 'flex-start', color: '#1c1b3a' }} onClick={() => remove(r)}>Remove question</button>
                  </div>
                )}
              </div>
            );
          })}
          {shown.length === 0 && <div className="pp-empty" style={{ alignItems: 'flex-start', textAlign: 'left' }}><span>{emptyText}</span></div>}
          {!showAllM && shown.length > 5 && <button type="button" className="dv-btn" style={{ height: 44 }} onClick={() => setShowAllM(true)}>Show all {shown.length} questions</button>}
          {locked.length > 0 && <div className="pp-lockm"><Icon name="lock" size={15} /> {locked.length} more prompts on paid plans · <a onClick={() => requirePayment('aeoPrompts')} role="link" tabIndex={0}>Upgrade</a></div>}
        </div>

        {hidden.length > 0 && (
          <div className="pp-hid dv-nopr"><Icon name="eye-off" size={15} />Hidden questions ({hidden.length}) ·<button type="button" className="dv-link" onClick={() => setHiddenPop(true)}>Restore</button></div>
        )}

        <div className="dv-legend">
          <div>
            <span><b className="g">#2</b>Recommended with a link</span>
            <span><b className="a">✓</b>Mentioned, no link</span>
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

      {hiddenPop && (
        <div className="pp-modal dv-nopr" onClick={() => setHiddenPop(false)} role="dialog" aria-modal="true" aria-label="Hidden questions">
          <div className="pp-pop" onClick={e => e.stopPropagation()}>
            <div className="pp-pophd"><div><b>Hidden questions</b><span>These are hidden from your list. Restore one to show it again.</span></div>
              <button type="button" title="Close" aria-label="Close" onClick={() => setHiddenPop(false)}><Icon name="x" size={16} /></button></div>
            <div className="pp-poplist">
              {hidden.length === 0 && <span style={{ display: 'block', padding: '16px 0', fontSize: 14, color: MUTE }}>No hidden questions.</span>}
              {hidden.map(h => (
                <div key={h.text}><div><b>{h.text}</b><span>{h.p && h.p.intent && INTENTS[h.p.intent] ? `${h.p.intent} · ${num(h.p.volume_estimate)} searches/mo` : 'Your question'}</span></div>
                  <button type="button" onClick={() => { restorePrompt(h.text); if (hidden.length <= 1) setHiddenPop(false); }}>Restore</button></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
