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
  const pending = items.filter(i => i?.status === 'pending');
  const others = items.filter(i => i?.status !== 'pending');
  if (items.length === 0) return null;

  return (
    <div className={s.wrap}>
      <div className={s.title}>🗓️ Scheduled posts</div>
      {[...pending, ...others].map(item => (
        <div key={item?.schedule_id} className={s.row}>
          <img className={s.thumb} src={item?.image_url} alt="" />
          <div className={s.info}>
            <div className={s.caption}>{item?.caption}</div>
            <div className={s.meta}>
              {(item?.platforms || []).map(p => <span key={p}>{PLATFORM_ICON[p] || ''}</span>)}
              {' · '}{item?.scheduled_time ? new Date(item.scheduled_time).toLocaleString() : '—'}
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
    </div>
  );
}
