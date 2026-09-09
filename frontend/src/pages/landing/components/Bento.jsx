import { Arrow } from './icons.jsx';

export default function Bento() {
  return (
    <section className="section-bento">
      <div className="section">
        <div className="section-head">
          <div className="section-eyebrow"><span className="mono">02</span><span>Products</span></div>
          <h2 className="section-title">
            One platform. Every <em>answer engine.</em>
          </h2>
          <p className="section-sub">
            Track. Diagnose. Ship. From single-domain audits to multi-brand portfolios with
            millions of tracked prompts.
          </p>
        </div>

        <div className="bento">
          <article className="bento-card span-3">
            <h3 className="bento-title">Answer-engine ranking</h3>
            <p className="bento-body">
              See exactly where you surface across ChatGPT, Perplexity, Claude, Gemini and 10 more —
              for every prompt your buyers ask.
            </p>
            <a href="#" className="bento-link">Explore tracking <Arrow size={13} /></a>
            <div className="bento-visual gradient-1">
              <div className="bento-mock" style={{ top: 16, left: 18, fontSize: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 11 }}>ChatGPT</div>
                <div style={{ color: '#1e8c5a' }}>#2 ↑12</div>
              </div>
              <div className="bento-mock" style={{ bottom: 20, right: 22, fontSize: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 11 }}>Perplexity</div>
                <div style={{ color: '#1e8c5a' }}>#4 ↑8</div>
              </div>
              <div className="bento-mock" style={{ top: '45%', left: '45%', fontSize: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 11 }}>Claude</div>
                <div style={{ color: '#1e8c5a' }}>#5 ↑6</div>
              </div>
            </div>
          </article>

          <article className="bento-card span-3">
            <h3 className="bento-title">Citation tracking</h3>
            <p className="bento-body">
              Daily crawls of which sources the engines cite, paired with the article,
              paragraph and quote they pulled.
            </p>
            <a href="#" className="bento-link">See citations <Arrow size={13} /></a>
            <div className="bento-visual gradient-2">
              <div className="bento-mock" style={{ top: 18, left: 18, right: 18, padding: 14 }}>
                <div style={{ fontSize: 10, color: 'var(--fg-mute)' }}>SOURCE</div>
                <div style={{ fontWeight: 600, fontSize: 12, marginTop: 2 }}>company.com/best-tools-2026</div>
                <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--fg-dim)', fontStyle: 'italic' }}>
                  "...with the best citation score in independent testing..."
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 6, fontSize: 9.5 }}>
                  <span style={{ padding: '2px 7px', background: '#e6f7ed', color: '#1e8c5a', borderRadius: 4 }}>Cited 3×</span>
                  <span style={{ padding: '2px 7px', background: '#efeefe', color: '#3a31d4', borderRadius: 4 }}>ChatGPT · Claude · Gemini</span>
                </div>
              </div>
            </div>
          </article>

          <article className="bento-card span-2">
            <h3 className="bento-title">Prompt clustering</h3>
            <p className="bento-body">
              500+ buyer-intent prompts per domain, grouped by funnel stage.
            </p>
            <a href="#" className="bento-link">Learn more <Arrow size={13} /></a>
            <div className="bento-visual gradient-3">
              <div className="bento-mock" style={{ top: 14, left: 14, right: 14, padding: 12, fontSize: 9.5 }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <span style={{ padding: '3px 7px', background: '#e3e8ee', borderRadius: 999 }}>pricing</span>
                  <span style={{ padding: '3px 7px', background: '#635bff', color: 'white', borderRadius: 999 }}>vs competitor</span>
                  <span style={{ padding: '3px 7px', background: '#e3e8ee', borderRadius: 999 }}>integrations</span>
                  <span style={{ padding: '3px 7px', background: '#e3e8ee', borderRadius: 999 }}>reviews</span>
                  <span style={{ padding: '3px 7px', background: '#e3e8ee', borderRadius: 999 }}>alternatives</span>
                </div>
              </div>
            </div>
          </article>

          <article className="bento-card span-2">
            <h3 className="bento-title">Share of voice</h3>
            <p className="bento-body">Track 3 rivals — named, linked, quoted — week over week.</p>
            <a href="#" className="bento-link">Benchmark <Arrow size={13} /></a>
            <div className="bento-visual gradient-4">
              <div className="bento-mock" style={{ top: 14, left: 14, right: 14, padding: 12, fontSize: 9.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span>You</span><span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>42%</span>
                </div>
                <div style={{ height: 4, background: '#635bff', borderRadius: 2, marginBottom: 8 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span>Rival A</span><span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>28%</span>
                </div>
                <div style={{ height: 4, width: '67%', background: 'var(--fg-mute)', borderRadius: 2, marginBottom: 8 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span>Rival B</span><span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>19%</span>
                </div>
                <div style={{ height: 4, width: '45%', background: 'var(--line-strong)', borderRadius: 2 }} />
              </div>
            </div>
          </article>

          <article className="bento-card span-2">
            <h3 className="bento-title">Content playbook</h3>
            <p className="bento-body">Auto-briefs: which sub-topic, schema, sources to cite.</p>
            <a href="#" className="bento-link">View playbooks <Arrow size={13} /></a>
            <div className="bento-visual gradient-5">
              <div className="bento-mock" style={{ top: 14, left: 14, right: 14, padding: 12, fontSize: 10 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 99, background: '#1e8c5a', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 7 }}>✓</span>
                  <span style={{ textDecoration: 'line-through', color: 'var(--fg-mute)' }}>Add FAQ schema</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 99, background: '#1e8c5a', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 7 }}>✓</span>
                  <span style={{ textDecoration: 'line-through', color: 'var(--fg-mute)' }}>Cite G2 stats</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 99, background: 'var(--bg-2)', border: '1px solid var(--line-strong)' }} />
                  <span style={{ fontWeight: 500 }}>Publish comparison</span>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
