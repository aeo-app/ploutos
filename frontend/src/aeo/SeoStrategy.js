import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAeo } from './AeoContext';
import { PAGE_TEMPLATES, templateById, pageKey, sampleContent } from './pageTemplates';
import { renderPageHtml, DEFAULT_THEME } from './pageRender';
import { ScaledFrame, StylePicker } from './PageUi';
import { PageReader } from './PageReader';
import { DesignPreview, useSiteStyle, loadTheme, saveTheme } from './PageStudio';

const INTENT = {
  informational: ['Informational', 'People want to learn', '#eef2ff', '#3730a3'],
  commercial: ['Commercial', 'People are comparing options', '#fff7ed', '#9a3412'],
  transactional: ['Transactional', 'People are ready to buy or book', '#ecfdf5', '#047857'],
  local: ['Local', 'People want something nearby', '#fdf2f8', '#9d174d'],
};
const Pill = ({ children, bg = '#f3f4f8', fg = '#3a3957' }) => <span className="ae-pill" style={{ background: bg, color: fg }}>{children}</span>;

// Same mapping as the server (seo_page_template): an idea's format picks the suggested design.
const FORMAT_TEMPLATE = { 'service page': 'service', guide: 'guide', 'faq page': 'faq', comparison: 'comparison', 'local page': 'location', checklist: 'how_to', 'case study outline': 'guide' };
const suggestedTemplate = (format) => FORMAT_TEMPLATE[String(format || '').trim().toLowerCase()] || 'guide';
const THEME_NOTE = 'We matched your website’s colours automatically. You can change them any time.';

/** The same flow as Content Strategy: pick a design, pick colours and fonts, we write the page, then preview / download / publish. */
function SeoPageDesigner({ keyword, idea, onClose }) {
  const { content, busy, loadSeoPage } = useAeo();
  const { state } = useApp();
  const company = state.request.company_name || '';
  const [tpl, setTpl] = useState(() => suggestedTemplate(idea.format));
  const [title, setTitle] = useState(idea.title);
  const [theme, setTheme] = useState(() => ({ ...DEFAULT_THEME, ...(loadTheme() || {}) }));
  const [chosen, setChosen] = useState(() => !!loadTheme());
  const [previewId, setPreviewId] = useState('');
  const [openKey, setOpenKey] = useState(null);
  const siteStyle = useSiteStyle(state.request.url, company, (d) => {
    if (d?.found && d.primary && !loadTheme()) setTheme(th => ({ ...th, primary: d.primary, accent: d.secondary || '', font: d.font_kind === 'serif' ? 'classic' : 'modern', fontName: d.font || '' }));
  });
  const profile = useMemo(() => ({ logo: siteStyle.logo, phone: siteStyle.phone, email: siteStyle.email, address: siteStyle.address }),
    [siteStyle.logo, siteStyle.phone, siteStyle.email, siteStyle.address]);
  const changeTheme = (th) => { setTheme(th); setChosen(true); saveTheme(th); };
  const previews = useMemo(() => Object.fromEntries(PAGE_TEMPLATES.map(x => [x.id,
    renderPageHtml(sampleContent(x.id, { prompt: keyword, company: company || 'Your business' }), { template: x.id, theme, company: company || 'Your business', profile })])),
  [theme, keyword, company, profile]);

  const cleanTitle = title.replace(/\s+/g, ' ').trim();
  const asIdea = { ...idea, title: cleanTitle };
  const key = tpl && cleanTitle.length >= 3 ? pageKey(keyword.trim().toLowerCase(), tpl, cleanTitle) : '';
  const making = !!(key && busy[`seopage|${key}`]);
  const existing = key ? content.seopage?.[key] : null;
  const make = async () => {
    if (!key) return;
    const a = existing || await loadSeoPage(keyword, asIdea, tpl);
    if (a) setOpenKey(key);
  };
  const open = openKey && content.seopage?.[openKey];
  const previewTpl = previewId ? templateById(previewId) : null;

  return (
    <div className="ae-reader-bg" onClick={onClose}>
      <article className="ae-reader wide" onClick={e => e.stopPropagation()} data-testid="seo-designer">
        <div className="ae-reader-h">
          <Pill bg="#eef2ff" fg="#3730a3">{idea.format || 'SEO page'}</Pill><Pill>Targets “{keyword}”</Pill>
          <button className="ae-btn sm" style={{ border: 'none', background: 'none', marginLeft: 'auto' }} onClick={onClose}>Close ✕</button>
        </div>
        <div className="ae-reader-b" style={{ padding: '22px 26px', gap: 16 }}>
          <div className="ae-col" style={{ gap: 4 }}>
            <h2 className="ae-h2" style={{ margin: 0, fontSize: 21 }}>Turn this into a website page</h2>
            <p className="ae-sub" style={{ margin: 0 }}>We write the page for “{keyword}” and design it in your brand: your colours, fonts and logo. Pick a template, check the style, then create it. You can download it and publish it on your website.</p>
          </div>
          <div className="ae-step-h"><span>1</span>Select your template</div>
          <div className="ae-dz-grid" role="radiogroup" aria-label="Select your template">
            {PAGE_TEMPLATES.map(x => (
              <div key={x.id} className={`ae-dz ${tpl === x.id ? 'on' : ''}`}>
                <button type="button" role="radio" aria-checked={tpl === x.id} className="ae-dz-pick" onClick={() => setTpl(x.id)} data-testid={`tpl-${x.id}`}>
                  <ScaledFrame html={previews[x.id]} title={`${x.name} preview`} />
                  {tpl === x.id && <span className="ae-dz-tick" aria-hidden="true">✓</span>}
                  <span className="ae-dz-meta">
                    <span className="ae-dz-top"><b>{x.name}</b>{suggestedTemplate(idea.format) === x.id && <span className="ae-tpl-tag">Suggested</span>}</span>
                    <span className="ae-dz-bl">{x.blurb}</span>
                    <span className="ae-dz-best">Best for: {x.bestFor}</span>
                  </span>
                </button>
                <button type="button" className="ae-dz-full" onClick={() => setPreviewId(x.id)}>Preview full page ↗</button>
              </div>
            ))}
          </div>
          <div className="ae-step-h"><span>2</span>Choose your style</div>
          <div className="ae-pg-box"><StylePicker theme={theme} onChange={changeTheme} site={siteStyle} />
            {!chosen && siteStyle.found && <div className="ae-note" style={{ marginTop: 8 }}>{THEME_NOTE}</div>}</div>
          <div className="ae-step-h"><span>3</span>Name your page and create it</div>
          <input className="ae-input" value={title} maxLength={300} onChange={e => setTitle(e.target.value)} aria-label="Page title" data-testid="seo-page-title" />
          {idea.link && <div className="ae-note">Suggested address: <span className="ae-mono" style={{ color: '#4f46e5', wordBreak: 'break-all' }}>{idea.link}</span></div>}
          <div><button className="ae-btn primary" disabled={!key || making} onClick={make} data-testid="seo-make-page">
            {making ? 'Writing and designing your page…' : existing ? 'Open this page' : `Generate ${templateById(tpl)?.name.toLowerCase()}`}</button></div>
        </div>
      </article>
      {previewTpl && <DesignPreview tpl={previewTpl} html={previews[previewTpl.id]} onClose={() => setPreviewId('')} onUse={() => { setTpl(previewTpl.id); setPreviewId(''); }} />}
      {open && <PageReader asset={open} onClose={() => setOpenKey(null)} refreshing={!!busy[`seopage|${openKey}`]} theme={theme} onTheme={changeTheme} site={siteStyle} company={company} profile={profile}
        onRefresh={() => loadSeoPage(keyword, { ...idea, title: open.title }, open.template, true)} />}
    </div>
  );
}

function Idea({ idea, keyword, n }) {
  const { content } = useAeo();
  const done = Object.values(content.seopage || {}).filter(a => a && String(a.prompt).trim().toLowerCase() === keyword.trim().toLowerCase() && a.title === idea.title);
  const [open, setOpen] = useState(false);
  const [design, setDesign] = useState(false);
  const it = INTENT[idea.intent] || INTENT.informational;
  return (
    <div className="seo-idea" data-testid="seo-idea">
      <div className="seo-n">{n}</div>
      <div className="ae-col" style={{ gap: 6, minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}><Pill bg={it[2]} fg={it[3]}>{it[0]}</Pill><Pill>{idea.format}</Pill></div>
        <b style={{ fontSize: 15 }}>{idea.title}</b>
        {idea.target_query && <span className="ae-sub" style={{ fontSize: 12.5 }}>Goes after the search: <b>“{idea.target_query}”</b></span>}
        {idea.why && <span style={{ fontSize: 13, lineHeight: 1.5 }}>{idea.why}</span>}
        {open && <div className="ae-col" style={{ gap: 6, fontSize: 13 }}>
          {!!idea.outline.length && <ol style={{ margin: '4px 0', paddingLeft: 20 }}>{idea.outline.map((h, i) => <li key={i}>{h}</li>)}</ol>}
          {idea.meta_title && <span><b>Page title:</b> {idea.meta_title}</span>}
          {idea.meta_description && <span><b>Description:</b> {idea.meta_description}</span>}
          {idea.link && <span><b>Suggested address:</b> {idea.link}</span>}
        </div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="ae-btn sm" onClick={() => setOpen(o => !o)}>{open ? 'Hide outline' : 'Show outline & SEO details'}</button>
          <button type="button" className="ae-btn sm primary" onClick={() => setDesign(true)} data-testid="seo-write">{done.length ? 'Open your page' : 'Write this page'}</button>
        </div>
      </div>
      {design && <SeoPageDesigner keyword={keyword} idea={idea} onClose={() => setDesign(false)} />}
    </div>
  );
}


const diffLabel = (d) => d < 30 ? ['Easy', '#047857', '#ecfdf5'] : d < 60 ? ['Moderate', '#92400e', '#fffbeb'] : ['Hard', '#b91c1c', '#fef2f2'];
const num = (n) => Number(n).toLocaleString();

/** Real Google figures for the keyword (monthly searches, difficulty, who ranks now, where the customer is). */
function RealData({ keyword, md, limited }) {
  if (!md || !md.source) return <div className="ae-note" data-testid="seo-nodata">Live Google numbers (searches, difficulty and who ranks now) are not available for this keyword yet. The plan below is based on your website.</div>;
  const dl = md.difficulty != null ? diffLabel(md.difficulty) : null;
  const when = md.checked_at ? new Date(md.checked_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const Stat = ({ label, value, sub, tone }) => <div className="seo-stat" style={tone ? { background: tone[2] } : undefined}><span>{label}</span><b style={tone ? { color: tone[1] } : undefined}>{value}</b>{sub && <small>{sub}</small>}</div>;
  return (
    <div className="ae-col" style={{ gap: 12 }} data-testid="seo-realdata">
      <span className="ae-eyebrow p">Real Google data{md.market ? ` · ${md.market}` : ''}{when ? ` · ${when}` : ''}</span>
      <div className="seo-stats">
        {md.monthly_searches != null && <Stat label="Searches per month" value={num(md.monthly_searches)} sub={`for “${keyword}”`} />}
        {dl && <Stat label="Difficulty" value={`${md.difficulty}/100`} sub={dl[0]} tone={dl} />}
        {md.competition && <Stat label="Advertiser competition" value={md.competition} sub={md.cpc != null ? `about $${md.cpc} per click` : ''} />}
        {md.your_site && <Stat label="Your site on Google" value={md.your_position ? `#${md.your_position}` : 'Not in top 20'} sub={md.your_site} tone={md.your_position ? (md.your_position <= 10 ? ['', '#047857', '#ecfdf5'] : ['', '#92400e', '#fffbeb']) : ['', '#b91c1c', '#fef2f2']} />}
      </div>
      {!!(md.serp || []).length && <div className="ae-col" style={{ gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Who ranks on Google right now</span>
        <div className="seo-serp">{md.serp.map(r => (
          <div key={r.position + r.url} className={'seo-serp-row' + (md.your_site && r.domain === md.your_site ? ' mine' : '')}>
            <span className="seo-n">{r.position}</span>
            <div className="ae-col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
              <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title || r.url}</a>
              <span className="ae-sub" style={{ fontSize: 12 }}>{r.domain} · {r.page_type}</span>
            </div>
          </div>))}</div>
      </div>}
      {!!(md.related || []).length && <div className="ae-col" style={{ gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Related searches people really make</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{md.related.map(r => <Pill key={r.keyword} bg="#f3f4f8">{r.keyword} · {num(r.monthly_searches)}/mo{r.difficulty != null ? ` · ${r.difficulty}` : ''}</Pill>)}</div>
      </div>}
      <span className="ae-sub" style={{ fontSize: 11.5 }}>Source: Google Ads data and Google results through {md.source}. Difficulty is 0-100: how hard it is to reach page one.{limited ? ' The preview shows the first results only.' : ''}</span>
    </div>
  );
}

/** Google SEO strategy for the keyword the customer selected. Added next to the AI-answer strategy, which is unchanged. */
export function SeoStrategyBlock({ keyword }) {
  const { content, busy, loadSeoStrategy, peekSeoStrategy, loadSavedSeoPages, savedLoaded } = useAeo();
  const data = content.seo[keyword];
  const working = !!busy['seo|' + keyword];
  useEffect(() => { if (keyword && savedLoaded && !data) peekSeoStrategy(keyword); if (keyword && savedLoaded) loadSavedSeoPages(keyword); /* eslint-disable-next-line */ }, [keyword, savedLoaded]);
  if (!keyword) return null;

  if (!data) {
    return working
      ? <section className="ae-card" style={{ padding: 24, gap: 10 }} data-testid="seo-working"><span className="ae-eyebrow p">Google SEO strategy</span><h2 className="lg">Building your plan for “{keyword}”</h2>
          <span className="ae-sub">Reading your website, working out what people want when they search it, then choosing the pages to publish…</span><div className="ae-dots"><i /><i /><i /></div></section>
      : <section className="ae-card" style={{ padding: 24, gap: 12 }} data-testid="seo-start">
          <div className="ae-col" style={{ gap: 4 }}><span className="ae-eyebrow p">Google SEO strategy</span><h2 className="lg">Rank higher on Google for “{keyword}”</h2>
            <span className="ae-sub" style={{ maxWidth: 700 }}>We work out what people want when they search this keyword, and give you the pages and articles to publish, with titles, outlines and a 4-week plan. Then we can write them for you.</span></div>
          <div><button type="button" className="ae-btn primary" onClick={() => loadSeoStrategy(keyword)} data-testid="seo-generate">Generate Google SEO strategy</button></div>
        </section>;
  }
  const it = INTENT[data.intent] || INTENT.informational;
  return (
    <section className="ae-card" style={{ padding: 24, gap: 20 }} data-testid="seo-strategy">
      <div className="ae-row" style={{ alignItems: 'flex-start' }}>
        <div className="ae-col" style={{ gap: 4, maxWidth: 780 }}><span className="ae-eyebrow p">Google SEO strategy</span><h2 className="lg">How to rank higher on Google for “{keyword}”</h2></div>
        <button type="button" className="ae-btn sm" style={{ marginLeft: 'auto' }} disabled={working} onClick={() => loadSeoStrategy(keyword, true)} data-testid="seo-refresh"
          title="Fetch today's Google numbers and rebuild the plan">{working ? 'Updating…' : '↻ Refresh with live data'}</button>
      </div>
      {data.limited && <div className="ae-note">You see a short preview: one page idea and the first two weeks. The full set of pages, writing them for you, and all four weeks are part of a paid plan.</div>}
      <RealData keyword={keyword} md={data.market_data} limited={data.limited} />
      <div className="ae-answer"><span className="ae-eyebrow p">What people want when they search this</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Pill bg={it[2]} fg={it[3]}>{it[0]} intent</Pill><span className="ae-sub" style={{ fontSize: 12.5 }}>{it[1]}</span></div>
        <span style={{ fontSize: 15, lineHeight: 1.55, fontWeight: 500 }}>{data.intent_note}</span></div>
      {!!data.topics.length && <div className="ae-col" style={{ gap: 8 }}><span className="ae-eyebrow p">Topics your page must cover</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{data.topics.map(x => <Pill key={x} bg="#eef0ff" fg="#3730a3">{x}</Pill>)}</div></div>}
      <div className="ae-col" style={{ gap: 10 }}><span className="ae-eyebrow p">Content to publish</span>
        {data.content.map((c, i) => <Idea key={c.title} idea={c} keyword={keyword} n={i + 1} />)}</div>
      {!!data.related_searches.length && <div className="ae-col" style={{ gap: 8 }}><span className="ae-eyebrow p">Related searches to win (long-tail)</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{data.related_searches.map(x => <Pill key={x}>{x}</Pill>)}</div></div>}
      {!!data.on_page.length && <div className="ae-col" style={{ gap: 8 }}><span className="ae-eyebrow p">On-page checklist for “{keyword}”</span>
        <ul className="seo-check">{data.on_page.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      <div className="ae-col" style={{ gap: 8 }}><span className="ae-eyebrow p">Your 4-week SEO plan</span>
        <div className="ae-plan">{data.plan.map((w, i) => <div key={i}><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: '#4f46e5' }}>{w.week}</span><span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>{w.task}</span></div>)}
          {data.limited && [3, 4].map(n => <div key={n} style={{ opacity: .6 }}><span style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5' }}>WEEK {n}</span><span style={{ fontSize: 13 }}>🔒 Locked</span></div>)}</div></div>
      <span className="ae-sub" style={{ fontSize: 12 }}>Google rankings depend on many things we do not control. This plan shows the content that gives your site the best chance, and does not promise a position.</span>
    </section>
  );
}

/** Its own page: pick a keyword (from your website, or type one) and get the Google SEO strategy for that keyword. */
export function SeoStrategyPage() {
  const { siteKeywords, saved } = useAeo();
  const { state, toast } = useApp();
  const [site, setSite] = useState(null);            // keywords read from the website; null = loading
  const [own, setOwn] = useState([]);                // keywords typed on this page
  const [typed, setTyped] = useState('');
  const [active, setActive] = useState('');
  const url = state.request.url;
  useEffect(() => {
    if (!url) { setSite([]); return; }
    let live = true;
    siteKeywords().then(d => { if (live) setSite(d?.keywords || []); }).catch(() => { if (live) setSite([]); });
    return () => { live = false; };
    // eslint-disable-next-line
  }, [url]);
  const list = useMemo(() => {
    const seen = new Set(), out = [];
    [...own, ...(site || []), ...((saved && saved.calendar_keywords) || [])].forEach(k => { const t = String(k || '').trim(); if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); } });
    return out;
  }, [own, site, saved]);
  const current = list.includes(active) ? active : list[0] || '';
  const add = () => {
    const t = typed.replace(/\s+/g, ' ').trim();
    if (t.length < 2) { toast({ type: 'info', message: 'Type a keyword of at least 2 characters.' }); return; }
    setOwn(o => [t, ...o.filter(x => x.toLowerCase() !== t.toLowerCase())]); setActive(t); setTyped('');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} data-testid="seo-page">
      <section className="ae-card" style={{ padding: 20, gap: 12 }}>
        <div className="ae-col" style={{ gap: 4 }}><span className="ae-eyebrow p">Google SEO strategy</span><h2 className="lg" style={{ margin: 0 }}>Pick a keyword to rank for on Google</h2>
          <span className="ae-sub" style={{ fontSize: 13 }}>Choose one of the keywords from your website, or type your own. You get the search intent, the pages to publish and a 4-week plan for that keyword.</span></div>
        {site === null && <div className="ae-dots"><i /><i /><i /></div>}
        {!!list.length && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} data-testid="seo-keywords">
          {list.map(k => <button key={k} type="button" className={'seo-kw' + (k === current ? ' on' : '')} onClick={() => setActive(k)} data-testid="seo-kw">{k}</button>)}
        </div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="ae-input" style={{ flex: '1 1 260px', minWidth: 0 }} value={typed} maxLength={120} placeholder="Type your own keyword, e.g. office removals singapore"
            onChange={e => setTyped(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} data-testid="seo-input" />
          <button type="button" className="ae-btn" onClick={add} data-testid="seo-add">Use this keyword</button>
        </div>
      </section>
      {current ? <SeoStrategyBlock keyword={current} />
        : site !== null && <section className="ae-card" style={{ padding: 24 }}><span className="ae-sub">{url ? 'We could not read keywords from your website yet. Type a keyword above to start.' : 'Add your company website in your profile, or type a keyword above.'}</span></section>}
    </div>
  );
}
