const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#06B6D4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const CHECKLIST = [
  'Learns your brand voice and priority prompts, then applies fixes automatically across your site.',
  'Runs a continuous audit-and-fix loop: schema, content and technical issues resolved as they’re found.',
  'Builds your social media calendar and publishes to Instagram, Facebook, LinkedIn, Google My Business and YouTube on schedule.',
  'Frees you from needing a dedicated marketing hire to keep every channel active and every engine tracked.',
];

const STATS = [
  ['Audits run', 'Daily'],
  ['Engines tracked', '6'],
  ['Channels automated', '5'],
  ['Marketing hires needed', '0'],
];

export default function Agent() {
  return (
    <section className="dark">
      <div className="wrap agent-grid">
        <div>
          <span className="eyebrow">Your AI growth agent</span>
          <h2 style={{ color: 'var(--white)', fontSize: 'clamp(24px,3vw,32px)', marginTop: 14 }}>
            One agent that audits, fixes, ranks and posts — so you don't need a marketing hire.
          </h2>
          <ul className="checklist" style={{ marginTop: 28 }}>
            {CHECKLIST.map((text) => (
              <li key={text}>
                <span className="tick"><Check /></span>
                <p>{text}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="agent-panel">
          {STATS.map(([label, value]) => (
            <div className="row" key={label}><span>{label}</span><span>{value}</span></div>
          ))}
        </div>
      </div>
    </section>
  );
}
