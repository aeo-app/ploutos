// Served from public/ as static files — see the note in HowItWorks.jsx for
// why these are plain URL paths rather than JS module imports.
const smeImg = process.env.PUBLIC_URL + '/assets/screens/audience-sme.png';
const agencyImg = process.env.PUBLIC_URL + '/assets/screens/audience-agency.png';

export default function Audience() {
  return (
    <section id="audience">
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">Who it's for</span>
          <h2>From solo founders to growing SMEs.</h2>
        </div>
        <div className="audience-grid">
          <div className="audience-card">
            <div
              style={{
                marginBottom: 20, borderRadius: 14, overflow: 'hidden', aspectRatio: '16 / 9',
                backgroundImage: `url(${smeImg})`, backgroundSize: 'cover', backgroundPosition: 'center',
              }}
              role="img"
              aria-label="SME owner running their shop/storefront, phone or laptop in hand"
            />
            <span className="tag">Growth-minded SMEs</span>
            <h3>Singapore &amp; India, today.</h3>
            <p>
              Built for teams without a dedicated marketing hire. You choose the prompts that
              matter to your business — AEO-APP.AI runs the audit, fixes what it can, and keeps
              your social channels posting on schedule and on-brand, without adding headcount.
            </p>
            <span className="pill">Available now</span>
          </div>
          <div className="audience-card soon">
            <div
              style={{
                marginBottom: 20, borderRadius: 14, overflow: 'hidden', aspectRatio: '16 / 9',
                backgroundImage: `url(${agencyImg})`, backgroundSize: 'cover', backgroundPosition: 'center',
              }}
              role="img"
              aria-label="Agency team reviewing multiple client dashboards together"
            />
            <span className="tag">Agencies &amp; multi-brand portfolios</span>
            <h3>Coming soon.</h3>
            <p>
              Multi-domain, multi-client support is on our roadmap. If you manage several brands
              and want early access, talk to us.
            </p>
            <span className="pill">Roadmap</span>
          </div>
        </div>
      </div>
    </section>
  );
}
