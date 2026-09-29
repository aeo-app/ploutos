import { scrollToSection } from '../scrollUtils';

export default function Hero({ onGetStarted }) {
  return (
    <section className="hero dark" id="top">
      <div className="wrap">
        <div>
          <span className="eyebrow">AEO · GEO · SEO · Digital Marketing</span>
          <h1>Growth Hacking, <span className="accent">Powered by AI.</span></h1>
          <p className="lede">
            AEO-APP.AI helps you audit your website, fix technical issues, improve your visibility
            across AI search and Google, and manage your marketing work from one platform. It also
            helps create and publish content across Instagram, Facebook, LinkedIn, Google Business
            Profile, and YouTube.
          </p>
          <div className="cta-row">
            <button type="button" className="btn btn-primary" onClick={() => onGetStarted?.()}>Start your free audit</button>
            <a className="btn btn-ghost-dark" href="#how" onClick={(e) => scrollToSection('how', e)}>See how it works</a>
          </div>
          <p className="trust-line">No credit card required · Cancel anytime</p>
        </div>
        <div className="mock">
          <div className="mock-top">
            <span className="mock-domain">This week · automated</span>
            <div className="mock-dots"><span /><span /><span /></div>
          </div>
          <div className="mock-feed">
            <span className="chip">Mon</span>
            <div>
              <p>"3 ways to get cited by ChatGPT" — carousel post drafted from your weekly prompt.</p>
              <div className="plat"><span>Instagram</span><span>·</span><span>Facebook</span></div>
            </div>
          </div>
          <div className="mock-feed">
            <span className="chip">Wed</span>
            <div>
              <p>New service reel — script, captions and thumbnail generated automatically.</p>
              <div className="plat"><span>YouTube</span><span>·</span><span>Instagram</span></div>
            </div>
          </div>
          <div className="mock-feed">
            <span className="chip">Fri</span>
            <div>
              <p>Weekly business update posted to your listing.</p>
              <div className="plat"><span>Google My Business</span><span>·</span><span>LinkedIn</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
