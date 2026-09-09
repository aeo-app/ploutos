import { Arrow } from './icons.jsx';

export default function ThreeUp() {
  return (
    <section className="three-up">
      <div className="section">
        <div className="section-head">
          <div className="section-eyebrow"><span className="mono">04</span><span>Why aeo-app</span></div>
          <h2 className="section-title">
            One agent that <em>audits, fixes, and ships</em> for you.
          </h2>
        </div>
        <div className="three-up-grid">
          <article className="three-up-card">
            <h3>Your own AI agent, from day one</h3>
            <p>A dedicated agent learns your brand voice, products and goals — then recommends what to fix and ships it for you. Not generic advice.</p>
            <a href="#" className="three-up-link">Meet your agent <Arrow size={12} /></a>
          </article>
          <article className="three-up-card">
            <h3>Audit and automate in one loop</h3>
            <p>Scan your site for what's blocking AI crawlers, then let aeo-app ship the fixes — schema, llms.txt, content briefs and pull requests. No dev backlog.</p>
            <a href="#" className="three-up-link">See automations <Arrow size={12} /></a>
          </article>
          <article className="three-up-card">
            <h3>Proves ROI, not vanity scores</h3>
            <p>Connect GA, Search Console, HubSpot and Salesforce to tie AI visibility to traffic, leads and revenue — and report it to the board.</p>
            <a href="#" className="three-up-link">See analytics <Arrow size={12} /></a>
          </article>
        </div>
      </div>
    </section>
  );
}
