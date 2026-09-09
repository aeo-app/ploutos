import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { rememberPageBeforeOAuthRedirect } from '../../utils/oauthReturn';
import s from './PostStatusSummary.module.css';

const PLATFORM_ICON = { facebook: '📘', instagram: '📷', linkedin: '💼', google_business: '📍' };
const PLATFORM_NAME = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', google_business: 'Google Business' };
const CONNECT_GROUP = { facebook: 'meta', instagram: 'meta', linkedin: 'linkedin', google_business: 'google_business' };
const STATUS_META = {
  pending: { label: 'Scheduled', cls: 'statusScheduled', icon: '🕐' },
  posted: { label: 'Posted successfully', cls: 'statusPosted', icon: '✓' },
  partial: { label: 'Partially posted', cls: 'statusPartial', icon: '⚠' },
  failed: { label: 'Failed to post', cls: 'statusFailed', icon: '✗' },
  cancelled: { label: 'Cancelled', cls: 'statusCancelled', icon: '—' },
};

/**
 * `item` is the matching history record for THIS specific post
 * (day_date + post_number), or null/undefined if nothing has been
 * posted/scheduled for it yet — that "nothing yet" case renders as a
 * plain "Draft — not yet scheduled or posted" line, since there's no
 * separate draft record on the backend, just the absence of one.
 */
export function PostStatusSummary({ item, api, onChanged }) {
  const { state } = useApp();
  const [retrying, setRetrying] = useState(false);
  const [reconnecting, setReconnecting] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [localError, setLocalError] = useState(null);

  if (!item) {
    return (
      <div className={s.wrap}>
        <span className={s.draftBadge}>📝 Draft — not yet scheduled or posted</span>
      </div>
    );
  }

  const meta = STATUS_META[item.status] || { label: item.status, cls: '', icon: '' };
  const resultByPlatform = Object.fromEntries((item.results || []).map(r => [r.platform, r]));
  const hasResults = (item.results || []).length > 0;

  const handleRetry = async () => {
    setRetrying(true);
    setLocalError(null);
    try {
      const updated = await api.retryScheduled(item.schedule_id);
      onChanged?.(updated);
    } catch (e) {
      setLocalError(e.message || 'Could not retry.');
    } finally {
      setRetrying(false);
    }
  };

  const handleReconnect = async (platform) => {
    setReconnecting(platform);
    setLocalError(null);
    try {
      const { authorize_url } = await api.connect(CONNECT_GROUP[platform] || platform);
      rememberPageBeforeOAuthRedirect(state.page);
      window.location.href = authorize_url;
    } catch (e) {
      setLocalError(e.message || 'Could not start reconnecting.');
      setReconnecting(null);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    setLocalError(null);
    try {
      await api.cancelScheduled(item.schedule_id);
      onChanged?.({ ...item, status: 'cancelled' });
    } catch (e) {
      setLocalError(e.message || 'Could not cancel.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className={s.wrap}>
      <div className={s.mainRow}>
        {item.image_url && <img className={s.thumb} src={item.image_url} alt="" />}
        <div className={s.info}>
          <div className={s.statusLine}>
            <span className={`${s.statusBadge} ${s[meta.cls]}`}>{meta.icon} {meta.label}</span>
            <span className={s.timeText}>
              {item.scheduled_time ? new Date(item.scheduled_time).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
            </span>
          </div>
          <div className={s.platformRow}>
            {(item.platforms || []).map(p => {
              const result = resultByPlatform[p];
              const pState = !hasResults ? 'pending' : (result?.success ? 'success' : 'fail');
              return (
                <span key={p} className={`${s.platformChip} ${s[`chip_${pState}`]}`} title={result?.error || PLATFORM_NAME[p] || p}>
                  {PLATFORM_ICON[p] || ''} {PLATFORM_NAME[p] || p} {pState === 'success' ? '✓' : pState === 'fail' ? '✗' : ''}
                </span>
              );
            })}
          </div>
          {item.status === 'pending' && (
            <button type="button" className={s.cancelLink} disabled={cancelling} onClick={handleCancel}>
              {cancelling ? 'Cancelling…' : 'Cancel scheduled post'}
            </button>
          )}
        </div>
      </div>

      {(item.status === 'failed' || item.status === 'partial') && (
        <div className={s.actionsRow}>
          {(item.results || []).filter(r => !r?.success && r?.needs_reconnect).map(r => (
            api.connect ? (
              <button
                key={r.platform} type="button" className={s.reconnectBtn}
                disabled={reconnecting === r.platform}
                onClick={() => handleReconnect(r.platform)}
              >
                {reconnecting === r.platform ? 'Reconnecting…' : `⚠ Reconnect ${PLATFORM_NAME[r.platform] || r.platform}`}
              </button>
            ) : (
              <span key={r.platform} className={s.reconnectNeededText}>⚠ {PLATFORM_NAME[r.platform] || r.platform} needs reconnection</span>
            )
          ))}
          {api.retryScheduled && (
            <button type="button" className={s.retryBtn} disabled={retrying} onClick={handleRetry}>
              {retrying ? 'Retrying…' : '↻ Retry'}
            </button>
          )}
        </div>
      )}

      {localError && <div className={s.errorText}>{localError}</div>}
    </div>
  );
}
