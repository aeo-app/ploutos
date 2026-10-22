const STORAGE_KEY = 'oauth_return_page';

/**
 * Every OAuth connect flow in this app (Canva, Meta, LinkedIn, Google
 * Business) is a full browser redirect away and back — the whole React app
 * reloads on return, so `state.page` resets to its default. Call this right
 * before redirecting to the provider's consent screen, with whatever page
 * the user was on, so AppShell can restore it on return regardless of
 * whether the connection succeeded or failed.
 */
export function rememberPageBeforeOAuthRedirect(page) {
  try {
    sessionStorage.setItem(STORAGE_KEY, page);
  } catch {
    // sessionStorage can throw in some locked-down/private-browsing
    // contexts — non-fatal, worst case the user just lands on the default
    // page after connecting, same as before this existed.
  }
}

/** Reads and clears the remembered page — call once, on the return trip. */
export function consumeRememberedPage() {
  try {
    const page = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    return page || null;
  } catch {
    return null;
  }
}

/* ── "In progress" connections ─────────────────────────────────────────────
 * When connecting a social account doesn't complete (the provider refuses,
 * the app isn't approved yet, the request fails) customers see a calm
 * "in progress" state instead of an error. */
const PROGRESS_KEY = 'aeo_connect_progress';
const ATTEMPT_KEY = 'aeo_connect_attempt';
const PLATFORMS_OF_GROUP = { meta: ['facebook', 'instagram'], linkedin: ['linkedin'], google_business: ['google_business'], youtube: ['youtube'] };

export function getConnectProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') || {}; } catch { return {}; }
}
function writeProgress(map) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(map)); window.dispatchEvent(new Event('aeo-connect-progress')); } catch { /* optional */ }
}
export function markConnectInProgress(platforms) {
  const m = getConnectProgress();
  [].concat(platforms).forEach(p => { m[p] = Date.now(); });
  writeProgress(m);
}
export function clearConnectInProgress(platforms) {
  const m = getConnectProgress();
  [].concat(platforms).forEach(p => { delete m[p]; });
  writeProgress(m);
}
/** Which connect group (meta / linkedin / google_business / youtube) the user just started, so the return trip knows. */
export function rememberConnectAttempt(group) { try { sessionStorage.setItem(ATTEMPT_KEY, group); } catch { /* optional */ } }
export function consumeConnectAttempt() {
  try { const g = sessionStorage.getItem(ATTEMPT_KEY); sessionStorage.removeItem(ATTEMPT_KEY); return g ? (PLATFORMS_OF_GROUP[g] || [g]) : []; } catch { return []; }
}
export const platformsOfGroup = (g) => PLATFORMS_OF_GROUP[g] || [g];
