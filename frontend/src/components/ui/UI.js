import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import s from './UI.module.css';

/* ── Card ────────────────────────────────────────────────── */
export function Card({ children, padded = true, className = '', style }) {
  return (
    <div className={`${s.card} ${padded ? s.cardPadded : ''} ${className}`} style={style}>
      {children}
    </div>
  );
}

/* ── Badge ───────────────────────────────────────────────── */
const BADGE_MAP = { default: s.badgeDefault, brand: s.badgeBrand, success: s.badgeSuccess, warning: s.badgeWarning, danger: s.badgeDanger, info: s.badgeInfo };
export function Badge({ children, variant = 'default' }) {
  return <span className={`${s.badge} ${BADGE_MAP[variant] || s.badgeDefault}`}>{children}</span>;
}

/* ── Tag ─────────────────────────────────────────────────── */
export function Tag({ children }) {
  return <span className={s.tag}>{children}</span>;
}

/* ── StatTile ────────────────────────────────────────────── */
export function StatTile({ label, value, sub, color, icon, trend }) {
  return (
    <Card className={s.statTile} padded={false}>
      <div className={s.statLabel}>
        {icon && <span>{icon}</span>}
        {label}
      </div>
      <motion.div
        className={s.statValue}
        style={{ color: color || 'var(--c-indigo-600)' }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {value ?? '—'}
      </motion.div>
      {sub && <div className={s.statSub}>{sub}</div>}
      {trend && (
        <div className={`${s.statTrend} ${trend > 0 ? s.trendUp : s.trendDown}`}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </div>
      )}
    </Card>
  );
}

/* ── ProgressBar ─────────────────────────────────────────── */
export function ProgressBar({ label, value, max = 100, color = 'var(--c-indigo-500)' }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className={s.progressWrap}>
      {label && (
        <div className={s.progressHeader}>
          <span className={s.progressLabel}>{label}</span>
          <span className={s.progressVal} style={{ color }}>{value}</span>
        </div>
      )}
      <div className={s.progressTrack}>
        <motion.div
          className={s.progressFill}
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        />
      </div>
    </div>
  );
}

/* ── Section Header ──────────────────────────────────────── */
export function SectionHeader({ title, subtitle, right }) {
  return (
    <div className={`${s.sectionHeader} ${right ? s.sectionHeaderRow : ''}`}>
      <div>
        <div className={s.sectionTitle}>{title}</div>
        {subtitle && <div className={s.sectionSub}>{subtitle}</div>}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

/* ── Table ───────────────────────────────────────────────── */
export function DataTable({ cols, rows, keyFn }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c.key} className={`${s.th} ${c.right ? s.thRight : ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={keyFn ? keyFn(row, ri) : ri} className={`${s.tr} ${row.locked ? s.trLocked : ''}`}>
              {cols.map(c => (
                <td
                  key={c.key}
                  className={[s.td, c.right ? s.tdRight : '', c.mono ? s.tdMono : '', c.bold ? s.tdBold : ''].join(' ')}
                >
                  {row.locked ? (c.lockedRender ? c.lockedRender() : <span className={s.tdLockedMask}>██████</span>)
                    : (c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—'))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Skeleton ────────────────────────────────────────────── */
export function Skeleton({ h = 18, w = '100%', mb = 8 }) {
  return <div className={s.skeleton} style={{ height: h, width: w, marginBottom: mb }} />;
}
export function SkeletonCard({ rows = 5 }) {
  return (
    <Card>
      <Skeleton h={20} w="45%" mb={20} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} h={14} w={i % 3 === 0 ? '100%' : i % 3 === 1 ? '80%' : '65%'} mb={12} />
      ))}
    </Card>
  );
}

/* ── Empty state ─────────────────────────────────────────── */
export function Empty({ icon = '🔍', title, body, action }) {
  return (
    <div className={s.empty}>
      <motion.div className={s.emptyIcon} animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}>
        {icon}
      </motion.div>
      <div className={s.emptyTitle}>{title}</div>
      <div className={s.emptyBody}>{body}</div>
      {action}
    </div>
  );
}

/* ── Divider ─────────────────────────────────────────────── */
export function Divider({ label }) {
  return (
    <div className={s.divider}>
      <div className={s.dividerLine} />
      {label && <span className={s.dividerLabel}>{label}</span>}
      <div className={s.dividerLine} />
    </div>
  );
}

/* ── Copy button ─────────────────────────────────────────── */
export function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className={`${s.copyBtn} ${copied ? s.copyBtnCopied : ''}`}>
      {copied ? '✓ Copied' : '⎘ Copy'}
    </button>
  );
}

/* ── Insight card ────────────────────────────────────────── */
export function InsightCard({ insight, detail, index }) {
  return (
    <motion.div
      className={s.insightCard}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.07 }}
    >
      <div className={s.insightNum}>{index + 1}</div>
      <div>
        <div className={s.insightTitle}>{insight}</div>
        <div className={s.insightDetail}>{detail}</div>
      </div>
    </motion.div>
  );
}

/* ── CharCount ───────────────────────────────────────────── */
export function CharCount({ text, max }) {
  const n = text?.length || 0;
  const cls = n > max ? s.charOver : n > max * 0.88 ? s.charWarn : s.charOk;
  return <span className={`${s.charCount} ${cls}`}>{n} / {max}</span>;
}

/* ── Error card ──────────────────────────────────────────── */
export function ErrorCard({ message }) {
  return (
    <Card>
      <div style={{ padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
        <div style={{ fontWeight: 600, color: 'var(--c-danger)', marginBottom: '6px' }}>Request Failed</div>
        <div style={{ fontSize: '14px', color: 'var(--c-slate-500)' }}>{message}</div>
      </div>
    </Card>
  );
}
