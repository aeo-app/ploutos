import { useCallback, useEffect, useState } from 'react';
import { aeoApi } from '../api/aeoApi';

/* The server no longer keeps a saved website check, so screens run the check itself. The result is kept for the
   rest of the visit, so opening the same page again does not check the website again. */
const latest = new Map();    // url -> last result this session (keyed by url so "act as" another customer never mixes them)
const pending = new Map();   // url -> in-flight check, shared by every screen that asks at the same time

export function loadSiteChecks(url) {
  if (latest.has(url)) return Promise.resolve(latest.get(url));
  if (!pending.has(url)) {
    pending.set(url, aeoApi.siteChecks(url)
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
