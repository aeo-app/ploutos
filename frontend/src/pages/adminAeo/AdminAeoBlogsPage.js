import React, { useMemo, useState } from 'react';
import { adminAeoApi } from '../../api/adminApi';
import { hkey } from '../../aeo/utils';
import { Badge, Card, Empty, SectionHeader, SkeletonCard } from '../../components/ui/UI';
import { useApp } from '../../context/AppContext';
import { AdminImg, CustomerList, UserHeader, promptsOf, useAdminCall, useWorkspace } from './shared'; // eslint-disable-line no-unused-vars
import s from './AdminAeo.module.css';

const TYPES = ['Blog', 'FAQ', 'How-to guide', 'Comparison', 'Case study', 'Listicle'];

function statusOf(st, hasDoc) {
  if (st.team === 'verified') return ['Verified', 'success'];
  if (st.pending) return ['Review requested', 'warning'];
  if (st.team === 'edited') return ['Edited by team', 'brand'];
  if (hasDoc) return ['AI draft', 'default'];
  return ['Topic idea', 'default'];
}

function BlogEditor({ userId, prompt, topic, existing, request, onClose, onSaved }) {
  const call = useAdminCall();
  const { toast } = useApp();
  const isNew = !existing;
  const [title, setTitle] = useState(topic?.title || '');
  const [type, setType] = useState(existing?.type || topic?.type || 'Blog');
  const [intro, setIntro] = useState(existing?.intro || '');
  const [sections, setSections] = useState(existing?.sections?.length ? existing.sections : [{ h: '', p: '' }]);
  const [busy, setBusy] = useState('');
  const setSec = (i, k, v) => setSections(a => a.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const move = (i, d) => setSections(a => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return a; [b[i], b[j]] = [b[j], b[i]]; return b; });

  const draftWithAi = async () => {
    if (title.trim().length < 3) { toast({ type: 'error', message: 'Add a title first.' }); return; }
    if ((intro || sections.some(x => x.p)) && !window.confirm('Replace what is written with a new AI draft?')) return;
    setBusy('ai');
    const d = await call(adminAeoApi.aiBlog(userId, { prompt, title: title.trim(), type, words: topic?.words || 1000 }));
    setBusy('');
    if (d) { setIntro(d.intro || ''); setSections(d.sections?.length ? d.sections : [{ h: '', p: '' }]); }
  };

  const save = async (team) => {
    if (title.trim().length < 3) { toast({ type: 'error', message: 'A blog needs a title.' }); return; }
    if (!intro.trim() && !sections.some(x => x.p.trim())) { toast({ type: 'error', message: 'Write something first.' }); return; }
    setBusy(team);
    const r = await call(adminAeoApi.saveContent(userId, {
      kind: 'blog', prompt, title: title.trim(), team, add_topic: true,
      state_key: hkey('blog', prompt, title.trim()),
      data: { type, intro, sections: sections.filter(x => x.h.trim() || x.p.trim()), words: topic?.words || 1000 },
    }));
    setBusy('');
    if (r) {
      if (r.topic_added === false) toast({ type: 'info', message: 'Saved. Generate the topics for this prompt so the customer sees it in their list.' });
      else toast({ type: 'success', message: team === 'verified' ? 'Saved and marked verified. The customer will see it.' : 'Saved. The customer will see it.' });
      onSaved();
    }
  };

  return (
    <div className={s.modalBg} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.modalH}>
          <div><div className={s.h2}>{isNew ? 'Write a blog' : 'Edit blog'}</div><span className={s.muted}>For the prompt: “{prompt}”</span></div>
          <button type="button" className={s.btn} onClick={onClose}>Close ✕</button>
        </div>
        <div className={s.modalB}>
          {request && <div className={`${s.banner} ${s.field}`}>The customer asked our team to review this blog. Saving clears the request.</div>}
          <div className={s.field}><span className={s.label}>Title</span>
            <input className={s.input} value={title} onChange={e => setTitle(e.target.value)} disabled={!!topic?.title} placeholder="e.g. How electromagnetic bird deterrents work" /></div>
          <div className={s.field}><span className={s.label}>Type</span>
            <select className={s.input} value={type} onChange={e => setType(e.target.value)}>{[...new Set([type, ...TYPES])].map(t => <option key={t}>{t}</option>)}</select></div>
          <div className={s.field}><span className={s.label}>Introduction</span>
            <textarea className={s.area} value={intro} onChange={e => setIntro(e.target.value)} /></div>
          <span className={s.label}>Sections</span>
          {sections.map((sec, i) => (
            <div key={i} className={s.sec}>
              <div className={s.field}><input className={s.input} placeholder="Section heading" value={sec.h} onChange={e => setSec(i, 'h', e.target.value)} /></div>
              <div className={s.field}><textarea className={s.area} placeholder="Section text" value={sec.p} onChange={e => setSec(i, 'p', e.target.value)} /></div>
              <div className={s.actions}>
                <button type="button" className={`${s.btn} ${s.sm}`} onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                <button type="button" className={`${s.btn} ${s.sm}`} onClick={() => move(i, 1)} disabled={i === sections.length - 1}>↓</button>
                <button type="button" className={`${s.btn} ${s.sm}`} onClick={() => setSections(a => a.filter((_, j) => j !== i))} disabled={sections.length === 1}>Remove</button>
              </div>
            </div>
          ))}
          <button type="button" className={s.btn} onClick={() => setSections(a => [...a, { h: '', p: '' }])}>+ Add section</button>
        </div>
        <div className={s.modalF}>
          <button type="button" className={s.btn} disabled={!!busy} onClick={draftWithAi}>{busy === 'ai' ? 'Drafting…' : '✨ Draft with AI'}</button>
          <div className={s.actions}>
            <button type="button" className={s.btn} disabled={!!busy} onClick={() => save('edited')}>{busy === 'edited' ? 'Saving…' : 'Save for customer'}</button>
            <button type="button" className={`${s.btn} ${s.good}`} disabled={!!busy} onClick={() => save('verified')}>{busy === 'verified' ? 'Saving…' : '✓ Save & mark verified'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PromptBlogs({ userId, prompt, ws, reload }) {
  const call = useAdminCall();
  const [editor, setEditor] = useState(null);
  const [gen, setGen] = useState(false);
  const strat = ws.content.find(c => c.kind === 'strategy' && c.prompt === prompt);
  const blogs = ws.content.filter(c => c.kind === 'blog' && c.prompt === prompt);
  const topics = useMemo(() => {
    const list = (strat?.data.blog_topics || []).map(t => ({ ...t }));
    blogs.forEach(b => { if (!list.some(t => t.title.trim().toLowerCase() === (b.title || '').trim().toLowerCase())) list.push({ type: b.data.type, title: b.title, words: 1000 }); });
    return list;
  }, [strat, blogs]);

  const generateTopics = async () => { setGen(true); await call(adminAeoApi.aiStrategy(userId, prompt)); setGen(false); reload(); };
  const verify = async (t, doc) => {
    const key = hkey('blog', prompt, t.title);
    await call(adminAeoApi.saveContent(userId, { kind: 'blog', prompt, title: t.title, team: 'verified', state_key: key, data: { type: doc.data.type, intro: doc.data.intro, sections: doc.data.sections } }));
    reload();
  };

  return (
    <Card>
      <div className={s.head}>
        <div><div className={s.title}>“{prompt}”</div><span className={s.muted}>{topics.length} blog topic{topics.length === 1 ? '' : 's'}</span></div>
        <div className={s.actions}>
          {!strat && <button type="button" className={s.btn} disabled={gen} onClick={generateTopics}>{gen ? 'Generating…' : 'Generate topics (AI)'}</button>}
          <button type="button" className={`${s.btn} ${s.primary}`} onClick={() => setEditor({ topic: { title: '', type: 'Blog' }, doc: null })}>+ Write a new blog</button>
        </div>
      </div>
      {topics.length === 0 && <p className={s.note}>No topics yet. Generate topics with AI or write a blog from scratch.</p>}
      {topics.map(t => {
        const key = hkey('blog', prompt, t.title);
        const st = ws.state.blog_state[key] || {};
        const doc = blogs.find(b => (b.title || '').trim().toLowerCase() === t.title.trim().toLowerCase());
        const [label, variant] = statusOf(st, !!doc);
        return (
          <div key={key} className={`${s.row} ${st.pending && st.team !== 'verified' ? s.rowReq : ''}`}>
            <div>
              <div className={s.title}>{t.title}</div>
              <div className={s.actions} style={{ marginTop: 4 }}>
                <span className={s.muted}>{t.type}</span>
                <Badge variant={variant}>{label}</Badge>
                {st.approved && <Badge variant="success">Approved by customer</Badge>}
              </div>
            </div>
            <div className={s.actions}>
              {doc && st.team !== 'verified' && <button type="button" className={s.btn} onClick={() => verify(t, doc)}>✓ Mark verified</button>}
              <button type="button" className={`${s.btn} ${st.pending && st.team !== 'verified' ? s.primary : ''}`}
                onClick={() => setEditor({ topic: t, doc: doc?.data || null, request: !!st.pending && st.team !== 'verified' })}>
                {doc ? (st.pending ? 'Review & edit' : 'Edit') : 'Write'}
              </button>
            </div>
          </div>
        );
      })}
      {editor && <BlogEditor userId={userId} prompt={prompt} topic={editor.topic} existing={editor.doc} request={editor.request}
        onClose={() => setEditor(null)} onSaved={() => { setEditor(null); reload(); }} />}
    </Card>
  );
}

export function AdminAeoBlogsPage({ selectedUser, onSelectUser }) {
  const { ws, loading, reload } = useWorkspace(selectedUser);
  const [tick, setTick] = useState(0);
  const prompts = promptsOf(ws);
  const refresh = () => { reload(); setTick(t => t + 1); };
  return (
    <div>
      <SectionHeader title="Blogs" subtitle="Review the blogs customers asked our team to check, or write one for them. Saved work appears on the customer's screen." />
      <div className={s.layout}>
        <CustomerList selectedUser={selectedUser} onSelectUser={onSelectUser} refreshKey={tick} />
        <div className={s.main}>
          {!selectedUser && <Empty icon="📝" title="Choose a customer" body="Customers with open review requests are listed first." />}
          {selectedUser && (loading || !ws) && <SkeletonCard rows={4} />}
          {ws && (
            <>
              <UserHeader ws={ws} />
              {prompts.length === 0 && <Empty icon="🧭" title="No prompts selected yet" body="This customer has not chosen prompts to work on, so there are no blog topics yet." />}
              {prompts.map(p => <PromptBlogs key={p} userId={ws.user.user_id} prompt={p} ws={ws} reload={refresh} />)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
