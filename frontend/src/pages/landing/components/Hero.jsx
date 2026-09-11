import { useState, useRef } from 'react';
import { Tick, Arrow, Caret, GoogleLogo, Sparkle } from './icons.jsx';
import ReportCard from './ReportCard.jsx';

function Ticker() {
  return (
    <div className="ticker">
      {/* <div className="ticker-info">
        <span className="ticker-info-dot" />
        <span>AI-search volume tracked today:</span>
        <span className="mono">$184.7m</span>
      </div> */}
    </div>
  );
}

function Nav({ onSignIn, onGetStarted }) {
  return (
    <div className="nav-wrap">
      <nav className="nav">
        <a href="#top" className="logo">
          <span className="logo-mark">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 11.5L8 3l5 8.5M5 9h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="logo-text">aeo-app<span className="logo-dot">.ai</span></span>
        </a>
        <div className="nav-links">
          <a className="nav-link" href="#solutions">Products <Caret /></a>
          <a className="nav-link" href="#solutions">Solutions <Caret /></a>
          <a className="nav-link" href="#blog">Blogs</a>
          <a className="nav-link" href="#pricing">Pricing</a>
        </div>
        <div className="nav-cta">
          <button type="button" className="nav-link" onClick={onSignIn}>Sign in</button>
          <a className="btn btn-ghost btn-sm" href="#contact">Contact sales</a>
          <button type="button" className="btn btn-dark btn-sm" onClick={onGetStarted}>
            Get started <Arrow size={12} />
          </button>
        </div>
      </nav>
    </div>
  );
}

export default function Hero({ onSignIn, onGetStarted }) {
  const [url, setUrl] = useState('');
  const [stage] = useState('idle');
  const [report] = useState(null);
  const inputRef = useRef(null);

  const submit = (e) => {
    e?.preventDefault();
    const v = url.trim();
    if (!v) { inputRef.current?.focus(); return; }
    onGetStarted?.(v);
  };

  return (
    <section className="hero-wrap" id="top">
      <div className="hero-mesh" />
      <div className="hero-mesh-grid" />
      <Ticker />
      <Nav onSignIn={onSignIn} onGetStarted={() => onGetStarted?.()} />
      <div className="hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <div className="hero-eyebrow">
              <Sparkle />
              <span>AUDIT · ANALYZE · AUTOMATE · IMPROVE RANKING</span>
              <Arrow size={12} />
            </div>
            <h1 className="hero-title">
              Your AI Growth Hacker. <em>You select prompts, we deliver ranking.</em>
            </h1>
            <p className="hero-sub">
              Get your AEO audits and automate the marketing to improve your visibility across every
              AI model — ChatGPT, Claude, Perplexity and Gemini — so your brand shows up in the answer.
            </p>
            <div className="hero-ctas">
              <button type="button" className="btn btn-primary btn-lg" onClick={() => onGetStarted?.()}>
                Start now <Arrow className="btn-arrow" size={13} />
              </button>
              <button type="button" className="btn btn-google btn-lg" onClick={() => onGetStarted?.()}>
                <GoogleLogo /> Sign up with Google
              </button>
            </div>
          </div>

          <div className="hero-card">
            <ReportCard stage={stage} report={report} />
          </div>
        </div>
      </div>

      <div className="audit-pop" id="audit">
        <form onSubmit={submit} className="audit-row">
          <span className="audit-prefix">https://</span>
          <input
            ref={inputRef}
            className="audit-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="your-domain.com"
            spellCheck={false}
            autoCapitalize="off"
          />
          <button type="submit" className="btn btn-primary">
            Get AEO Audit Report <span className="price-tag"></span>
          </button>
        </form>
        <div className="audit-meta">
          <span><Tick /> 47-page PDF in &lt; 4 min</span>
          <span><Tick /> 14 engines · 500 prompts</span>
          <span><Tick /> No card required</span>
        </div>
      </div>
      <div className="hero-mesh-fade" />
    </section>
  );
}
