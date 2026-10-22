import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { canvaApi } from '../../api/canvaApi';
import { socialPublishApi } from '../../api/socialPublishApi';
import { aeoApi } from '../../api/aeoApi';
import { downloadImage } from '../../api/downloadImage';
import { useAeo } from '../AeoContext';
import { useConnectProgress } from '../useConnectProgress';
import { clearConnectInProgress } from '../../utils/oauthReturn';
import { EngCell, SocialChannelsCard } from '../parts';
import { BrandKitCard, KeywordsPanel, ShortPlayer } from '../BrandKit';
import { BlogTopicsPage } from '../../pages/BlogTopicsPage';
import { BLOG_TAG, CHANNELS, channelState, hkey, ENG_SHORT, TINTS, calendarStart, fmtDate, hostOf, isoDate } from '../utils';


// Older cached posts (or a model slip) can have an empty visual — derive one from the post so it is never blank.
const visualOf = (post, brand) => (post.visual && post.visual.trim())
  || `A realistic, high-quality, real-world photograph for ${brand} showing: ${(post.title || post.text || '').replace(/\s+/g, ' ').slice(0, 160)}`;

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

/** Nothing is generated until the user clicks Generate (it costs tokens). Once generated, a flag is saved so the
 *  (server-cached, free) result reloads automatically on later visits. Returns the click handler. */
function useAutoLoad(kind, key, has, load) {
  const { saved, savedLoaded, setBlogState, team } = useAeo();
  const flag = hkey('gen', kind, key || '');
  // Content our team prepared loads by itself — the customer shouldn't have to click Generate to see it.
  const byTeam = kind === 'social' ? team.social.includes(key) : (team.strategy.includes(key) || team.blogs.some(b => b.prompt === key));
  const was = !!(saved.blog_state[flag] || {}).drafted || byTeam;
  const tried = useRef(new Set());
  useEffect(() => {
    if (!key || has || !was || !savedLoaded) return;
    const k = kind + '|' + key;
    if (tried.current.has(k)) return;
    tried.current.add(k);
    load();
    // eslint-disable-next-line
  }, [kind, key, has, was, savedLoaded]);
  return async () => {
    const d = await load();
    if (d && !(saved.blog_state[flag] || {}).drafted) setBlogState(flag, { drafted: true });
  };
}

function PreviewBanner({ what }) {
  const { requirePayment } = useApp();
  return (
    <div className="ae-banner" style={{ borderRadius: 14, border: '1px solid #fde68a' }}>
      <span><b>Free preview.</b> {what}</span>
      <button className="ae-btn sm primary" onClick={() => requirePayment('aeoStrategy')}>Unlock everything</button>
    </div>
  );
}
function LockedTile({ label }) {
  const { requirePayment } = useApp();
  return (
    <div className="ae-pillar" style={{ background: '#fafaff', borderStyle: 'dashed', cursor: 'pointer', justifyContent: 'center', alignItems: 'center', textAlign: 'center', minHeight: 110 }} onClick={() => requirePayment('aeoStrategy')}>
      <span style={{ fontSize: 20 }}>🔒</span><span className="ae-sub">{label}</span>
    </div>
  );
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
function Retry({ title, text, onRetry, label = 'Generate' }) {
  return (
    <div className="ae-empty"><h2>{title}</h2><p>{text}</p><button className="ae-btn primary" onClick={onRetry}>{label}</button></div>
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
      : <Retry title="Content strategy" text={`Build the answer we want AI to give for “${t.active}”, the content to publish and a 4-week plan.`} label="Generate strategy" onRetry={retry} />;
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
      {data.limited && <PreviewBanner what="You see the answer, one content pillar and the first two weeks. The full plan has four pillars and four weeks." />}
      <div className="ae-answer"><span className="ae-eyebrow p">The answer we want AI to give</span><span style={{ fontSize: 15, lineHeight: 1.55, fontWeight: 500 }}>{data.answer}</span></div>
      <div className="ae-pillars">
        {data.pillars.map((p, i) => (
          <div key={i} className="ae-pillar">
            <span className="ae-eyebrow">{p.type}</span><span style={{ fontSize: 15, fontWeight: 800 }}>{p.title}</span>
            <span style={{ fontSize: 13, color: '#4a4966', lineHeight: 1.5 }}>{p.detail}</span>
            <span className="ae-mono" style={{ marginTop: 'auto', fontSize: 11.5, color: '#4f46e5' }}>{p.meta}</span>
          </div>
        ))}
        {data.limited && [1, 2, 3].map(i => <LockedTile key={i} label="More content pillars" />)}
      </div>
      <div className="ae-plan">
        {data.plan.map((w, i) => (
          <div key={i}><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#4f46e5' }}>{w.week}</span><span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>{w.task}</span></div>
        ))}
        {data.limited && [3, 4].map(n => <div key={n} style={{ cursor: 'pointer', opacity: .6 }}><span style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5' }}>WEEK {n}</span><span style={{ fontSize: 13 }}>🔒 Locked</span></div>)}
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
          <span className="ae-note" style={{ marginRight: 'auto', fontSize: 12.5 }}>{item.origin === 'pending' ? 'Team review requested — our team will check and edit this for you.' : item.origin === 'verified' ? 'Checked and finalised by our team.' : item.origin === 'edited' ? 'Written or edited by our team.' : 'Written by AI from your website and market data. Check facts before publishing.'}</span>
          {item.origin === 'ai' && !item.approved && <button className="ae-btn" onClick={onRequest}>Request team review</button>}
          <button className="ae-btn" style={{ borderColor: '#10b981', fontWeight: 800, padding: '10px 20px', background: item.approved ? '#ecfdf5' : '#10b981', color: item.approved ? '#047857' : '#fff' }} onClick={onApprove}>{item.approved ? 'Approved ✓' : 'Approve blog'}</button>
        </div>
      </article>
    </div>
  );
}

function BlogsBlock({ t }) {
  const { content, busy, saved, loadStrategy, loadBlogDraft, setBlogState } = useAeo();
  const { requirePayment } = useApp();
  const [reader, setReader] = useState(null);
  const data = content.strategy[t.active];
  const retry = useAutoLoad('strategy', t.active, !!data, () => loadStrategy(t.active));
  if (!data) return busy['strategy|' + t.active] ? <Generating title="Finding blog topics" text="Matching topics to what AI engines are being asked…" /> : <Retry title="Blog topics" text={`Get blog topic ideas written to win “${t.active}”. You can then draft and approve each one.`} label="Generate blog topics" onRetry={retry} />;

  const items = data.blog_topics.map(b => {
    const k = hkey('blog', t.active, b.title);
    const st = saved.blog_state[k] || {};
    const origin = st.team === 'verified' ? 'verified' : st.team === 'edited' ? 'edited' : st.pending ? 'pending' : st.drafted ? 'ai' : 'idea';
    return { ...b, k, origin, approved: !!st.approved, drafted: !!st.drafted,
      meta: `${b.words.toLocaleString()} words · ${Math.ceil(b.words / 230)} min read · targets “${t.active}”` };
  });
  const drafts = items.filter(b => b.origin !== 'idea');

  const draftKey = (b) => `${t.active}|${b.title}`;
  const generate = async (b) => {
    if (data.limited) { requirePayment('aeoBlog'); return null; }
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
      {data.limited && <PreviewBanner what="Topic ideas are free. Full blog drafts are part of a paid plan." />}
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
const _signed = {};
function PostImg({ src }) {
  const [url, setUrl] = useState(_signed[src] || src);
  const [failed, setFailed] = useState(false);
  const [tried, setTried] = useState(!!_signed[src]);
  useEffect(() => { setUrl(_signed[src] || src); setFailed(false); setTried(!!_signed[src]); }, [src]);
  // If the raw link can't be displayed (bucket not public), ask the server for a signed link once.
  const onError = async () => {
    if (tried) { setFailed(true); return; }
    setTried(true);
    try { const r = await aeoApi.imageUrl(src); _signed[src] = r.url; setUrl(r.url); }
    catch { setFailed(true); }
  };
  if (failed) return <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 12, fontSize: 12.5, background: 'rgba(255,255,255,.85)' }}>Image saved but could not be loaded. <a href={src} target="_blank" rel="noreferrer" style={{ marginLeft: 4 }}>Open link</a></div>;
  return <img src={url} alt="Post visual" title="Click to view full size" onError={onError} onClick={() => window.open(url, '_blank', 'noopener')} />;
}

function VisualBrief({ post, fallback, hasImg, working, onSave, onRegen, video }) {
  const [txt, setTxt] = useState(post.visual || fallback);
  useEffect(() => { setTxt(post.visual || fallback); }, [post.visual, fallback]);
  const changed = txt.trim() !== (post.visual || fallback).trim();
  return (
    <div className="ae-vsug" style={{ gap: 8 }}>
      <span className="ae-eyebrow p">{video ? 'Content suggestion for the video' : 'Content suggestion for the image'}</span>
      <textarea className="ae-input" style={{ minHeight: 76, resize: 'vertical', fontFamily: 'inherit', padding: '9px 12px' }} maxLength={800} value={txt} onChange={e => setTxt(e.target.value)}
        placeholder={video ? 'Describe what the video should show — e.g. a mover carefully wrapping furniture in a bright Singapore apartment' : 'Describe the image you want — e.g. a friendly team at work, bright office, blue and white colours'} />
      <span className="ae-note">{video ? 'We make a vertical YouTube Short from real-looking scenes of this, with your logo and contact details. You can also upload your own Short.' : 'Change this to tell us what the image should show — we create a realistic photo of it with your logo and contact details. You can also upload your own image.'}</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="ae-btn sm primary" disabled={!!working || !txt.trim()} onClick={() => onRegen(txt.trim())}>{working === (video ? 'vid' : 'ai') ? (video ? 'Creating video…' : 'Generating…') : hasImg ? (video ? '↻ Save & regenerate Short' : '↻ Save & regenerate image') : (video ? '✨ Save & generate Short' : '✨ Save & generate image')}</button>
        <button type="button" className="ae-btn sm" disabled={!!working || !changed || !txt.trim()} onClick={() => onSave(txt.trim())}>Save suggestion only</button>
      </div>
    </div>
  );
}

function PostEditForm({ ch, post, saving, onSave, onCancel }) {
  const [d, setD] = useState({ text: post.text || '', cta: post.cta || '', tags: post.tags || '', title: post.title || '', duration: post.duration || '' });
  const set = (k) => (e) => setD(x => ({ ...x, [k]: e.target.value }));
  const lab = { fontSize: 12, fontWeight: 700, color: '#4a4966' };
  const inp = { padding: '9px 12px', width: '100%', fontFamily: 'inherit' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', background: '#f8f8fd', borderTop: '1px solid var(--ae-line2)' }}>
      {ch.id === 'yt' && <label style={{ display: 'grid', gap: 4 }}><span style={lab}>Video title</span><input className="ae-input" style={inp} maxLength={200} value={d.title} onChange={set('title')} /></label>}
      <label style={{ display: 'grid', gap: 4 }}><span style={lab}>Caption</span><textarea className="ae-input" style={{ ...inp, minHeight: 130, resize: 'vertical' }} maxLength={3000} value={d.text} onChange={set('text')} /></label>
      <label style={{ display: 'grid', gap: 4 }}><span style={lab}>Call to action</span><input className="ae-input" style={inp} maxLength={200} value={d.cta} onChange={set('cta')} /></label>
      <label style={{ display: 'grid', gap: 4 }}><span style={lab}>Hashtags</span><input className="ae-input" style={inp} maxLength={400} value={d.tags} onChange={set('tags')} placeholder="#example #hashtags" /></label>
      {ch.id === 'yt' && <label style={{ display: 'grid', gap: 4 }}><span style={lab}>Video length</span><input className="ae-input" style={inp} maxLength={20} value={d.duration} onChange={set('duration')} placeholder="e.g. 0:45" /></label>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="ae-btn primary sm" disabled={saving || !d.text.trim()} onClick={() => onSave(d)}>{saving ? 'Saving…' : 'Save changes'}</button>
        <button type="button" className="ae-btn sm" disabled={saving} onClick={onCancel}>Cancel</button>
        {!d.text.trim() && <span className="ae-err">The caption can't be empty.</span>}
      </div>
    </div>
  );
}

function PostPreview({ ch, post, when, short, brand, handle, img, vid, vthumb, v, i, showVisual, onToggleVisual, visualSlot }) {
  const ini = brand.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const tint = TINTS[(i + v) % TINTS.length];
  const id = ch.id;
  const text = post.text;
  return (
    <div style={{ background: '#fff', display: 'flex', flexDirection: 'column' }}>
      {id === 'fb' && <><div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 16px 8px' }}><div className="ae-ico" style={{ width: 40, height: 40, borderRadius: '50%', background: '#1d4ed8', color: '#fff' }}>{ini}</div><div className="ae-col"><b style={{ fontSize: 14.5 }}>{brand}</b><span style={{ fontSize: 12, color: '#65676b' }}>{short} · Public</span></div></div><div style={{ padding: '0 16px 12px', fontSize: 14, lineHeight: 1.5 }}><pre>{text}</pre>{post.cta && <b style={{ display: 'block', marginTop: 6 }}>{post.cta}</b>}{post.tags && <span style={{ display: 'block', marginTop: 6, color: '#1d4ed8' }}>{post.tags}</span>}</div></>}
      {id === 'ig' && <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px' }}><div style={{ width: 34, height: 34, borderRadius: '50%', padding: 2, background: '#e1306c' }}><div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 10 }}>{ini}</div></div><b style={{ fontSize: 13.5 }}>{handle}</b></div>}
      {id === 'li' && <><div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 16px 8px' }}><div className="ae-ico" style={{ width: 44, height: 44, borderRadius: 6, background: '#1e3a8a', color: '#fff' }}>{ini}</div><div className="ae-col"><b style={{ fontSize: 14 }}>{brand}</b><span style={{ fontSize: 12, color: '#666' }}>{short}</span></div></div><div style={{ padding: '0 16px 12px', fontSize: 14, lineHeight: 1.5 }}><pre>{text}</pre>{post.cta && <b style={{ display: 'block', marginTop: 6 }}>{post.cta}</b>}{post.tags && <span style={{ display: 'block', marginTop: 6, color: '#1d4ed8' }}>{post.tags}</span>}</div></>}
      {id === 'gbp' && <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 16px 10px' }}><div className="ae-ico" style={{ width: 36, height: 36, borderRadius: '50%', background: '#fef3c7', color: '#92400e' }}>{ini}</div><div className="ae-col"><b style={{ fontSize: 14 }}>{brand}</b><span style={{ fontSize: 12, color: '#5f6368' }}>Update · {short}</span></div></div>}

      <div className={`ae-post-img${id !== 'yt' && img ? ' has-img' : ''}`} style={{ aspectRatio: id === 'yt' ? '9 / 16' : ch.aspect, ...(id === 'yt' ? { maxWidth: 340, margin: '0 auto', width: '100%' } : {}), background: id === 'yt' && vid ? '#000' : `repeating-linear-gradient(135deg,${tint[0]} 0 12px,${tint[1]} 12px 24px)` }}>
        {id === 'yt'
          ? (vid ? <ShortPlayer src={vid} thumb={vthumb} /> : <button type="button" className="ae-btn sm ph-btn" onClick={onToggleVisual}>🎬 Short video — content suggestion</button>)
          : img ? <PostImg src={img} /> : <button type="button" className="ae-btn sm ph-btn" onClick={onToggleVisual}>💡 Content suggestion</button>}
        {id === 'yt' && !vid && post.duration && <span style={{ position: 'absolute', right: 8, bottom: 8, background: 'rgba(0,0,0,.8)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>{post.duration}</span>}
      </div>

      {showVisual && visualSlot}

      {id === 'fb' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', margin: '0 12px', padding: '6px 0', borderTop: '1px solid #e4e6eb', fontSize: 13.5, fontWeight: 600, color: '#65676b', textAlign: 'center' }}><span>Like</span><span>Comment</span><span>Share</span></div>}
      {id === 'ig' && <><div style={{ display: 'flex', gap: 16, padding: '10px 12px 4px', fontSize: 13, fontWeight: 700 }}><span>Like</span><span>Comment</span><span>Share</span><span style={{ marginLeft: 'auto' }}>Save</span></div><div style={{ padding: '4px 12px 14px', fontSize: 13.5, lineHeight: 1.45 }}><b>{handle}</b> <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span><span style={{ display: 'block', marginTop: 6, color: '#00376b' }}>{post.tags}</span></div></>}
      {id === 'li' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', margin: '0 12px', padding: '8px 0', borderTop: '1px solid #e0e0e0', fontSize: 13, fontWeight: 600, color: '#666', textAlign: 'center' }}><span>Like</span><span>Comment</span><span>Repost</span><span>Send</span></div>}
      {id === 'yt' && <div style={{ display: 'flex', gap: 12, padding: '12px 14px 14px' }}><div className="ae-ico" style={{ width: 36, height: 36, flexShrink: 0, borderRadius: '50%', background: '#991b1b', color: '#fff', fontSize: 12 }}>{ini}</div><div className="ae-col" style={{ gap: 3 }}><b style={{ fontSize: 15, lineHeight: 1.35 }}>{post.title || text}</b><span style={{ fontSize: 12.5, color: '#606060' }}>{brand} · Premieres {short}</span><span style={{ fontSize: 13, color: '#3f3f3f', lineHeight: 1.45, marginTop: 4 }}>{text}</span></div></div>}
      {id === 'gbp' && <><div style={{ padding: '12px 16px', fontSize: 14, lineHeight: 1.5 }}>{text}</div>{post.cta && <div style={{ padding: '0 16px 16px' }}><span style={{ display: 'inline-flex', padding: '8px 18px', borderRadius: 999, border: '1px solid #dadce0', color: '#1a73e8', fontSize: 14, fontWeight: 600 }}>{post.cta}</span></div>}</>}
    </div>
  );
}

function CalendarBlock({ t }) {
  const { content, busy, saved, brand: brandKit, loadSocial, editPost, setPostState, setPostStates } = useAeo();
  const { state, toast, setPage } = useApp();
  const [channel, setChannel] = useState('fb');
  const [working, setWorking] = useState({});
  const [editing, setEditing] = useState({});
  const [savingPost, setSavingPost] = useState({});
  const [openVis, setOpenVis] = useState({});
  const [conn, setConn] = useState({});
  const [showLink, setShowLink] = useState(false);
  const [confirmPub, setConfirmPub] = useState(null);
  const brandRef = useRef(null);
  const progress = useConnectProgress();
  useEffect(() => { let off = false; socialPublishApi.status().then(d => { if (off) return; const m = {}; (d?.platforms || []).forEach(x => { m[x.platform] = x; if (x.connected && !x.needs_reconnect) clearConnectInProgress(x.platform); }); setConn(m); }).catch(() => {}); return () => { off = true; }; }, []);
  const data = content.social[t.active];
  const retry = useAutoLoad('social', t.active, !!data, () => loadSocial(t.active));
  const start = useMemo(() => calendarStart(), []);

  if (!data) return busy['social|' + t.active] ? <Generating title={`Writing your posts for “${t.active}”`} text="Drafting four posts for each of your five channels…" /> : <><BrandKitCard /><Retry title="Social media calendar" text={`Create a 4-week calendar with posts for Facebook, Instagram, LinkedIn, YouTube Shorts and Google Business, built around your keywords (or the top 10 from your website if you add none) and supporting “${t.active}”. Then generate a realistic image for each post — with your logo and contact details — and approve it.`} label="Generate social media calendar" onRetry={retry} /></>;

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

  const savePost = async (p, fields) => {
    setSavingPost(m => ({ ...m, [p.k]: true }));
    const ok = await editPost(t.active, p.c.id, p.i, fields);
    setSavingPost(m => { const n = { ...m }; delete n[p.k]; return n; });
    if (ok) toast({ type: 'success', message: 'Saved.' });
    return ok;
  };
  const downloadPostImage = async (p) => {
    setWorking(w => ({ ...w, [p.k]: 'dl' }));
    try {
      const ok = await downloadImage(p.st.img, `${brand}-${p.c.id}-${isoDate(p.d)}`, () => aeoApi.downloadBlob(p.st.img));
      if (!ok) toast({ type: 'info', message: 'Opened the image in a new tab — right-click it to save.' });
    } finally { setWorking(w => { const n = { ...w }; delete n[p.k]; return n; }); }
  };
  const postCaption = (p) => [p.post.text, p.post.cta, p.post.tags].map(x => (x || '').trim()).filter(Boolean).join('\n\n');
  const publishNow = async (p) => {
    setConfirmPub(null);
    const cs = channelState(p.c, conn[p.c.platform], !!progress[p.c.platform]);
    if (cs.key !== 'on') {
      setShowLink(true);
      toast({ type: 'info', message: cs.key === 'progress' ? `Your ${p.c.name} connection is in progress. We will be able to publish here once it is ready.` : `Connect your ${p.c.name} account first, then publish.` });
      return;
    }
    setWorking(w => ({ ...w, [p.k]: 'pub' }));
    try {
      const res = await socialPublishApi.publish({
        ...(p.c.id === 'yt' ? { video_url: p.st.vid, title: (p.post.title || '').slice(0, 100) || undefined } : { image_url: p.st.img }),
        caption: postCaption(p).slice(0, 3000), platforms: [p.c.platform],
        cta_url: hostOf(state.request.url) ? `https://${hostOf(state.request.url)}` : undefined,
        day_date: isoDate(p.d), post_number: 1,
      });
      const r = (res?.results || [])[0] || {};
      if (r.success) {
        setPostState(p.k, { approved: true, published: true, pub_at: new Date().toISOString() });
        toast({ type: 'success', message: `Published to ${p.c.name}.` });
      } else if (r.needs_reconnect) {
        setShowLink(true);
        toast({ type: 'info', message: `Please reconnect your ${p.c.name} account, then publish again.` });
      } else if (p.c.platform === 'facebook' || p.c.platform === 'instagram') {
        toast({ type: 'error', message: r.error || `Could not publish to ${p.c.name}. Please try again.` });
      } else {
        toast({ type: 'info', message: `${p.c.name} publishing is still being set up for your account. Your post is saved and approved — we will publish it once it is ready.` });
      }
    } catch (e) {
      if (e.code !== 'TokenExpired') toast({ type: 'error', message: e.message || 'Could not publish. Please try again.' });
    } finally { setWorking(w => { const n = { ...w }; delete n[p.k]; return n; }); }
  };
  const needBrand = () => {
    if (brandKit.complete) return false;
    toast({ type: 'info', message: 'Add your logo and contact phone number first — they are printed on every image and Short.' });
    if (brandRef.current) brandRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  };
  const bizPayload = () => ({ company_name: state.request.company_name || '', industry: state.request.industry || '', keywords: saved.calendar_keywords || [] });
  const genImage = async (p, brief) => {
    if (needBrand()) return;
    setWorking(w => ({ ...w, [p.k]: 'ai' }));
    try {
      const res = await canvaApi.generatePoster({
        day_date: `aeo-${isoDate(p.d)}-${p.c.id}`, post_number: 1,
        visual_suggestion: brief || visualOf(p.post, brand),
        caption: p.post.text.slice(0, 500), cta: p.post.cta || '', ...bizPayload(),
      });
      if (res?.poster_image_url) setPostState(p.k, { img: res.poster_image_url, v: (p.st.v || 0) + 1 });
      else toast({ type: 'error', message: 'The image service returned no image. Please try again.' });
    } catch (e) {
      if (e.code !== 'TokenExpired') toast({ type: 'error', message: e.message || 'Could not generate the image.' });
    } finally { setWorking(w => { const n = { ...w }; delete n[p.k]; return n; }); }
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const genShort = async (p, brief) => {
    if (needBrand()) return;
    setWorking(w => ({ ...w, [p.k]: 'vid' }));
    try {
      const { job_id } = await aeoApi.startShort({
        title: p.post.title || '', text: p.post.text.slice(0, 1500), visual: brief || visualOf(p.post, brand), ...bizPayload(),
      });
      const until = Date.now() + 9 * 60 * 1000;
      while (Date.now() < until) {
        await sleep(4000);
        const st = await aeoApi.shortStatus(job_id);
        if (st.status === 'done') { setPostState(p.k, { vid: st.video_url, vthumb: st.thumb_url, v: (p.st.v || 0) + 1 }); toast({ type: 'success', message: 'Your Short is ready.' }); return; }
        if (st.status === 'error') throw new Error(st.error || 'Could not create the video.');
      }
      throw new Error('The video is taking longer than usual. Please try again in a few minutes.');
    } catch (e) {
      if (e.code !== 'TokenExpired') toast({ type: 'error', message: e.message || 'Could not create the video.' });
    } finally { setWorking(w => { const n = { ...w }; delete n[p.k]; return n; }); }
  };
  const uploadShort = async (p, file) => {
    if (!file) return;
    if (file.size > 120 * 1024 * 1024) { toast({ type: 'error', message: 'Please choose a video under 120 MB.' }); return; }
    setWorking(w => ({ ...w, [p.k]: 'upv' }));
    try {
      const res = await socialPublishApi.uploadVideo(file);
      if (res?.video_url) { setPostState(p.k, { vid: res.video_url, vthumb: res.thumb_url || '', v: (p.st.v || 0) + 1 }); toast({ type: 'success', message: 'Your Short is uploaded.' }); }
    } catch (e) {
      if (e.code !== 'TokenExpired') toast({ type: 'error', message: e.message || 'Upload failed.' });
    } finally { setWorking(w => { const n = { ...w }; delete n[p.k]; return n; }); }
  };
  const downloadShort = async (p) => {
    setWorking(w => ({ ...w, [p.k]: 'dl' }));
    try {
      let url = p.st.vid;
      try { url = (await aeoApi.imageUrl(p.st.vid)).url || url; } catch (_) { /* public link */ }
      const blob = await (await fetch(url)).blob();
      const a = document.createElement('a'); const href = URL.createObjectURL(blob);
      a.href = href; a.download = `${brand}-short-${isoDate(p.d)}.mp4`.replace(/[^a-z0-9._-]+/gi, '-'); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
    } catch (_) { window.open(p.st.vid, '_blank', 'noopener'); }
    finally { setWorking(w => { const n = { ...w }; delete n[p.k]; return n; }); }
  };
  const rebuild = async (prompt) => {
    if (!window.confirm('Rebuild the calendar around these keywords? The posts are rewritten. Images and approvals stay on the same slots.')) return;
    await loadSocial(prompt, true);
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
      <div ref={brandRef}><BrandKitCard /></div>
      <section className="ae-card" style={{ padding: 24, gap: 18 }}>
        <div className="ae-row"><div className="ae-col"><span className="ae-eyebrow p">Social media calendar</span><h2 className="lg">{fmtDate(start, { day: 'numeric', month: 'short' })} – {fmtDate(new Date(start.getTime() + 27 * 864e5), { day: 'numeric', month: 'short', year: 'numeric' })}</h2></div>
          <b style={{ fontSize: 13, color: '#4a4966' }}>{approvedN} of {all.length} posts approved</b></div>
        <KeywordsPanel prompt={t.active} onRegenerate={rebuild} regenerating={!!busy['social|' + t.active]} />
        <div className="ae-chtabs">
          {CHANNELS.map(c => (
            <button key={c.id} className={`ae-chtab ${c.id === channel ? 'on' : ''}`} onClick={() => setChannel(c.id)}>
              <span className="ae-ico" style={{ background: c.bg, color: c.fg }}>{c.abbr}</span>
              <span className="ae-col" style={{ alignItems: 'flex-start' }}>
                <b style={{ fontSize: 13.5 }}>{c.name}</b>
                {(() => { const cs = channelState(c, conn[c.platform], !!progress[c.platform]);
                  return <span style={{ fontSize: 11, fontWeight: 700, color: cs.color }}>{cs.label}</span>; })()}
                {(() => {
                  const tot = all.filter(p => p.c.id === c.id).length, ok = all.filter(p => p.c.id === c.id && p.st.approved).length;
                  const done = tot > 0 && ok === tot;
                  return <span className="ae-pill" style={{ fontSize: 11, padding: '2px 8px', background: done ? '#d1fae5' : ok ? '#fef3c7' : '#fee2e2', color: done ? '#065f46' : ok ? '#92400e' : '#991b1b' }}>
                    {done ? '✓ Approved' : ok ? `Partly approved · ${ok}/${tot}` : `Not approved · 0/${tot}`}</span>;
                })()}
              </span>
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
        {(() => { const cs = channelState(ch, conn[ch.platform], !!progress[ch.platform]);
          if (cs.key === 'on') return null;
          const prog = cs.key === 'progress';
          return <div className="ae-note" style={{ background: '#f3f4ff', border: '1px solid #dcdcf7', color: '#3730a3', padding: '10px 14px', borderRadius: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{prog ? <><b>{ch.name} is in progress.</b> We are finishing this connection — you can write, edit and approve these posts now and we will publish them once it is ready.</>
              : <><b>Connect your {ch.name} account</b> to publish these posts. You can approve them in the meantime.</>}</span>
            <button className="ae-btn sm" onClick={() => setShowLink(v => !v)}>{showLink ? 'Hide' : prog ? 'Try again' : 'Connect account'}</button></div>; })()}
        {showLink && <SocialChannelsCard />}
        {data.limited && <PreviewBanner what="You get one post per channel. Paid plans include four posts per channel across the 4 weeks." />}
        <span className="ae-note">Approve each post when you are happy with it and its image. Channels with unapproved posts are marked “Not approved”.</span>
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
              <div className="ae-post-bar"><span style={{ color: '#4a4966' }}>{fmtDate(p.d, { weekday: 'short', day: 'numeric', month: 'short' })} · {p.c.time}</span><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{p.st.team && <span className="ae-pill" style={{ fontSize: 11, background: '#e0f2fe', color: '#075985' }}>{p.st.team === 'verified' ? 'Verified by our team' : 'Updated by our team'}</span>}<span style={{ color: ap ? '#047857' : '#b45309' }}>{ap ? 'Approved' : 'Awaiting your approval'}</span></span></div>
              <PostPreview ch={p.c} post={p.post} short={fmtDate(p.d, { day: 'numeric', month: 'short' })} brand={brand} handle={handle} img={p.st.img} vid={p.st.vid} vthumb={p.st.vthumb} v={p.st.v || 0} i={p.i}
                showVisual={!!openVis[p.k]} onToggleVisual={() => setOpenVis(o => ({ ...o, [p.k]: !o[p.k] }))}
                visualSlot={<VisualBrief post={p.post} fallback={visualOf(p.post, brand)} hasImg={p.c.id === 'yt' ? !!p.st.vid : !!p.st.img} working={w} video={p.c.id === 'yt'}
                  onSave={(v) => savePost(p, { visual: v })}
                  onRegen={async (v) => { if (v !== (p.post.visual || visualOf(p.post, brand)).trim()) { if (!(await savePost(p, { visual: v }))) return; } p.c.id === 'yt' ? genShort(p, v) : genImage(p, v); }} />} />
              {editing[p.k] && <PostEditForm ch={p.c} post={p.post} saving={!!savingPost[p.k]}
                onCancel={() => setEditing(m => ({ ...m, [p.k]: false }))}
                onSave={async (d) => { if (await savePost(p, d)) setEditing(m => ({ ...m, [p.k]: false })); }} />}
              <div className="ae-post-actions">
                <button className="ae-btn sm" style={{ fontWeight: 700 }} onClick={() => setEditing(m => ({ ...m, [p.k]: !m[p.k] }))}>{editing[p.k] ? 'Close editor' : '✎ Edit post'}</button>
                {p.c.id === 'yt' ? <>
                  <span className="ae-eyebrow" style={{ letterSpacing: '.06em' }}>Short video</span>
                  <button className="ae-btn sm" style={{ fontWeight: 700 }} onClick={() => setOpenVis(o => ({ ...o, [p.k]: !o[p.k] }))}>{openVis[p.k] ? 'Hide suggestion' : '💡 Content suggestion'}</button>
                  <button className="ae-btn sm" style={{ fontWeight: 700, ...(p.st.vid ? {} : { borderColor: '#4f46e5', background: '#eef0ff', color: '#3730a3' }) }} disabled={!!w} onClick={() => genShort(p)}>{w === 'vid' ? 'Creating your Short… (1–2 min)' : p.st.vid ? 'Regenerate Short' : '🎬 Generate Short video'}</button>
                  <label className="ae-btn sm" style={{ fontWeight: 700, cursor: 'pointer' }}>{w === 'upv' ? 'Uploading…' : 'Upload your own Short'}<input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" style={{ display: 'none' }} disabled={!!w} onChange={e => { uploadShort(p, e.target.files && e.target.files[0]); e.target.value = ''; }} /></label>
                  {p.st.vid && <button className="ae-btn sm" style={{ fontWeight: 700 }} disabled={w === 'dl'} onClick={() => downloadShort(p)}>{w === 'dl' ? 'Preparing…' : '⬇ Download'}</button>}
                  {p.st.vid && <button className="ae-linkbtn" onClick={() => setPostState(p.k, { vid: '', vthumb: '' })}>Remove video</button>}
                </> : <>
                <span className="ae-eyebrow" style={{ letterSpacing: '.06em' }}>Image</span>
                <button className="ae-btn sm" style={{ fontWeight: 700 }} onClick={() => setOpenVis(o => ({ ...o, [p.k]: !o[p.k] }))}>{openVis[p.k] ? 'Hide suggestion' : '💡 Content suggestion'}</button>
                <button className="ae-btn sm" style={{ fontWeight: 700, ...(p.st.img ? {} : { borderColor: '#4f46e5', background: '#eef0ff', color: '#3730a3' }) }} disabled={!!w} onClick={() => genImage(p)}>{w === 'ai' ? 'Generating…' : p.st.img ? 'Regenerate AI image' : 'Generate AI image'}</button>
                <label className="ae-btn sm" style={{ fontWeight: 700, cursor: 'pointer' }}>{w === 'up' ? 'Uploading…' : 'Upload your own'}<input type="file" accept="image/*" style={{ display: 'none' }} disabled={!!w} onChange={e => { upload(p, e.target.files && e.target.files[0]); e.target.value = ''; }} /></label>
                {p.st.img && <button className="ae-btn sm" style={{ fontWeight: 700 }} disabled={w === 'dl'} onClick={() => downloadPostImage(p)}>{w === 'dl' ? 'Preparing…' : '⬇ Download'}</button>}
                {p.st.img && <button className="ae-linkbtn" onClick={() => setPostState(p.k, { img: '' })}>Remove image</button>}
                </>}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {p.st.published && <span className="ae-pill" style={{ fontSize: 11.5, background: '#d1fae5', color: '#065f46' }} title={p.st.pub_at ? new Date(p.st.pub_at).toLocaleString() : ''}>✓ Published</span>}
                  {confirmPub === p.k
                    ? <><span className="ae-note" style={{ fontSize: 12.5 }}>Post to {p.c.name} now?</span>
                        <button className="ae-btn sm" style={{ fontWeight: 800, background: '#4f46e5', color: '#fff', borderColor: '#4f46e5' }} onClick={() => publishNow(p)}>Yes, publish</button>
                        <button className="ae-btn sm" onClick={() => setConfirmPub(null)}>Cancel</button></>
                    : <button className="ae-btn sm" style={{ fontWeight: 800 }} disabled={!!w || !(p.c.id === 'yt' ? p.st.vid : p.st.img) || !!data.limited}
                        title={data.limited ? 'Publishing is available on paid plans.' : !(p.c.id === 'yt' ? p.st.vid : p.st.img) ? (p.c.id === 'yt' ? 'Create or upload a Short first.' : 'Add an image first — every channel needs one.') : `Post this to ${p.c.name} right now`}
                        onClick={() => setConfirmPub(p.k)}>{w === 'pub' ? 'Publishing…' : p.st.published ? '↻ Publish again' : '🚀 Publish now'}</button>}
                  <button className="ae-btn good" style={{ fontWeight: 800, padding: '8px 16px', background: ap ? '#ecfdf5' : '#10b981', color: ap ? '#047857' : '#fff' }} onClick={() => setPostState(p.k, { approved: !ap })}>{ap ? 'Approved ✓' : 'Approve'}</button>
                </span>
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
function Tabs({ tabs, value, onChange }) {
  return <div className="ae-seg">{tabs.map(([id, label]) => <button key={id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{label}</button>)}</div>;
}

export function BlogsAeoPage() {
  const t = useTargets();
  const { refreshTeamWork } = useAeo();
  useEffect(() => { refreshTeamWork(); }, []); // eslint-disable-line
  const [tab, setTab] = useState('ai');
  return (
    <>
      <Tabs value={tab} onChange={setTab} tabs={[['ai', 'Topics for my prompts'], ['team', 'From our team']]} />
      {tab === 'team' && <BlogTopicsPage />}
      {tab === 'ai' && (t.active ? <><TargetChips t={t} /><BlogsBlock t={t} /></> : <NeedAnalysis setPage={t.setPage} />)}
    </>
  );
}
export function CalendarAeoPage() {
  const t = useTargets();
  const { refreshTeamWork } = useAeo();
  useEffect(() => { refreshTeamWork(); }, []); // eslint-disable-line
  if (!t.active) return <NeedAnalysis setPage={t.setPage} />;
  return <><TargetChips t={t} /><CalendarBlock t={t} /></>;
}
