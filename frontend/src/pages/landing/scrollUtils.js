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
// Sections that live on their own page (the top-bar tabs). When the section is not on the page being viewed, go to its page.
const SECTION_PAGE = { how: '/how-it-works', studio: '/how-it-works#studio', autopilot: '/how-it-works#autopilot', features: '/features', demo: '/features#demo', pricing: '/pricing', faq: '/faq', blog: '/blog' };

export function scrollToSection(id, e) {
  if (e) e.preventDefault();
  if (typeof document === 'undefined') return;
  const el = document.getElementById(id);
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (SECTION_PAGE[id] && typeof window !== 'undefined') window.location.assign(SECTION_PAGE[id]);
}
