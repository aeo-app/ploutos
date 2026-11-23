import React, { useEffect, useRef, useState } from 'react';
import { aeoApi } from '../api/aeoApi';
import { useApp } from '../context/AppContext';
import { prepPhoto } from '../utils/photoPrep';

export const MAX_PHOTOS = 5;
export const EMPTY_MEDIA = { heading: '', subheading: '', photos: [] };

/** What the generate calls send for the optional photos / heading / subheading. */
export const mediaPayload = (o) => {
  const m = o || EMPTY_MEDIA;
  return { photo_urls: (m.photos || []).map(p => p.url) };
};

/** The voice and background-music choice for a reel (only used when the server adds a voiceover). */
export const reelPayload = (o) => {
  const m = o || EMPTY_MEDIA;
  return { voice: m.voice || '', music: m.music !== false };
};

// Every reel panel needs the same list, so it is fetched once per page load.
let reelOptionsRequest = null;
const loadReelOptions = () => {
  if (!reelOptionsRequest) {
    reelOptionsRequest = aeoApi.reelOptions().catch(() => { reelOptionsRequest = null; return null; });
  }
  return reelOptionsRequest;
};

/**
 * Optional extras for generating one image or reel: the customer's own photos (up to 5), a heading and a subheading.
 * Everything is optional; with none of it, the image or reel is created from the description as before.
 * `update(fn)` receives the current value and returns the next one.
 */
export function MediaOptions({ kind, value, update, disabled, defaultOpen, defaults }) {
  const { toast } = useApp();
  const [open, setOpen] = useState(!!defaultOpen);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const v = value || EMPTY_MEDIA;
  const photos = v.photos || [];
  const reel = kind === 'reel';
  const word = reel ? 'reel' : 'image';
  const [reelOpts, setReelOpts] = useState(null);
  useEffect(() => {
    if (!reel) return undefined;
    let active = true;
    loadReelOptions().then(o => { if (active) setReelOpts(o); });
    return () => { active = false; };
  }, [reel]);
  const voiceover = reel && !!reelOpts?.voiceover;
  const voiceId = v.voice || reelOpts?.default_voice || '';
  const voiceLabel = (reelOpts?.voices || []).find(o => o.id === voiceId)?.label || '';

  // Free the temporary preview links when this panel goes away.
  const live = useRef(photos);
  live.current = photos;
  useEffect(() => () => { live.current.forEach(p => p.thumb && URL.revokeObjectURL(p.thumb)); }, []);

  const addFiles = async (list) => {
    const files = Array.from(list || []);
    if (!files.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) { toast({ type: 'info', message: `You can use up to ${MAX_PHOTOS} photos.` }); return; }
    if (files.length > room) toast({ type: 'info', message: `Only ${room} more photo${room > 1 ? 's' : ''} fit — the rest were skipped.` });
    setBusy(true);
    for (const f of files.slice(0, room)) {
      try {
        const blob = await prepPhoto(f);
        const res = await aeoApi.uploadPhoto(blob);
        const item = { url: res.url, thumb: URL.createObjectURL(blob), name: f.name };
        update(cur => ((cur.photos || []).length >= MAX_PHOTOS ? cur : { ...cur, photos: [...(cur.photos || []), item] }));
      } catch (e) {
        if (e.code !== 'TokenExpired') toast({ type: 'error', message: `${f.name || 'Photo'}: ${e.message || 'could not be uploaded.'}` });
      }
    }
    setBusy(false);
  };
  const remove = (i) => update(cur => {
    const p = (cur.photos || [])[i];
    if (p && p.thumb) URL.revokeObjectURL(p.thumb);
    return { ...cur, photos: (cur.photos || []).filter((_, j) => j !== i) };
  });
  const move = (i, d) => update(cur => {
    const a = [...(cur.photos || [])]; const j = i + d;
    if (j < 0 || j >= a.length) return cur;
    [a[i], a[j]] = [a[j], a[i]];
    return { ...cur, photos: a };
  });

  const bits = [];
  if (photos.length) bits.push(`${photos.length} photo${photos.length > 1 ? 's' : ''}`);
  if (voiceover && voiceLabel) bits.push(voiceLabel);
  if (voiceover && v.music === false) bits.push('no music');

  return (
    <div className="ae-media" data-testid={`media-options-${kind}`}>
      <button type="button" className="ae-media-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span>{voiceover ? '🎙️ Photos, voice & music' : '📷 Use your own photos'} <em>(optional)</em></span>
        <span className="ae-media-sum">{bits.length ? bits.join(' · ') : 'your own photos'}</span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="ae-media-body">
          <div className="ae-media-photos">
            <div className="ae-media-ph-head">
              <b>Your photos</b><span className="ae-note">{photos.length}/{MAX_PHOTOS}</span>
              <button type="button" className="ae-btn sm" disabled={disabled || busy || photos.length >= MAX_PHOTOS} onClick={() => input.current && input.current.click()}>
                {busy ? 'Uploading…' : photos.length ? '＋ Add more' : '＋ Add photos'}
              </button>
              <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} data-testid="media-file"
                onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            </div>
            {photos.length > 0 && (
              <div className="ae-media-strip">
                {photos.map((p, i) => (
                  <div key={p.url} className="ae-media-th">
                    <img src={p.thumb} alt={`Photo ${i + 1}`} />
                    {reel && <span className="ae-media-n">{i + 1}</span>}
                    <button type="button" className="ae-media-x" aria-label={`Remove photo ${i + 1}`} disabled={disabled} onClick={() => remove(i)}>✕</button>
                    {reel && photos.length > 1 && (
                      <span className="ae-media-mv">
                        <button type="button" aria-label="Move earlier" disabled={disabled || i === 0} onClick={() => move(i, -1)}>‹</button>
                        <button type="button" aria-label="Move later" disabled={disabled || i === photos.length - 1} onClick={() => move(i, 1)}>›</button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="ae-note" style={{ margin: 0 }}>
              {!reel
                ? 'We build the image from your real photos. With no photos, we create it from the description.'
                : voiceover
                  ? 'Your photos become the scenes of the reel, in this order. With no photos, we use your saved company photos, or create the scenes if you have none.'
                  : 'Your photos become the scenes of the reel, in this order. With no photos, we create the scenes for you.'}
            </p>
          </div>
          {voiceover && (
            <div className="ae-media-row">
              <label className="ae-media-f">
                Voiceover
                <select value={voiceId} disabled={disabled} data-testid="media-voice"
                  onChange={e => { const id = e.target.value; update(cur => ({ ...cur, voice: id })); }}>
                  {reelOpts.voices.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
              <label className="ae-media-check">
                <input type="checkbox" checked={v.music !== false} disabled={disabled} data-testid="media-music"
                  onChange={e => { const on = e.target.checked; update(cur => ({ ...cur, music: on })); }} />
                Background music
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
