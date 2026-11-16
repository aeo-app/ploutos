import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { aeoApi } from '../api/aeoApi';
import { Icon } from './Icon';
import { ENGINES, fmtDate, hostOf } from './utils';

/* ── "See answers": what each AI tool really answered to one prompt, with its sources ── */

const RESULT = (cell) => (cell == null ? ['Not checked', '#6b6a85']
  : cell > 0 ? [`Recommends you (#${cell}) with a link`, '#059669']
  : cell < 0 ? ['Mentions you, no link', '#b45309']
  : ["Doesn't mention you", '#dc2626']);

const linkNewTab = { a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a> };

export function RealAnswersButton({ prompt }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="dv-link sm dv-nopr" onClick={() => setOpen(true)}>See answers</button>
      {open && <RealAnswersModal prompt={prompt} onClose={() => setOpen(false)} />}
    </>
  );
}

function RealAnswersModal({ prompt, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    aeoApi.answers(prompt)
      .then(d => { if (active) setData(d); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [prompt]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const answers = data?.answers || {};
  const asked = ENGINES.filter(e => answers[e]);
  const when = data?.checked_at ? ` · asked on ${fmtDate(new Date(data.checked_at), { day: 'numeric', month: 'short', year: 'numeric' })}` : '';

  return (
    <div className="dv-modal" role="dialog" aria-modal="true" aria-label="What AI tools answered" onClick={onClose}>
      <div className="dv-modal-card dv-answers" onClick={e => e.stopPropagation()}>
        <div className="dv-modal-head">
          <div className="dv-row-b"><span className="dv-h2">What AI tools answered</span>
            <button type="button" className="dv-x" onClick={onClose} title="Close" aria-label="Close"><Icon name="x" size={16} /></button></div>
          <span className="dv-sub">“{prompt}”{when}</span>
        </div>
        <div className="dv-modal-body">
          {error && <p className="dv-sub dv-answer-err">{error}</p>}
          {!data && !error && <p className="dv-sub">Loading the answers…</p>}
          {data && !asked.length && <p className="dv-sub">No answers are saved for this prompt yet. They appear after your next analysis.</p>}
          {asked.map(engine => <EngineAnswer key={engine} engine={engine} answer={answers[engine]} />)}
        </div>
      </div>
    </div>
  );
}

function EngineAnswer({ engine, answer }) {
  const [label, color] = answer.error ? ['Could not be checked', '#6b6a85'] : RESULT(answer.cell);
  return (
    <div className="dv-answer">
      <div className="dv-row-b"><b>{engine}</b><span className="dv-answer-res" style={{ color }}>{label}</span></div>
      {answer.error || (!answer.text && answer.note)
        ? <p className="dv-sub">{answer.error || answer.note}</p>
        : <div className="dv-answer-text"><ReactMarkdown remarkPlugins={[remarkGfm]} components={linkNewTab}>{answer.text}</ReactMarkdown></div>}
      {answer.competitors?.length > 0 && <span className="dv-tiny">Recommends: {answer.competitors.join(', ')}</span>}
      {answer.sources?.length > 0 && (
        <div className="dv-answer-src">
          {answer.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" title={s.title || s.url}>{hostOf(s.url)}</a>)}
        </div>
      )}
    </div>
  );
}
