import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { loadBlogPosts, formatBlogDate, estimateReadTime } from '../utils/blogPosts';
import { SectionHeader, Badge, Empty, ErrorCard } from '../components/ui/UI';
import s from './BlogsPage.module.css';

/**
 * Deliberately read-only — per product decision, blog posts are authored
 * as .md files directly in the codebase (src/content/blog/), not through
 * any in-app UI. Adding or updating a post means adding/editing a file
 * there and redeploying — nothing in this component writes anything back.
 */
export function BlogsPage() {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(null);
  const [activeSlug, setActiveSlug] = useState(null);

  useEffect(() => {
    loadBlogPosts()
      .then(setPosts)
      .catch(e => setError(e.message || 'Could not load blog posts.'));
  }, []);

  const activePost = posts?.find(p => p.slug === activeSlug) || null;

  if (activeSlug && activePost) {
    return (
      <div className={s.page}>
        <button type="button" className={s.backBtn} onClick={() => setActiveSlug(null)}>← All posts</button>
        <BlogReader post={activePost} />
      </div>
    );
  }

  return (
    <div className={s.page}>
      <SectionHeader title="Blogs" subtitle="Articles and updates from the AEO Intel team." />

      {error && <ErrorCard message={error} />}
      {posts === null && !error && <div className={s.loadingRow}><span className={s.spinner} />Loading posts…</div>}
      {posts !== null && posts.length === 0 && (
        <Empty icon="📝" title="No posts yet" body="Add a .md file to src/content/blog to publish your first post." />
      )}

      <div className={s.grid}>
        {(posts || []).map(post => (
          <article key={post.slug} className={s.postCard} onClick={() => setActiveSlug(post.slug)}>
            {post.featured_image && <img className={s.cardImage} src={post.featured_image} alt="" />}
            <div className={s.cardBody}>
              <div className={s.cardMeta}>
                {post.category && <Badge variant="brand">{post.category}</Badge>}
                <span>{formatBlogDate(post.date)}</span>
                <span>·</span>
                <span>{estimateReadTime(post.body)}</span>
              </div>
              <h3 className={s.cardTitle}>{post.title}</h3>
              {post.excerpt && <p className={s.cardExcerpt}>{post.excerpt}</p>}
              {post.author && <div className={s.cardAuthor}>By {post.author}</div>}
              <span className={s.cardReadMore}>Read article →</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function BlogReader({ post }) {
  return (
    <article className={s.reader}>
      {post.featured_image && <img className={s.readerImage} src={post.featured_image} alt="" />}
      <div className={s.readerMeta}>
        {post.category && <Badge variant="brand">{post.category}</Badge>}
        <span>{formatBlogDate(post.date)}</span>
        <span>·</span>
        <span>{estimateReadTime(post.body)}</span>
        {post.author && <><span>·</span><span>By {post.author}</span></>}
      </div>
      <h1 className={s.readerTitle}>{post.title}</h1>
      <div className={s.readerBody}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.body}</ReactMarkdown>
      </div>
    </article>
  );
}
