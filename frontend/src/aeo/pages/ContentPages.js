import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { canvaApi } from '../../api/canvaApi';
import { socialPublishApi } from '../../api/socialPublishApi';
import { useAeo } from '../AeoContext';
import { EngCell } from '../parts';
import { BLOG_TAG, CHANNELS, ENG_SHORT, TINTS, calendarStart, fmtDate, hostOf, isoDate } from '../utils';

// Short stable key — state keys are capped server-side, prompts/titles can be long.
const hkey = (...parts) => {
  const s = parts.join('\u0001');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

/** The prompts the content screens work on: the user's selection, else the top prompt. */
function useTargets() {
  const { analysis, saved } = useAeo();
  const { setPage } = useApp();
  const [idx, setIdx] = useState(0);
  const list = useMemo(() => {
    if (saved.selected_prompts.length) return saved.selected_prompts;
    const first = (analysis?.prompts || []).find(p => !p.locked);
    return first ? [first.text] : [];
  }, [saved.selected_prompts, analysis]);
  const active = list[Math.min(idx, Math.max(list.length - 1, 0))] || null;
  const row = (analysis?.prompts || []).find(p => p.text === active);
  return { list, active, row, setIdx, setPage, hasSelection: saved.selected_prompts.length > 0 };
}

function TargetChips({ t }) {
  return (
    <div className="ae-target">
      <span className="ae-eyebrow">Target prompt</span>
      {t.list.map((p, i) => <button key={p} className={`ae-tchip ${p === t.active ? 'on' : ''}`} onClick={() => t.setIdx(i)}>{p}</button>)}
      <a onClick={() => t.setPage('aeoPrompts')} style={{ fontSize: 13, fontWeight: 700, marginLeft: 4 }}>{t.hasSelection ? 'Change prompts' : 'Showing your #1 prompt — choose prompts →'}</a>
    </div>
  );
}

function NeedAnalysis({ setPage }) {
  return (
    <div className="ae-empty">
      <h2>Choose a prompt first</h2>
      <p>Content is written to win a specific question people ask AI. Run your analysis, then pick the prompts you want to rank for.</p>
      <button className="ae-btn primary" onClick={() => setPage('aeoPrompts')}>Go to Prompts</button>
    </div>
  );
}

/** Auto-generates once per (kind, key); a failure (e.g. paywall) shows a retry card instead of looping. */
function useAutoLoad(kind, key, has, load) {
  const tried = useRef(new Set());
  useEffect(() => {
    if (!key || has) return;
    const k = kind + '|' + key;
    if (tried.current.has(k)) return;
    tried.current.add(k);
    load();
    // eslint-disable-next-line
  }, [kind, key, has]);
  return () => { tried.current.delete(kind + '|' + key); load(); };
}

function Generating({ title, text }) {
  return (
    <section className="ae-loading">
      <div className="ae-dots"><i /><i /><i /></div>
      <span style={{ fontSize: 16, fontWeight: 800 }}>{title}</span>
      <span className="ae-sub">{text}</span>
    </section>
  );
}
function Retry({ title, text, onRetry }) {
  return (
    <div className="ae-empty"><h2>{title}</h2><p>{text}</p><button className="ae-btn primary" onClick={onRetry}>Generate now</button></div>
  );
}

/* ── Content strategy ───────────────────────────────────────────────────── */
function StrategyBlock({ t }) {
  const { content, busy, loadStrategy } = useAeo();
  const data = content.strategy[t.active];
  const isBusy = !!busy['strategy|' + t.active];
  const retry = useAutoLoad('strategy', t.active, !!data, () => loadStrategy(t.active));

  if (!data) {
    return isBusy ? <Generating title={`Building your strategy for “${t.active}”`} text="Reading the market, then drafting the answer we want AI to give, content pillars and a 4-week plan…" />
      : <Retry title="Content strategy" text="Generate a strategy for this prompt. This is a paid feature." onRetry={retry} />;
  }
  return (
    <section className="ae-card" style={{ padding: 24, gap: 20 }}>
      <div className="ae-row" style={{ alignItems: 'flex-start' }}>
        <div className="ae-col" style={{ gap: 4, maxWidth: 760 }}><span className="ae-eyebrow p">Content strategy</span><h2 className="lg">How to own “{t.active}”</h2></div>
        <div style={{ display: 'flex', gap: 6 }}>
          {ENG_SHORT.map((s, j) => (
            <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 10px', borderRadius: 10, background: '#f8f8fd' }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ae-faint)' }}>{s}</span><EngCell x={t.row ? t.row.engines[j] : null} j={j} />
            </div>
          ))}
        </div>
      </div>
      <div className="ae-answer"><span className="ae-eyebrow p">The answer we want AI to give</span><span style={{ fontSize: 15, lineHeight: 1.55, fontWeight: 500 }}>{data.answer}</span></div>
      <div className="ae-pillars">
        {data.pillars.map((p, i) => (
          <div key={i} className="ae-pillar">
            <span className="ae-eyebrow">{p.type}</span><span style={{ fontSize: 15, fontWeight: 800 }}>{p.title}</span>
            <span style={{ fontSize: 13, color: '#4a4966', lineHeight: 1.5 }}>{p.detail}</span>
            <span className="ae-mono" style={{ marginTop: 'auto', fontSize: 11.5, color: '#4f46e5' }}>{p.meta}</span>
          </div>
        ))}
      </div>
      <div className="ae-plan">
        {data.plan.map((w, i) => (
          <div key={i}><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#4f46e5' }}>{w.week}</span><span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>{w.task}</span></div>
        ))}
      </div>
    </section>
  );
}

/* ── Blogs ──────────────────────────────────────────────────────────────── */
function BlogReader({ item, draft, onClose, onApprove, onRequest }) {
  const tag = BLOG_TAG[item.origin];
  return (
    <div className="ae-reader-bg" onClick={onClose}>
      <article className="ae-reader" onClick={e => e.stopPropagation()}>
        <div className="ae-reader-h">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="ae-pill" style={{ background: tag[1], color: tag[2], padding: '4px 10px' }}>{tag[0]}</span>
            {item.approved && <span className="ae-pill" style={{ background: '#10b981', color: '#fff', padding: '4px 10px' }}>Approved</span>}
          </div>
          <button className="ae-btn sm" style={{ border: 'none', background: 'none' }} onClick={onClose}>Close ✕</button>
        </div>
        <div className="ae-reader-b">
          <span className="ae-eyebrow">{item.type}</span>
          <h1>{item.title}</h1>
          <span className="ae-sub">{item.meta}</span>
          <p style={{ fontSize: 17, fontWeight: 500 }}>{draft.intro}</p>
          {draft.sections.map((s, i) => <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><h3>{s.h}</h3><p>{s.p}</p></div>)}
        </div>
        <div className="ae-reader-f">
          <span className="ae-note" style={{ marginRight: 'auto', fontSize: 12.5 }}>{item.origin === 'pending' ? 'Team review requested.' : 'Written by AI from your website and market data. Check facts before publishing.'}</span>
          {item.origin === 'ai' && !item.approved && <button className="ae-btn" onClick={onRequest}>Request team review</button>}
          <button className="ae-btn" style={{ borderColor: '#10b981', fontWeight: 800, padding: '10px 20px', background: item.approved ? '#ecfdf5' : '#10b981', color: item.approved ? '#047857' : '#fff' }} onClick={onApprove}>{item.approved ? 'Approved ✓' : 'Approve blog'}</button>
        </div>
      </article>
    </div>
  );
}

function BlogsBlock({ t }) {
  const { content, busy, saved, loadStrategy, loadBlogDraft, setBlogState } = useAeo();
  const [reader, setReader] = useState(null);
  const data = content.strategy[t.active];
  const retry = useAutoLoad('strategy', t.active, !!data, () => loadStrategy(t.active));
  if (!data) return busy['strategy|' + t.active] ? <Generating title="Finding blog topics" text="Matching topics to what AI engines are being asked…" /> : <Retry title="Blog topics" text="Generate blog topics for this prompt. This is a paid feature." onRetry={retry} />;

  const items = data.blog_topics.map(b => {
    const k = hkey('blog', t.active, b.title);
    const st = saved.blog_state[k] || {};
    const origin = st.pending ? 'pending' : st.drafted ? 'ai' : 'idea';
    return { ...b, k, origin, approved: !!st.approved, drafted: !!st.drafted,
      meta: `${b.words.toLocaleString()} words · ${Math.ceil(b.words / 230)} min read · targets “${t.active}”` };
  });
  const drafts = items.filter(b => b.origin !== 'idea');

  const draftKey = (b) => `${t.active}|${b.title}`;
  const generate = async (b) => {
    const d = await loadBlogDraft(t.active, b);
    if (d) setBlogState(b.k, { drafted: true });
    return d;
  };
  const read = async (b) => {
    let d = content.blog[draftKey(b)];
    if (!d) d = await loadBlogDraft(t.active, b);   // cached server-side → no new generation cost
    if (d) setReader(b.k);
  };
  const open = items.find(b => b.k === reader);
  const draft = open && content.blog[draftKey(open)];

  return (
    <section className="ae-card" style={{ padding: 24 }}>
      <div className="ae-row"><div className="ae-col"><span className="ae-eyebrow p">Blogs</span><h2 className="lg">Blog topics for this prompt</h2></div>
        <b style={{ fontSize: 13, color: '#4a4966' }}>{drafts.filter(b => b.approved).length} of {drafts.length} drafts approved</b></div>
      {items.map(b => {
        const tag = BLOG_TAG[b.origin]; const bz = busy['blog|' + draftKey(b)];
        return (
          <div key={b.k} className={`ae-blog ${b.approved ? 'ok' : ''}`}>
            <div className="ae-col" style={{ gap: 6, minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span className="ae-eyebrow" style={{ letterSpacing: '.06em' }}>{b.type}</span>
                <span className="ae-pill" style={{ background: tag[1], color: tag[2], fontSize: 11 }}>{tag[0]}</span>
                {b.approved && <span className="ae-pill" style={{ background: '#10b981', color: '#fff', fontSize: 11 }}>Approved</span>}
              </div>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{b.title}</span>
              <span className="ae-sub" style={{ fontSize: 12.5 }}>{b.meta}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {b.origin === 'idea'
                ? <button className="ae-btn outline" disabled={!!bz} onClick={() => generate(b)}>{bz ? 'Writing…' : 'Generate draft'}</button>
                : <button className="ae-btn primary" disabled={!!bz} onClick={() => read(b)}>{bz ? 'Opening…' : b.approved ? 'Read' : 'Read & approve'}</button>}
            </div>
          </div>
        );
      })}
      {open && draft && <BlogReader item={open} draft={draft} onClose={() => setReader(null)}
        onApprove={() => setBlogState(open.k, { approved: !open.approved })} onRequest={() => setBlogState(open.k, { pending: true })} />}
    </section>
  );
}

/* ── Social calendar ────────────────────────────────────────────────────── */
function PostPreview({ ch, post, when, short, brand, handle, img, v, i }) {
  const ini = brand.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const tint = TINTS[(i + v) % TINTS.length];
  const id = ch.id;
  const text = post.text;
  return (
    <div style={{ background: '#fff', display: 'flex', flexDirection: 'column' }}>
      {id === 'fb' && <><div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 16px 8px' }}><div className="ae-ico" style={{ width: 40, height: 40, borderRadius: '50%', background: '#1d4ed8', color: '#fff' }}>{ini}</div><div className="ae-col"><b style={{ fontSize: 14.5 }}>{brand}</b><span style={{ fontSize: 12, color: '#65676b' }}>{short} · Public</span></div></div><div style={{ padding: '0 16px 12px', fontSize: 14.5, lineHeight: 1.45 }}><pre>{text}</pre></div></>}
      {id === 'ig' && <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px' }}><div style={{ width: 34, height: 34, borderRadius: '50%', padding: 2, background: '#e1306c' }}><div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 10 }}>{ini}</div></div><b style={{ fontSize: 13.5 }}>{handle}</b></div>}
      {id === 'li' && <><div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 16px 8px' }}><div className="ae-ico" style={{ width: 44, height: 44, borderRadius: 6, background: '#1e3a8a', color: '#fff' }}>{ini}</div><div className="ae-col"><b style={{ fontSize: 14 }}>{brand}</b><span style={{ fontSize: 12, color: '#666' }}>{short}</span></div></div><div style={{ padding: '0 16px 12px', fontSize: 14, lineHeight: 1.5 }}><pre>{text}</pre></div></>}
      {id === 'gbp' && <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 16px 10px' }}><div className="ae-ico" style={{ width: 36, height: 36, borderRadius: '50%', background: '#fef3c7', color: '#92400e' }}>{ini}</div><div className="ae-col"><b style={{ fontSize: 14 }}>{brand}</b><span style={{ fontSize: 12, color: '#5f6368' }}>Update · {short}</span></div></div>}

      <div className="ae-post-img" style={{ aspectRatio: ch.aspect, background: `repeating-linear-gradient(135deg,${tint[0]} 0 12px,${tint[1]} 12px 24px)` }}>
        {img ? <img src={img} alt="Post visual" /> : <span className="ph">AI image · {post.visual || 'to be generated'}</span>}
        {id === 'yt' && post.duration && <span style={{ position: 'absolute', right: 8, bottom: 8, background: 'rgba(0,0,0,.8)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>{post.duration}</span>}
      </div>

      {id === 'fb' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', margin: '0 12px', padding: '6px 0', borderTop: '1px solid #e4e6eb', fontSize: 13.5, fontWeight: 600, color: '#65676b', textAlign: 'center' }}><span>Like</span><span>Comment</span><span>Share</span></div>}
      {id === 'ig' && <><div style={{ display: 'flex', gap: 16, padding: '10px 12px 4px', fontSize: 13, fontWeight: 700 }}><span>Like</span><span>Comment</span><span>Share</span><span style={{ marginLeft: 'auto' }}>Save</span></div><div style={{ padding: '4px 12px 14px', fontSize: 13.5, lineHeight: 1.45 }}><b>{handle}</b> <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span><span style={{ display: 'block', marginTop: 6, color: '#00376b' }}>{post.tags}</span></div></>}
      {id === 'li' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', margin: '0 12px', padding: '8px 0', borderTop: '1px solid #e0e0e0', fontSize: 13, fontWeight: 600, color: '#666', textAlign: 'center' }}><span>Like</span><span>Comment</span><span>Repost</span><span>Send</span></div>}
      {id === 'yt' && <div style={{ display: 'flex', gap: 12, padding: '12px 14px 14px' }}><div className="ae-ico" style={{ width: 36, height: 36, flexShrink: 0, borderRadius: '50%', background: '#991b1b', color: '#fff', fontSize: 12 }}>{ini}</div><div className="ae-col" style={{ gap: 3 }}><b style={{ fontSize: 15, lineHeight: 1.35 }}>{post.title || text}</b><span style={{ fontSize: 12.5, color: '#606060' }}>{brand} · Premieres {short}</span><span style={{ fontSize: 13, color: '#3f3f3f', lineHeight: 1.45, marginTop: 4 }}>{text}</span></div></div>}
      {id === 'gbp' && <><div style={{ padding: '12px 16px', fontSize: 14, lineHeight: 1.5 }}>{text}</div>{post.cta && <div style={{ padding: '0 16px 16px' }}><span style={{ display: 'inline-flex', padding: '8px 18px', borderRadius: 999, border: '1px solid #dadce0', color: '#1a73e8', fontSize: 14, fontWeight: 600 }}>{post.cta}</span></div>}</>}
    </div>
  );
}

function CalendarBlock({ t }) {
  const { content, busy, saved, loadSocial, setPostState, setPostStates } = useAeo();
  const { state, toast, setPage } = useApp();
  const [channel, setChannel] = useState('fb');
  const [working, setWorking] = useState({});
  const data = content.social[t.active];
  const retry = useAutoLoad('social', t.active, !!data, () => loadSocial(t.active));
  const start = useMemo(() => calendarStart(), []);

  if (!data) return busy['social|' + t.active] ? <Generating title={`Writing your posts for “${t.active}”`} text="Drafting four posts for each of your five channels…" /> : <Retry title="Social media calendar" text="Generate four posts for each channel. This is a paid feature." onRetry={retry} />;

  const brand = state.request.company_name || 'Your company';
  const handle = hostOf(state.request.url).split('.')[0] || 'yourcompany';
  const pk = (ch, i) => hkey('post', t.active, ch, i);
  const all = [];
  CHANNELS.forEach(c => (data.channels[c.id] || []).slice(0, 4).forEach((post, i) => {
    const d = new Date(start); d.setDate(d.getDate() + c.day + 7 * i);
    all.push({ c, i, post, d, offset: c.day + 7 * i, k: pk(c.id, i), st: saved.post_state[pk(c.id, i)] || {} });
  }));
  const approvedN = all.filter(p => p.st.approved).length;
  const ch = CHANNELS.find(c => c.id === channel);
  const feed = all.filter(p => p.c.id === channel);

  const days = Array.from({ length: 28 }, (_, o) => {
    const d = new Date(start); d.setDate(d.getDate() + o);
    return { label: o === 0 || d.getDate() === 1 ? fmtDate(d, { day: 'numeric', month: 'short' }) : String(d.getDate()), chips: all.filter(p => p.offset === o) };
  });

  const genImage = async (p) => {
    if (!p.post.visual) { toast({ type: 'error', message: 'This post has no visual description to generate from.' }); return; }
    setWorking(w => ({ ...w, [p.k]: 'ai' }));
    try {
      const res = await canvaApi.generatePoster({
        day_date: `aeo-${isoDate(p.d)}-${p.c.id}`, post_number: 1,
        visual_suggestion: `${p.post.visual}. Square social-media image for ${brand}. No text, no logos, no watermarks.`,
        caption: p.post.text.slice(0, 500), cta: p.post.cta || '',
      });
      if (res?.poster_image_url) setPostState(p.k, { img: res.poster_image_url, v: (p.st.v || 0) + 1 });
      else toast({ type: 'error', message: 'The image service returned no image. Please try again.' });
    } catch (e) {
      if (e.code !== 'TokenExpired') toast({ type: 'error', message: e.message || 'Could not generate the image.' });
    } finally { setWorking(w => { const n = { ...w }; delete n[p.k]; return n; }); }
  };
  const upload = async (p, file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast({ type: 'error', message: 'Please choose an image under 10 MB.' }); return; }
    setWorking(w => ({ ...w, [p.k]: 'up' }));
    try {
      const res = await socialPublishApi.uploadMedia(file);
      if (res?.image_url) setPostState(p.k, { img: res.image_url });
    } catch (e) {
      if (e.code !== 'TokenExpired') toast({ type: 'error', message: e.message || 'Upload failed.' });
    } finally { setWorking(w => { const n = { ...w }; delete n[p.k]; return n; }); }
  };

  return (
    <>
      <section className="ae-card" style={{ padding: 24, gap: 18 }}>
        <div className="ae-row"><div className="ae-col"><span className="ae-eyebrow p">Social media calendar</span><h2 className="lg">{fmtDate(start, { day: 'numeric', month: 'short' })} – {fmtDate(new Date(start.getTime() + 27 * 864e5), { day: 'numeric', month: 'short', year: 'numeric' })}</h2></div>
          <b style={{ fontSize: 13, color: '#4a4966' }}>{approvedN} of {all.length} posts approved</b></div>
        <div className="ae-chtabs">
          {CHANNELS.map(c => (
            <button key={c.id} className={`ae-chtab ${c.id === channel ? 'on' : ''}`} onClick={() => setChannel(c.id)}>
              <span className="ae-ico" style={{ background: c.bg, color: c.fg }}>{c.abbr}</span>
              <span className="ae-col" style={{ alignItems: 'flex-start' }}><b style={{ fontSize: 13.5 }}>{c.name}</b><span style={{ fontSize: 11.5, color: 'var(--ae-mute)' }}>{all.filter(p => p.c.id === c.id && p.st.approved).length}/4 approved</span></span>
            </button>
          ))}
        </div>
        <div className="ae-cal">
          {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => <span key={d} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--ae-faint)', padding: '0 6px' }}>{d}</span>)}
          {days.map((d, o) => (
            <div key={o} className="ae-cal-d"><span>{d.label}</span>
              {d.chips.map(p => (
                <button key={p.k} title={`${p.c.name} · ${p.c.time}`} onClick={() => setChannel(p.c.id)}
                  style={{ background: p.st.approved ? p.c.fg : p.c.bg, color: p.st.approved ? '#fff' : p.c.fg, borderColor: p.c.id === channel ? '#1c1b3a' : 'transparent' }}>{p.st.approved ? '✓ ' : ''}{p.c.name}</button>
              ))}
            </div>
          ))}
        </div>
        <span className="ae-note">Approving a post marks it ready. To publish or schedule it on a connected account, use <a onClick={() => setPage('publishCalendar')}>Publishing &amp; Canva</a>.</span>
      </section>

      <section className="ae-feed">
        <div className="ae-row" style={{ width: '100%', maxWidth: 560, flexWrap: 'nowrap' }}>
          <b style={{ fontSize: 15 }}>{ch.name} preview</b>
          <button className="ae-btn good sm" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => setPostStates(Object.fromEntries(feed.map(p => [p.k, { approved: true }])))}>Approve all {ch.name}</button>
        </div>
        {feed.map(p => {
          const ap = !!p.st.approved, w = working[p.k];
          return (
            <div key={p.k} className={`ae-post ${ap ? 'ok' : ''}`}>
              <div className="ae-post-bar"><span style={{ color: '#4a4966' }}>{fmtDate(p.d, { weekday: 'short', day: 'numeric', month: 'short' })} · {p.c.time}</span><span style={{ color: ap ? '#047857' : '#b45309' }}>{ap ? 'Approved' : 'Awaiting your approval'}</span></div>
              <PostPreview ch={p.c} post={p.post} short={fmtDate(p.d, { day: 'numeric', month: 'short' })} brand={brand} handle={handle} img={p.st.img} v={p.st.v || 0} i={p.i} />
              <div className="ae-post-actions">
                <span className="ae-eyebrow" style={{ letterSpacing: '.06em' }}>Image</span>
                <button className="ae-btn sm" style={{ fontWeight: 700, ...(p.st.img ? {} : { borderColor: '#4f46e5', background: '#eef0ff', color: '#3730a3' }) }} disabled={!!w} onClick={() => genImage(p)}>{w === 'ai' ? 'Generating…' : p.st.img ? 'Regenerate AI image' : 'Generate AI image'}</button>
                <label className="ae-btn sm" style={{ fontWeight: 700, cursor: 'pointer' }}>{w === 'up' ? 'Uploading…' : 'Upload your own'}<input type="file" accept="image/*" style={{ display: 'none' }} disabled={!!w} onChange={e => { upload(p, e.target.files && e.target.files[0]); e.target.value = ''; }} /></label>
                {p.st.img && <button className="ae-linkbtn" onClick={() => setPostState(p.k, { img: '' })}>Remove image</button>}
                <button className="ae-btn good" style={{ marginLeft: 'auto', fontWeight: 800, padding: '8px 16px', background: ap ? '#ecfdf5' : '#10b981', color: ap ? '#047857' : '#fff' }} onClick={() => setPostState(p.k, { approved: !ap })}>{ap ? 'Approved ✓' : 'Approve'}</button>
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}

/* ── Pages ─────────────────────────────────────────────────────────────── */
export function StrategyAeoPage() {
  const t = useTargets();
  if (!t.active) return <NeedAnalysis setPage={t.setPage} />;
  return <><TargetChips t={t} /><StrategyBlock t={t} /><BlogsBlock t={t} /><CalendarBlock t={t} /></>;
}
export function BlogsAeoPage() {
  const t = useTargets();
  if (!t.active) return <NeedAnalysis setPage={t.setPage} />;
  return <><TargetChips t={t} /><BlogsBlock t={t} /></>;
}
export function CalendarAeoPage() {
  const t = useTargets();
  if (!t.active) return <NeedAnalysis setPage={t.setPage} />;
  return <><TargetChips t={t} /><CalendarBlock t={t} /></>;
}
