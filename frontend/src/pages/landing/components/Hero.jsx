import { useState } from 'react';
import { CheckIcon } from './ui';
import { setSignupPrefill } from '../prefill';

const A = '/assets/landing';

export default function Hero({ onGetStarted }) {
  const [site, setSite] = useState('');
  const submit = (e) => {
    e.preventDefault();
    setSignupPrefill({ domain: site });   // the sign-up form picks this up
    onGetStarted?.();
  };

  return (
    <section className="hero" id="top">
      <div className="hero-in">
        <div className="hero-copy">
          <p className="eyebrow">Your AI marketing team</p>
          <h1>Get found on ChatGPT, Google <span className="accent">and everywhere.</span></h1>
          <p className="hero-lede">
            AEO App creates your images, reels and posts, publishes them to Google Business Profile,
            Instagram, Facebook, YouTube and LinkedIn, and makes sure AI search recommends your business.
          </p>
          <form id="audit" className="audit-form" onSubmit={submit}>
            <label htmlFor="site-hero" className="sr-only">Your website address</label>
            <input id="site-hero" type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck="false"
              autoComplete="url" placeholder="yourbusiness.com" value={site} onChange={(e) => setSite(e.target.value)} />
            <button type="submit" className="btn btn-primary btn-lg">Get my free audit</button>
          </form>
          <ul className="ticks">
            <li><CheckIcon size={16} />Free audit and 1 week of content</li>
            <li><CheckIcon size={16} />Takes about 60 seconds</li>
          </ul>
        </div>

        <div className="hero-visual">
          <div className="mock-shell">
            <div className="mock-card">
              <div className="mock-bar">
                <p>Lagoon Bay Resort · overview</p>
                <span className="pill">Example data</span>
              </div>
              <div className="mock-kpis">
                <div><p>AI visibility</p><b>72<small>/100</small></b></div>
                <div><p>Posts this month</p><b>26</b></div>
                <div><p>Channels live</p><b>5</b></div>
              </div>
              <p className="mock-label">Content calendar</p>
              <div className="mock-cal">
                <div>
                  <img src={`${A}/blog.jpeg`} alt="Infinity pool at sunset" width="800" height="600" />
                  <p className="t">Blog</p><p className="s ok">Published · Mon</p>
                </div>
                <div>
                  <div className="thumb">
                    <img src={`${A}/insta-reel-cover.jpeg`} alt="Reel cover: sunrise over the lagoon" width="432" height="672" />
                    <span className="play" aria-hidden="true"><svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M7 4l14 8-14 8z" /></svg></span>
                  </div>
                  <p className="t">Reel</p><p className="s ok">Published · Wed</p>
                </div>
                <div>
                  <div className="thumb">
                    <img src={`${A}/social-media.jpeg`} alt="Poster: overwater villas at sunset" width="600" height="640" />
                    <span className="poster-text">Weekend escape?</span>
                  </div>
                  <p className="t">Poster</p><p className="s sched">Scheduled · Fri</p>
                </div>
                <div>
                  <img src={`${A}/gmb.jpeg`} alt="Breakfast by the pool" width="700" height="700" />
                  <p className="t">GBP post</p><p className="s warn">Needs approval</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
