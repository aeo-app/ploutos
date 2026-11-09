import { useState, useEffect, useRef } from 'react';
import { loadBlogPosts, formatBlogDate, estimateReadTime } from '../../../utils/blogPosts';

const ArrowIcon = ({ flip }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={flip ? { transform: 'rotate(180deg)' } : undefined}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export default function Blog({ initialPosts }) {
  const [posts, setPosts] = useState(initialPosts || []);
  const trackRef = useRef(null);

  useEffect(() => {
    if (initialPosts) return; // prerender already resolved this — skip the fetch entirely
    loadBlogPosts()
      .then(all => setPosts(all)) // every post — the landing page carousel swipes through all of them, not just the latest 3
      .catch(() => {}); // landing page degrades gracefully to an empty section rather than an error
    // eslint-disable-next-line
  }, []);

  const scrollByCard = (dir) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector('.blog-card');
    const amount = (card ? card.offsetWidth + 20 : 300) * dir;
    track.scrollBy({ left: amount, behavior: 'smooth' });
  };

  if (posts.length === 0) return null;

  return (
    <section id="blog" className="sec tint topline">
      <div className="sec-in">
        <div className="blog-head">
          <div className="blog-title">
            <p className="eyebrow">From the blog</p>
            <h2>Practical guides on getting found.</h2>
          </div>
          <div className="blog-nav">
            <button type="button" aria-label="Previous articles" onClick={() => scrollByCard(-1)}><ArrowIcon flip /></button>
            <button type="button" aria-label="Next articles" onClick={() => scrollByCard(1)}><ArrowIcon /></button>
          </div>
        </div>

        <div className="blog-carousel">
          <div className="blog-track" ref={trackRef}>
            {posts.map((p) => (
              <a className="blog-card" href={`/blog/${p.slug}`} key={p.slug}>
                {p.featured_image ? (
                  <div
                    className="blog-img"
                    role="img" aria-label={p.title}
                    style={{ backgroundImage: `url(${p.featured_image})` }}
                  />
                ) : (
                  <div className="blog-img blog-img-ph"><span>{p.category || 'Article'}</span></div>
                )}
                <span className="tag">{formatBlogDate(p.date)} · {estimateReadTime(p.body)}</span>
                <h4>{p.title}</h4>
                <p>{p.excerpt}</p>
              </a>
            ))}
          </div>
        </div>

        <p className="blog-all">
          <a href="/blog">View all articles</a>
        </p>
      </div>
    </section>
  );
}
