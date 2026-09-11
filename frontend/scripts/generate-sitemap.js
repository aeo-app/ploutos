#!/usr/bin/env node
/**
 * scripts/generate-sitemap.js — builds public/sitemap.xml before every
 * production build (see package.json's "build" script).
 *
 * Deliberately NOT a hand-maintained static file: this app's Blogs
 * feature works by dropping a .md file into src/content/blog/ and
 * nothing else (see src/utils/blogPosts.js's own docstring for that
 * decision) — a sitemap that needed a second, manual step every time a
 * post was added would quietly break that promise. Instead this script
 * scans that same folder directly and regenerates the whole file fresh
 * on every build, so it can never drift out of sync with what's
 * actually there.
 *
 * Only includes URLs that are genuinely public and crawlable without
 * logging in:
 *   - the landing page itself
 *   - every blog post at /blog/:slug
 * Deliberately excludes anything behind the authenticated app shell
 * (the dashboard, calendar, billing, etc. — none of that is reachable
 * or meaningful to a crawler with no session) and /connect-page/:token,
 * which public/robots.txt already blocks outright since it carries a
 * live, sensitive, single-use invite token in the URL itself.
 */
const fs = require('fs');
const path = require('path');

const SITE_URL = process.env.SITE_URL || 'https://www.aeo-app.ai';
const BLOG_CONTENT_DIR = path.join(__dirname, '..', 'src', 'content', 'blog');
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'sitemap.xml');

function parseDateFromFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const dateLine = match[1].split(/\r?\n/).find(line => /^date:/.test(line));
  if (!dateLine) return null;
  const value = dateLine.replace(/^date:\s*/, '').replace(/^["']|["']$/g, '').trim();
  return value || null;
}

function loadBlogEntries() {
  if (!fs.existsSync(BLOG_CONTENT_DIR)) return [];
  return fs
    .readdirSync(BLOG_CONTENT_DIR)
    .filter(filename => filename.endsWith('.md'))
    .map(filename => {
      const raw = fs.readFileSync(path.join(BLOG_CONTENT_DIR, filename), 'utf8');
      const slug = filename.replace(/\.md$/, '');
      const date = parseDateFromFrontmatter(raw);
      return { slug, date };
    });
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return [
    '  <url>',
    `    <loc>${loc}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n');
}

function generate() {
  const posts = loadBlogEntries();
  const today = new Date().toISOString().slice(0, 10);

  const entries = [
    urlEntry(`${SITE_URL}/`, today, 'weekly', '1.0'),
    urlEntry(`${SITE_URL}/blog`, today, 'weekly', '0.8'),
    ...posts.map(p => urlEntry(`${SITE_URL}/blog/${p.slug}`, p.date || today, 'monthly', '0.7')),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries.join('\n'),
    '</urlset>',
    '',
  ].join('\n');

  fs.writeFileSync(OUTPUT_PATH, xml, 'utf8');
  console.log(`[generate-sitemap] wrote ${OUTPUT_PATH} — 1 landing page + ${posts.length} blog post(s)`);
}

generate();
