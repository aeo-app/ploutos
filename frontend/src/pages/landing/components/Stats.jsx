export default function Stats() {
  return (
    <section className="stats">
      <div className="stats-inner">
        <div className="stats-head">
          <div>
            <div className="section-eyebrow" style={{ color: 'rgba(255,255,255,0.7)' }}>
              <span className="mono">01</span>
              <span>By the numbers</span>
            </div>
            <h2 className="section-title">
              The world's growth teams <em>trust aeo-app</em> for AI visibility.
            </h2>
          </div>
          <p className="section-sub">
            Customers start their research in AI tools before they ever reach out to a product. We
            measure the prompts your buyers actually type, on the engines they actually use — from
            ChatGPT and Perplexity to Google AI Overviews and 11 more — every day.
          </p>
        </div>
        <div className="stats-grid">
          <div className="stat">
            <div className="stat-value"><em>40</em>%</div>
            <div className="stat-label">Average lift in AI-search visibility within the first 90 days.</div>
          </div>
          <div className="stat">
            <div className="stat-value"><em>206</em>%</div>
            <div className="stat-label">Share-of-voice improvement against tracked competitors.</div>
          </div>
          <div className="stat">
            <div className="stat-value"><em>1</em><span className="stat-unit">m+</span></div>
            <div className="stat-label">Qualified pipeline generated from AI search, across our cohort.</div>
          </div>
          <div className="stat">
            <div className="stat-value"><em>100</em>+</div>
            <div className="stat-label">Marketers, agencies and brands optimizing with aeo-app.</div>
          </div>
        </div>
        <div className="stats-viz" />
      </div>
    </section>
  );
}
