/**
 * src/utils/blogPosts.js — loads Markdown blog posts from src/content/blog/
 * ============================================================================
 * Adding or updating a post is JUST creating/editing a .md file in that
 * folder — nothing else needs to change anywhere in the code. This works
 * via two Webpack-native mechanisms that don't need CRA to be ejected or
 * any custom loader config:
 *
 *   1. require.context() — discovers every .md file in the folder at BUILD
 *      time, so a new file is picked up automatically on the next build/
 *      deploy, with no manifest file to remember to update.
 *   2. Each require()'d path resolves to a URL (CRA's default asset-module
 *      handling for unrecognized extensions), which is then fetch()'d at
 *      RUNTIME to get the actual raw text content.
 *
 * Frontmatter (the --- delimited block at the top of each file) is parsed
 * with a small hand-rolled parser rather than pulling in a YAML library —
 * the format used here is deliberately flat (simple key: value pairs, no
 * nesting), which is all a blog post's metadata needs.
 */

const postContext = require.context('../content/blog', false, /\.md$/);

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };

  const [, frontmatterBlock, body] = match;
  const meta = {};
  frontmatterBlock.split(/\r?\n/).forEach(line => {
    const lineMatch = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!lineMatch) return;
    const [, key, rawValue] = lineMatch;
    // Strip optional surrounding quotes - "like this" or 'like this'
    meta[key] = rawValue.replace(/^["']|["']$/g, '').trim();
  });
  return { meta, body: body.trim() };
}

function slugFromFilename(filename) {
  return filename.replace(/^\.\//, '').replace(/\.md$/, '');
}

let _cache = null;

/**
 * Returns every post, newest first, each as:
 * { slug, title, date, author, category, featured_image, excerpt, body }
 * Cached after the first successful load — fetch() only needs to run once
 * per page session, not once per component that reads posts.
 */
export async function loadBlogPosts() {
  if (_cache) return _cache;

  const filenames = postContext.keys(); // e.g. ['./why-your-h1-doesnt-matter.md', ...]
  const posts = await Promise.all(
    filenames.map(async (filename) => {
      const url = postContext(filename);
      const res = await fetch(url);
      const raw = await res.text();
      const { meta, body } = parseFrontmatter(raw);
      return {
        slug: slugFromFilename(filename),
        title: meta.title || slugFromFilename(filename),
        date: meta.date || '',
        author: meta.author || '',
        category: meta.category || '',
        featured_image: meta.featured_image || '',
        excerpt: meta.excerpt || '',
        body,
      };
    })
  );

  posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  _cache = posts;
  return posts;
}

export async function loadBlogPost(slug) {
  const posts = await loadBlogPosts();
  return posts.find(p => p.slug === slug) || null;
}

export function formatBlogDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function estimateReadTime(body) {
  const words = (body || '').trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min read`;
}
