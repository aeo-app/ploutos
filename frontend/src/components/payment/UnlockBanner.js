import React from 'react';

/**
 * A single, compact call-to-action shown once per section that contains
 * any locked rows (rather than a button per row) — the locked rows
 * themselves are already visually blurred (see DataTable's `locked` row
 * support / LockedTeaser), this banner is just the one place to click.
 */
export function UnlockBanner({ count, onUnlock, label = 'result' }) {
  if (!count) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '10px 16px', background: 'var(--c-indigo-50)', border: '1px solid var(--c-indigo-200)',
      borderRadius: 'var(--r-md)', marginTop: 10,
    }}>
      <span style={{ fontSize: 12.5, color: 'var(--c-indigo-700)', fontWeight: 600 }}>
        🔒 {count} {label}{count !== 1 ? 's' : ''} locked — unlock to see the full picture
      </span>
      <button
        type="button"
        onClick={onUnlock}
        style={{
          border: 'none', background: 'var(--grad-brand)', color: 'white', fontWeight: 700, fontSize: 12.5,
          padding: '7px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        Unlock
      </button>
    </div>
  );
}
