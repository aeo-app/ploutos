/**
 * scripts/prerender/index.js — build-time static pre-rendering
 * ============================================================================
 * Run AFTER `react-scripts build` (see package.json), since it needs the
 * real build/index.html as a template to inject rendered content into.
 *
 * What this actually solves: this app is a client-side-rendered SPA, so
 * without this, EVERY route serves the exact same empty
 * `<div id="root"></div>` shell to any visitor whose HTTP client doesn't
 * execute JavaScript — which includes most AI crawlers (GPTBot, ClaudeBot,
 * PerplexityBot, etc. — see public/robots.txt, which explicitly allows
 * them) and many traditional search crawlers too. Allowing a crawler in
 * accomplishes nothing if there's no actual content for it to read once
 * it arrives. This generates one real, content-filled static HTML file
 * per public route, so a crawler gets real markup immediately — no JS
 * execution required — while a human visitor's browser still boots the
 * full interactive React app over it, exactly as before.
 *
 * Deliberately NOT true server-side rendering: this app deploys as pure
 * static files to S3 with no server at all (see package.json's "deploy"
 * script). Build-time pre-rendering fits that exactly, needs no new
 * infrastructure, and solves the actual problem (crawler-visible
 * content) just as completely as a live SSR server would for these
 * routes, since none of them are personalized or need to vary per-request.
 *
 * Deliberately does NOT touch anything behind the authenticated app shell
 * (dashboard, calendar, billing, etc.) — none of that is reachable or
 * meaningful to a crawler with no session, and pre-rendering it would be
 * both wasted effort and a way to leak UI structure that isn't public.
 */
require('./setup');

const fs = require('fs');
const path = require('path');
const React = require('react');
const ReactDOMServer = require('react-dom/server');

const BUILD_DIR = path.join(__dirname, '..', '..', 'build');
const INDEX_HTML_PATH = path.join(BUILD_DIR, 'index.html');
const API_BASE = process.env.PRERENDER_API_BASE || 'https://api.aeo-app.ai/api/v1';

const { AuthProvider } = require('../../src/context/AuthContext.js');
const { LandingPage } = require('../../src/pages/landing/LandingPage.js');
const { PublicBlogIndexPage } = require('../../src/pages/PublicBlogIndexPage.js');
const { PublicBlogPostPage } = require('../../src/pages/PublicBlogPostPage.js');
const { loadBlogPostsSync } = require('./loadBlogPostsNode.js');

// ── Fetch plans from the real, live API ─────────────────────────────────────
// Best-effort: if the backend isn't reachable from wherever this build runs,
// the landing page still gets pre-rendered — just without the Pricing
// section's cards filled in server-side. That section still works fine for
// a human visitor (the client-side fetch in Pricing.jsx runs normally once
// the real app boots) — it just means a crawler hitting the static snapshot
// wouldn't see plan prices baked into the initial HTML for that specific
// section. Every other section of the page, and the entire Blog feature
// (no live-API dependency at all), still gets pre-rendered fully regardless.
async function fetchPlansForPrerender() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${API_BASE}/payment/plans`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    return data.plans || null;
  } catch (e) {
    console.warn(`[prerender] Could not fetch live plans from ${API_BASE} (${e.message}) — Pricing section will render without initial data, same as a fresh client-side load would show before its own fetch resolves.`);
    return null;
  }
}

// ── HTML injection ───────────────────────────────────────────────────────────
function injectIntoTemplate(templateHtml, renderedAppHtml, opts) {
  opts = opts || {};
  let html = templateHtml.replace(
    /<div id="root">.*?<\/div>/s,
    '<div id="root">' + renderedAppHtml + '</div>'
  );
  if (opts.title) {
    html = html.replace(/<title>.*?<\/title>/s, '<title>' + escapeHtml(opts.title) + '</title>');
  }
  if (opts.description) {
    if (/<meta name="description"/i.test(html)) {
      html = html.replace(/<meta name="description"[^>]*>/i, '<meta name="description" content="' + escapeHtml(opts.description) + '">');
    } else {
      html = html.replace('</head>', '  <meta name="description" content="' + escapeHtml(opts.description) + '">\n  </head>');
    }
  }
  return html;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function writeRouteHtml(routePath, html) {
  // '/' -> build/index.html ; '/blog' -> build/blog/index.html ;
  // '/blog/my-post' -> build/blog/my-post/index.html — matches how S3
  // static website hosting resolves a directory request to its index.html.
  const outDir = routePath === '/' ? BUILD_DIR : path.join(BUILD_DIR, routePath);
  const outPath = path.join(outDir, 'index.html');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');
  console.log('[prerender] wrote ' + path.relative(BUILD_DIR, outPath) + ' (' + html.length + ' bytes)');
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(INDEX_HTML_PATH)) {
    console.error('[prerender] ' + INDEX_HTML_PATH + ' not found — this script must run AFTER "react-scripts build", not before. See package.json\'s "build" script.');
    process.exit(1);
  }
  const template = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const posts = loadBlogPostsSync();

  // 1. Landing page (homepage + pricing section + blog teaser, all in one route)
  const plans = await fetchPlansForPrerender();
  const landingHtml = ReactDOMServer.renderToString(
    React.createElement(
      AuthProvider,
      null,
      React.createElement(LandingPage, { initialPlans: plans, initialPosts: posts.slice(0, 3) })
    )
  );
  writeRouteHtml('/', injectIntoTemplate(template, landingHtml, {
    title: 'AEO Intel — Track and improve your AI search visibility',
    description: 'Track your brand across ChatGPT, Perplexity, and Google AI Overviews, then ship the content and technical fixes that move you into the answer.',
  }));

  // 2. Blog index — every post, one card each
  const blogIndexHtml = ReactDOMServer.renderToString(
    React.createElement(PublicBlogIndexPage, { initialPosts: posts })
  );
  writeRouteHtml('/blog', injectIntoTemplate(template, blogIndexHtml, {
    title: 'Blog — AEO Intel',
    description: 'Articles and updates from the AEO Intel team on AI search visibility, answer-engine optimization, and content strategy.',
  }));

  // 3. Every individual blog post
  for (const post of posts) {
    const postHtml = ReactDOMServer.renderToString(
      React.createElement(PublicBlogPostPage, { slug: post.slug, initialPost: post })
    );
    writeRouteHtml('/blog/' + post.slug, injectIntoTemplate(template, postHtml, {
      title: post.title + ' — AEO Intel Blog',
      description: post.excerpt || undefined,
    }));
  }

  console.log('[prerender] done — 1 homepage + 1 blog index + ' + posts.length + ' blog post(s)');
}

main().catch(function (err) {
  console.error('[prerender] failed:', err);
  process.exit(1);
});
