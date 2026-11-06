import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { copyToClipboard } from './utils';
import { exportMarkdown, exportPdf, exportWord } from './blogExport';

const tableText = (t) => t ? [t.headers.join(' | '), ...t.rows.map(r => r.join(' | '))].join('\n') : '';

/** The page as plain documents for Word / Markdown / PDF / copy. FAQs and the table become sections. */
export function pillarDoc(a) {
  const sections = [...(a.sections || [])];
  if (a.table) sections.push({ h: 'Comparison', p: tableText(a.table) });
  if ((a.faqs || []).length) sections.push(...a.faqs.map(f => ({ h: f.q, p: f.a })));
  return { title: a.title, type: a.pillar_type, prompt: a.prompt, intro: a.intro, sections };
}

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

export function PillarReader({ asset, onClose, onRefresh, refreshing }) {
  const { toast } = useApp();
  const [tab, setTab] = useState('publish');
  const doc = pillarDoc(asset);
  const pdf = () => { if (!exportPdf(doc)) toast({ type: 'info', message: 'Your browser blocked the print window. Allow pop-ups for this site and try again.' }); };
  return (
    <div className="ae-reader-bg" onClick={onClose}>
      <article className="ae-reader" onClick={e => e.stopPropagation()} data-testid="pillar-reader">
        <div className="ae-reader-h">
          <span className="ae-pill" style={{ background: '#eef0ff', color: '#3730a3', padding: '4px 10px' }}>{asset.pillar_type}</span>
          <button className="ae-btn sm" style={{ border: 'none', background: 'none' }} onClick={onClose}>Close ✕</button>
        </div>
        <div className="ae-reader-b" style={{ padding: '24px 28px' }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>{asset.title}</h2>
        <div className="ae-seg">
          <button className={tab === 'publish' ? 'on' : ''} onClick={() => setTab('publish')}>1. How to publish it</button>
          <button className={tab === 'content' ? 'on' : ''} onClick={() => setTab('content')}>2. The page content</button>
          <button className={tab === 'schema' ? 'on' : ''} onClick={() => setTab('schema')}>3. Schema code</button>
        </div>

        {tab === 'publish' && (
          <div className="ae-col" style={{ gap: 12 }}>
            <p className="ae-sub" style={{ margin: 0 }}>This is a new page for <b>your own website</b>. AI engines recommend businesses whose sites answer the question clearly, so this page is written to be quoted.</p>
            <CopyRow label="Page address (URL ending)" value={`/${asset.slug}`} toast={toast} />
            <CopyRow label="Page title (SEO)" value={asset.page_title} toast={toast} />
            <CopyRow label="Meta description" value={asset.meta_description} toast={toast} />
            {asset.where && <div className="ae-pg-box"><span className="ae-eyebrow">Where it goes on your site</span><div>{asset.where}</div></div>}
            {asset.link_from?.length > 0 && <div className="ae-pg-box"><span className="ae-eyebrow">Link to it from</span><ul>{asset.link_from.map((l, i) => <li key={i}>{l}</li>)}</ul></div>}
            {asset.checklist?.length > 0 && <div className="ae-pg-box warn"><span className="ae-eyebrow">Fill in before you publish</span><ul>{asset.checklist.map((l, i) => <li key={i}>{l}</li>)}</ul></div>}
            <div className="ae-pg-box"><span className="ae-eyebrow">Step by step</span><ol>{asset.steps.map((l, i) => <li key={i}>{l}</li>)}</ol></div>
          </div>
        )}

        {tab === 'content' && (
          <div className="ae-col" style={{ gap: 10 }}>
            <div className="ae-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="ae-btn sm" onClick={() => { copyToClipboard(`${asset.title}\n\n${doc.intro}\n\n${doc.sections.map(s => `${s.h}\n${s.p}`).join('\n\n')}`); toast({ type: 'success', message: 'Page text copied.' }); }}>Copy all text</button>
              <button className="ae-btn sm" onClick={() => exportWord(doc)}>⬇ Word</button>
              <button className="ae-btn sm" onClick={() => exportMarkdown(doc)}>⬇ Markdown</button>
              <button className="ae-btn sm" onClick={pdf}>⬇ PDF</button>
              <button className="ae-btn sm" disabled={refreshing} onClick={onRefresh}>{refreshing ? 'Rewriting…' : 'Rewrite'}</button>
            </div>
            <h3 style={{ margin: '6px 0 0' }}>{asset.title}</h3>
            <p style={{ margin: 0, lineHeight: 1.6 }}>{asset.intro}</p>
            {asset.sections.map((s, i) => <div key={i}><h4 style={{ margin: '12px 0 4px' }}>{s.h}</h4>{String(s.p).split(/\n{2,}/).map((x, j) => <p key={j} style={{ margin: '0 0 8px', lineHeight: 1.6 }}>{x}</p>)}</div>)}
            {asset.table && (
              <div className="ae-bl-scroll"><table className="ae-bl-table"><thead><tr>{asset.table.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                <tbody>{asset.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>
            )}
            {asset.faqs.length > 0 && <><h4 style={{ margin: '14px 0 4px' }}>Frequently asked questions</h4>
              {asset.faqs.map((f, i) => <div key={i} style={{ marginBottom: 8 }}><b>{f.q}</b><p style={{ margin: '2px 0 0', lineHeight: 1.6 }}>{f.a}</p></div>)}</>}
          </div>
        )}

        {tab === 'schema' && (
          <div className="ae-col" style={{ gap: 10 }}>
            <p className="ae-sub" style={{ margin: 0 }}>Paste this into a Custom HTML block on the page (or the page's header-code field). It tells search and AI engines which parts are questions and answers. Do not change the text inside the quotes unless you also change it on the page.</p>
            <pre className="ae-pg-code" data-testid="pillar-schema">{asset.schema_jsonld}</pre>
            <div><button className="ae-btn sm primary" onClick={() => { copyToClipboard(asset.schema_jsonld); toast({ type: 'success', message: 'Schema code copied.' }); }}>Copy schema code</button></div>
          </div>
        )}
        </div>
      </article>
    </div>
  );
}
