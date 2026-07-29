function FootCol({ title, links }) {
  return (
    <div>
      <div className="foot-col-h">{title}</div>
      <div className="foot-col">
        {links.map((l) => <a href="#" key={l}>{l}</a>)}
      </div>
    </div>
  );
}

export default function Footer() {
  return (
    <footer className="foot">
      <div className="foot-inner">
        <div className="foot-top">
          <div className="foot-brand">
            <a href="#top" className="logo">
              <span className="logo-mark">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 11.5L8 3l5 8.5M5 9h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="logo-text">aeo-app<span className="logo-dot">.ai</span></span>
            </a>
            <p className="foot-tag">
              Visibility infrastructure for the answer-engine era. Built in San Francisco, NYC and Lisbon.
            </p>
            <div className="foot-status">
              <span className="foot-status-dot" />
              <span>All systems normal · <span className="mono">99.98% uptime · 184ms p50</span></span>
            </div>
          </div>
          <FootCol title="Products" links={['Tracking', 'Citations', 'Prompts', 'Share of voice', 'Playbook', 'API']} />
          <FootCol title="Solutions" links={['Growth teams', 'Agencies', 'Enterprise', 'DTC', 'Fintech', 'SaaS']} />
          <FootCol title="Company" links={['About', 'Customers', 'Careers', 'Press', 'Partners', 'Contact']} />
        </div>
        <div className="foot-bot">
          <div className="foot-bot-left">
            <span>© 2026 aeo-app, Inc.</span>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Security</a>
            <a href="#">Cookies</a>
            <a href="#">Sitemap</a>
          </div>
          <span>SOC2 Type II · GDPR · CCPA · 548 Market St #88123, San Francisco</span>
        </div>
      </div>
    </footer>
  );
}
