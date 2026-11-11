/* Turns a written page (content from the backend) into a complete, designed web page.
   Six designs × any colour/font theme. Pure functions, no dependencies — the same code makes the
   template previews, the live preview, the downloaded .html and the PDF, so they always match. */

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Bracketed placeholder text is never shown: it is dropped, so a page can never go live with "[add your …]" on it.
const mark = (s) => esc(String(s == null ? '' : s).replace(/\s*\[[^\]\n]{2,160}\]/g, '').replace(/\s+([.,;:!?])/g, '$1'));

/** Paragraphs separated by blank lines; blocks where every line starts with - or • become bullet lists. */
const body = (t) => String(t ?? '').split(/\n{2,}/).map(b => b.trim()).filter(Boolean).map(b => {
  const lines = b.split('\n').map(x => x.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every(l => /^[-•*]\s+/.test(l))) return `<ul>${lines.map(l => `<li>${mark(l.replace(/^[-•*]\s+/, ''))}</li>`).join('')}</ul>`;
  return `<p>${mark(b).replace(/\n/g, '<br>')}</p>`;
}).join('\n');

/* ── colour helpers ─────────────────────────────────────────────────────── */
const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
export const isHex = (h) => /^#[0-9a-f]{6}$/i.test(String(h || ''));
const toRgb = (h) => { const x = String(h).replace('#', ''); return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)); };
const toHex = (c) => '#' + c.map(v => clamp(v).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, t) => { const A = toRgb(a), B = toRgb(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const lum = (h) => { const [r, g, b] = toRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** Darkens a colour until it is readable as text on `bg`. */
const readable = (h, bg = '#ffffff', min = 4.5) => { let c = h; for (let i = 0; i < 12 && contrast(c, bg) < min; i++) c = mixHex(c, '#000000', 0.12); return c; };

/* ── themes ─────────────────────────────────────────────────────────────── */
export const COLOR_PRESETS = [
  { id: 'ocean',  name: 'Ocean',  primary: '#1e4fd8', accent: '#0ea5e9' },
  { id: 'forest', name: 'Forest', primary: '#0f7a55', accent: '#d97706' },
  { id: 'sunset', name: 'Sunset', primary: '#d9480f', accent: '#f59f00' },
  { id: 'royal',  name: 'Royal',  primary: '#6d28d9', accent: '#db2777' },
  { id: 'slate',  name: 'Slate',  primary: '#1f2937', accent: '#0ea5e9' },
];
const SANS = '"Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif';
const SERIF = 'Georgia,"Times New Roman",Times,serif';
export const FONT_STYLES = [
  { id: 'modern',  name: 'Modern',  note: 'Clean sans-serif',        head: SANS,  body: SANS },
  { id: 'classic', name: 'Classic', note: 'Serif headings',          head: SERIF, body: SANS },
  { id: 'elegant', name: 'Elegant', note: 'Serif throughout',        head: SERIF, body: SERIF },
];
export const DEFAULT_THEME = { primary: COLOR_PRESETS[0].primary, accent: COLOR_PRESETS[0].accent, font: 'modern', fontName: '' };

const quote = (n) => `"${String(n).replace(/["\\<>]/g, '')}"`;

/** Everything the CSS needs, derived from the chosen primary/accent colours and font style. */
export function resolveTheme(t) {
  const th = { ...DEFAULT_THEME, ...(t || {}) };
  const primary = isHex(th.primary) ? th.primary.toLowerCase() : DEFAULT_THEME.primary;
  const accent = isHex(th.accent) ? th.accent.toLowerCase() : mixHex(primary, '#ffffff', 0.35);
  const fs = FONT_STYLES.find(f => f.id === th.font) || FONT_STYLES[0];
  const lead = th.fontName ? `${quote(th.fontName)},` : '';
  return {
    p: primary, pd: mixHex(primary, '#000000', 0.22), pt: mixHex(primary, '#ffffff', 0.93), pt2: mixHex(primary, '#ffffff', 0.84),
    pc: contrast(primary, '#ffffff') >= 3.2 ? '#ffffff' : '#0b1220', pl: readable(primary),
    a: accent, ac: contrast(accent, '#ffffff') >= 3.2 ? '#ffffff' : '#0b1220',
    fh: lead + fs.head, fb: lead + fs.body,
  };
}

/* ── CSS ────────────────────────────────────────────────────────────────── */
const CSS = `
&{font-family:var(--fb);color:var(--ink);background:#fff;line-height:1.65;font-size:17px;-webkit-text-size-adjust:100%}
&,& *{box-sizing:border-box}
& h1,& h2,& h3,& h4{font-family:var(--fh);color:var(--ink);line-height:1.2;margin:0}
& p{margin:0 0 14px}
& a{color:var(--pl)}
& .wrap{max-width:1120px;margin:0 auto;padding:0 24px}
& .narrow{max-width:800px}
& .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:12px 24px;border-radius:10px;font-weight:700;font-size:16px;text-decoration:none;border:2px solid transparent;cursor:pointer;font-family:var(--fb);line-height:1.2}
& .btn-p{background:var(--p);color:var(--pc)}
& .btn-p:hover{background:var(--pd);color:var(--pc)}
& .btn-w{background:#fff;color:var(--pl)}
& .btn-o{background:transparent;border-color:currentColor;color:inherit}
& .eyebrow{display:inline-block;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--pl);margin-bottom:14px}
& .lead{font-size:20px;line-height:1.6;color:var(--mut)}
& .sec{padding:80px 0}
& .sec.soft{background:var(--pt)}
& .sec-h{max-width:720px;margin:0 0 40px}
& .sec-h.c{margin-left:auto;margin-right:auto;text-align:center}
& .sec-h h2{font-size:clamp(26px,3.2vw,38px)}
& .sec-h p{margin:12px 0 0;color:var(--mut);font-size:18px}
& .top{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.96);border-bottom:1px solid var(--line);backdrop-filter:blur(8px)}
& .top .wrap{display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:68px}
& .logo{display:block;height:42px;width:auto;max-width:190px;object-fit:contain}
& .logo.sm{height:30px;max-width:140px;background:#fff;border-radius:6px;padding:3px 6px}
& .brand{display:flex;align-items:center;font-family:var(--fh);font-weight:800;font-size:21px;color:var(--ink);letter-spacing:-.01em}
& .top nav{display:flex;gap:26px;font-size:15px;font-weight:600}
& .top nav a{color:var(--mut);text-decoration:none}
& .top nav a:hover{color:var(--pl)}
& .top .btn{min-height:40px;padding:8px 18px;font-size:15px}
/* hero */
& .hero{padding:84px 0 88px}
& .hero h1{font-size:clamp(34px,5vw,56px);letter-spacing:-.02em}
& .hero .lead{margin-top:20px;max-width:640px}
& .hero .ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
& .hero-grad{background:linear-gradient(135deg,var(--pd),var(--p));color:var(--pc)}
& .hero-grad h1,& .hero-grad .lead,& .hero-grad .eyebrow{color:var(--pc)}
& .hero-grad .lead{opacity:.92}
& .hero-soft{background:linear-gradient(180deg,var(--pt),#fff)}
& .grid2{display:grid;grid-template-columns:1.15fr .85fr;gap:56px;align-items:center}
& .card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:28px}
& .hero-card{color:var(--ink);box-shadow:0 24px 60px rgba(0,0,0,.18)}
& .hero-card h3{font-size:19px;margin-bottom:14px}
& .checks{list-style:none;margin:0;padding:0;display:grid;gap:12px}
& .checks li{position:relative;padding-left:30px;font-weight:600;font-size:16px;line-height:1.45}
& .checks li:before{content:"";position:absolute;left:0;top:3px;width:20px;height:20px;border-radius:50%;background:var(--pt2) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M5.5 10.5l3 3 6-6.5' fill='none' stroke='%23222' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/16px no-repeat}
/* cards + steps */
& .cards3{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:20px}
& .feat{background:#fff;border:1px solid var(--line);border-radius:16px;padding:26px}
& .soft .feat{border-color:var(--pt2)}
& .feat .ic{width:44px;height:44px;border-radius:12px;background:var(--pt2);color:var(--pl);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;font-family:var(--fh);margin-bottom:16px}
& .feat h3{font-size:19px;margin-bottom:8px}
& .feat p{margin:0;color:var(--mut);font-size:16px}
& .steps{counter-reset:s;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px}
& .step{background:#fff;border-radius:16px;padding:26px;border:1px solid var(--pt2);position:relative}
& .step:before{counter-increment:s;content:counter(s);display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;background:var(--p);color:var(--pc);font-weight:800;font-family:var(--fh);margin-bottom:14px}
& .step h3{font-size:18px;margin-bottom:6px}
& .step p{margin:0;color:var(--mut);font-size:16px}
/* prose */
& .prose h2{font-size:clamp(24px,2.8vw,32px);margin:44px 0 14px}
& .prose h2:first-child{margin-top:0}
& .prose p,& .prose li{color:#374151}
& .prose ul{margin:0 0 16px;padding-left:22px}
& .split{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:start;padding:30px 0;border-top:1px solid var(--line)}
& .split:first-child{border-top:0}
& .split h2{font-size:clamp(24px,2.6vw,30px)}
/* faq */
& .qa{background:#fff;border:1px solid var(--line);border-radius:14px;margin-bottom:12px}
& .qa summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:20px 22px;font-weight:700;font-size:18px;font-family:var(--fh);min-height:44px}
& .qa summary::-webkit-details-marker{display:none}
& .qa summary:after{content:"+";flex:0 0 auto;font-size:26px;font-weight:500;color:var(--pl);line-height:1}
& .qa[open] summary:after{content:"\\2212"}
& .qa[open]{border-color:var(--pt2);box-shadow:0 8px 24px rgba(0,0,0,.05)}
& .qa p{margin:0;padding:0 22px 22px;color:#374151}
/* cta */
& .cta{background:linear-gradient(135deg,var(--pd),var(--p));color:var(--pc);text-align:center;padding:84px 0}
& .cta h2{color:var(--pc);font-size:clamp(28px,3.6vw,42px)}
& .cta p{max-width:620px;margin:14px auto 28px;font-size:19px;opacity:.94}
& .contact-row{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 26px;margin-top:24px;font-size:16px;font-weight:600}
& .contact-row a,& .contact-row span{color:var(--pc);text-decoration:none;opacity:.95}
& .contact-row a:hover{text-decoration:underline}
& .cta .btn{background:#fff;color:var(--pl)}
/* footer */
& .foot{background:var(--ink);color:#d1d5db;padding:34px 0;font-size:15px}
& .foot .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px}
& .foot b{color:#fff;font-family:var(--fh)}
& .foot-b{display:flex;align-items:center;gap:12px}
& .foot-c{display:flex;flex-wrap:wrap;gap:6px 22px}
& .foot-c a{color:#e5e7eb;text-decoration:none}
& .foot-c a:hover{text-decoration:underline}
/* guide */
& .takeaways{background:var(--pt);border:1px solid var(--pt2);border-left:5px solid var(--p);border-radius:14px;padding:24px 28px;margin-top:34px}
& .takeaways h3{font-size:17px;margin-bottom:12px}
& .takeaways ul{margin:0;padding-left:20px;display:grid;gap:8px}
& .takeaways li b{font-family:var(--fh)}
& .doc{display:grid;grid-template-columns:240px minmax(0,1fr);gap:56px;align-items:start}
& .toc{position:sticky;top:92px;font-size:15px}
& .toc b{display:block;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);margin-bottom:12px}
& .toc a{display:block;color:var(--mut);text-decoration:none;padding:7px 0 7px 14px;border-left:2px solid var(--line);line-height:1.4}
& .toc a:hover{color:var(--pl);border-color:var(--p)}
/* faq page */
& .hero-c{text-align:center}
& .hero-c .lead{margin-left:auto;margin-right:auto}
& .pill{display:inline-block;background:var(--pt2);color:var(--pl);font-weight:700;font-size:14px;padding:6px 14px;border-radius:999px;margin-top:22px}
& .facts{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin-top:26px}
& .fact{background:#fff;border:1px solid var(--pt2);border-radius:12px;padding:12px 18px;font-weight:700;font-size:15px}
& .fact span{display:block;font-weight:500;color:var(--mut);font-size:14px}
/* comparison */
& .tbl-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:16px;background:#fff}
& .tbl{width:100%;border-collapse:collapse;min-width:560px}
& .tbl th,& .tbl td{padding:16px 20px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top;font-size:16px}
& .tbl thead th{background:var(--pt);font-family:var(--fh);font-size:16px}
& .tbl tbody tr:last-child td{border-bottom:0}
& .tbl td:first-child{font-weight:700}
& .tbl th:last-child{background:var(--p);color:var(--pc)}
& .tbl td:last-child{background:var(--pt);font-weight:600}
/* location */
& .map{position:relative;border-radius:20px;overflow:hidden;min-height:300px;background:var(--pt2);background-image:linear-gradient(var(--pt) 1px,transparent 1px),linear-gradient(90deg,var(--pt) 1px,transparent 1px);background-size:36px 36px;border:1px solid var(--pt2);padding:26px;display:flex;flex-direction:column;justify-content:flex-end}
& .map .pin{position:absolute;top:30px;right:34px;width:56px;height:56px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--p);display:flex;align-items:center;justify-content:center;box-shadow:0 10px 24px rgba(0,0,0,.2)}
& .map .pin:after{content:"";width:20px;height:20px;border-radius:50%;background:#fff}
& .map h3{font-size:20px;margin-bottom:12px}
& .chips{display:flex;flex-wrap:wrap;gap:10px}
& .chip{background:#fff;border:1px solid var(--pt2);color:var(--ink);padding:8px 16px;border-radius:999px;font-weight:600;font-size:15px}
& .chips.lg .chip{font-size:16px;padding:10px 20px}
/* how-to */
& .howto{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:56px;align-items:start}
& .timeline{counter-reset:t;list-style:none;margin:0;padding:0;position:relative}
& .timeline:before{content:"";position:absolute;left:21px;top:8px;bottom:8px;width:2px;background:var(--pt2)}
& .tl{counter-increment:t;position:relative;padding:0 0 34px 68px}
& .tl:before{content:counter(t);position:absolute;left:0;top:0;width:44px;height:44px;border-radius:50%;background:var(--p);color:var(--pc);font-weight:800;font-family:var(--fh);display:flex;align-items:center;justify-content:center;font-size:18px}
& .tl h3{font-size:21px;margin-bottom:6px}
& .tl p{margin:0;color:#374151}
& .need{position:sticky;top:92px;background:var(--pt);border:1px solid var(--pt2);border-radius:18px;padding:26px}
& .need h3{font-size:18px;margin-bottom:14px}
& .need .checks li{font-weight:500}
& .need .checks li b{display:block;font-family:var(--fh)}
@media (max-width:900px){
  & .sec{padding:56px 0}
  & .hero{padding:52px 0 56px}
  & .grid2,& .split,& .howto{grid-template-columns:1fr;gap:32px}
  & .doc{grid-template-columns:1fr;gap:10px}
  & .toc{position:static;display:none}
  & .need{position:static}
  & .top nav{display:none}
  & .cta{padding:56px 0}
}
@media (max-width:560px){
  & .wrap{padding:0 18px}
  & .lead{font-size:18px}
  & .hero .ctas .btn{width:100%}
  & .top .btn{padding:8px 14px}
  & .qa summary{font-size:17px;padding:16px 18px}
  & .qa p{padding:0 18px 18px}
  & .tl{padding-left:58px}
}
@media print{
  & .top{position:static}
  & .sec,& .hero,& .cta{padding:34px 0}
  & .feat,& .step,& .qa,& .tl,& .card,& .takeaways{break-inside:avoid}
  & h2,& h3{break-after:avoid}
  & .toc,& .need{position:static}
  & *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`;

/** Prefixes every rule with .ap so the page can be pasted into another website without touching it. */
function scope(css) {
  const walk = (str) => {
    let out = '', pos = 0;
    while (pos < str.length) {
      const open = str.indexOf('{', pos);
      if (open < 0) break;
      const sel = str.slice(pos, open).trim();
      let depth = 1, j = open + 1;
      while (j < str.length && depth) { if (str[j] === '{') depth++; else if (str[j] === '}') depth--; j++; }
      const inner = str.slice(open + 1, j - 1);
      if (sel.startsWith('@media')) out += `${sel}{${walk(inner)}}`;
      else if (sel.startsWith('@')) out += `${sel}{${inner}}`;
      else out += sel.split(',').map(x => { x = x.trim(); return x === '&' ? '.ap' : x.startsWith('&') ? `.ap${x.slice(1)}` : x; }).join(',') + `{${inner}}`;
      pos = j;
    }
    return out;
  };
  return walk(css.replace(/\/\*[\s\S]*?\*\//g, ''));
}
const SCOPED = scope(CSS);

export function pageCss(theme) {
  const t = resolveTheme(theme);
  const vars = `.ap{--p:${t.p};--pd:${t.pd};--pt:${t.pt};--pt2:${t.pt2};--pc:${t.pc};--pl:${t.pl};--a:${t.a};--ink:#111827;--mut:#4b5563;--line:#e5e7eb;--fh:${t.fh};--fb:${t.fb}}`;
  return vars + SCOPED;
}

/* ── shared blocks ──────────────────────────────────────────────────────── */
/* The customer's logo and contact details, read from their website. Anything not found is simply left out. */
let PROFILE = {};
const clean = (v) => String(v || '').trim();
const telOf = (p) => clean(p).replace(/[^\d+]/g, '');
const contacts = () => {
  const p = PROFILE || {};
  const out = [];
  if (clean(p.phone)) out.push({ k: 'phone', label: clean(p.phone), href: `tel:${telOf(p.phone)}` });
  if (clean(p.email)) out.push({ k: 'email', label: clean(p.email), href: `mailto:${clean(p.email)}` });
  if (clean(p.address)) out.push({ k: 'address', label: clean(p.address) });
  return out;
};
const contactHtml = () => contacts().map(c => c.href ? `<a href="${esc(c.href)}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`).join('');
const logoImg = (company, cls = 'logo') => clean(PROFILE?.logo) && /^(data:image\/|https?:\/\/)/i.test(PROFILE.logo) ? `<img class="${cls}" src="${esc(PROFILE.logo)}" alt="${esc(company || '')} logo">` : '';
const ctaHref = () => { const c = contacts().find(x => x.href); return c ? esc(c.href) : '#contact'; };

const has = (a) => Array.isArray(a) && a.length > 0;
const ctaLabel = (c) => c.cta?.button || 'Get in touch';

const faqBlock = (c, { id = 'faq', title = 'Frequently asked questions', soft = false } = {}) => has(c.faqs) ? `
<section class="sec${soft ? ' soft' : ''}" id="${id}"><div class="wrap narrow">
<div class="sec-h c"><h2>${esc(title)}</h2></div>
${c.faqs.map((f, i) => `<details class="qa"${i === 0 ? ' open' : ''}><summary>${mark(f.q)}</summary><p>${mark(f.a)}</p></details>`).join('\n')}
</div></section>` : '';

const ctaBlock = (c, headline) => `
<section class="cta" id="contact"><div class="wrap">
<h2>${mark(c.cta?.headline || headline || 'Ready to get started?')}</h2>
<p>${mark(c.cta?.text || 'Get in touch today and we will help you with the next step.')}</p>
<a class="btn" href="${ctaHref()}">${mark(ctaLabel(c))}</a>
${contacts().length ? `<div class="contact-row">${contactHtml()}</div>` : ''}
</div></section>`;

const featCards = (items) => `<div class="cards3">${items.map((h, i) => `<div class="feat"><div class="ic">${i + 1}</div><h3>${mark(h.title)}</h3>${h.text ? `<p>${mark(h.text)}</p>` : ''}</div>`).join('')}</div>`;
const stepCards = (items) => `<div class="steps">${items.map(s => `<div class="step"><h3>${mark(s.title)}</h3>${s.text ? `<p>${mark(s.text)}</p>` : ''}</div>`).join('')}</div>`;
const checkList = (items) => `<ul class="checks">${items.map(h => `<li>${mark(h.title)}</li>`).join('')}</ul>`;
const proseSections = (c) => (c.sections || []).map(s => `<h2>${mark(s.h)}</h2>\n${body(s.p)}`).join('\n');
const headline = (c) => c.headline || c.title || '';
const secHead = (title, sub, center = false) => `<div class="sec-h${center ? ' c' : ''}"><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;

/* ── the six designs ────────────────────────────────────────────────────── */
const DESIGNS = {
  service: (c) => `
<section class="hero hero-grad"><div class="wrap grid2">
<div>${c.eyebrow ? `<span class="eyebrow">${mark(c.eyebrow)}</span>` : ''}<h1>${mark(headline(c))}</h1>${c.intro ? `<p class="lead">${mark(c.intro)}</p>` : ''}
<div class="ctas"><a class="btn btn-w" href="#contact">${mark(ctaLabel(c))}</a>${has(c.steps) ? '<a class="btn btn-o" href="#steps">How it works</a>' : ''}</div></div>
${has(c.highlights) ? `<aside class="card hero-card"><h3>What you get</h3>${checkList(c.highlights)}</aside>` : ''}
</div></section>
${has(c.highlights) ? `<section class="sec" id="benefits"><div class="wrap">${secHead('Why customers choose us', '', false)}${featCards(c.highlights)}</div></section>` : ''}
${has(c.steps) ? `<section class="sec soft" id="steps"><div class="wrap">${secHead('How it works', 'Simple from the first call to the finished job.')}${stepCards(c.steps)}</div></section>` : ''}
${has(c.sections) ? `<section class="sec"><div class="wrap">${c.sections.map(s => `<div class="split prose"><h2>${mark(s.h)}</h2><div>${body(s.p)}</div></div>`).join('')}</div></section>` : ''}
${faqBlock(c, { soft: true })}${ctaBlock(c)}`,

  guide: (c) => {
    const toc = [...(c.sections || []).map((s, i) => [`s${i + 1}`, s.h]), ...(has(c.faqs) ? [['faq', 'Frequently asked questions']] : [])];
    return `
<section class="hero hero-soft"><div class="wrap narrow">${c.eyebrow ? `<span class="eyebrow">${mark(c.eyebrow)}</span>` : ''}<h1>${mark(headline(c))}</h1>${c.intro ? `<p class="lead">${mark(c.intro)}</p>` : ''}
${has(c.highlights) ? `<div class="takeaways"><h3>Key takeaways</h3><ul>${c.highlights.map(h => `<li><b>${mark(h.title)}</b>${h.text ? ` — ${mark(h.text)}` : ''}</li>`).join('')}</ul></div>` : ''}</div></section>
<section class="sec"><div class="wrap doc">
<nav class="toc" aria-label="On this page"><b>On this page</b>${toc.map(([id, t]) => `<a href="#${id}">${esc(t)}</a>`).join('')}</nav>
<article class="prose">${(c.sections || []).map((s, i) => `<h2 id="s${i + 1}">${mark(s.h)}</h2>\n${body(s.p)}`).join('\n')}</article>
</div></section>
${faqBlock(c, { soft: true })}${ctaBlock(c)}`;
  },

  faq: (c) => `
<section class="hero hero-soft hero-c"><div class="wrap narrow">${c.eyebrow ? `<span class="eyebrow">${mark(c.eyebrow)}</span>` : ''}<h1>${mark(headline(c))}</h1>${c.intro ? `<p class="lead">${mark(c.intro)}</p>` : ''}
${has(c.faqs) ? `<span class="pill">${c.faqs.length} answers to your questions</span>` : ''}
${has(c.highlights) ? `<div class="facts">${c.highlights.map(h => `<div class="fact">${mark(h.title)}${h.text ? `<span>${mark(h.text)}</span>` : ''}</div>`).join('')}</div>` : ''}</div></section>
${has(c.sections) ? `<section class="sec"><div class="wrap narrow prose">${proseSections(c)}</div></section>` : ''}
${faqBlock(c, { title: 'Your questions, answered' })}${ctaBlock(c, 'Still have a question?')}`,

  comparison: (c) => `
<section class="hero hero-soft hero-c"><div class="wrap narrow">${c.eyebrow ? `<span class="eyebrow">${mark(c.eyebrow)}</span>` : ''}<h1>${mark(headline(c))}</h1>${c.intro ? `<p class="lead">${mark(c.intro)}</p>` : ''}</div></section>
${c.table?.headers?.length ? `<section class="sec" id="compare"><div class="wrap">${secHead('Side by side', 'The main things to compare before you choose.', true)}
<div class="tbl-wrap"><table class="tbl"><thead><tr>${c.table.headers.map(h => `<th>${mark(h)}</th>`).join('')}</tr></thead><tbody>${(c.table.rows || []).map(r => `<tr>${r.map(x => `<td>${mark(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div></section>` : ''}
${has(c.highlights) ? `<section class="sec soft"><div class="wrap">${secHead('What to look for', '', true)}${featCards(c.highlights)}</div></section>` : ''}
${has(c.sections) ? `<section class="sec"><div class="wrap narrow prose">${proseSections(c)}</div></section>` : ''}
${faqBlock(c, { soft: true })}${ctaBlock(c)}`,

  location: (c) => `
<section class="hero hero-soft"><div class="wrap grid2">
<div>${c.eyebrow ? `<span class="eyebrow">${mark(c.eyebrow)}</span>` : ''}<h1>${mark(headline(c))}</h1>${c.intro ? `<p class="lead">${mark(c.intro)}</p>` : ''}
<div class="ctas"><a class="btn btn-p" href="#contact">${mark(ctaLabel(c))}</a>${has(c.areas) ? '<a class="btn btn-o" href="#areas" style="color:var(--pl)">Areas we cover</a>' : ''}</div></div>
<div class="map"><span class="pin" aria-hidden="true"></span>${has(c.areas) ? `<h3>Areas we cover</h3><div class="chips">${c.areas.slice(0, 8).map(a => `<span class="chip">${mark(a)}</span>`).join('')}</div>` : ''}</div>
</div></section>
${has(c.highlights) ? `<section class="sec"><div class="wrap">${secHead('Why local customers choose us', '')}${featCards(c.highlights)}</div></section>` : ''}
${has(c.areas) ? `<section class="sec soft" id="areas"><div class="wrap">${secHead('Where we work', 'If your area is not listed, get in touch and we will check.')}<div class="chips lg">${c.areas.map(a => `<span class="chip">${mark(a)}</span>`).join('')}</div></div></section>` : ''}
${has(c.sections) ? `<section class="sec"><div class="wrap">${c.sections.map(s => `<div class="split prose"><h2>${mark(s.h)}</h2><div>${body(s.p)}</div></div>`).join('')}</div></section>` : ''}
${faqBlock(c, { soft: true })}${ctaBlock(c)}`,

  how_to: (c) => `
<section class="hero hero-soft"><div class="wrap narrow">${c.eyebrow ? `<span class="eyebrow">${mark(c.eyebrow)}</span>` : ''}<h1>${mark(headline(c))}</h1>${c.intro ? `<p class="lead">${mark(c.intro)}</p>` : ''}</div></section>
<section class="sec"><div class="wrap howto">
<div>${has(c.steps) ? `<ol class="timeline">${c.steps.map(s => `<li class="tl"><h3>${mark(s.title)}</h3>${s.text ? `<p>${mark(s.text)}</p>` : ''}</li>`).join('')}</ol>` : ''}
${has(c.sections) ? `<div class="prose" style="margin-top:20px">${proseSections(c)}</div>` : ''}</div>
${has(c.highlights) ? `<aside class="need"><h3>What you need</h3><ul class="checks">${c.highlights.map(h => `<li><b>${mark(h.title)}</b>${h.text ? mark(h.text) : ''}</li>`).join('')}</ul></aside>` : ''}
</div></section>
${faqBlock(c, { soft: true })}${ctaBlock(c)}`,
};

export const designOf = (template) => (DESIGNS[template] ? template : 'service');

const header = (c, company) => `<header class="top"><div class="wrap"><span class="brand">${logoImg(company) || esc(company || 'Your business')}</span>
<nav>${has(c.steps) ? '<a href="#steps">How it works</a>' : ''}${has(c.faqs) ? '<a href="#faq">FAQ</a>' : ''}<a href="#contact">Contact</a></nav>
<a class="btn btn-p" href="#contact">${mark(ctaLabel(c))}</a></div></header>`;
const footer = (company) => `<footer class="foot"><div class="wrap"><span class="foot-b">${logoImg(company, 'logo sm')}<span><b>${esc(company || 'Your business')}</b> · © ${new Date().getFullYear()}</span></span>${contacts().length ? `<span class="foot-c">${contactHtml()}</span>` : ''}</div></footer>`;

/** The page markup. chrome=false leaves out the header and footer (for pasting into a site that already has them). */
export function pageMarkup(content, { template, company, chrome = true, profile } = {}) {
  PROFILE = profile || {};
  const d = designOf(template || content?.template);
  return `<div class="ap d-${d}">${chrome ? header(content, company) : ''}${DESIGNS[d](content || {})}${chrome ? footer(company) : ''}</div>`;
}

const docHead = (c, theme, title) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(c.meta_description || '')}">
<style>html{scroll-behavior:smooth}body{margin:0}@page{margin:12mm}${pageCss(theme)}</style>
</head>
<body>
<!-- Page created with AEO-APP.ai. Check the details once, then publish. -->`;

/** A complete standalone web page (what the .html download and the preview use). */
export function renderPageHtml(content, { template, theme, company, profile } = {}) {
  const c = content || {};
  return `${docHead(c, theme, c.page_title || c.title || 'Page')}
${pageMarkup(c, { template: template || c.template, company, chrome: true, profile })}
</body>
</html>
`;
}

/** Style + markup without header/footer, for a "custom HTML" block in another website. */
export function renderEmbedHtml(content, { template, theme, company, profile } = {}) {
  return `<style>${pageCss(theme)}</style>\n${pageMarkup(content || {}, { template: template || content?.template, company, chrome: false, profile })}\n`;
}
