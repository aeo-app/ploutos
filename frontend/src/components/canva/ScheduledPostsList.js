import React, { useState, useEffect, useCallback } from 'react';
import s from './ScheduledPostsList.module.css';

const PLATFORM_ICON = { facebook: '📘', instagram: '📷', linkedin: '💼', google_business: '📍' };
const STATUS_LABEL = {
  pending: 'Pending', posted: 'Posted', failed: 'Failed', cancelled: 'Cancelled',
};

/** `api` needs {listScheduled, cancelScheduled} — see socialPublishApi.js /
 * adminApi.js's social* functions for the two ways this gets bound. */
export function ScheduledPostsList({ api }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(null);
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

  if (error) return <div className={s.errorText}>{error}</div>;
  if (!items) return null;
  if (items.length === 0) return null;

  const filteredItems = filter === 'all'
    ? items
    : items.filter(item => item?.status === filter);
  const groups = filteredItems.reduce((result, item) => {
    const date = item?.scheduled_time ? new Date(item.scheduled_time) : null;
    const key = date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
      : 'Unscheduled';
    (result[key] ||= []).push(item);
    return result;
  }, {});

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
          ['all', 'All'], ['pending', 'Scheduled'], ['posted', 'Posted'], ['failed', 'Failed'], ['cancelled', 'Cancelled'],
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
      {Object.entries(groups).map(([date, dateItems]) => (
        <section key={date} className={s.dayGroup}>
          <div className={s.dayLabel}>{date}</div>
          {dateItems.map(item => (
            <div key={item?.schedule_id} className={s.row}>
              <img className={s.thumb} src={item?.image_url} alt="" />
              <div className={s.info}>
                <div className={s.caption}>{item?.caption}</div>
                <div className={s.meta}>
                  {(item?.platforms || []).map(p => <span key={p}>{PLATFORM_ICON[p] || ''}</span>)}
                  {' · '}{item?.scheduled_time ? new Date(item.scheduled_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}
                  {' · '}<span className={s[`status_${item?.status}`] || ''}>{STATUS_LABEL[item?.status] || item?.status}</span>
                </div>
                {item?.status === 'failed' && (item?.results || []).some(r => !r?.success) && (
                  <div className={s.failReason}>
                    {(item.results || []).filter(r => !r?.success).map(r => `${PLATFORM_ICON[r?.platform] || ''} ${r?.error || 'Failed'}`).join(' · ')}
                  </div>
                )}
              </div>
              {item?.status === 'pending' && (
                <button
                  type="button" className={s.cancelBtn}
                  disabled={cancelling === item?.schedule_id}
                  onClick={() => handleCancel(item.schedule_id)}
                >
                  {cancelling === item?.schedule_id ? 'Cancelling…' : 'Cancel'}
                </button>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
