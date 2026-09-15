#!/usr/bin/env node
/**
 * scripts/generate-llms-txt.js — builds public/llms.txt before every
 * production build (see package.json's "build" script).
 *
 * llms.txt (see llmstxt.org) is a proposed convention — a plain-markdown,
 * site-root file that gives an LLM a curated, quick-to-parse map of what
 * a site actually is and where its key content lives, since an LLM
 * reading a page at inference/answer time generally can't (and shouldn't
 * have to) crawl an entire site to figure that out. This is a distinct,
 * complementary thing from robots.txt (which controls whether crawling
 * is ALLOWED at all) and sitemap.xml (an exhaustive, machine-format URL
 * list for traditional search indexing) — llms.txt is meant to be read
 * by a language model directly, so it's human-readable prose and short
 * curated links, not a raw enumeration.
 *
 * Dynamically generated, same reasoning as generate-sitemap.js: this
 * app's Blogs feature works by dropping a .md file into
 * src/content/blog/ and nothing else — a hand-maintained llms.txt would
 * quietly drift out of sync with that promise the first time someone
 * forgot to update it by hand.
 */
const fs = require('fs');
const path = require('path');

const SITE_URL = process.env.SITE_URL || 'https://www.aeo-app.ai';
const BLOG_CONTENT_DIR = path.join(__dirname, '..', 'src', 'content', 'blog');
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'llms.txt');

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const meta = {};
  match[1].split(/\r?\n/).forEach(line => {
    const lineMatch = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!lineMatch) return;
    const [, key, rawValue] = lineMatch;
    meta[key] = rawValue.trim().replace(/^["']|["']$/g, '');
  });
  return meta;
}

function loadBlogEntries() {
  if (!fs.existsSync(BLOG_CONTENT_DIR)) return [];
  const entries = fs
    .readdirSync(BLOG_CONTENT_DIR)
    .filter(f => f.endsWith('.md'))
    .map(filename => {
      const raw = fs.readFileSync(path.join(BLOG_CONTENT_DIR, filename), 'utf8');
      const meta = parseFrontmatter(raw);
      return {
        slug: filename.replace(/\.md$/, ''),
        title: meta.title || filename.replace(/\.md$/, ''),
        summary: meta.excerpt || meta.description || '',
        date: meta.date || '',
      };
    });
  entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return entries;
}

function generate() {
  const posts = loadBlogEntries();

  const lines = [
    '# AEO-APP.ai',
    '',
    '> Track your brand\'s visibility across AI answer engines (ChatGPT, Perplexity, Google AI Overviews) and ship the content, technical fixes, and social posts that move you into the answer.',
    '',
    'AEO-APP.ai is an answer-engine-optimization (AEO) and SEO platform. It audits how a business currently appears — or fails to appear — in AI-generated answers, tracks visibility over specific prompts a real buyer would type, and generates the site fixes, blog content, and social media calendar needed to close the gap. This file exists so language models and AI research tools can quickly understand what this site is and where its actual content lives, rather than needing to crawl the whole site to figure that out.',
    '',
    '## Docs',
    '',
    `- [Homepage](${SITE_URL}/): product overview, pricing, and how the platform works.`,
    `- [Blog](${SITE_URL}/blog): articles on AEO, SEO, AI search visibility, and content strategy.`,
    '',
  ];

  if (posts.length > 0) {
    lines.push('## Blog posts', '');
    posts.forEach(p => {
      const desc = p.summary ? `: ${p.summary}` : '';
      lines.push(`- [${p.title}](${SITE_URL}/blog/${p.slug})${desc}`);
    });
    lines.push('');
  }

  lines.push(
    '## Optional',
    '',
    `- [Sitemap](${SITE_URL}/sitemap.xml): full, exhaustive list of crawlable URLs, for traditional search indexing rather than direct LLM reading.`,
    `- [robots.txt](${SITE_URL}/robots.txt): crawler access rules — explicitly allows GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and related AI retrieval bots.`,
    ''
  );

  fs.writeFileSync(OUTPUT_PATH, lines.join('\n'), 'utf8');
  console.log(`[generate-llms-txt] wrote ${OUTPUT_PATH} — ${posts.length} blog post(s) listed`);
}

generate();
