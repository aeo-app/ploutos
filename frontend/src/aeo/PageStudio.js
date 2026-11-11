import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAeo } from './AeoContext';
import { aeoApi } from '../api/aeoApi';
import { PAGE_TEMPLATES, templateById, templateOfSuggestion, defaultTitle, pageKey, pageLink, slugify, sampleContent } from './pageTemplates';
import { renderPageHtml, DEFAULT_THEME } from './pageRender';
import { ScaledFrame, StylePicker } from './PageUi';
import { PageReader } from './PageReader';

const THEME_KEY = 'aeo_page_theme';
const loadTheme = () => { try { const t = JSON.parse(localStorage.getItem(THEME_KEY) || 'null'); return t && typeof t === 'object' ? t : null; } catch (e) { return null; } };
const saveTheme = (t) => { try { localStorage.setItem(THEME_KEY, JSON.stringify(t)); } catch (e) { /* private mode etc. — the choice just is not remembered */ } };

/** What we can read from the customer's own website: brand colours and fonts. Asked for once per website. */
function useSiteStyle(url, company, onFound) {
  const [site, setSite] = useState({ loading: true });
  useEffect(() => {
    let off = false;
    if (!url) { setSite({ loading: false, found: false, note: '' }); return undefined; }
    setSite({ loading: true });
    aeoApi.siteStyle(url, company)
      .then(d => { if (!off) { setSite({ loading: false, ...d }); onFound?.(d); } })
      .catch(() => { if (!off) setSite({ loading: false, found: false, note: 'We could not read your website’s style. Pick a colour below instead.' }); });
    return () => { off = true; };
  }, [url]); // eslint-disable-line
  return site;
}

/** Full-size look at one design with sample text, so the customer can judge it before choosing. */
function DesignPreview({ tpl, html, onUse, onClose }) {
  const [device, setDevice] = useState('desktop');
  return (
    <div className="ae-reader-bg" onClick={onClose}>
      <article className="ae-reader wide" onClick={e => e.stopPropagation()} data-testid="design-preview">
        <div className="ae-reader-h">
          <span className="ae-pill" style={{ background: '#eef0ff', color: '#3730a3', padding: '4px 10px' }}>Preview · sample text</span>
          <button className="ae-btn sm" style={{ border: 'none', background: 'none' }} onClick={onClose}>Close ✕</button>
        </div>
        <div className="ae-reader-b" style={{ padding: '22px 26px' }}>
          <div className="ae-row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div className="ae-col" style={{ gap: 2 }}><h2 style={{ margin: 0, fontSize: 20 }}>{tpl.name}</h2><span className="ae-sub">{tpl.blurb}</span></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div className="ae-seg">
                <button className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')}>Desktop</button>
                <button className={device === 'mobile' ? 'on' : ''} onClick={() => setDevice('mobile')}>Mobile</button>
              </div>
              <button className="ae-btn primary" onClick={onUse} data-testid="use-design">Use this design</button>
            </div>
          </div>
          <div className={`ae-view ${device}`}><iframe title={`${tpl.name} preview`} srcDoc={html} sandbox="allow-same-origin" /></div>
        </div>
      </article>
    </div>
  );
}

/** Strategy → pick a design → pick colours and fonts → we write the page → preview, download, publish. */
export function PageStudio({ t, data }) {
  const { content, busy, loadPage, loadSavedPages } = useAeo();
  const { state } = useApp();
  const prompt = t.active;
  const company = state.request.company_name || '';
  const site = state.request.url;

  const [tpl, setTpl] = useState('');
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState(() => ({ ...DEFAULT_THEME, ...(loadTheme() || {}) }));
  const [chosen, setChosen] = useState(() => !!loadTheme());   // has the customer picked a style themselves?
  const [openKey, setOpenKey] = useState(null);
  const [previewId, setPreviewId] = useState('');

  const siteStyle = useSiteStyle(site, company, (d) => {
    // First time: dress the previews in the customer's own colours (unless they already chose something).
    if (d?.found && d.primary && !loadTheme()) {
      setTheme(th => ({ ...th, primary: d.primary, accent: d.secondary || '', font: d.font_kind === 'serif' ? 'classic' : 'modern', fontName: d.font || '' }));
    }
  });

  // Logo and contact details read from the website; whatever was not found is simply absent from the page.
  const profile = useMemo(() => ({ logo: siteStyle.logo, phone: siteStyle.phone, email: siteStyle.email, address: siteStyle.address }),
    [siteStyle.logo, siteStyle.phone, siteStyle.email, siteStyle.address]);

  useEffect(() => { if (prompt) loadSavedPages(prompt); }, [prompt]); // eslint-disable-line
  useEffect(() => { setTpl(''); setTitle(''); setOpenKey(null); }, [prompt]);

  const changeTheme = (th) => { setTheme(th); setChosen(true); saveTheme(th); };
  const suggested = useMemo(() => {
    const m = {};
    (data.pillars || []).forEach(p => { const id = templateOfSuggestion(p); if (id && !m[id]) m[id] = p; });
    return m;
  }, [data]);

  // Each design drawn with sample text in the customer's current style — these are the real designs, not pictures of them.
  const previews = useMemo(() => Object.fromEntries(PAGE_TEMPLATES.map(x => [x.id,
    renderPageHtml(sampleContent(x.id, { prompt, company: company || 'Your business' }), { template: x.id, theme, company: company || 'Your business', profile })])),
  [theme, prompt, company, profile]);

  const pick = (id) => { setTpl(id); setTitle(suggested[id]?.title || defaultTitle(id, prompt)); };
  const cleanTitle = title.replace(/\s+/g, ' ').trim();
  const key = tpl && cleanTitle.length >= 3 ? pageKey(prompt, tpl, cleanTitle) : '';
  const making = !!(key && busy[`pillar|${key}`]);
  const existing = key ? content.pillar?.[key] : null;
  const slug = (tpl && suggested[tpl] && cleanTitle === suggested[tpl].title ? suggested[tpl].slug : '') || slugify(cleanTitle);

  const make = async () => {
    if (!key) return;
    const a = existing || await loadPage(prompt, { template: tpl, title: cleanTitle, detail: suggested[tpl]?.detail || '', answer: data.answer || '' });
    if (a) setOpenKey(key);
  };

  const mine = Object.entries(content.pillar || {}).filter(([, a]) => a && a.prompt === prompt && a.template).reverse();
  const open = openKey && content.pillar?.[openKey];
  const previewTpl = previewId ? templateById(previewId) : null;

  return (
    <div className="ae-col" style={{ gap: 16 }}>
      <div className="ae-col" style={{ gap: 4 }}>
        <h2 className="ae-h2" style={{ margin: 0, fontSize: 22 }} data-testid="studio-title">Turn Your Content Strategy into a Website Page</h2>
        <p className="ae-sub" style={{ margin: 0, maxWidth: 800 }}>Your content strategy is ready! Now turn it into a professional webpage that helps customers and AI search engines understand your business. Choose a template, preview the design, and we’ll create a complete webpage with relevant content that matches your brand. You can download it and publish it on your website.</p>
      </div>

      <div className="ae-step-h"><span>1</span>Select Your Template</div>
      <div className="ae-dz-grid" role="radiogroup" aria-label="Select Your Template">
        {PAGE_TEMPLATES.map(x => (
          <div key={x.id} className={`ae-dz ${tpl === x.id ? 'on' : ''}`}>
            <button type="button" role="radio" aria-checked={tpl === x.id} className="ae-dz-pick" onClick={() => pick(x.id)} data-testid={`tpl-${x.id}`}>
              <ScaledFrame html={previews[x.id]} title={`${x.name} preview`} />
              {tpl === x.id && <span className="ae-dz-tick" data-testid={`tick-${x.id}`} aria-hidden="true">✓</span>}
              <span className="ae-dz-meta">
                <span className="ae-dz-top"><b>{tpl === x.id && <span className="sr-only">Selected: </span>}{x.name}</b>{suggested[x.id] && <span className="ae-tpl-tag">Suggested</span>}</span>
                <span className="ae-dz-bl">{x.blurb}</span>
                <span className="ae-dz-best">Best for: {x.bestFor}</span>
              </span>
            </button>
            <button type="button" className="ae-dz-full" onClick={() => setPreviewId(x.id)} data-testid={`full-${x.id}`}>Preview full page ↗</button>
          </div>
        ))}
      </div>

      <div className="ae-step-h"><span>2</span>Choose your style</div>
      <div className="ae-pg-box"><StylePicker theme={theme} onChange={changeTheme} site={siteStyle} />
        {!chosen && siteStyle.found && <div className="ae-note" style={{ marginTop: 8 }}>We matched your website’s colours automatically. You can change them any time.</div>}
      </div>

      {tpl && (
        <div className="ae-col" style={{ gap: 10 }}>
          <div className="ae-step-h"><span>3</span>Name your page and create it</div>
          <input className="ae-input" value={title} maxLength={300} onChange={e => setTitle(e.target.value)} aria-label="Page title" data-testid="page-title" />
          {slug && <div className="ae-note">Your page will live at <span className="ae-mono" style={{ color: '#4f46e5', wordBreak: 'break-all' }}>{pageLink(site, slug)}</span></div>}
          {suggested[tpl]?.detail && <div className="ae-note">{suggested[tpl].detail}</div>}
          <div className="ae-row" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
            <button className="ae-btn primary" disabled={!key || making} onClick={make} data-testid="make-page">
              {making ? 'Writing and designing your page…' : existing ? 'Open this page' : `Generate ${templateById(tpl)?.name.toLowerCase()}`}
            </button>
            {data.limited && !existing && <span className="ae-note">Writing full pages is part of a paid plan.</span>}
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <div className="ae-col" style={{ gap: 8 }}>
          <div className="ae-step-h"><span>✓</span>Your pages</div>
          <div className="ae-mine-grid">
            {mine.map(([k, a]) => (
              <div key={k} className="ae-mypage" data-testid="my-page">
                <ScaledFrame html={renderPageHtml(a, { template: a.template, theme, company, profile })} title={`${a.title} preview`} width={1100} ratio={0.7} />
                <div style={{ minWidth: 0 }}>
                  <span className="ae-eyebrow">{a.template_name}</span>
                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>{a.title}</div>
                  {a.link && <div className="ae-mono" style={{ fontSize: 11.5, color: '#4f46e5', wordBreak: 'break-all' }}>{a.link}</div>}
                </div>
                <button className="ae-btn sm primary" onClick={() => setOpenKey(k)}>Preview · download · publish</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {previewTpl && <DesignPreview tpl={previewTpl} html={previews[previewTpl.id]} onClose={() => setPreviewId('')} onUse={() => { pick(previewTpl.id); setPreviewId(''); }} />}
      {open && (
        <PageReader asset={open} onClose={() => setOpenKey(null)} refreshing={!!busy[`pillar|${openKey}`]} theme={theme} onTheme={changeTheme} site={siteStyle} company={company} profile={profile}
          onRefresh={() => loadPage(prompt, { template: open.template, title: open.title, answer: data.answer || '' }, true)} />
      )}
    </div>
  );
}
