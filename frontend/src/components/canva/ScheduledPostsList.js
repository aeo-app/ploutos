import React, { useState, useEffect, useCallback } from 'react';
import { rememberPageBeforeOAuthRedirect } from '../../utils/oauthReturn';
import { useApp } from '../../context/AppContext';
import s from './ScheduledPostsList.module.css';

const PLATFORM_ICON = { facebook: '📘', instagram: '📷', linkedin: '💼', google_business: '📍' };
const PLATFORM_NAME = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', google_business: 'Google Business' };
const CONNECT_GROUP = { facebook: 'meta', instagram: 'meta', linkedin: 'linkedin', google_business: 'google_business' };
const STATUS_LABEL = {
  pending: 'Scheduled', posted: 'Posted', partial: 'Partially posted', failed: 'Failed', cancelled: 'Cancelled',
};

/** `api` needs {listScheduled, cancelScheduled} — see socialPublishApi.js /
 * adminApi.js's social* functions for the two ways this gets bound. */
export function ScheduledPostsList({ api }) {
  const { state } = useApp();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [retrying, setRetrying] = useState(null);
  const [reconnecting, setReconnecting] = useState(null);
  const [filter, setFilter] = useState('all');

  const load = useCallback(() => {
    api.listScheduled()
      .then(d => setItems(d?.items || []))
      .catch(err => setError(err?.message || 'Could not load scheduled posts.'));
    // eslint-disable-next-line
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async (scheduleId) => {
    setCancelling(scheduleId);
    try {
      await api.cancelScheduled(scheduleId);
      setItems(prev => (prev || []).map(i => i?.schedule_id === scheduleId ? { ...i, status: 'cancelled' } : i));
    } catch (err) {
      setError(err?.message || 'Could not cancel that scheduled post.');
    } finally {
      setCancelling(null);
    }
  };

  const handleRetry = async (scheduleId) => {
    setRetrying(scheduleId);
    setError(null);
    try {
      const updated = await api.retryScheduled(scheduleId);
      setItems(prev => (prev || []).map(i => i?.schedule_id === scheduleId ? updated : i));
    } catch (err) {
      setError(err?.message || 'Could not retry that post.');
    } finally {
      setRetrying(null);
    }
  };

  const handleReconnect = async (platform) => {
    const connectGroup = CONNECT_GROUP[platform] || platform;
    setReconnecting(platform);
    setError(null);
    try {
      const { authorize_url } = await api.connect(connectGroup);
      rememberPageBeforeOAuthRedirect(state.page);
      window.location.href = authorize_url;
    } catch (err) {
      setError(err?.message || `Could not start reconnecting ${PLATFORM_NAME[platform] || platform}.`);
      setReconnecting(null);
    }
  };

  if (error) return <div className={s.errorText}>{error}</div>;
  if (!items) return null;
  if (items.length === 0) return null;

  const filteredItems = filter === 'all'
    ? items
    : items.filter(item => item?.status === filter);
  return (
    <div className={s.wrap}>
      <div className={s.headerRow}>
        <div>
          <div className={s.title}>Content status</div>
          <div className={s.subtitle}>Track what is ready, queued, and already published.</div>
        </div>
        <span className={s.total}>{items.length} post{items.length === 1 ? '' : 's'}</span>
      </div>
      <div className={s.filters} role="tablist" aria-label="Post status">
        {[
          ['all', 'All'], ['pending', 'Scheduled'], ['posted', 'Posted'], ['partial', 'Partial'], ['failed', 'Failed'], ['cancelled', 'Cancelled'],
        ].map(([value, label]) => (
          <button
            key={value} type="button" role="tab" aria-selected={filter === value}
            className={`${s.filterBtn} ${filter === value ? s.filterActive : ''}`}
            onClick={() => setFilter(value)}
          >
            {label} <span>{value === 'all' ? items.length : items.filter(item => item?.status === value).length}</span>
          </button>
        ))}
      </div>
      {filteredItems.length === 0 && <div className={s.empty}>Nothing in this status yet.</div>}

      {filteredItems.length > 0 && (
        <div className={s.tableScroll}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Platform</th>
                <th>Post content</th>
                <th>Uploaded image</th>
                <th>Scheduled date/time</th>
                <th>Status</th>
                <th>Scheduled image</th>
                <th>Posted image</th>
                <th>Error / message</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.flatMap(item => {
                const resultByPlatform = Object.fromEntries((item?.results || []).map(r => [r.platform, r]));
                const hasResults = (item?.results || []).length > 0;
                const isPending = item?.status === 'pending';
                const isCancelled = item?.status === 'cancelled';

                return (item?.platforms || []).map(p => {
                  const result = resultByPlatform[p];
                  const pState = !hasResults ? 'pending' : (result?.success ? 'success' : 'fail');
                  const rowStatus = isCancelled ? 'cancelled' : isPending ? 'pending' : (pState === 'success' ? 'posted' : pState === 'fail' ? 'failed' : item?.status);

                  return (
                    <tr key={`${item?.schedule_id}-${p}`} className={s.tr}>
                      <td className={s.platformCell}>{PLATFORM_ICON[p] || ''} {PLATFORM_NAME[p] || p}</td>
                      <td className={s.captionCell} title={item?.caption}>{item?.caption}</td>
                      <td className={s.imgCell}>
                        {item?.image_url && (
                          <a href={item.image_url} target="_blank" rel="noreferrer" className={s.imgLink}>
                            <img className={s.thumb} src={item.image_url} alt="" />
                            <span>View</span>
                          </a>
                        )}
                      </td>
                      <td className={s.timeCell}>
                        {item?.scheduled_time ? new Date(item.scheduled_time).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                      </td>
                      <td>
                        <span className={`${s.statusBadge} ${s[`status_${rowStatus}`] || ''}`}>{STATUS_LABEL[rowStatus] || rowStatus}</span>
                      </td>
                      <td className={s.imgCell}>
                        {isPending && item?.image_url && (
                          <a href={item.image_url} target="_blank" rel="noreferrer" className={s.imgLink}>
                            <img className={s.thumb} src={item.image_url} alt="" />
                            <span>View</span>
                          </a>
                        )}
                      </td>
                      <td className={s.imgCell}>
                        {pState === 'success' && item?.image_url && (
                          <a href={item.image_url} target="_blank" rel="noreferrer" className={s.imgLink}>
                            <img className={s.thumb} src={item.image_url} alt="" />
                            <span>View</span>
                          </a>
                        )}
                      </td>
                      <td className={s.errorCell}>
                        {result?.error && <span className={s.failReason}>{result.error}</span>}
                        {result?.needs_reconnect && api.connect && (
                          <button
                            type="button" className={s.reconnectInlineBtn}
                            disabled={reconnecting === p}
                            onClick={() => handleReconnect(p)}
                          >
                            {reconnecting === p ? 'Reconnecting…' : `Reconnect ${PLATFORM_NAME[p] || p}`}
                          </button>
                        )}
                      </td>
                      <td className={s.actionsCell}>
                        {isPending && (
                          <button
                            type="button" className={s.cancelBtn}
                            disabled={cancelling === item?.schedule_id}
                            onClick={() => handleCancel(item.schedule_id)}
                          >
                            {cancelling === item?.schedule_id ? '…' : 'Cancel'}
                          </button>
                        )}
                        {(item?.status === 'failed' || item?.status === 'partial') && api.retryScheduled && (
                          <button
                            type="button" className={s.retryBtn}
                            disabled={retrying === item?.schedule_id}
                            onClick={() => handleRetry(item.schedule_id)}
                          >
                            {retrying === item?.schedule_id ? '…' : '↻ Retry'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
