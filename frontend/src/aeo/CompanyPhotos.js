import React, { useEffect, useRef, useState } from 'react';
import { aeoApi } from '../api/aeoApi';
import { useApp } from '../context/AppContext';
import { useAeo } from './AeoContext';
import { prepPhoto } from '../utils/photoPrep';

export const MAX_COMPANY_PHOTOS = 12;

function Thumb({ item, onRemove }) {
  const [src, setSrc] = useState(item.view || '');
  useEffect(() => {
    let off = false;
    if (!item.view) aeoApi.imageUrl(item.url).then(r => { if (!off) setSrc(r.url); }).catch(() => {});
    return () => { off = true; };
  }, [item.url, item.view]);
  return (
    <div className="ae-cph" data-testid="company-photo">
      {src ? <img src={src} alt={item.name || 'Company photo'} /> : <span className="ae-note">…</span>}
      <button type="button" aria-label={`Remove ${item.name || 'photo'}`} title="Remove" onClick={onRemove}>×</button>
    </div>
  );
}

/**
 * The customer's real photos of their company: office, team, products, services, work in progress. They are saved with the
 * account and every poster is built from them, so the posters look like the business. Optional: with no photos, posters are made
 * from professional real-world photographs.
 */
export function CompanyPhotos({ compact }) {
  const { saved, setCompanyPhotos } = useAeo();
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(!compact);
  const [fresh, setFresh] = useState({});      // url -> signed link of photos uploaded in this visit (no extra lookup)
  const input = useRef(null);
  const list = saved.company_photos || [];
  const listRef = useRef(list);
  listRef.current = list;

  const add = async (files) => {
    const picked = Array.from(files || []);
    if (!picked.length) return;
    const room = MAX_COMPANY_PHOTOS - listRef.current.length;
    if (room <= 0) { toast({ type: 'info', message: `You can keep up to ${MAX_COMPANY_PHOTOS} photos.` }); return; }
    if (picked.length > room) toast({ type: 'info', message: `Only ${room} more photo${room > 1 ? 's' : ''} fit; the rest were skipped.` });
    setBusy(true);
    let next = listRef.current;
    for (const f of picked.slice(0, room)) {
      try {
        const res = await aeoApi.uploadPhoto(await prepPhoto(f));
        next = [...next, { url: res.url, name: (f.name || '').slice(0, 80) }];
        setFresh(m => ({ ...m, [res.url]: res.view_url }));
        listRef.current = next;
        setCompanyPhotos(next);
      } catch (e) {
        if (e.code !== 'TokenExpired') toast({ type: 'error', message: `${f.name || 'Photo'}: ${e.message || 'could not be uploaded.'}` });
      }
    }
    setBusy(false);
  };
  const remove = (url) => { const next = listRef.current.filter(p => p.url !== url); listRef.current = next; setCompanyPhotos(next); };

  return (
    <section className="ae-card" data-testid="company-photos" style={{ padding: compact ? 16 : 22, gap: 12 }}>
      <div className="ae-row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div className="ae-col" style={{ gap: 2, minWidth: 0 }}>
          <span className="ae-eyebrow p">Company photos <em style={{ fontStyle: 'normal', fontWeight: 500 }}>(optional)</em></span>
          <b style={{ fontSize: compact ? 14 : 16 }}>{list.length ? `${list.length} photo${list.length > 1 ? 's' : ''} will be used for your posters` : 'Add real photos of your company'}</b>
        </div>
        {compact && <button type="button" className="ae-btn sm" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'Hide' : list.length ? 'Manage photos' : 'Add photos'}</button>}
      </div>
      {open && <>
        <span className="ae-note">Upload photos of your office, team, products, services or the work you do. Your posters are built from these real photos, so they look like your business. Without photos, posters use professional real-world photographs instead. Never cartoons.</span>
        <div className="ae-cphs">
          {list.map(p => <Thumb key={p.url} item={{ ...p, view: fresh[p.url] }} onRemove={() => remove(p.url)} />)}
          {list.length < MAX_COMPANY_PHOTOS && (
            <button type="button" className="ae-cph add" disabled={busy} onClick={() => input.current && input.current.click()} data-testid="company-photo-add">
              {busy ? 'Uploading…' : <><b>+</b><span>Add photos</span></>}
            </button>
          )}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }} data-testid="company-photo-input" onChange={e => { add(e.target.files); e.target.value = ''; }} />
        <span className="ae-note">{list.length} of {MAX_COMPANY_PHOTOS} photos. JPG, PNG or WebP.</span>
      </>}
    </section>
  );
}
