import React, { useEffect, useRef, useState } from 'react';
import { COLOR_PRESETS, FONT_STYLES, DEFAULT_THEME } from './pageRender';

/** A real rendered page shown small: the page is laid out at desktop width, then scaled down to fit. */
export function ScaledFrame({ html, title, width = 1200, ratio = 0.62 }) {
  const box = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    setW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = w ? w / width : 0.25;
  const h = Math.round(width * ratio);
  return (
    <div ref={box} className="ae-sf" style={{ height: Math.round(h * scale) }} aria-hidden="true">
      <iframe title={title} srcDoc={html} sandbox="" tabIndex={-1} loading="lazy" style={{ width, height: h, transform: `scale(${scale})` }} />
    </div>
  );
}

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

/** Colour + font choices. `site` is what we read from the customer's own website: { loading, found, primary, secondary, palette, font, ... }. */
export function StylePicker({ theme, onChange, site }) {
  const t = { ...DEFAULT_THEME, ...(theme || {}) };
  const set = (patch) => onChange({ ...t, ...patch });
  const siteReady = !!(site && site.found && site.primary);
  const siteOn = siteReady && same(t.primary, site.primary);
  const preset = COLOR_PRESETS.find(p => same(p.primary, t.primary));
  const custom = !siteOn && !preset;

  return (
    <div className="ae-sty" data-testid="style-picker">
      {site?.loading && <div className="ae-note">Reading your website’s colours and fonts…</div>}
      {!site?.loading && site && !siteReady && site.note && <div className="ae-note">{site.note}</div>}

      <div className="ae-sty-row">
        <span className="ae-sty-l">Colours</span>
        <div className="ae-sw-row" role="radiogroup" aria-label="Colour theme">
          {siteReady && (
            <button type="button" role="radio" aria-checked={siteOn} className={`ae-sw ${siteOn ? 'on' : ''}`} data-testid="sw-site"
              onClick={() => set({ primary: site.primary, accent: site.secondary || '' })}>
              <i style={{ background: `linear-gradient(135deg, ${site.primary} 50%, ${site.secondary || site.primary} 50%)` }} />Your website
            </button>
          )}
          {COLOR_PRESETS.map(p => (
            <button key={p.id} type="button" role="radio" aria-checked={!siteOn && preset?.id === p.id} className={`ae-sw ${!siteOn && preset?.id === p.id ? 'on' : ''}`} data-testid={`sw-${p.id}`}
              onClick={() => set({ primary: p.primary, accent: p.accent })}>
              <i style={{ background: `linear-gradient(135deg, ${p.primary} 50%, ${p.accent} 50%)` }} />{p.name}
            </button>
          ))}
          <label className={`ae-sw ${custom ? 'on' : ''}`}>
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(t.primary) ? t.primary : '#1e4fd8'} aria-label="Pick your own colour" onChange={e => set({ primary: e.target.value, accent: '' })} />
            <i style={{ background: 'conic-gradient(#e4572e, #f6a700, #84cc16, #0ea5e9, #6d28d9, #e4572e)' }} />Your own
          </label>
        </div>
      </div>

      {siteReady && site.palette?.length > 1 && (
        <div className="ae-sty-row">
          <span className="ae-sty-l">Found on your site</span>
          <div className="ae-sw-row">
            {site.palette.map(c => (
              <button key={c} type="button" className={`ae-dot ${same(t.primary, c) ? 'on' : ''}`} style={{ background: c }} title={c} aria-label={`Use ${c}`} onClick={() => set({ primary: c, accent: '' })} />
            ))}
          </div>
        </div>
      )}

      <div className="ae-sty-row">
        <span className="ae-sty-l">Fonts</span>
        <div className="ae-sw-row" role="radiogroup" aria-label="Font style">
          {FONT_STYLES.map(f => (
            <button key={f.id} type="button" role="radio" aria-checked={t.font === f.id} className={`ae-sw ${t.font === f.id ? 'on' : ''}`} data-testid={`font-${f.id}`} onClick={() => set({ font: f.id })}>
              <b style={{ fontFamily: f.head, fontSize: 16 }}>Aa</b>{f.name}<small>{f.note}</small>
            </button>
          ))}
        </div>
        {site?.font && (
          <label className="ae-check">
            <input type="checkbox" checked={!!t.fontName} onChange={e => set({ fontName: e.target.checked ? site.font : '' })} />
            Use my website’s font ({site.font}) <small>It shows once the page is on your site.</small>
          </label>
        )}
      </div>
    </div>
  );
}
