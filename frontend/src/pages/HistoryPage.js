import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { historyApi } from '../api/historyApi';
import { withTokenExpiry } from '../api/authApi';
import { Card, Badge, SectionHeader, StatTile, DataTable, SkeletonCard, Empty, ErrorCard, CopyButton } from '../components/ui/UI';
import { CompetitorsResultView } from './CompetitorsPage';
import { KeywordsResultView } from './KeywordsPage';
import { ProfileResultView } from './ProfilePage';
import { DomainAuthorityResultView } from './DomainAuthorityPage';
import { FullReportResultView } from './FullReportPage';
import { ContentStrategyResultView } from './ContentStrategyPage';
import { RelocationCalendarResultView } from './RelocationCalendarPage';
import s from './HistoryPage.module.css';

const TYPE_META = {
  competitors: { label: 'Competitors', icon: '⚔' },
  keywords: { label: 'Keywords', icon: '🔑' },
  profile: { label: 'Company Profile', icon: '📋' },
  domain_authority: { label: 'Domain Authority', icon: '📈' },
  full_report: { label: 'Full Report', icon: '⚡' },
  content_strategy: { label: 'Content Strategy', icon: '✍️' },
  relocation_social_calendar: { label: 'Social Media Calendar', icon: '📅' },
};
const typeLabel = (t) => TYPE_META[t]?.label || t;
const typeIcon = (t) => TYPE_META[t]?.icon || '📄';

// Renders a saved record's `result` with the SAME components each feature's
// own live page uses — not a generic JSON dump. Falls back to raw JSON for
// any analysis_type not listed here (e.g. a future feature).
function ResultByType({ analysisType, result }) {
  switch (analysisType) {
    case 'competitors':       return <CompetitorsResultView data={result} />;
    case 'keywords':          return <KeywordsResultView data={result} />;
    case 'profile':           return <ProfileResultView data={result} />;
    case 'domain_authority':  return <DomainAuthorityResultView data={result} />;
    case 'full_report':       return <FullReportResultView result={result} />;
    case 'content_strategy':  return <ContentStrategyResultView result={result} />;
    case 'relocation_social_calendar': return <RelocationCalendarResultView result={result} />;
    default: return null;
  }
}
const HAS_FORMATTED_VIEW = new Set(Object.keys(TYPE_META));

const STATUS_VARIANT = { success: 'success', partial: 'warning', failed: 'danger', error: 'danger' };

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/* ── Detail modal: same rendering as the feature's own page, with a raw-JSON fallback ── */
function DetailModal({ analysisId, onClose, fetchOne }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('formatted'); // 'formatted' | 'raw'

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchOne(analysisId)
      .then(data => { if (!cancelled) setRecord(data); })
      .catch(e => { if (!cancelled) setError(e.message || 'Failed to load this record.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [analysisId, fetchOne]);

  const hasFormatted = record && HAS_FORMATTED_VIEW.has(record.analysis_type);

  return (
    <div className={s.overlay} onClick={onClose}>
      <motion.div
        className={s.modal}
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className={s.modalHead}>
          <span className={s.modalTitle}>
            {record ? `${typeIcon(record.analysis_type)} ${typeLabel(record.analysis_type)}` : 'Loading…'}
          </span>
          <button type="button" className={s.modalClose} onClick={onClose}>×</button>
        </div>

        {record && (
          <div className={s.modalMeta}>
            <Badge>{record.company_name}</Badge>
            {record.market && <Badge variant="info">{record.market}</Badge>}
            {record.industry && <Badge>{record.industry}</Badge>}
            <Badge variant={STATUS_VARIANT[record.status] || 'default'}>{record.status}</Badge>
            <span style={{ fontSize: 12, color: 'var(--c-slate-400)', alignSelf: 'center' }}>{formatDate(record.created_at)}</span>
            {hasFormatted && (
              <div className={s.viewToggle}>
                <button type="button" className={`${s.viewToggleBtn} ${view === 'formatted' ? s.viewToggleBtnActive : ''}`} onClick={() => setView('formatted')}>Formatted</button>
                <button type="button" className={`${s.viewToggleBtn} ${view === 'raw' ? s.viewToggleBtnActive : ''}`} onClick={() => setView('raw')}>Raw JSON</button>
              </div>
            )}
          </div>
        )}

        <div className={s.modalBody}>
          {loading && <SkeletonCard rows={6} />}
          {error && <ErrorCard message={error} />}
          {record && !loading && hasFormatted && view === 'formatted' && (
            <ResultByType analysisType={record.analysis_type} result={record.result} />
          )}
          {record && !loading && (!hasFormatted || view === 'raw') && (
            <div className={s.jsonBox}>
              <div className={s.jsonCopyBtn}><CopyButton text={JSON.stringify(record.result, null, 2)} /></div>
              {JSON.stringify(record.result, null, 2)}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export function HistoryPage() {
  const { goScreen, logout } = useAuth();

  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [lastKey, setLastKey] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [filterType, setFilterType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [viewingId, setViewingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const authCtx = { goScreen, logout };

  const loadStats = useCallback(async () => {
    try {
      const data = await withTokenExpiry(historyApi.stats(), authCtx);
      setStats(data);
    } catch (e) {
      if (e?.code !== 'TokenExpired') setError(e.message || 'Failed to load stats.');
    }
  }, []);

  const loadFirstPage = useCallback(async (type) => {
    setLoading(true);
    setError(null);
    setItems([]);
    setLastKey(null);
    try {
      const data = await withTokenExpiry(historyApi.list({ analysisType: type || undefined, limit: 20 }), authCtx);
      setItems(data.items || []);
      setLastKey(data.last_evaluated_key || null);
      setHasMore(!!data.last_evaluated_key);
    } catch (e) {
      if (e?.code !== 'TokenExpired') setError(e.message || 'Failed to load history.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = async () => {
    if (!lastKey) return;
    setLoadingMore(true);
    try {
      const data = await withTokenExpiry(
        historyApi.list({ analysisType: filterType || undefined, limit: 20, lastKey }),
        authCtx
      );
      setItems(prev => [...prev, ...(data.items || [])]);
      setLastKey(data.last_evaluated_key || null);
      setHasMore(!!data.last_evaluated_key);
    } catch (e) {
      if (e?.code !== 'TokenExpired') setError(e.message || 'Failed to load more.');
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => { loadStats(); loadFirstPage(null); }, [loadStats, loadFirstPage]);

  const selectFilter = (type) => {
    setFilterType(type);
    loadFirstPage(type);
  };

  const confirmDelete = async (id) => {
    setDeletingId(id);
    try {
      await withTokenExpiry(historyApi.remove(id), authCtx);
      setItems(prev => prev.filter(i => i.analysis_id !== id));
      setConfirmDeleteId(null);
      loadStats();
    } catch (e) {
      if (e?.code !== 'TokenExpired') setError(e.message || 'Failed to delete.');
    } finally {
      setDeletingId(null);
    }
  };

  const cols = [
    {
      key: 'analysis_type', label: 'Type',
      render: (v) => <span className={s.typeBadge}>{typeIcon(v)} {typeLabel(v)}</span>,
    },
    { key: 'company_name', label: 'Company / Country', bold: true },
    { key: 'market', label: 'Market', render: (v) => v || '—' },
    { key: 'created_at', label: 'Created', render: (v) => formatDate(v) },
    {
      key: 'status', label: 'Status',
      render: (v) => <Badge variant={STATUS_VARIANT[v] || 'default'}>{v}</Badge>,
    },
    {
      key: 'analysis_id', label: '', right: true,
      render: (id) => (
        confirmDeleteId === id ? (
          <div className={s.confirmRow}>
            <span className={s.confirmText}>Delete?</span>
            <button type="button" className={s.actionBtn} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
            <button
              type="button"
              className={`${s.actionBtn} ${s.actionBtnDanger}`}
              onClick={() => confirmDelete(id)}
              disabled={deletingId === id}
            >
              {deletingId === id ? 'Deleting…' : 'Confirm'}
            </button>
          </div>
        ) : (
          <div className={s.actionsCell}>
            <button type="button" className={s.actionBtn} onClick={() => setViewingId(id)}>View</button>
            <button type="button" className={`${s.actionBtn} ${s.actionBtnDanger}`} onClick={() => setConfirmDeleteId(id)}>Delete</button>
          </div>
        )
      ),
    },
  ];

  const availableTypes = stats ? Object.keys(stats.by_type || {}) : [];

  return (
    <div className={s.page}>
      <SectionHeader title="History" subtitle="Every analysis you've run, across every feature — view the full result or clean up old runs." />

      {stats && (
        <div className={s.statsRow}>
          <StatTile label="Total analyses" value={stats.total} icon="📊" />
          {availableTypes.slice(0, 4).map(t => (
            <StatTile key={t} label={typeLabel(t)} value={stats.by_type[t]} icon={typeIcon(t)} />
          ))}
        </div>
      )}

      {availableTypes.length > 0 && (
        <div className={s.filterRow}>
          <button type="button" className={`${s.filterChip} ${!filterType ? s.filterChipActive : ''}`} onClick={() => selectFilter(null)}>
            All
          </button>
          {availableTypes.map(t => (
            <button
              key={t}
              type="button"
              className={`${s.filterChip} ${filterType === t ? s.filterChipActive : ''}`}
              onClick={() => selectFilter(t)}
            >
              {typeIcon(t)} {typeLabel(t)}
            </button>
          ))}
        </div>
      )}

      {loading && <SkeletonCard rows={6} />}
      {error && <ErrorCard message={error} />}

      {!loading && !error && items.length === 0 && (
        <Empty icon="🗂️" title="No history yet" body="Run any analysis and it'll show up here automatically." />
      )}

      {!loading && items.length > 0 && (
        <Card padded={false}>
          <DataTable cols={cols} rows={items} keyFn={(row) => row.analysis_id} />
        </Card>
      )}

      {hasMore && !loading && (
        <div className={s.loadMoreWrap}>
          <button type="button" className={s.actionBtn} onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      <AnimatePresence>
        {viewingId && (
          <DetailModal analysisId={viewingId} onClose={() => setViewingId(null)} fetchOne={historyApi.getOne} />
        )}
      </AnimatePresence>
    </div>
  );
}
