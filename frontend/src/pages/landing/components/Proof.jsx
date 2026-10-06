const PersonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
  </svg>
);

export default function Proof() {
  return (
    <section style={{ background: 'var(--white)', borderTop: '1px solid var(--border)' }}>
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Social proof</span>
          <h2>Early results from our first customers.</h2>
        </div>
        <div className="proof-card">
          <div>
            <p className="big">
              AEO-APP.AI is already running growth for paying customers across Singapore and
              India. We're early — which means founders get direct access to the team building
              the product.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
              <div
                style={{
                  width: 44, height: 44, borderRadius: '50%', flex: 'none',
                  background: 'linear-gradient(135deg, var(--indigo), var(--cyan))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                }}
              >
                <PersonIcon />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--slate-light)' }}>
                Customer stories coming soon — with their name, role &amp; company
              </span>
            </div>
          </div>
          <div className="proof-stat">
            <div className="n">Live</div>
            <div className="l">In market</div>
          </div>
        </div>
      </div>
    </section>
  );
}
