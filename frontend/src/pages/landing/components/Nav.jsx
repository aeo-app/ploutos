import { useState } from 'react';

// Every tab is its own page with its own address (and is pre-rendered at build time, see scripts/prerender).
export const NAV_LINKS = [
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Blog', href: '/blog' },
];

export default function Nav({ onSignIn, onGetStarted, active }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="ln-nav">
      <div className="ln-nav-row">
        <a className="brand" href="/">
          <img className="brand-mark" src="/aeo-logo.png" alt="" aria-hidden="true" />
          <span className="brand-name">AEO App</span>
        </a>

        <nav id="ln-menu" className={'menu' + (open ? ' open' : '')} aria-label="Main">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} aria-current={active === l.href ? 'page' : undefined} className={active === l.href ? 'active' : undefined}>{l.label}</a>
          ))}
          <button type="button" className="menu-login" onClick={() => { setOpen(false); onSignIn?.(); }}>Log in</button>
        </nav>

        <div className="nav-ctas">
          <button type="button" className="login" onClick={onSignIn}>Log in</button>
          <button type="button" className="btn btn-primary" onClick={() => onGetStarted?.()}>Get free audit</button>
          <button
            type="button" className="menu-toggle" aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open} aria-controls="ln-menu" onClick={() => setOpen((o) => !o)}
          >
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
