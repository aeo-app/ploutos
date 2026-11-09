import { useState } from 'react';
import { scrollToSection } from '../scrollUtils';

const LINKS = [
  { label: 'How it works', section: 'how' },
  { label: 'Features', section: 'features' },
  { label: 'Pricing', section: 'pricing' },
  { label: 'FAQ', section: 'faq' },
];

export default function Nav({ onSignIn, onGetStarted }) {
  const [open, setOpen] = useState(false);
  const go = (section) => (e) => { scrollToSection(section, e); setOpen(false); };

  return (
    <header className="ln-nav">
      <div className="ln-nav-row">
        <a className="brand" href="#top" onClick={go('top')}>
          <img className="brand-mark" src="/aeo-logo.png" alt="" aria-hidden="true" />
          <span className="brand-name">AEO App</span>
        </a>

        <nav id="ln-menu" className={'menu' + (open ? ' open' : '')} aria-label="Main">
          {LINKS.map((l) => (
            <a key={l.section} href={`#${l.section}`} onClick={go(l.section)}>{l.label}</a>
          ))}
          <a href="/blog">Blog</a>
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
