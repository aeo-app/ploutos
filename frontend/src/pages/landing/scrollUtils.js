/**
 * scrollToSection(id) — smooth-scrolls to a section on the current page
 * without ever touching window.location.hash, so the URL bar stays clean
 * (e.g. "https://www.aeo-app.ai/", never "https://www.aeo-app.ai/#pricing")
 * even though every in-page nav link still points at a real "#id" href.
 *
 * The href is kept deliberately, not removed — this is a progressive-
 * enhancement pattern: with JS running normally, onClick below calls
 * preventDefault() so the browser's native "jump to hash" behavior never
 * fires at all, and this function does the scrolling instead. If JS
 * fails to load, is disabled, or the link is opened in a new tab/window,
 * the real href still works via the browser's own anchor navigation —
 * removing the href entirely would break that fallback for no benefit.
 */
export function scrollToSection(id, e) {
  if (e) e.preventDefault();
  if (typeof document === 'undefined') return;
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
