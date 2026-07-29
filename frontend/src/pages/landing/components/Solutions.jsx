import { Arrow } from './icons.jsx';

export default function Solutions() {
  return (
    <section className="solutions section" id="solutions">
      <div className="section-head">
        <div className="section-eyebrow"><span className="mono">03</span><span>Built for every team</span></div>
        <h2 className="section-title">
          From <em>solo founders</em> to <em>publicly-traded</em> portfolios.
        </h2>
      </div>

      <div className="solution-row">
        <div>
          <div className="solution-eyebrow">For growth teams</div>
          <h3 className="solution-title">Win the prompts that drive pipeline.</h3>
          <p className="solution-body">
            We mine 500 buyer-intent prompts per domain, cluster them by funnel stage and tell you
            exactly which to defend first. Then we ship a playbook your writers can execute.
          </p>
          <a href="#contact" className="btn btn-dark">Talk to growth <Arrow className="btn-arrow" size={13} /></a>
          <div className="solution-stats">
            <div><div className="solution-stat-v">+412%</div><div className="solution-stat-l">AI citations / month</div></div>
            <div><div className="solution-stat-v">−71%</div><div className="solution-stat-l">Inbound CAC</div></div>
            <div><div className="solution-stat-v">8w</div><div className="solution-stat-l">Time to top-3</div></div>
          </div>
        </div>
        <div className="solution-visual solution-visual-1">
          <div className="solution-visual-mock">
            <div className="solution-mock-h">"best business banking"</div>
            <div className="solution-mock-v">#2</div>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 6 }}>across ChatGPT, Perplexity, Claude</div>
            <div className="solution-mock-row" style={{ marginTop: 14 }}>
              <span>"alternatives to X"</span><span className="solution-mock-rank">#4</span>
            </div>
            <div className="solution-mock-row"><span>"X vs Y for 2026"</span><span className="solution-mock-rank">#1</span></div>
            <div className="solution-mock-row"><span>"is X worth the price"</span><span className="solution-mock-rank">#3</span></div>
          </div>
        </div>
      </div>

      <div className="solution-row reverse">
        <div>
          <div className="solution-eyebrow">For agencies & portfolios</div>
          <h3 className="solution-title">One workspace. <em>Every brand.</em></h3>
          <p className="solution-body">
            Unlimited domains. White-label PDFs. Per-client portals. Real-time refresh on a watchlist
            of prompts, with a Postgres mirror for your warehouse.
          </p>
          <a href="#contact" className="btn btn-dark">See enterprise <Arrow className="btn-arrow" size={13} /></a>
          <div className="solution-stats">
            <div><div className="solution-stat-v">∞</div><div className="solution-stat-l">Domains tracked</div></div>
            <div><div className="solution-stat-v">1h</div><div className="solution-stat-l">Refresh interval</div></div>
            <div><div className="solution-stat-v">SOC2</div><div className="solution-stat-l">Type II</div></div>
          </div>
        </div>
        <div className="solution-visual solution-visual-2">
          <div className="solution-visual-mock">
            <div className="solution-mock-h">PORTFOLIO · 14 BRANDS</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}><div className="solution-mock-h">Avg AEO</div><div className="solution-mock-v">62</div></div>
              <div style={{ flex: 1 }}><div className="solution-mock-h">Citations/wk</div><div className="solution-mock-v">184</div></div>
            </div>
            <div className="solution-mock-row"><span>brand-a.com</span><span className="solution-mock-rank">+18%</span></div>
            <div className="solution-mock-row"><span>brand-b.com</span><span className="solution-mock-rank">+22%</span></div>
            <div className="solution-mock-row"><span>brand-c.com</span><span className="solution-mock-rank">+9%</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}
