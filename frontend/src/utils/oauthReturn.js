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
