const PILLARS = [
  {
    cls: 'p1', title: 'AEO', text: 'Get cited inside ChatGPT, Gemini, Perplexity and Copilot.',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg>,
  },
  {
    cls: 'p2', title: 'GEO', text: 'Content structured the way generative engines read it.',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" /></svg>,
  },
  {
    cls: 'p3', title: 'SEO', text: 'Technical audits and on-page fixes, ranked in Google.',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>,
  },
  {
    cls: 'p4', title: '30-Day Content Calendar', text: 'A full month of posts planned and drafted for you.',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>,
  },
  {
    cls: 'p1', title: 'Auto-Posting', text: 'Published on schedule to Facebook, Instagram, LinkedIn & Google My Business.',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="6" cy="12" r="2.3" /><circle cx="18" cy="6" r="2.3" /><circle cx="18" cy="18" r="2.3" /><path d="M8.1 10.8l7.6-3.6M8.1 13.2l7.6 3.6" /></svg>,
  },
  {
    cls: 'p2', title: 'YouTube Reels', text: 'Short-form video, created and published automatically.',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9l5 3-5 3V9z" fill="currentColor" stroke="none" /></svg>,
  },
  {
    cls: 'p3', title: 'Backlinking', text: 'Builds the authority links that move your ranking.',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="12" r="5" /><circle cx="15" cy="12" r="5" /></svg>,
  },
  {
    cls: 'p4', title: 'Technical Fixes', text: 'Site issues found and resolved automatically.',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M3 12h3M18 12h3M4.9 19.1L7 17M17 7l2.1-2.1" /></svg>,
  },
];

export default function Product() {
  return (
    <section id="product">
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Our platform</span>
          <h2>Everything your growth stack needs, in one place.</h2>
          <p>AEO, GEO and SEO tracking, a 30-day content calendar, automated posting, and the technical work behind it all — one platform, no separate tools.</p>
        </div>
        <div className="pillars-grid">
          {PILLARS.map((p, i) => (
            <div className={`pillar ${p.cls}`} key={p.title + i}>
              <div className="icon">{p.icon}</div>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
