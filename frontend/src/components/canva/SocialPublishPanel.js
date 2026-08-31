import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { rememberPageBeforeOAuthRedirect } from '../../utils/oauthReturn';
import s from './SocialPublishPanel.module.css';

const PLATFORM_META = {
  facebook: { label: 'Facebook', icon: '📘', connectGroup: 'meta' },
  instagram: { label: 'Instagram', icon: '📷', connectGroup: 'meta' },
  linkedin: { label: 'LinkedIn', icon: '💼', connectGroup: 'linkedin' },
  google_business: { label: 'Google Business', icon: '📍', connectGroup: 'google_business' },
};
const SCHEDULABLE_PLATFORMS = new Set(['facebook', 'instagram']);

/**
 * Posts (or schedules) an image to Facebook, Instagram, LinkedIn, and/or
 * Google Business Profile. Works with EITHER an existing Canva poster
 * (`posterId`) OR a user's own directly-uploaded image — never needs Canva
 * at all if the user just wants to post their own photo for this date.
 *
 * `api` is a small adapter so the exact same component works for a normal
 * user's own account (api bound to socialPublishApi) and for an admin
 * acting on a customer's behalf (api bound to adminApi's social* calls for
 * that customer's user_id) — see RelocationCalendarPage.js and
 * AdminContentPage.js for how each wires this up.
 */
export function SocialPublishPanel({ api, dayDate, posterId, defaultCaption }) {
  const { state } = useApp();
  const [statusList, setStatusList] = useState(null);
  const [connecting, setConnecting] = useState(null);

  const [imageSource, setImageSource] = useState(posterId ? 'poster' : 'upload'); // 'poster' | 'upload'
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedUrl, setUploadedUrl] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [mode, setMode] = useState('now'); // 'now' | 'schedule'
  const [scheduledTime, setScheduledTime] = useState('');

  const [selected, setSelected] = useState({});
  const [caption, setCaption] = useState(defaultCaption || '');
  const [ctaUrl, setCtaUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null);
  const [scheduleConfirmation, setScheduleConfirmation] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.status()
      .then(d => setStatusList(d?.platforms || []))
      .catch(err => console.warn('[SocialPublishPanel] status failed:', err?.message || err));
    // eslint-disable-next-line
  }, []);

  const handleConnect = async (connectGroup) => {
    setConnecting(connectGroup);
    setError(null);
    try {
      const { authorize_url } = await api.connect(connectGroup);
      rememberPageBeforeOAuthRedirect(state.page);
      window.location.href = authorize_url;
    } catch (e) {
      setError(e.message || `Could not start ${connectGroup} connection.`);
      setConnecting(null);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    setUploadedUrl(null);
    setUploading(true);
    setError(null);
    try {
      const { image_url } = await api.uploadMedia(file);
      setUploadedUrl(image_url);
    } catch (err) {
      setError(err.message || 'Could not upload that image.');
      setUploadedFile(null);
    } finally {
      setUploading(false);
    }
  };

  const togglePlatform = (platform) => {
    setSelected(v => {
      const next = { ...v, [platform]: !v[platform] };
      // Scheduling only supports Facebook/Instagram — flipping to "schedule"
      // mode with an unsupported platform selected would just fail server-
      // side, so drop it here instead of letting the user hit that error.
      if (mode === 'schedule' && next[platform] && !SCHEDULABLE_PLATFORMS.has(platform)) {
        next[platform] = false;
      }
      return next;
    });
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    if (newMode === 'schedule') {
      setSelected(v => {
        const next = { ...v };
        Object.keys(next).forEach(p => { if (!SCHEDULABLE_PLATFORMS.has(p)) next[p] = false; });
        return next;
      });
    }
  };

  const selectedPlatforms = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
  const isConnected = (platform) => statusList?.find(p => p?.platform === platform)?.connected;

  const buildImageSourcePayload = () => {
    if (imageSource === 'poster') {
      if (!posterId) return null;
      return { poster_id: posterId };
    }
    if (!uploadedUrl) return null;
    return { image_url: uploadedUrl };
  };

  const handleSubmit = async () => {
    setError(null);
    setResults(null);
    setScheduleConfirmation(null);

    if (selectedPlatforms.length === 0) { setError('Pick at least one platform.'); return; }
    if (!caption.trim()) { setError('Write a caption first.'); return; }
    const sourcePayload = buildImageSourcePayload();
    if (!sourcePayload) {
      setError(imageSource === 'poster' ? 'No poster available yet.' : 'Upload an image first.');
      return;
    }
    if (mode === 'schedule' && !scheduledTime) { setError('Pick a date and time to schedule for.'); return; }

    setSubmitting(true);
    try {
      if (mode === 'now') {
        const data = await api.publish({
          ...sourcePayload, caption: caption.trim(), platforms: selectedPlatforms,
          cta_url: ctaUrl.trim() || undefined,
        });
        setResults(data?.results || []);
      } else {
        const iso = new Date(scheduledTime).toISOString();
        const data = await api.schedule({
          ...sourcePayload, day_date: dayDate, caption: caption.trim(), platforms: selectedPlatforms,
          scheduled_time: iso, cta_url: ctaUrl.trim() || undefined,
        });
        setScheduleConfirmation(data);
      }
    } catch (e) {
      setError(e.message || 'Could not complete that request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={s.wrap}>
      <div className={s.title}>📤 Post to social media</div>

      {!statusList && <span className={s.loadingText}>Checking connections…</span>}

      {statusList && (
        <div className={s.platformGrid}>
          {Object.entries(PLATFORM_META).map(([platform, meta]) => {
            const connected = isConnected(platform);
            const disabledForMode = mode === 'schedule' && !SCHEDULABLE_PLATFORMS.has(platform);
            return (
              <div key={platform} className={s.platformRow}>
                <label className={s.platformLabel}>
                  <input
                    type="checkbox"
                    disabled={!connected || disabledForMode}
                    checked={!!selected[platform]}
                    onChange={() => togglePlatform(platform)}
                  />
                  <span>{meta.icon} {meta.label}</span>
                  {disabledForMode && <span className={s.notSchedulable}>(not schedulable)</span>}
                </label>
                {connected ? (
                  <span className={s.connectedBadge}>Connected</span>
                ) : api.connect ? (
                  <button
                    type="button" className={s.connectBtn}
                    disabled={connecting === meta.connectGroup}
                    onClick={() => handleConnect(meta.connectGroup)}
                  >
                    {connecting === meta.connectGroup ? 'Connecting…' : 'Connect'}
                  </button>
                ) : (
                  <span className={s.notConnectedText}>Not connected by customer</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className={s.sourceToggleRow}>
        {posterId && (
          <button type="button" className={`${s.toggleBtn} ${imageSource === 'poster' ? s.toggleBtnActive : ''}`} onClick={() => setImageSource('poster')}>
            Use Canva poster
          </button>
        )}
        <button type="button" className={`${s.toggleBtn} ${imageSource === 'upload' ? s.toggleBtnActive : ''}`} onClick={() => setImageSource('upload')}>
          Upload my own image
        </button>
      </div>

      {imageSource === 'upload' && (
        <div className={s.uploadRow}>
          <input type="file" accept="image/*" onChange={handleFileChange} className={s.fileInput} />
          {uploading && <span className={s.loadingText}>Uploading…</span>}
          {uploadedUrl && !uploading && <img className={s.uploadPreview} src={uploadedUrl} alt="Upload preview" />}
        </div>
      )}
      {imageSource === 'poster' && !posterId && (
        <div className={s.hintText}>No Canva poster created yet for this post — create one above, or upload your own image instead.</div>
      )}

      <div className={s.sourceToggleRow}>
        <button type="button" className={`${s.toggleBtn} ${mode === 'now' ? s.toggleBtnActive : ''}`} onClick={() => switchMode('now')}>
          Post now
        </button>
        <button type="button" className={`${s.toggleBtn} ${mode === 'schedule' ? s.toggleBtnActive : ''}`} onClick={() => switchMode('schedule')}>
          Schedule for later
        </button>
      </div>

      {mode === 'schedule' && (
        <>
          <input
            type="datetime-local" className={s.dateTimeInput}
            value={scheduledTime} onChange={e => setScheduledTime(e.target.value)}
          />
          <div className={s.hintText}>Scheduling only supports Facebook and Instagram — Instagram has no native "post later" API, so this app holds and publishes it for you at the time you pick.</div>
        </>
      )}

      <textarea className={s.captionBox} placeholder="Caption for this post…" value={caption} onChange={e => setCaption(e.target.value)} />
      {selected.google_business && (
        <input className={s.ctaInput} placeholder="Google Business 'Learn more' link (optional)" value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} />
      )}

      <button type="button" className={s.publishBtn} onClick={handleSubmit} disabled={submitting}>
        {submitting
          ? (mode === 'now' ? 'Posting…' : 'Scheduling…')
          : (mode === 'now'
            ? `Post to ${selectedPlatforms.length || ''} platform${selectedPlatforms.length === 1 ? '' : 's'}`
            : `Schedule for ${selectedPlatforms.length || ''} platform${selectedPlatforms.length === 1 ? '' : 's'}`)}
      </button>

      {error && <div className={s.errorText}>{error}</div>}

      {results && (
        <div className={s.resultsList}>
          {results.map(r => (
            <div key={r?.platform} className={r?.success ? s.resultSuccess : s.resultError}>
              {PLATFORM_META[r?.platform]?.icon} {PLATFORM_META[r?.platform]?.label}: {r?.success ? '✓ Posted' : `✗ ${r?.error || 'Failed'}`}
            </div>
          ))}
        </div>
      )}

      {scheduleConfirmation && (
        <div className={s.resultSuccess}>
          ✓ Scheduled for {new Date(scheduleConfirmation.scheduled_time).toLocaleString()}
        </div>
      )}
    </div>
  );
}
