import React from 'react';
import s from '../../pages/ContentStrategyPage.module.css'; // shared .locked* classes live here

/**
 * Renders a blurred, semi-transparent "structure preview" (fake skeleton
 * lines, not real content) with a lock overlay and an unlock button — used
 * for any keyword/day the backend returned as `locked: true` (see
 * KeywordReportSlot / DayScheduleSlot on the backend). No real data ever
 * reaches this component for locked items; it's purely a static skeleton.
 */
export function LockedTeaser({ previewText, onUnlock }) {
  return (
    <div className={s.lockedWrap}>
      <div className={s.lockedSkeleton}>
        <div className={`${s.skeletonLine} ${s.short}`} />
        <div className={s.skeletonTagRow}>
          <div className={s.skeletonTag} /><div className={s.skeletonTag} /><div className={s.skeletonTag} />
        </div>
        <div className={`${s.skeletonLine} ${s.medium}`} />
        <div className={s.skeletonBlock} />
        <div className={s.skeletonLine} />
        <div className={`${s.skeletonLine} ${s.medium}`} />
        <div className={s.skeletonBlock} />
      </div>
      <div className={s.lockedOverlay}>
        <span className={s.lockedIcon}>🔒</span>
        <span className={s.lockedText}>{previewText || 'Unlock to view the full result.'}</span>
        <button type="button" className={s.lockedBtn} onClick={onUnlock}>Unlock full report</button>
      </div>
    </div>
  );
}
