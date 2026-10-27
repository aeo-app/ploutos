/* Blog export — everything runs in the browser, nothing is uploaded. */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const para = (t) => String(t ?? '').split(/\n{2,}/).map(x => `<p>${esc(x).replace(/\n/g, '<br>')}</p>`).join('');
const slug = (t) => String(t || 'blog').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'blog';

const blogHtml = (b) => `<article><h1>${esc(b.title)}</h1>${b.type ? `<p><i>${esc(b.type)}${b.prompt ? ` · targets “${esc(b.prompt)}”` : ''}</i></p>` : ''}${para(b.intro)}${(b.sections || []).map(s => `<h2>${esc(s.h)}</h2>${para(s.p)}`).join('')}</article>`;
const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Calibri,Arial,sans-serif;max-width:780px;margin:32px auto;padding:0 20px;line-height:1.6;color:#1c1b3a}h1{font-size:28px}h2{font-size:20px;margin-top:24px}article{page-break-after:always}article:last-child{page-break-after:auto}</style></head><body>${body}</body></html>`;

export const blogMarkdown = (b) => [`# ${b.title}`, b.type ? `*${b.type}${b.prompt ? ` · targets “${b.prompt}”` : ''}*` : '', b.intro || '', ...(b.sections || []).map(s => `## ${s.h}\n\n${s.p}`)].filter(Boolean).join('\n\n') + '\n';

function save(name, mime, text) {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** One or many blogs as a Word file (Word and Google Docs open it as a normal document). */
export function exportWord(blogs, name) {
  const list = [].concat(blogs);
  save(`${name || slug(list[0]?.title)}.doc`, 'application/msword', page(list[0]?.title || 'Blogs', list.map(blogHtml).join('')));
}
export function exportMarkdown(blogs, name) {
  const list = [].concat(blogs);
  save(`${name || slug(list[0]?.title)}.md`, 'text/markdown', list.map(blogMarkdown).join('\n---\n\n'));
}
/** PDF: opens the print dialog on a clean copy — choose "Save as PDF". */
export function exportPdf(blogs) {
  const list = [].concat(blogs);
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(page(list[0]?.title || 'Blogs', list.map(blogHtml).join('')));
  w.document.close(); w.focus();
  setTimeout(() => { try { w.print(); } catch (_) { /* the page is still open to print by hand */ } }, 300);
  return true;
}
