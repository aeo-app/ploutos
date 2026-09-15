import React from 'react';

/**
 * Renders a single <script type="application/ld+json"> tag containing
 * `data`, JSON-stringified. Deliberately a normal part of the React tree
 * (not injected into <head> by a separate script) — this means the exact
 * same component works correctly in both places this app renders pages:
 *
 *   - scripts/prerender/index.js's ReactDOMServer.renderToString() call
 *     already renders the WHOLE component tree, including this, into
 *     the static HTML a crawler sees with no JS execution required.
 *   - A live, client-side render produces the identical markup, since
 *     it's the same component tree — no duplicate logic to keep in sync
 *     between a "prerendered version" and a "live version" of the schema.
 *
 * Google explicitly supports JSON-LD anywhere in the document, not only
 * <head> — see https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data.
 */
export function JsonLd({ data }) {
  if (!data) return null;
  return (
    <script
      type="application/ld+json"
      // JSON.stringify's output is already valid inside a <script> tag
      // for this specific content type — no HTML-escaping risk here
      // since the data below is all static/known-safe strings, never
      // raw user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
