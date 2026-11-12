import { useEffect, useState } from 'react';
import { isActingAs } from '../api/seoApi';
import { useApp } from '../context/AppContext';
import { socialPublishApi } from '../api/socialPublishApi';
import { rememberPageBeforeOAuthRedirect, rememberConnectAttempt, markConnectInProgress, clearConnectInProgress, platformsOfGroup } from '../utils/oauthReturn';
import { useConnectProgress } from './useConnectProgress';
import { useAeo } from './AeoContext';
import { CHANNELS, channelState } from './utils';

/** Dashboard order and look of the five channels. */
export const DASH_CHANNELS = [
  { id: 'fb', icon: 'facebook', bg: '#e8f0fe', fg: '#1877f2' },
  { id: 'ig', icon: 'instagram', bg: '#fdeef4', fg: '#c13584' },
  { id: 'li', icon: 'linkedin', bg: '#e8f1f8', fg: '#0a66c2' },
  { id: 'gbp', icon: 'store', bg: '#e9f5ee', fg: '#188038' },
  { id: 'yt', icon: 'youtube', bg: '#fdecec', fg: '#dc2626' },
];
const GROUP = { facebook: 'meta', instagram: 'meta', linkedin: 'linkedin', google_business: 'google_business', youtube: 'youtube' };
const FOUND_KEY = { fb: 'facebook', ig: 'instagram', li: 'linkedin', yt: 'youtube', gbp: 'google_business' };
const shortLink = (u) => String(u || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').replace(/^[a-z]+\.com\//i, '');

/** Connection state of the five social channels, plus connect / disconnect / re-scan. An admin viewing a customer can look but never connect. */
export function useSocialChannels() {
  const acting = isActingAs();
  const { state, toast } = useApp();
  const { brand, detecting, detectBrand } = useAeo();
  const [status, setStatus] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [connecting, setConnecting] = useState(null);
  const progress = useConnectProgress();
  const found = (brand.data && brand.data.socials) || {};

  useEffect(() => {
    let off = false;
    socialPublishApi.statusForView().then(d => {
      if (off) return;
      const m = {}; (d?.platforms || []).forEach(p => { m[p.platform] = p; });
      setStatus(m); setLoaded(true);
      Object.values(m).forEach(p => { if (!acting && p.connected && !p.needs_reconnect) clearConnectInProgress(p.platform); });
    }).catch(() => { if (!off) setLoaded(true); });
    return () => { off = true; };
    // eslint-disable-next-line
  }, []);

  const channels = DASH_CHANNELS.map(d => {
    const ch = CHANNELS.find(c => c.id === d.id);
    const st = status[ch.platform];
    const cs = channelState(ch, st, !!progress[ch.platform]);
    const key = cs.key === 'on' ? 'connected' : cs.key === 'off' ? 'connect' : cs.key;   // connected | connect | reconnect | progress
    const f = found[FOUND_KEY[d.id]];
    return { ...d, ch, name: ch.name, platform: ch.platform, key, account: key === 'connected' ? (st?.account_label || 'Connected account') : '', foundUrl: f || '', foundLabel: f ? shortLink(f) : '' };
  });

  const connect = async (c) => {
    setConnecting(c.id);
    const group = GROUP[c.platform] || c.platform;
    try {
      const { authorize_url } = await socialPublishApi.connect(group);
      if (!authorize_url) throw new Error('no authorize url');
      rememberPageBeforeOAuthRedirect(state.page);
      rememberConnectAttempt(group);
      window.location.href = authorize_url;
    } catch (e) {
      // Not something the customer can fix: show the connection as "in progress", never as an error.
      markConnectInProgress(platformsOfGroup(group));
      toast({ type: 'info', message: `Your ${c.name} connection is in progress. We are finishing the setup — try again a little later.` });
      setConnecting(null);
    }
  };
  const disconnect = async (c) => {
    try { await socialPublishApi.disconnect(c.platform); setStatus(m => ({ ...m, [c.platform]: { ...m[c.platform], connected: false } })); }
    catch (e) { toast({ type: 'info', message: 'We could not disconnect just now. Please try again in a moment.' }); }
  };
  const rescan = async () => {
    try { await detectBrand(); toast({ type: 'success', message: 'We checked your website again.' }); }
    catch (e) { if (e.code !== 'TokenExpired') toast({ type: 'info', message: 'We could not read your website just now. Please try again in a moment.' }); }
  };
  return { acting, channels, loaded, connecting, connect, disconnect, rescan, detecting, canScan: !!state.request.url };
}
