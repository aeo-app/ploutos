import React from 'react';
import s from './BlurredPreview.module.css';

/**
 * Wraps a fully-rendered result view (built from static placeholder data,
 * see dummyData.js) in a blur + gradient overlay with a single unlock CTA.
 * No API call happens to produce what's underneath — it's local, static
 * data, so showing this preview costs zero backend/Bedrock usage.
 */
export function BlurredPreview({ title = 'Unlock this report', subtitle, onUnlock, children }) {
  return (
    <div className={s.wrap}>
      <div className={s.blurred} aria-hidden="true">{children}</div>
      <div className={s.overlay}>
        <span className={s.icon}>🔒</span>
        <span className={s.title}>{title}</span>
        {subtitle && <span className={s.subtitle}>{subtitle}</span>}
        <button type="button" className={s.btn} onClick={onUnlock}>Unlock full report</button>
      </div>
    </div>
  );
}
