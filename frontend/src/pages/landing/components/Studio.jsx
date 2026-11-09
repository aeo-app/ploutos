import { useEffect, useRef } from 'react';

const A = '/assets/landing';

export default function Studio() {
  const video = useRef(null);
  // Respect people who ask their device for less motion: show the poster, don't autoplay.
  useEffect(() => {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches && video.current) video.current.pause();
    } catch (_) { /* optional */ }
  }, []);

  return (
    <section id="studio" className="sec tint bordered">
      <div className="sec-in">
        <div className="studio-head">
          <div className="studio-title">
            <p className="eyebrow">AI content studio</p>
            <h2>One guest question. Five ready-to-post pieces.</h2>
            <p className="lead">Blogs, reels, posters and social posts, with images and video made for you. Here's what we created for a beach resort from one question.</p>
          </div>
          <div className="question-bubble">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            <span>“Best family resort for a weekend near Singapore?”</span>
          </div>
        </div>

        <div className="studio-grid">
          <article className="card-s">
            <p className="card-s-tag"><i style={{ background: '#1E4FD8' }} />Blog article</p>
            <img className="r43" src={`${A}/blog.jpeg`} alt="Infinity pool and beach at sunset" width="800" height="600" loading="lazy" />
            <div className="card-s-body">
              <p className="big">The perfect family weekend in Bintan: a complete guide</p>
              <p className="small">Website · Google</p>
            </div>
          </article>

          <article className="card-s">
            <p className="card-s-tag"><i style={{ background: '#C13584' }} />Instagram reel</p>
            <div className="tall reel">
              <video ref={video} src={`${A}/insta-reel.mp4`} poster={`${A}/reel-cover.jpg`} autoPlay muted loop playsInline preload="metadata"
                aria-label="Reel: sunrise over the lagoon and overwater villas" />
              <div className="reel-cap"><p>3 things to do on your first morning</p></div>
              <span className="reel-time">0:30</span>
            </div>
            <div className="card-s-body"><p className="small">30-sec video · Instagram, Facebook, YouTube Shorts</p></div>
          </article>

          <article className="card-s">
            <p className="card-s-tag"><i style={{ background: '#7C3AED' }} />Social poster</p>
            <div className="tall poster" role="img" aria-label="Poster: Weekend escape? Two nights in a pool villa">
              <div className="poster-top">
                <p className="h">Weekend escape?</p>
                <p className="sub">2 nights in a pool villa, from [PRICE]</p>
              </div>
              <img src={`${A}/social-media.jpeg`} alt="" width="600" height="640" loading="lazy" />
              <div className="poster-foot">LAGOON BAY</div>
            </div>
            <div className="card-s-body"><p className="small">On-brand design · Instagram, Facebook</p></div>
          </article>

          <article className="card-s">
            <p className="card-s-tag"><i style={{ background: '#0A66C2' }} />LinkedIn post</p>
            <div className="li-head">
              <span className="avatar" aria-hidden="true">LB</span>
              <span className="li-name"><strong>Lagoon Bay Resort</strong><br /><span>2d</span></span>
            </div>
            <p className="li-text">Planning your next team offsite? 3 reasons companies choose a short ferry ride over a long flight.</p>
            <img className="r21" src={`${A}/linkedin.jpeg`} alt="Seaside deck set up for a team meeting" width="1000" height="500" loading="lazy" />
            <div className="li-foot"><span>142 reactions</span><span>9 comments</span></div>
          </article>

          <article className="card-s">
            <p className="card-s-tag"><i style={{ background: '#0F7A55' }} />Google Business post</p>
            <img className="r11" src={`${A}/gmb.jpeg`} alt="Breakfast for two by the pool" width="700" height="700" loading="lazy" />
            <div className="card-s-body">
              <p className="mid">Book direct this month and breakfast for two is on us.</p>
              <p className="cta-txt">Book now</p>
            </div>
          </article>
        </div>
        <p className="fine-center">Sample content for a fictional resort.</p>
      </div>
    </section>
  );
}
