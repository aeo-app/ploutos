import { useState, useEffect } from 'react';
import { Arrow } from './icons.jsx';
import { loadBlogPosts, formatBlogDate, estimateReadTime } from '../../../utils/blogPosts';

export default function Blog({ initialPosts }) {
  const [posts, setPosts] = useState(initialPosts || []);

  useEffect(() => {
    if (initialPosts) return; // prerender already resolved this — skip the fetch entirely
    loadBlogPosts()
      .then(all => setPosts(all.slice(0, 3))) // most recent 3, for the landing page teaser
      .catch(() => {}); // landing page degrades gracefully to an empty section rather than an error
    // eslint-disable-next-line
  }, []);

  if (posts.length === 0) return null;

  return (
    <section className="section" id="blog">
      <div className="section-head">
        <div className="section-eyebrow"><span className="mono">08</span><span>From the journal</span></div>
        <h2 className="section-title">What's happening at <em>aeo-app.</em></h2>
      </div>
      <div className="posts">
        {posts.map((p, i) => (
          <a className="post" href={`/blog/${p.slug}`} key={p.slug}>
            {p.featured_image ? (
              <img className="post-thumb" src={p.featured_image} alt="" style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
            ) : (
              <div className="post-thumb" data-i={i % 3} />
            )}
            <div className="post-body">
              <div className="post-meta">
                <span>{p.category}</span><span>·</span><span>{formatBlogDate(p.date)}</span><span>·</span><span>{estimateReadTime(p.body)}</span>
              </div>
              <h3 className="post-title">{p.title}</h3>
              <p className="post-ex">{p.excerpt}</p>
              <span className="post-read">Read article <Arrow size={12} /></span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
