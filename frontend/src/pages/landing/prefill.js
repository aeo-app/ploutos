// The landing page forms hand what the visitor typed to the real sign-up form
// (which creates the account and sends the verification code), instead of
// collecting the same details twice. SignupPage reads and clears this key.
export const SIGNUP_PREFILL_KEY = 'aeo_signup_prefill';

export function setSignupPrefill(values) {
  const clean = {};
  Object.keys(values || {}).forEach((k) => {
    const v = typeof values[k] === 'string' ? values[k].trim() : values[k];
    if (v) clean[k] = v;
  });
  if (!Object.keys(clean).length) return;
  try { sessionStorage.setItem(SIGNUP_PREFILL_KEY, JSON.stringify(clean)); } catch (_) { /* optional */ }
}
