import { BASE } from '../api/seoApi';

/**
 * Lapsed-subscriber paywall.
 *
 * When someone who has paid before no longer has an active plan (expired, cancelled and ended, or a failed
 * renewal), the server answers every paid action with 402 + code "subscription_required". This module catches
 * that answer in one place, shows the pricing plans, waits for the payment to be confirmed and then repeats the
 * very request the person made — so every paid button behaves the same way without each page handling it.
 * If the person closes the plans instead, the original 402 goes back to the caller, which shows its message.
 */
let host = null;          // set by <PaywallHost/>
let pending = null;       // one popup at a time; parallel blocked requests share it
let suppressUntil = 0;

export const registerPaywallHost = (fn) => { host = fn; return () => { if (host === fn) host = null; }; };

/** True for a moment after the popup was closed without paying, so other 402 handlers don't open a second one. */
export const isPaywallSuppressed = () => Date.now() < suppressUntil;

export function openPaywall(info = {}) {
  if (!host) return Promise.resolve(false);
  if (pending) return pending;
  pending = new Promise((resolve) => {
    host(info, (paid) => {
      pending = null;
      if (!paid) suppressUntil = Date.now() + 2500;
      resolve(!!paid);
    });
  });
  return pending;
}

export const LAPSE_TEXT = {
  expired: 'Your subscription has expired.',
  cancelled: 'Your subscription was cancelled and its paid period has ended.',
  renewal_failed: 'We could not renew your subscription because the automatic payment failed.',
};

const urlOf = (input) => (typeof input === 'string' ? input : (input && input.url) || '');

export function installPaywallFetch() {
  if (typeof window === 'undefined' || window.__paywallFetchInstalled) return;
  window.__paywallFetchInstalled = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await orig(input, init);
    if (res.status !== 402 || !urlOf(input).startsWith(BASE)) return res;
    let body = null;
    try { body = await res.clone().json(); } catch { /* not JSON: an ordinary 402 */ }
    if (body?.code !== 'subscription_required') return res;

    const paid = await openPaywall({ reason: body.reason, message: body.detail });
    if (!paid) return res;

    // Paid: repeat the request. The token may have been refreshed while the person was paying, so use the current one.
    let retryInit = init;
    try {
      const tok = localStorage.getItem('id_token');
      if (tok && init && init.headers && !(init.headers instanceof Headers) && init.headers.Authorization) {
        retryInit = { ...init, headers: { ...init.headers, Authorization: `Bearer ${tok}` } };
      }
    } catch { /* keep the original headers */ }
    return window.fetch(input, retryInit);
  };
}
