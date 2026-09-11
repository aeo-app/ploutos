import React, { useState, useEffect } from 'react';
import { loadBlogPosts, formatBlogDate, estimateReadTime } from '../utils/blogPosts';
import s from './PublicBlogIndexPage.module.css';

/**
 * Reached at /blog — same standalone-outside-the-authenticated-app
 * pattern as PublicBlogPostPage.js and ConnectPageApprovalPage.js (see
 * App.js's top-level path check). This is the actual "blog index" a
 * crawler or human visitor lands on to see every post — the landing
 * page's own Blog section only ever teases the 3 most recent.
 */
export function PublicBlogIndexPage({ initialPosts }) {
  const [posts, setPosts] = useState(initialPosts || undefined);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initialPosts) return; // prerender already resolved this — skip the fetch entirely
    loadBlogPosts().then(setPosts).catch(e => setError(e.message || 'Could not load posts.'));
    // eslint-disable-next-line
  }, []);

  return (
    <div className={s.wrap}>
      <div className={s.topBar}>
        <a href="/" className={s.brand}>AEO<span className={s.brandAccent}>Intel</span></a>
        <a href="/" className={s.homeLink}>← Back to home</a>
      </div>

      <div className={s.content}>
        <h1 className={s.pageTitle}>Blog</h1>
        <p className={s.pageSub}>Articles and updates from the AEO Intel team.</p>

        {error && <div className={s.error}>{error}</div>}
        {posts === undefined && !error && <div className={s.loading}>Loading…</div>}
        {posts && posts.length === 0 && <div className={s.loading}>No posts yet.</div>}

        <div className={s.grid}>
          {(posts || []).map(post => (
            <a key={post.slug} className={s.card} href={`/blog/${post.slug}`}>
              {post.featured_image && <img className={s.cardImage} src={post.featured_image} alt="" />}
              <div className={s.cardBody}>
                <div className={s.cardMeta}>
                  {post.category && <span className={s.categoryBadge}>{post.category}</span>}
                  <span>{formatBlogDate(post.date)}</span>
                  <span>·</span>
                  <span>{estimateReadTime(post.body)}</span>
                </div>
                <h2 className={s.cardTitle}>{post.title}</h2>
                {post.excerpt && <p className={s.cardExcerpt}>{post.excerpt}</p>}
                {post.author && <div className={s.cardAuthor}>By {post.author}</div>}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
