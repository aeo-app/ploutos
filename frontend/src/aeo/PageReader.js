import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { copyToClipboard } from './utils';
import { pageHtml, pageEmbedCode, downloadHtml, downloadPdf } from './pageExport';
import { StylePicker } from './PageUi';

const plainText = (a) => [a.headline || a.title, a.intro,
  ...(a.highlights || []).map(h => `${h.title}${h.text ? ` — ${h.text}` : ''}`),
  ...(a.steps || []).map((s, i) => `Step ${i + 1}: ${s.title}${s.text ? `\n${s.text}` : ''}`),
  ...(a.sections || []).map(s => `${s.h}\n${s.p}`),
  ...(a.areas?.length ? ['Areas we cover\n' + a.areas.join(', ')] : []),
  ...(a.table?.headers?.length ? ['Comparison\n' + [a.table.headers.join(' | '), ...a.table.rows.map(r => r.join(' | '))].join('\n')] : []),
  ...((a.faqs || []).length ? ['Frequently asked questions\n' + a.faqs.map(f => `${f.q}\n${f.a}`).join('\n\n')] : []),
  ...(a.cta ? [`${a.cta.headline}\n${a.cta.text}`] : [])].filter(Boolean).join('\n\n');

/* ── Where to publish: the same page, step by step for the website builder the customer uses ───────────── */
const PLATFORMS = [
  { id: 'wordpress', name: 'WordPress', steps: (a) => [
    'In WordPress go to Pages → Add New Page. Type the page title.',
    'Click the + button, choose “Custom HTML”, press “Copy page code” above and paste it in. Check the preview tab to see how it looks.',
    `In the settings panel on the right, set the page address (“Permalink / URL slug”) to ${a.slug || 'the address shown above'}.`,
    'If you use Yoast, Rank Math or All in One SEO, paste the page title and short description from the boxes above into its fields.',
    'Click Publish.'] },
  { id: 'wix', name: 'Wix', steps: (a) => [
    'In the Wix Editor go to Pages & Menu → Add Page → Blank Page. Name it.',
    'Click Add (+) → Embed Code → Embed HTML. Choose “Code”, press “Copy page code” above and paste it in, then stretch the box to full width.',
    `Open the page’s SEO settings: set the URL ending to ${a.slug || 'the address shown above'}, and paste the page title and short description.`,
    'Click Publish. If you want the words to be normal page text that search engines read directly, use “Copy all text” above and paste it into text elements instead.'] },
  { id: 'shopify', name: 'Shopify', steps: (a) => [
    'In Shopify admin go to Online Store → Pages → Add page. Enter the page title.',
    'In the content box click the “Show HTML” button (the <> icon), press “Copy page code” above, and paste it in.',
    `Under “Search engine listing”, click Edit: paste the page title and short description, and set the URL handle to ${a.slug || 'the address shown above'}.`,
    'Make sure the page is set to Visible, then Save. To show it in your menu, go to Online Store → Navigation.'] },
  { id: 'squarespace', name: 'Squarespace', steps: (a) => [
    'Go to Pages → the + button → Blank page. Name it and place it in your menu where you want it.',
    'Edit the page, add a Code block, press “Copy page code” above and paste it in. (Code blocks need a Squarespace plan that supports them.)',
    `Open the page settings (gear icon). Under General set the URL slug to ${a.slug || 'the address shown above'}; under SEO paste the page title and short description.`,
    'Save and publish.'] },
  { id: 'webflow', name: 'Webflow', steps: (a) => [
    'In the Pages panel click New page.',
    `Open the page settings: set the Slug to ${a.slug || 'the address shown above'} and paste the SEO title and meta description.`,
    'On the page, add an Embed element (Add panel → Components → Embed), press “Copy page code” above and paste it in.',
    'Publish your site.'] },
  { id: 'other', name: 'Another site / developer', steps: (a) => [
    'Press “Download HTML” above. This is a complete, finished web page with the title and description already in it.',
    `Upload it to your website’s files as ${a.slug ? a.slug + '.html' : 'a new .html file'} (or send it to whoever looks after your website and ask them to publish it at /${a.slug || 'the address shown above'}).`,
    'Open the live page once to check it looks right.'] },
];

const AFTER = (a) => [
  'Open the live page and read it once to check everything is right for your business. Your logo and contact details were added from your website, so there is nothing to fill in.',
  ...(a.link_from?.length ? [`Add links to the new page from: ${a.link_from.join('; ')}. Use plain words as the link text.`] : ['Add a link to the new page from your menu or a related page.']),
  'Tell Google about it: open Google Search Console, paste the page address into the search bar at the top, and click “Request indexing”.',
  'In 2 to 4 weeks, re-run your analysis here to see whether AI engines now mention you for this question.',
];

function CopyRow({ label, value, toast }) {
  return (
    <div className="ae-pg-row">
      <div style={{ minWidth: 0, flex: 1 }}>
        <span className="ae-eyebrow">{label}</span>
        <div style={{ fontSize: 14, fontWeight: 600, wordBreak: 'break-word' }}>{value}</div>
      </div>
      <button className="ae-btn sm" onClick={() => { copyToClipboard(value); toast({ type: 'success', message: `${label} copied.` }); }}>Copy</button>
    </div>
  );
}

export function PageReader({ asset, onClose, onRefresh, refreshing, theme, onTheme, site, company, profile }) {
  const { toast } = useApp();
  const [tab, setTab] = useState('page');
  const [platform, setPlatform] = useState('wordpress');
  const [device, setDevice] = useState('desktop');
  const [styling, setStyling] = useState(false);
  const plat = PLATFORMS.find(p => p.id === platform) || PLATFORMS[0];
  const o = useMemo(() => ({ theme, company, profile }), [theme, company, profile]);
  const html = useMemo(() => pageHtml(asset, o), [asset, o]);
  const copy = (text, what) => { copyToClipboard(text); toast({ type: 'success', message: `${what} copied.` }); };
  const pdf = () => { if (!downloadPdf(asset, o)) toast({ type: 'info', message: 'Could not open the print window. Try again, or download the HTML file instead.' }); };

  return (
    <div className="ae-reader-bg" onClick={onClose}>
      <article className="ae-reader wide" onClick={e => e.stopPropagation()} data-testid="page-reader">
        <div className="ae-reader-h">
          <span className="ae-pill" style={{ background: '#eef0ff', color: '#3730a3', padding: '4px 10px' }}>{asset.template_name || 'Page'}</span>
          <button className="ae-btn sm" style={{ border: 'none', background: 'none' }} onClick={onClose}>Close ✕</button>
        </div>
        <div className="ae-reader-b" style={{ padding: '22px 26px' }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>{asset.title}</h2>
          <div className="ae-seg">
            <button className={tab === 'page' ? 'on' : ''} onClick={() => setTab('page')}>1. Preview &amp; download</button>
            <button className={tab === 'publish' ? 'on' : ''} onClick={() => setTab('publish')}>2. Where to publish it</button>
          </div>

          {tab === 'page' && (
            <div className="ae-col" style={{ gap: 12 }}>
              <div className="ae-row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                <button className="ae-btn sm primary" onClick={() => downloadHtml(asset, o)} data-testid="dl-html">⬇ Download HTML</button>
                <button className="ae-btn sm primary" onClick={pdf} data-testid="dl-pdf">⬇ Download PDF</button>
                <button className="ae-btn sm" onClick={() => copy(pageEmbedCode(asset, o), 'Page code')} data-testid="copy-code">Copy page code</button>
                <button className="ae-btn sm" onClick={() => copy(plainText(asset), 'Page text')}>Copy all text</button>
                <button className="ae-btn sm" disabled={refreshing} onClick={onRefresh}>{refreshing ? 'Rewriting…' : 'Rewrite content'}</button>
              </div>
              <div className="ae-row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div className="ae-seg" role="tablist" aria-label="Preview size">
                  <button role="tab" aria-selected={device === 'desktop'} className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')}>Desktop</button>
                  <button role="tab" aria-selected={device === 'mobile'} className={device === 'mobile' ? 'on' : ''} onClick={() => setDevice('mobile')} data-testid="dev-mobile">Mobile</button>
                </div>
                <button className="ae-btn sm" onClick={() => setStyling(v => !v)} aria-expanded={styling} data-testid="toggle-style">🎨 {styling ? 'Hide style options' : 'Change colours & fonts'}</button>
              </div>
              {styling && <div className="ae-pg-box"><StylePicker theme={theme} onChange={onTheme} site={site} /></div>}
              <p className="ae-sub" style={{ margin: 0 }}>This is how your page looks. The HTML file is a complete web page you can upload. The PDF opens your print window: choose “Save as PDF”. Your logo and contact details were taken from your website.</p>
              <div className={`ae-view ${device}`}>
                <iframe title="Your generated page" data-testid="page-frame" srcDoc={html} sandbox="allow-same-origin" />
              </div>
              {asset.link && <div className="ae-pg-box"><span className="ae-eyebrow">Page address on your site</span><div className="ae-mono" style={{ wordBreak: 'break-all' }}>{asset.link}</div></div>}
            </div>
          )}

          {tab === 'publish' && (
            <div className="ae-col" style={{ gap: 14 }}>
              <p className="ae-sub" style={{ margin: 0 }}>This is a new page for <b>your own website</b>. Follow the steps for the tool your website is built with.</p>
              <div className="ae-row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                <button className="ae-btn sm" onClick={() => downloadHtml(asset, o)}>⬇ Download HTML</button>
                <button className="ae-btn sm" onClick={() => copy(pageEmbedCode(asset, o), 'Page code')}>Copy page code</button>
                <button className="ae-btn sm" onClick={() => copy(plainText(asset), 'Page text')}>Copy all text</button>
              </div>

              {asset.checklist?.length > 0 && <div className="ae-pg-box warn"><span className="ae-eyebrow">Before you publish, fill in or check</span><ul>{asset.checklist.map((l, i) => <li key={i}>{l}</li>)}</ul></div>}

              <div className="ae-col" style={{ gap: 8 }}>
                <span className="ae-eyebrow">Details you will paste</span>
                {asset.slug && <CopyRow label="Page address ending" value={`/${asset.slug}`} toast={toast} />}
                <CopyRow label="Page title" value={asset.page_title || asset.title} toast={toast} />
                {asset.meta_description && <CopyRow label="Short description" value={asset.meta_description} toast={toast} />}
              </div>

              <div className="ae-col" style={{ gap: 8 }}>
                <span className="ae-eyebrow">What is your website built with?</span>
                <div className="ae-plats" role="tablist">
                  {PLATFORMS.map(p => <button key={p.id} role="tab" aria-selected={platform === p.id} className={platform === p.id ? 'on' : ''} onClick={() => setPlatform(p.id)}>{p.name}</button>)}
                </div>
                <div className="ae-pg-box" data-testid="publish-steps"><ol>{plat.steps(asset).map((l, i) => <li key={i}>{l}</li>)}</ol></div>
                <span className="ae-note">Menu names can differ slightly between versions of these tools. “Page code” leaves out the top menu and footer, so the page fits inside your own site’s design.</span>
              </div>

              {asset.where && <div className="ae-pg-box"><span className="ae-eyebrow">Where it goes on your site</span><div>{asset.where}</div></div>}
              <div className="ae-pg-box"><span className="ae-eyebrow">After you publish</span><ol>{AFTER(asset).map((l, i) => <li key={i}>{l}</li>)}</ol></div>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
