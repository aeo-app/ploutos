import { scrollToSection } from '../scrollUtils';

export default function Nav({ onSignIn, onGetStarted }) {
  return (
    <header className="site-nav">
      <div className="wrap nav-row">
        <a className="brand" href="#top" onClick={(e) => scrollToSection('top', e)}>
          <span className="brand-mark">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 11.5L8 3l5 8.5M5 9h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>AEO-APP<em>.AI</em></span>
        </a>
        <nav className="menu">
          <a href="#product" onClick={(e) => scrollToSection('product', e)}>Product</a>
          <a href="#audience" onClick={(e) => scrollToSection('audience', e)}>Solutions</a>
          <a href="#pricing" onClick={(e) => scrollToSection('pricing', e)}>Pricing</a>
          <a href="/blog">Blog</a>
        </nav>
        <div className="nav-ctas">
          <button type="button" className="login" onClick={onSignIn}>Log in</button>
          <button type="button" className="btn btn-primary" onClick={() => onGetStarted?.()}>Start free audit</button>
        </div>
      </div>
    </header>
  );
}
