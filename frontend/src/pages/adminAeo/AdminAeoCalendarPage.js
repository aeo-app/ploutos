import React, { useEffect, useRef, useState } from 'react';
import { adminAeoApi } from '../../api/adminApi';
import { canvaApi } from '../../api/canvaApi';
import { downloadImage } from '../../api/downloadImage';
import { CHANNELS, channelState, hkey } from '../../aeo/utils';
import { Badge, Card, Empty, SectionHeader, SkeletonCard } from '../../components/ui/UI';
import { useApp } from '../../context/AppContext';
import { AdminImg, AdminVideo, CustomerList, UserHeader, promptsOf, useAdminCall, useWorkspace } from './shared';
import s from './AdminAeo.module.css';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const brandVisual = (post, brand) => (post.visual && post.visual.trim())
  || `A realistic, real-world photograph for ${brand} showing: ${(post.title || post.text || '').replace(/\s+/g, ' ').slice(0, 160)}`;

function PostEditor({ userId, brand, brandOk, prompt, ch, i, post, st, onChange, onFlag, onSaveDoc, saving, dirty, justSaved, saveError }) {
  const call = useAdminCall();
  const { toast } = useApp();
  const fileRef = useRef(null);
  const key = hkey('post', prompt, ch.id, i);
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(!st.approved);
  const [needCanva, setNeedCanva] = useState(false);
  const [dims, setDims] = useState('');
  const [zoom, setZoom] = useState(false);
  const approved = !!st.approved;
  const img = st.img;

  const vid = st.vid;
  const needBrand = () => {
    if (brandOk) return false;
    toast({ type: 'info', message: 'This customer has not added their logo and contact phone number yet. Images and Shorts need them — they are printed on every one.' });
    return true;
  };
  const genShort = async () => {
    if (needBrand()) return;
    setBusy('short');
    try {
      const { job_id } = await adminAeoApi.startShort(userId, { key, title: post.title || '', text: (post.text || '').slice(0, 1500), visual: brandVisual(post, brand) });
      const until = Date.now() + 9 * 60 * 1000;
      while (Date.now() < until) {
        await new Promise(r => setTimeout(r, 4000));
        const stt = await adminAeoApi.shortStatus(userId, job_id);
        if (stt.status === 'done') { onFlag(key, (stt.entry || {})[key] || { vid: stt.video_url, vthumb: stt.thumb_url }); toast({ type: 'success', message: 'Short created. The customer will see it.' }); setBusy(''); return; }
        if (stt.status === 'error') throw new Error(stt.error || 'Could not create the video.');
      }
      throw new Error('The video is taking longer than usual. Please try again in a few minutes.');
    } catch (e) { if (e?.code !== 'TokenExpired') toast({ type: 'error', message: e?.message || 'Could not create the video.' }); }
    setBusy('');
  };
  const uploadShort = async (f) => {
    if (!f) return;
    setBusy('upv');
    const r = await call(adminAeoApi.uploadShort(userId, key, f));
    setBusy('');
    if (r?.entry) { onFlag(key, r.entry); toast({ type: 'success', message: 'Short uploaded. The customer will see it.' }); }
  };
  const removeShort = async () => {
    setBusy('rm');
    const r = await call(adminAeoApi.flag(userId, { section: 'post', key, vid: '' }));
    setBusy('');
    if (r?.entry) onFlag(key, r.entry);
  };
  const gen = async () => {
    if (needBrand()) return;
    setBusy('gen');
    const r = await call(adminAeoApi.generateImage(userId, { key, visual: brandVisual(post, brand), brand }));
    setBusy('');
    if (r?.entry) { onFlag(key, r.entry); toast({ type: 'success', message: 'Image created. The customer will see it.' }); }
  };
  const upload = async (f) => {
    if (!f) return;
    setBusy('up');
    const r = await call(adminAeoApi.uploadImage(userId, key, f));
    setBusy('');
    if (r?.entry) onFlag(key, r.entry);
  };
  const remove = async () => {
    setBusy('rm');
    const r = await call(adminAeoApi.flag(userId, { section: 'post', key, img: '' }));
    setBusy('');
    if (r?.entry) onFlag(key, r.entry);
  };
  const download = async () => {
    setBusy('dl');
    const ok = await downloadImage(img, `${brand}-${ch.id}-week-${i + 1}`, () => adminAeoApi.downloadBlob(userId, img));
    setBusy('');
    if (!ok) toast({ type: 'info', message: 'Opened the image in a new tab — right-click it to save.' });
  };
  const set = (k, v) => onChange({ ...post, [k]: v });

  const connectCanva = async () => {
    setBusy('cc');
    const r = await call(canvaApi.connect(), { quiet: true });
    if (r?.authorize_url) {
      try { sessionStorage.setItem('admin_return', JSON.stringify({ page: 'calendars', user: { user_id: userId } })); } catch (_) { /* optional */ }
      window.location.href = r.authorize_url;
    } else { setBusy(''); toast({ type: 'error', message: 'Could not start the Canva connection.' }); }
  };
  const editInCanva = async () => {
    const w = window.open('', '_blank');               // opened first so the browser doesn't block it
    setBusy('ce'); setNeedCanva(false);
    try {
      const r = await adminAeoApi.canvaEdit(userId, key);
      if (r?.entry) onFlag(key, r.entry);
      if (w && r?.edit_url) w.location.href = r.edit_url;
      else if (r?.edit_url) toast({ type: 'info', message: 'Your browser blocked the Canva tab. Allow pop-ups and try again.' });
      toast({ type: 'info', message: 'Edit the image in Canva, then come back and click “Get edited image”.' });
    } catch (e) {
      if (w) w.close();
      if (e?.code === 'CanvaNotConnected') setNeedCanva(true);
      else toast({ type: 'error', message: e?.message || 'Could not open Canva.' });
    }
    setBusy('');
  };
  const syncCanva = async () => {
    setBusy('cs');
    const r = await call(adminAeoApi.canvaSync(userId, key));
    setBusy('');
    if (r?.entry) { onFlag(key, r.entry); toast({ type: 'success', message: 'Edited image brought back. The customer will see it too.' }); }
  };

  return (
    <div className={`${s.post} ${approved ? s.postOk : ''}`}>
      <div>
        <div className={s.head} style={{ marginBottom: 10 }}>
          <div className={s.actions}>
            <b>Week {i + 1}</b><span className={s.muted}>{DAYS[ch.day]} · {ch.time}</span>
            {approved ? <Badge variant="success">✓ Approved by customer</Badge> : <Badge variant="warning">Awaiting customer approval</Badge>}
            {st.team && <Badge variant="brand">{st.team === 'verified' ? 'Verified by team' : 'Updated by team'}</Badge>}
          </div>
        </div>
        {approved && !open ? (
          <div>
            <p className={s.note} style={{ whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>{post.text}</p>
            <div className={s.banner + ' ' + s.okBanner}>The customer approved this post — no update needed.</div>
            <button type="button" className={`${s.btn} ${s.sm}`} style={{ marginTop: 8 }} onClick={() => setOpen(true)}>Edit anyway</button>
          </div>
        ) : (
          <>
            {ch.id === 'yt' && (
              <div className={s.field}><span className={s.label}>Video title</span><input className={s.input} value={post.title || ''} onChange={e => set('title', e.target.value)} /></div>
            )}
            <div className={s.field}><span className={s.label}>Post text</span><textarea className={s.area} value={post.text || ''} onChange={e => set('text', e.target.value)} /></div>
            <div className={s.field}><span className={s.label}>Call to action</span><input className={s.input} value={post.cta || ''} onChange={e => set('cta', e.target.value)} /></div>
            <div className={s.field}><span className={s.label}>Hashtags</span><input className={s.input} value={post.tags || ''} onChange={e => set('tags', e.target.value)} /></div>
            {ch.id === 'yt' && <div className={s.field}><span className={s.label}>Duration</span><input className={s.input} value={post.duration || ''} onChange={e => set('duration', e.target.value)} /></div>}
            <div className={s.field}><span className={s.label}>Visual suggestion (used to create the image)</span>
              <textarea className={s.area} style={{ minHeight: 64 }} value={post.visual || ''} placeholder={brandVisual(post, brand)} onChange={e => set('visual', e.target.value)} /></div>
            {approved && <div className={s.banner} style={{ marginBottom: 8 }}>The customer already approved this post. Changes you save here will show on their screen.</div>}
            <div className={s.actions} style={{ alignItems: 'center' }}>
              <button type="button" className={`${s.btn} ${dirty ? s.primary : ''}`} disabled={saving || !dirty} onClick={onSaveDoc}>
                {saving ? '⏳ Saving…' : dirty ? 'Save changes' : '✓ Saved'}</button>
              <span className={s.note} style={{ color: saveError ? '#dc2626' : saving ? '#4f46e5' : dirty ? '#b45309' : justSaved ? '#059669' : undefined, fontWeight: 600 }}>
                {saveError ? 'Could not save — try again' : saving ? 'Saving your edits…' : dirty ? '● Unsaved changes' : justSaved ? 'Saved — the customer can see it now' : 'All changes saved'}</span>
              {approved && <button type="button" className={s.btn} onClick={() => setOpen(false)}>Collapse</button>}
            </div>
          </>
        )}
      </div>
      {ch.id === 'yt' ? (
      <div>
        {vid ? <AdminVideo userId={userId} src={vid} thumb={st.vthumb} /> : <div className={s.imgBox} style={{ aspectRatio: '9 / 16', maxWidth: 320 }}><span>No Short video yet</span></div>}
        {(!approved || open) && (
          <div className={s.imgBtns}>
            <button type="button" className={`${s.btn} ${s.sm} ${s.primary}`} disabled={!!busy} onClick={genShort}>{busy === 'short' ? 'Creating… (1–2 min)' : vid ? '↻ Create new Short' : '🎬 Create Short video'}</button>
            <button type="button" className={`${s.btn} ${s.sm}`} disabled={!!busy} onClick={() => fileRef.current?.click()}>{busy === 'upv' ? 'Uploading…' : '⬆ Upload Short'}</button>
            {vid && <button type="button" className={`${s.btn} ${s.sm}`} disabled={!!busy} onClick={removeShort}>Remove</button>}
            <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/*" hidden onChange={e => { uploadShort(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        )}
        <p className={s.note} style={{ margin: '8px 0 0' }}>YouTube posts are vertical Shorts (9:16, up to 3 minutes). Generated Shorts carry the customer's logo and contact details.</p>
      </div>
      ) : (
      <div>
        {img ? (
          <div className={s.imgFull}>
            <AdminImg userId={userId} src={img} onLoad={e => setDims(`${e.target.naturalWidth} × ${e.target.naturalHeight} px`)} />
            <button type="button" className={s.zoomBtn} onClick={() => setZoom(true)} title="View at full size">⤢ Full size</button>
          </div>
        ) : <div className={s.imgBox} style={{ aspectRatio: ch.aspect }}><span>No image yet</span></div>}
        {img && <p className={s.note} style={{ margin: '6px 0 0' }}>{dims ? `Actual size: ${dims}` : 'Loading…'}</p>}
        {img && <div className={s.imgBtns}><button type="button" className={`${s.btn} ${s.sm}`} disabled={busy === 'dl'} onClick={download}>{busy === 'dl' ? 'Preparing…' : '⬇ Download'}</button></div>}
        {zoom && (
          <div className={s.lightbox} onClick={() => setZoom(false)} role="dialog" aria-label="Full size image">
            <div className={s.lightboxIn} onClick={e => e.stopPropagation()}>
              <div className={s.actions} style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <b style={{ color: '#fff' }}>{dims}</b>
                <span className={s.actions}>
                  <button type="button" className={`${s.btn} ${s.sm}`} onClick={download}>⬇ Download</button>
                  <button type="button" className={`${s.btn} ${s.sm}`} onClick={() => setZoom(false)}>Close ✕</button>
                </span>
              </div>
              <div className={s.lightboxImg}><AdminImg userId={userId} src={img} /></div>
            </div>
          </div>
        )}
        {(!approved || open) && (
          <div className={s.imgBtns}>
            <button type="button" className={`${s.btn} ${s.sm} ${s.primary}`} disabled={!!busy} onClick={gen}>{busy === 'gen' ? 'Creating…' : img ? '↻ Create new image' : '✨ Create image'}</button>
            <button type="button" className={`${s.btn} ${s.sm}`} disabled={!!busy} onClick={() => fileRef.current?.click()}>{busy === 'up' ? 'Uploading…' : '⬆ Upload'}</button>
            {img && <button type="button" className={`${s.btn} ${s.sm}`} disabled={!!busy} onClick={remove}>Remove</button>}
            {img && <button type="button" className={`${s.btn} ${s.sm}`} disabled={!!busy} onClick={editInCanva}>{busy === 'ce' ? 'Opening Canva…' : '🎨 Edit in Canva'}</button>}
            {img && st.cd && <button type="button" className={`${s.btn} ${s.sm} ${s.good}`} disabled={!!busy} onClick={syncCanva}>{busy === 'cs' ? 'Getting image…' : '↻ Get edited image'}</button>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        )}
        {(!approved || open) && needCanva && (
          <div className={s.banner} style={{ marginTop: 8 }}>
            Canva isn't connected for your admin account yet.{' '}
            <button type="button" className={`${s.btn} ${s.sm}`} disabled={busy === 'cc'} onClick={connectCanva}>Connect Canva</button>
          </div>
        )}
        {(!approved || open) && st.cd && <p className={s.note} style={{ margin: '8px 0 0' }}>Finished editing in Canva? Click “Get edited image” to update this post for you and the customer. Image changes are saved automatically.</p>}
      </div>
      )}
    </div>
  );
}

function PromptCalendar({ ws, setWs, prompt, reload }) {
  const call = useAdminCall();
  const { toast } = useApp();
  const userId = ws.user.user_id;
  const brand = ws.user.company_name || 'the company';
  const doc = ws.content.find(c => c.kind === 'social' && c.prompt === prompt);
  const [channels, setChannels] = useState(doc?.data.channels || null);
  const [channel, setChannel] = useState('fb');
  const [saving, setSaving] = useState(false);
  const [gen, setGen] = useState(false);
  const [conn, setConn] = useState({});
  const [base, setBase] = useState(null);                 // what is saved on the server right now
  const [justSaved, setJustSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  useEffect(() => {
    const c = doc?.data.channels ? clone(doc.data.channels) : null;
    setChannels(c); setBase(c ? clone(c) : null);
  }, [doc?.sk, doc?.updated_at]); // eslint-disable-line
  const isDirty = (cid, i) => !!base && JSON.stringify((channels?.[cid] || [])[i] ?? null) !== JSON.stringify((base[cid] || [])[i] ?? null);
  const dirtyCount = channels && base ? CHANNELS.reduce((n, c) => n + (channels[c.id] || []).filter((_, i) => isDirty(c.id, i)).length, 0) : 0;
  useEffect(() => {
    let off = false;
    call(adminAeoApi.socialStatus(userId), { quiet: true }).then(d => { if (off || !d) return; const m = {}; (d.platforms || []).forEach(p => { m[p.platform] = p; }); setConn(m); });
    return () => { off = true; };
  }, [userId, call]);

  const setEntry = (key, entry) => setWs(w => ({ ...w, state: { ...w.state, post_state: { ...w.state.post_state, [key]: entry } } }));
  const ps = ws.state.post_state;

  const generate = async () => { setGen(true); await call(adminAeoApi.aiSocial(userId, prompt)); setGen(false); reload(); };
  const saveDoc = async (team = 'edited') => {
    setSaving(true); setSaveError(false); setJustSaved(false);
    const r = await call(adminAeoApi.saveContent(userId, { kind: 'social', prompt, sk: doc.sk, team, data: { channels } }), { quiet: true });
    setSaving(false);
    if (r) {
      setBase(clone(channels));
      setJustSaved(true); setTimeout(() => setJustSaved(false), 6000);
      toast({ type: 'success', message: 'Saved. The customer will see your changes.' });
      reload();
      return true;
    }
    setSaveError(true);
    toast({ type: 'error', message: 'Could not save your changes. Please try again.' });
    return false;
  };
  const verifyAll = async () => {
    if (!(await saveDoc('verified'))) return;
    for (const c of CHANNELS) for (let i = 0; i < (channels[c.id] || []).length; i++) {
      const r = await call(adminAeoApi.flag(userId, { section: 'post', key: hkey('post', prompt, c.id, i), team: 'verified' }), { quiet: true });
      if (r?.entry) setEntry(hkey('post', prompt, c.id, i), r.entry);
    }
  };

  if (!doc || !channels) {
    return (
      <Card>
        <div className={s.title}>“{prompt}”</div>
        <p className={s.note}>The customer has not created a social media calendar for this prompt. You can create one for them — it will appear on their Social Media Calendar page.</p>
        <button type="button" className={`${s.btn} ${s.primary}`} disabled={gen} onClick={generate}>{gen ? 'Creating the calendar…' : '✨ Create calendar (AI)'}</button>
      </Card>
    );
  }

  const ch = CHANNELS.find(c => c.id === channel);
  const posts = channels[channel] || [];
  const total = CHANNELS.reduce((n, c) => n + (channels[c.id] || []).length, 0);
  const approved = CHANNELS.reduce((n, c) => n + (channels[c.id] || []).filter((_, i) => ps[hkey('post', prompt, c.id, i)]?.approved).length, 0);

  return (
    <Card>
      <div className={s.head}>
        <div><div className={s.title}>“{prompt}”</div>
          <span className={s.muted}>{approved} of {total} posts approved by the customer{doc.data.limited ? ' · free preview (1 post per channel)' : ''}</span></div>
        <div className={s.actions}>
          <button type="button" className={`${s.btn} ${dirtyCount ? s.primary : ''}`} disabled={saving || !dirtyCount} onClick={() => saveDoc('edited')}>
            {saving ? '⏳ Saving…' : dirtyCount ? `Save all changes (${dirtyCount})` : '✓ All changes saved'}</button>
          <button type="button" className={`${s.btn} ${s.good}`} disabled={saving} onClick={verifyAll}>✓ Mark calendar verified</button>
        </div>
      </div>
      <div className={s.tabs} style={{ margin: '12px 0' }}>
        {CHANNELS.map(c => {
          const list = channels[c.id] || [];
          const ok = list.filter((_, i) => ps[hkey('post', prompt, c.id, i)]?.approved).length;
          const cn = conn[c.platform];
          return (
            <button key={c.id} type="button" className={`${s.tab} ${c.id === channel ? s.tabOn : ''}`} onClick={() => setChannel(c.id)}>
              <b style={{ fontSize: 13 }}>{c.name}{list.some((_, i) => isDirty(c.id, i)) && <span title="Unsaved changes" style={{ color: '#f59e0b', marginLeft: 6 }}>●</span>}</b>
              <span className={s.muted}>{ok}/{list.length} approved</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: channelState(c, cn).color }}>{channelState(c, cn).label}</span>
            </button>
          );
        })}
      </div>
      {channelState(ch, conn[ch.platform]).key !== 'on' && <div className={s.banner} style={{ marginBottom: 12 }}>{ch.name} is not connected for this customer yet — posts can be prepared and approved now, and published once they connect it.</div>}
      {dirtyCount > 0 && <div className={s.banner} style={{ marginBottom: 12 }}>You have {dirtyCount} unsaved change{dirtyCount > 1 ? 's' : ''}. They are not visible to the customer until you save.</div>}
      <div className={s.main}>
        {posts.map((p, i) => (
          <PostEditor key={`${channel}${i}`} userId={userId} brand={brand} brandOk={ws.brand_complete !== false} prompt={prompt} ch={ch} i={i} post={p}
            st={ps[hkey('post', prompt, ch.id, i)] || {}}
            onChange={np => setChannels(c => ({ ...c, [channel]: c[channel].map((x, j) => (j === i ? np : x)) }))}
            onFlag={setEntry} onSaveDoc={() => saveDoc('edited')} saving={saving}
            dirty={isDirty(channel, i)} justSaved={justSaved} saveError={saveError} />
        ))}
        {posts.length < 4 && (
          <button type="button" className={s.btn} onClick={() => setChannels(c => ({ ...c, [channel]: [...(c[channel] || []), { text: '', cta: '', tags: '', visual: '' }] }))}>+ Add a post to {ch.name}</button>
        )}
      </div>
    </Card>
  );
}

function NewCalendar({ ws, userId, existing, onCreated }) {
  const call = useAdminCall();
  const { toast } = useApp();
  const [pick, setPick] = useState('');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const options = (ws.prompt_options || []).filter(p => !existing.includes(p));
  const prompt = (custom.trim() || pick).trim();
  const create = async () => {
    if (prompt.length < 3) return;
    setBusy(true);
    const r = await call(adminAeoApi.aiSocial(userId, prompt));
    setBusy(false);
    if (r) { toast({ type: 'success', message: 'Calendar created. The customer can see it now.' }); setPick(''); setCustom(''); onCreated(prompt); }
  };
  return (
    <Card>
      <div className={s.title}>Create a calendar from a prompt</div>
      <p className={s.note}>Choose one of this customer's prompts, or type your own. We write four posts for every channel for it, and it appears on the customer's Social Media Calendar page.</p>
      <div className={s.actions} style={{ alignItems: 'stretch' }}>
        <select className={s.input} style={{ flex: '1 1 260px' }} value={pick} onChange={e => { setPick(e.target.value); setCustom(''); }}>
          <option value="">{options.length ? 'Choose a prompt…' : 'No other prompts available'}</option>
          {options.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <input className={s.input} style={{ flex: '1 1 220px' }} placeholder="…or type a prompt" maxLength={300} value={custom} onChange={e => { setCustom(e.target.value); if (e.target.value) setPick(''); }} />
        <button type="button" className={`${s.btn} ${s.primary}`} disabled={busy || prompt.length < 3} onClick={create}>{busy ? 'Creating the calendar…' : '✨ Create calendar'}</button>
      </div>
    </Card>
  );
}

export function AdminAeoCalendarPage({ selectedUser, onSelectUser }) {
  const { ws, setWs, loading, reload } = useWorkspace(selectedUser);
  const [tick, setTick] = useState(0);
  const [prompt, setPrompt] = useState(null);
  const prompts = promptsOf(ws);
  useEffect(() => { setPrompt(null); }, [selectedUser?.user_id]);
  const active = prompt && prompts.includes(prompt) ? prompt : prompts[0];
  return (
    <div>
      <SectionHeader title="Social Media Calendar" subtitle="See the prompts a customer chose, edit their posts, create images, and see what they approved. Changes appear on the customer's screen." />
      <div className={s.layout}>
        <CustomerList selectedUser={selectedUser} onSelectUser={onSelectUser} refreshKey={tick} />
        <div className={s.main}>
          {!selectedUser && <Empty icon="📅" title="Choose a customer" body="Pick a customer to see their prompts and social media calendars." />}
          {selectedUser && (loading || !ws) && <SkeletonCard rows={4} />}
          {ws && (
            <>
              <UserHeader ws={ws} />
              {ws.brand_complete === false && <div className={s.banner}>This customer has not added their <b>logo and contact phone number</b> yet (Company Profile / Social Media Calendar → Brand kit). Images and Shorts can't be created until they do, because both are printed on every one.</div>}
              <NewCalendar ws={ws} userId={ws.user.user_id} existing={prompts.filter(p => ws.content.some(c => c.kind === 'social' && c.prompt === p))}
                onCreated={(p) => { setPrompt(p); reload(); setTick(t => t + 1); }} />
              {prompts.length === 0 && <Empty icon="🧭" title="No prompts selected yet" body="This customer has not chosen prompts to work on. Create a calendar from any prompt above." />}
              {prompts.length > 0 && (
                <div className={s.chips}>
                  {prompts.map(p => {
                    const has = ws.content.some(c => c.kind === 'social' && c.prompt === p);
                    return <button key={p} type="button" className={`${s.chip} ${p === active ? s.chipOn : ''}`} onClick={() => setPrompt(p)}>{p}{has ? '' : ' · no calendar'}</button>;
                  })}
                </div>
              )}
              {active && <PromptCalendar key={active} ws={ws} setWs={setWs} prompt={active} reload={() => { reload(); setTick(t => t + 1); }} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
