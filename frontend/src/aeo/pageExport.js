/* Turns a written page into files the customer can keep: a ready-to-upload .html page, a PDF, or a code block to paste into
   another website. Everything runs in the browser — nothing is uploaded. */
import { renderPageHtml, renderEmbedHtml } from './pageRender';

const fileBase = (a) => (a.slug || String(a.title || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page').slice(0, 60);
const opts = (a, o) => ({ template: a.template, theme: o?.theme, company: o?.company, profile: o?.profile });

export const pageHtml = (a, o) => renderPageHtml(a, opts(a, o));
export const pageEmbedCode = (a, o) => renderEmbedHtml(a, opts(a, o));

export function downloadHtml(a, o) {
  const url = URL.createObjectURL(new Blob([pageHtml(a, o)], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `${fileBase(a)}.html`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** PDF: opens the print dialog on a clean copy of the page — choose "Save as PDF". Uses a hidden frame, so no pop-up is blocked. */
export function downloadPdf(a, o) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  // A real width, so the page lays out like a desktop page; hidden off-screen.
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:800px;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument || frame.contentWindow?.document;
  if (!doc) { frame.remove(); return false; }
  doc.open(); doc.write(pageHtml(a, o).replace(/<title>[^<]*<\/title>/, `<title>${fileBase(a)}</title>`)); doc.close();
  // Closed question boxes would print as closed — open them all.
  doc.querySelectorAll('details').forEach(d => { d.open = true; });
  const go = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (_) { /* nothing more to do */ } setTimeout(() => frame.remove(), 60000); };
  setTimeout(go, 400);
  return true;
}
