import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAeo } from './AeoContext';
import { aeoApi } from '../api/aeoApi';

/** Logo + contact details. Required before any image or Short is generated, and printed on every one. */
export function BrandKitCard({ defaultOpen = false }) {
  const { state, toast } = useApp();
  const { brand, saveBrand, uploadLogo, detectBrand, adoptSiteLogo } = useAeo();
  const d = brand.data || {};
  const [editing, setEditing] = useState(defaultOpen);
  const [f, setF] = useState({ phone: '', email: '', website: '', address: '' });
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const autoRan = useRef(false);

  // Pull the saved values into the form whenever they change.
  useEffect(() => { setF({ phone: d.phone || '', email: d.email || '', website: d.website || '', address: d.address || '' }); }, [d.phone, d.email, d.website, d.address]);
  // First time: read the website for the phone, email, address and a logo — nothing to type if the site has them.
  useEffect(() => {
    if (!brand.loaded || brand.complete || d.detected || autoRan.current || !state.request.url) return;
    autoRan.current = true;
    (async () => { setBusy('detect'); try { await detectBrand(); } catch (_) { /* the form still works by hand */ } finally { setBusy(''); } })();
    // eslint-disable-next-line
  }, [brand.loaded, brand.complete, d.detected]);
  useEffect(() => { if (brand.loaded && !brand.complete) setEditing(true); }, [brand.loaded, brand.complete]);

  const run = async (kind, fn, okMsg) => {
    setBusy(kind); setErr('');
    try { const r = await fn(); if (okMsg) toast({ type: 'success', message: okMsg }); return r; }
    catch (e) { if (e.code !== 'TokenExpired') setErr(e.message || 'Something went wrong.'); return null; }
    finally { setBusy(''); }
  };
  const onLogo = (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setErr('Please choose a logo under 8 MB.'); return; }
    run('logo', () => uploadLogo(file), 'Logo saved.').then(r => { if (r && r.complete) setEditing(false); });
  };
  const save = async () => {
    if (!f.phone.trim()) { setErr('Enter your contact phone number.'); return; }
    const r = await run('save', () => saveBrand(f), 'Saved. This will be printed on every image and Short.');
    if (r && r.complete) setEditing(false);
  };
  const found = brand.found || {};
  const missingTxt = (brand.missing || []).map(m => m === 'logo' ? 'your logo' : 'a contact phone number').join(' and ');
  const lab = { fontSize: 12, fontWeight: 700, color: '#4a4966' };
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));

  if (!brand.loaded) return null;

  if (brand.complete && !editing) {
    return (
      <div className="ae-card" style={{ padding: '14px 18px', flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {d.logo_view_url && <img src={d.logo_view_url} alt="Your logo" style={{ height: 40, maxWidth: 120, objectFit: 'contain', background: '#fff', border: '1px solid #e3e2ee', borderRadius: 8, padding: 4 }} />}
        <div className="ae-col" style={{ gap: 2, minWidth: 0 }}>
          <b style={{ fontSize: 13.5 }}>Brand kit ready ✓</b>
          <span className="ae-sub" style={{ fontSize: 12.5 }}>{[d.phone, d.email, d.website].filter(Boolean).join(' · ')} — printed on every image and Short.</span>
        </div>
        <button type="button" className="ae-btn sm" style={{ marginLeft: 'auto' }} onClick={() => setEditing(true)}>Edit</button>
      </div>
    );
  }

  return (
    <section className="ae-card" style={{ padding: 22, gap: 14, border: brand.complete ? undefined : '1.5px solid #c7c9f5' }}>
      <div className="ae-col" style={{ gap: 4 }}>
        <span className="ae-eyebrow p">Brand kit {brand.complete ? '' : '· required'}</span>
        <h3 style={{ margin: 0, fontSize: 17 }}>Your logo and contact details</h3>
        <span className="ae-sub" style={{ fontSize: 13 }}>We print your logo, phone number and email on every image and YouTube Short we create, so people can reach you straight away.
          {!brand.complete && <b style={{ color: '#3730a3' }}> Add {missingTxt} to start creating images.</b>}</span>
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: 150, height: 84, border: '1.5px dashed #c9c8dc', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafaff', overflow: 'hidden' }}>
          {d.logo_view_url ? <img src={d.logo_view_url} alt="Your logo" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} /> : <span className="ae-note">No logo yet</span>}
        </div>
        <div className="ae-col" style={{ gap: 6 }}>
          <label className="ae-btn sm primary" style={{ cursor: 'pointer' }}>{busy === 'logo' ? 'Uploading…' : d.logo_url ? 'Replace logo' : 'Upload your logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} disabled={!!busy} onChange={e => { onLogo(e.target.files && e.target.files[0]); e.target.value = ''; }} /></label>
          <span className="ae-note">A clear PNG, JPG or WebP at least 240 px wide. A transparent background works best.</span>
        </div>
        {(found.logo_candidates || []).length > 0 && !d.logo_url && (
          <div className="ae-col" style={{ gap: 4 }}>
            <span className="ae-note">Found on your website — use one?</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {found.logo_candidates.map(u => (
                <button key={u} type="button" disabled={!!busy} onClick={() => run('logo', () => adoptSiteLogo(u), 'Logo saved.')} title="Use this logo"
                  style={{ width: 64, height: 44, border: '1px solid #e3e2ee', borderRadius: 8, background: '#fff', padding: 3, cursor: 'pointer' }}>
                  <img src={u} alt="Logo found on your website" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => { e.currentTarget.parentNode.style.display = 'none'; }} /></button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        <label style={{ display: 'grid', gap: 4 }}><span style={lab}>Contact phone number *</span>
          <input className="ae-input" style={{ minWidth: 0 }} value={f.phone} maxLength={40} onChange={set('phone')} placeholder="+65 6123 4567" inputMode="tel" /></label>
        <label style={{ display: 'grid', gap: 4 }}><span style={lab}>Email</span>
          <input className="ae-input" style={{ minWidth: 0 }} value={f.email} maxLength={120} onChange={set('email')} placeholder="hello@yourcompany.com" inputMode="email" /></label>
        <label style={{ display: 'grid', gap: 4 }}><span style={lab}>Website</span>
          <input className="ae-input" style={{ minWidth: 0 }} value={f.website} maxLength={140} onChange={set('website')} placeholder="yourcompany.com" /></label>
        <label style={{ display: 'grid', gap: 4 }}><span style={lab}>Address (optional)</span>
          <input className="ae-input" style={{ minWidth: 0 }} value={f.address} maxLength={200} onChange={set('address')} placeholder="Street, city" /></label>
      </div>

      {((found.phones || []).length > 1 || (found.emails || []).length > 1) && (
        <div className="ae-col" style={{ gap: 6 }}>
          <span className="ae-note">Also found on your website — tap to use:</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(found.phones || []).map(p => <button key={p} type="button" className="ae-pill" style={{ background: '#eef0ff', color: '#3730a3', border: 'none', cursor: 'pointer' }} onClick={() => setF(x => ({ ...x, phone: p }))}>{p}</button>)}
            {(found.emails || []).map(m => <button key={m} type="button" className="ae-pill" style={{ background: '#e0f2fe', color: '#075985', border: 'none', cursor: 'pointer' }} onClick={() => setF(x => ({ ...x, email: m }))}>{m}</button>)}
          </div>
        </div>
      )}
      {busy === 'detect' && <span className="ae-note">Reading your website for contact details…</span>}
      {err && <span className="ae-err">{err}</span>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="ae-btn primary" disabled={!!busy || !f.phone.trim()} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save brand kit'}</button>
        <button type="button" className="ae-btn" disabled={!!busy || !state.request.url} onClick={() => run('detect', detectBrand, 'Checked your website.')}>{busy === 'detect' ? 'Reading website…' : '🔎 Read my website again'}</button>
        {brand.complete && <button type="button" className="ae-btn" onClick={() => setEditing(false)}>Close</button>}
      </div>
    </section>
  );
}

/** The keywords the social calendar is built around. */
export function KeywordsPanel({ prompt, onRegenerate, regenerating }) {
  const { saved, setCalendarKeywords, suggestKeywords } = useAeo();
  const { toast } = useApp();
  const kws = saved.calendar_keywords || [];
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const add = () => {
    const parts = txt.split(/[,\n]/).map(x => x.trim()).filter(x => x.length > 1);
    if (!parts.length) return;
    const next = [...kws]; parts.forEach(p => { if (!next.some(k => k.toLowerCase() === p.toLowerCase())) next.push(p.slice(0, 80)); });
    setCalendarKeywords(next.slice(0, 20)); setTxt('');
  };
  const fromSite = async () => {
    setBusy(true);
    try { const list = await suggestKeywords(); if (list.length) { setCalendarKeywords(list.slice(0, 10)); toast({ type: 'success', message: `Added the top ${Math.min(list.length, 10)} keywords from your website.` }); } }
    catch (e) { if (e.code !== 'TokenExpired') toast({ type: 'info', message: e.message || 'We could not read enough from your website. Add your own keywords instead.' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="ae-col" style={{ gap: 8, padding: '12px 14px', background: '#f8f8fd', border: '1px solid var(--ae-line2)', borderRadius: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <b style={{ fontSize: 13.5 }}>Keywords this calendar is built around</b>
        <span className="ae-note">{kws.length ? `${kws.length} keyword${kws.length > 1 ? 's' : ''}` : 'None yet — we use the top 10 from your website'}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {kws.map(k => (
          <span key={k} className="ae-pill" style={{ background: '#eef0ff', color: '#3730a3', display: 'inline-flex', gap: 6, alignItems: 'center' }}>{k}
            <button type="button" aria-label={`Remove ${k}`} onClick={() => setCalendarKeywords(kws.filter(x => x !== k))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#3730a3', fontWeight: 800, padding: 0 }}>×</button></span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="ae-input" style={{ minWidth: 180 }} value={txt} maxLength={200} onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Add keywords, separated by commas" />
        <button type="button" className="ae-btn sm" disabled={!txt.trim()} onClick={add}>Add</button>
        <button type="button" className="ae-btn sm" disabled={busy} onClick={fromSite}>{busy ? 'Reading your website…' : '🔎 Use top 10 from my website'}</button>
        <button type="button" className="ae-btn sm primary" disabled={regenerating} onClick={() => onRegenerate(prompt)}>{regenerating ? 'Rebuilding…' : '↻ Rebuild calendar with these keywords'}</button>
      </div>
    </div>
  );
}

const _signedVid = {};
/** A Short from our bucket — asks for a signed link first so it plays even when the bucket is private. */
export function ShortPlayer({ src, thumb }) {
  const [url, setUrl] = useState(_signedVid[src] || '');
  const [poster, setPoster] = useState(_signedVid[thumb] || '');
  useEffect(() => {
    let off = false;
    const sign = async (u, set) => { if (!u) return; if (_signedVid[u]) { set(_signedVid[u]); return; } try { const r = await aeoApi.imageUrl(u); _signedVid[u] = r.url; if (!off) set(r.url); } catch { if (!off) set(u); } };
    sign(src, setUrl); sign(thumb, setPoster);
    return () => { off = true; };
  }, [src, thumb]);
  if (!url) return <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, color: '#4a4966' }}>Loading video…</div>;
  return <video src={url} poster={poster || undefined} controls playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />;
}
