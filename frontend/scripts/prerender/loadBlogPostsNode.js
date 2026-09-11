/**
 * scripts/prerender/loadBlogPostsNode.js — Node-native equivalent of
 * src/utils/blogPosts.js, for use ONLY by the prerender script.
 *
 * The real app's loader uses require.context() + fetch() against a
 * webpack-resolved asset URL — both are browser/webpack-only mechanisms
 * that don't exist in a plain Node process. This reads the exact same
 * src/content/blog/*.md files directly off disk instead, using the same
 * frontmatter parsing logic (kept in sync by hand — it's a few lines of
 * regex, not worth sharing a module across two very different runtimes
 * for).
 */
const fs = require('fs');
const path = require('path');

const BLOG_CONTENT_DIR = path.join(__dirname, '..', '..', 'src', 'content', 'blog');

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const [, frontmatterBlock, body] = match;
  const meta = {};
  frontmatterBlock.split(/\r?\n/).forEach(line => {
    const lineMatch = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!lineMatch) return;
    const [, key, rawValue] = lineMatch;
    meta[key] = rawValue.replace(/^["']|["']$/g, '').trim();
  });
  return { meta, body: body.trim() };
}

function loadBlogPostsSync() {
  if (!fs.existsSync(BLOG_CONTENT_DIR)) return [];
  const posts = fs
    .readdirSync(BLOG_CONTENT_DIR)
    .filter(f => f.endsWith('.md'))
    .map(filename => {
      const raw = fs.readFileSync(path.join(BLOG_CONTENT_DIR, filename), 'utf8');
      const slug = filename.replace(/\.md$/, '');
      const { meta, body } = parseFrontmatter(raw);
      return {
        slug,
        title: meta.title || slug,
        date: meta.date || '',
        author: meta.author || '',
        category: meta.category || '',
        featured_image: meta.featured_image || '',
        excerpt: meta.excerpt || '',
        body,
      };
    });
  posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return posts;
}

module.exports = { loadBlogPostsSync };
