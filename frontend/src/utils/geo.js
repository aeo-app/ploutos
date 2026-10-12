/**
 * Which country the visitor is browsing from, as best the browser can tell
 * (time zone first, then language region). Only India and Singapore get their
 * own price currency; everyone else sees USD, so anything else is "OTHER".
 * The server also looks at the CDN's country header, which wins when present.
 */
export function getBrowserCountry() {
  if (typeof window === 'undefined') return 'OTHER';
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) { /* ignore */ }
  if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') return 'IN';
  if (tz === 'Asia/Singapore') return 'SG';
  const region = ((window.navigator.language || '').match(/[-_]([A-Z]{2})$/i) || [])[1];
  const r = (region || '').toUpperCase();
  return r === 'IN' || r === 'SG' ? r : 'OTHER';
}

/** "9,999" for INR (lakh grouping), "1,299" elsewhere — whole numbers only, as plan prices are. */
export function formatPlanAmount(amount, currency) {
  const n = Math.round(parseFloat(amount));
  if (!Number.isFinite(n)) return String(amount);
  return n.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US');
}
