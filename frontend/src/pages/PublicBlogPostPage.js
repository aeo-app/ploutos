import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { loadBlogPost, formatBlogDate, estimateReadTime } from '../utils/blogPosts';
import s from './PublicBlogPostPage.module.css';

/**
 * Reached at /blog/:slug — deliberately outside the authenticated app
 * entirely (see App.js's top-level path check, same pattern as
 * ConnectPageApprovalPage). Blog posts need to be readable by anyone —
 * a human visitor, or an AI/search crawler — without logging in, or
 * public/robots.txt explicitly allowing crawlers has no actual content
 * for them to read.
 */
export function PublicBlogPostPage({ slug, initialPost }) {
  const [post, setPost] = useState(initialPost !== undefined ? initialPost : undefined); // undefined = loading, null = not found
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initialPost !== undefined) return; // prerender already resolved this — skip the fetch entirely
    loadBlogPost(slug)
      .then(setPost)
      .catch(e => setError(e.message || 'Could not load this post.'));
    // eslint-disable-next-line
  }, [slug]);

  return (
    <div className={s.wrap}>
      <div className={s.topBar}>
        <a href="/" className={s.brand}>AEO<span className={s.brandAccent}>Intel</span></a>
        <a href="/" className={s.homeLink}>← Back to home</a>
      </div>

      <div className={s.content}>
        {error && <div className={s.error}>{error}</div>}
        {post === undefined && !error && <div className={s.loading}>Loading…</div>}
        {post === null && !error && (
          <div className={s.notFound}>
            <div className={s.notFoundTitle}>Post not found</div>
            <div className={s.notFoundBody}>This post may have been moved or removed.</div>
          </div>
        )}
        {post && (
          <article>
            {post.featured_image && <img className={s.image} src={post.featured_image} alt="" />}
            <div className={s.meta}>
              {post.category && <span className={s.categoryBadge}>{post.category}</span>}
              <span>{formatBlogDate(post.date)}</span>
              <span>·</span>
              <span>{estimateReadTime(post.body)}</span>
              {post.author && <><span>·</span><span>By {post.author}</span></>}
            </div>
            <h1 className={s.title}>{post.title}</h1>
            <div className={s.body}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.body}</ReactMarkdown>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
