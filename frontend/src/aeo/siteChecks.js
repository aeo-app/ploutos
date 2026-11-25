import { useCallback, useEffect, useState } from 'react';
import { aeoApi } from '../api/aeoApi';

/* Website checks are saved on the server. Screens read the saved result; a new check runs only when
   there is none yet, the last one is over a week old, or the customer clicks "Re-check". */
const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const latest = new Map();    // url -> last result this session (keyed by url so "act as" another customer never mixes them)
const pending = new Map();   // url -> in-flight load, shared by the Dashboard and Company Profile

const isStale = (d) => !d?.checked_at || Date.now() - new Date(d.checked_at).getTime() > STALE_MS;

export function loadSiteChecks(url) {
  if (latest.has(url)) return Promise.resolve(latest.get(url));
  if (!pending.has(url)) {
    pending.set(url, aeoApi.siteChecksSaved()
      .then(d => (isStale(d) ? aeoApi.siteChecks(url) : d))
      .then(d => { latest.set(url, d); return d; })
      .finally(() => pending.delete(url)));
  }
  return pending.get(url);
}

export function useSiteChecks(url) {
  const [data, setData] = useState(() => latest.get(url) || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!url) return undefined;
    let off = false;
    setBusy(true); setErr('');
    loadSiteChecks(url)
      .then(d => { if (!off) setData(d); })
      .catch(e => { if (!off) setErr(e.message); })
      .finally(() => { if (!off) setBusy(false); });
    return () => { off = true; };
  }, [url]);

  const recheck = useCallback(async () => {
    if (!url) return;
    setBusy(true); setErr('');
    try {
      const d = await aeoApi.siteChecks(url);
      latest.set(url, d);
      setData(d);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }, [url]);

  return { data, busy, err, recheck };
}
