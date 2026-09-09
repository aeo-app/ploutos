import React, { useState, useEffect } from 'react';
import { invitesApi } from '../api/socialPublishApi';
import s from './ConnectPageApprovalPage.module.css';

const PLATFORM_META = {
  meta: { label: 'Facebook & Instagram', icon: '📘', connectLabel: 'Continue with Facebook' },
  linkedin: { label: 'LinkedIn', icon: '💼', connectLabel: 'Continue with LinkedIn' },
  google_business: { label: 'Google Business Profile', icon: '📍', connectLabel: 'Continue with Google' },
};

/**
 * Reached at /connect-page/:token — deliberately outside the normal
 * authenticated app entirely (see App.js's top-level path check). The
 * person opening this link is a page/profile admin who may have no
 * account on this platform at all; every API call here is public.
 */
export function ConnectPageApprovalPage({ inviteToken }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [selecting, setSelecting] = useState(null);
  const [approvedPage, setApprovedPage] = useState(null);

  const params = new URLSearchParams(window.location.search);
  const hadCallbackError = params.get('error') === '1';
  const callbackReason = params.get('reason');

  const load = () => {
    invitesApi.getStatus(inviteToken)
      .then(setData)
      .catch(err => setError(err.message || 'This invite link could not be loaded.'));
  };

  useEffect(() => { load(); }, [inviteToken]); // eslint-disable-line

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const { authorize_url } = await invitesApi.getConnectUrl(inviteToken, data.platform);
      window.location.href = authorize_url;
    } catch (e) {
      setError(e.message || 'Could not start the connection.');
      setConnecting(false);
    }
  };

  const handleSelectPage = async (pageId) => {
    setSelecting(pageId);
    setError(null);
    try {
      const result = await invitesApi.selectPage(inviteToken, pageId);
      setApprovedPage(result.selected_page_label);
      if (data.return_to_app) {
        window.location.replace(`${window.location.origin}/?social_publish=connected`);
      }
    } catch (e) {
      setError(e.message || 'Could not connect that page.');
    } finally {
      setSelecting(null);
    }
  };

  if (error && !data) {
    return (
      <div className={s.wrap}>
        <div className={s.card}>
          <div className={s.errorIcon}>⚠️</div>
          <div className={s.title}>Couldn't load this invite</div>
          <div className={s.body}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={s.wrap}>
        <div className={s.card}><div className={s.body}>Loading…</div></div>
      </div>
    );
  }

  const meta = PLATFORM_META[data.platform] || { label: data.platform, icon: '🔗', connectLabel: 'Continue' };

  return (
    <div className={s.wrap}>
      <div className={s.card}>
        <div className={s.brand}>AEO<span className={s.brandAccent}>Intel</span></div>

        {(data.stage === 'approved' || approvedPage) && (
          <>
            <div className={s.successIcon}>✓</div>
            <div className={s.title}>Connected</div>
            <div className={s.body}>
              <strong>{approvedPage || data.selected_page_label}</strong> is now connected to {data.requested_by_label}'s account.
              They can now schedule and publish posts to it. You can close this page.
            </div>
          </>
        )}

        {data.stage === 'expired' && (
          <>
            <div className={s.errorIcon}>⏱️</div>
            <div className={s.title}>This invite has expired</div>
            <div className={s.body}>Ask {data.requested_by_label} to send you a new invite link.</div>
          </>
        )}

        {data.stage === 'cancelled' && (
          <>
            <div className={s.errorIcon}>✕</div>
            <div className={s.title}>This invite was cancelled</div>
            <div className={s.body}>Ask {data.requested_by_label} to send you a new invite link if this was unexpected.</div>
          </>
        )}

        {data.stage === 'pending' && (
          <>
            <div className={s.icon}>{meta.icon}</div>
            <div className={s.title}>{data.requested_by_label} wants to connect a {meta.label} page</div>
            <div className={s.body}>
              You'll be taken to {meta.label.split(' ')[0]}'s own sign-in page to authorize this — we never see or
              store your password. Once you approve, you'll choose exactly which page or location to connect;
              nothing is shared without your explicit selection.
            </div>
            {hadCallbackError && (
              <div className={s.warningBanner}>
                {callbackReason || 'Something went wrong during the last attempt.'} You can try again below.
              </div>
            )}
            <button type="button" className={s.connectBtn} onClick={handleConnect} disabled={connecting}>
              {connecting ? 'Redirecting…' : meta.connectLabel}
            </button>
          </>
        )}

        {data.stage === 'pick_page' && (
          <>
            <div className={s.icon}>{meta.icon}</div>
            <div className={s.title}>Which page do you want to connect?</div>
            <div className={s.body}>{data.requested_by_label} will be able to post and schedule content to whichever page you pick below.</div>
            <div className={s.pageList}>
              {(data.available_pages || []).map(p => (
                <button
                  key={p.id} type="button" className={s.pageOption}
                  onClick={() => handleSelectPage(p.id)}
                  disabled={selecting !== null}
                >
                  <span>{p.label}</span>
                  <span className={s.pageOptionAction}>{selecting === p.id ? 'Connecting…' : 'Connect this one →'}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {error && <div className={s.errorText}>{error}</div>}
      </div>
    </div>
  );
}
