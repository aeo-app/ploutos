import React, { useState, useEffect } from 'react';
import { socialPublishApi } from '../../api/socialPublishApi';
import s from './SocialPublishPanel.module.css';

const PLATFORM_META = {
  facebook: { label: 'Facebook', icon: '📘', connectGroup: 'meta' },
  instagram: { label: 'Instagram', icon: '📷', connectGroup: 'meta' },
  linkedin: { label: 'LinkedIn', icon: '💼', connectGroup: 'linkedin' },
  google_business: { label: 'Google Business', icon: '📍', connectGroup: 'google_business' },
};

/**
 * Posts a Canva poster directly to Facebook, Instagram, LinkedIn, and/or
 * Google Business Profile. Each of those is its own OAuth connection (see
 * routers/social_publish_router.py) — connecting is a one-time step per
 * platform, same shape as the Canva panel above it.
 */
export function SocialPublishPanel({ posterId, defaultCaption }) {
  const [statusList, setStatusList] = useState(null); // [{platform, connected, account_label}]
  const [connecting, setConnecting] = useState(null); // which connect-group is mid-flow

  const [selected, setSelected] = useState({}); // platform -> bool
  const [caption, setCaption] = useState(defaultCaption || '');
  const [ctaUrl, setCtaUrl] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState(null); // [{platform, success, post_id, error}]
  const [error, setError] = useState(null);

  useEffect(() => {
    socialPublishApi.status()
      .then(d => setStatusList(d?.platforms || []))
      .catch(err => console.warn('[SocialPublishPanel] status failed:', err?.message || err));
  }, []);

  const handleConnect = async (connectGroup) => {
    setConnecting(connectGroup);
    setError(null);
    try {
      const { authorize_url } = await socialPublishApi.connect(connectGroup);
      window.location.href = authorize_url; // full-page redirect to that platform's consent screen
    } catch (e) {
      setError(e.message || `Could not start ${connectGroup} connection.`);
      setConnecting(null);
    }
  };

  const togglePlatform = (platform) => setSelected(v => ({ ...v, [platform]: !v[platform] }));

  const selectedPlatforms = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);

  const handlePublish = async () => {
    if (selectedPlatforms.length === 0) {
      setError('Pick at least one platform to post to.');
      return;
    }
    if (!caption.trim()) {
      setError('Write a caption first.');
      return;
    }
    setPublishing(true);
    setError(null);
    setResults(null);
    try {
      const data = await socialPublishApi.publish({
        poster_id: posterId,
        caption: caption.trim(),
        platforms: selectedPlatforms,
        cta_url: ctaUrl.trim() || undefined,
      });
      setResults(data?.results || []);
    } catch (e) {
      setError(e.message || 'Could not publish.');
    } finally {
      setPublishing(false);
    }
  };

  const isConnected = (platform) => statusList?.find(p => p?.platform === platform)?.connected;

  return (
    <div className={s.wrap}>
      <div className={s.title}>📤 Post directly to social media</div>

      {!statusList && <span className={s.loadingText}>Checking connections…</span>}

      {statusList && (
        <div className={s.platformGrid}>
          {Object.entries(PLATFORM_META).map(([platform, meta]) => {
            const connected = isConnected(platform);
            return (
              <div key={platform} className={s.platformRow}>
                <label className={s.platformLabel}>
                  <input
                    type="checkbox"
                    disabled={!connected}
                    checked={!!selected[platform]}
                    onChange={() => togglePlatform(platform)}
                  />
                  <span>{meta.icon} {meta.label}</span>
                </label>
                {connected ? (
                  <span className={s.connectedBadge}>Connected</span>
                ) : (
                  <button
                    type="button" className={s.connectBtn}
                    disabled={connecting === meta.connectGroup}
                    onClick={() => handleConnect(meta.connectGroup)}
                  >
                    {connecting === meta.connectGroup ? 'Connecting…' : 'Connect'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <textarea
        className={s.captionBox}
        placeholder="Caption for this post…"
        value={caption}
        onChange={e => setCaption(e.target.value)}
      />
      {selected.google_business && (
        <input
          className={s.ctaInput}
          placeholder="Google Business 'Learn more' link (optional)"
          value={ctaUrl}
          onChange={e => setCtaUrl(e.target.value)}
        />
      )}

      <button type="button" className={s.publishBtn} onClick={handlePublish} disabled={publishing}>
        {publishing ? 'Posting…' : `Post to ${selectedPlatforms.length || ''} platform${selectedPlatforms.length === 1 ? '' : 's'}`}
      </button>

      {error && <div className={s.errorText}>{error}</div>}

      {results && (
        <div className={s.resultsList}>
          {results.map(r => (
            <div key={r?.platform} className={r?.success ? s.resultSuccess : s.resultError}>
              {PLATFORM_META[r?.platform]?.icon} {PLATFORM_META[r?.platform]?.label}:{' '}
              {r?.success ? '✓ Posted' : `✗ ${r?.error || 'Failed'}`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
