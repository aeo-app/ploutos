import React, { useState, useEffect } from 'react';
import { invitesApi } from '../../api/socialPublishApi';
import s from './PagePickerModal.module.css';

const PLATFORM_META = {
  meta: { label: 'Facebook & Instagram', icon: '📘' },
  linkedin: { label: 'LinkedIn', icon: '💼' },
  google_business: { label: 'Google Business Profile', icon: '📍' },
};

/**
 * Shown right after the logged-in user authorizes with Facebook/Google
 * directly (self-connect, return_to_app=True on the backend) — NOT for
 * the "send a link to a different page admin" flow, which uses the
 * standalone public ConnectPageApprovalPage instead. `inviteToken` comes
 * from the OAuth-return redirect (?social_publish=pages_ready&invite_token=...),
 * handled in AppShell.js.
 */
export function PagePickerModal({ inviteToken, onDone }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selecting, setSelecting] = useState(null);

  useEffect(() => {
    invitesApi.getStatus(inviteToken)
      .then(setData)
      .catch(err => setError(err.message || 'Could not load the pages for this account.'));
  }, [inviteToken]);

  const handleSelect = async (pageId) => {
    setSelecting(pageId);
    setError(null);
    try {
      const result = await invitesApi.selectPage(inviteToken, pageId);
      onDone?.({ success: true, label: result.selected_page_label });
    } catch (e) {
      setError(e.message || 'Could not connect that page.');
      setSelecting(null);
    }
  };

  const meta = PLATFORM_META[data?.platform] || { label: data?.platform || '', icon: '🔗' };

  return (
    <div className={s.overlay} onClick={onDone ? () => onDone(null) : undefined}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        {!data && !error && <div className={s.loading}>Loading your pages…</div>}

        {error && !data && (
          <>
            <div className={s.title}>⚠️ Couldn't load pages</div>
            <div className={s.body}>{error}</div>
            <button type="button" className={s.closeBtn} onClick={() => onDone?.(null)}>Close</button>
          </>
        )}

        {data && data.stage === 'pick_page' && (
          <>
            <div className={s.title}>{meta.icon} Which {meta.label} page do you want to connect?</div>
            <div className={s.body}>You manage more than one — pick the one you want to schedule and publish posts to.</div>
            <div className={s.pageList}>
              {(data.available_pages || []).map(p => (
                <button
                  key={p.id} type="button" className={s.pageOption}
                  onClick={() => handleSelect(p.id)}
                  disabled={selecting !== null}
                >
                  <span>{p.label}</span>
                  <span className={s.pageOptionAction}>{selecting === p.id ? 'Connecting…' : 'Connect this one →'}</span>
                </button>
              ))}
            </div>
            {error && <div className={s.errorText}>{error}</div>}
          </>
        )}

        {data && data.stage !== 'pick_page' && (
          <>
            <div className={s.title}>Nothing to pick here</div>
            <div className={s.body}>This connection is already {data.stage}.</div>
            <button type="button" className={s.closeBtn} onClick={() => onDone?.(null)}>Close</button>
          </>
        )}
      </div>
    </div>
  );
}
