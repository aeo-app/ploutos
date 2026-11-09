const POST_TO = ['Google Business Profile', 'Instagram', 'Facebook', 'YouTube', 'LinkedIn', 'Forums & backlinks'];
const FOUND_ON = ['ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Claude', 'Grok', 'Meta AI', 'DeepSeek', 'Google'];

function Row({ label, items }) {
  return (
    <div className="plat-row">
      <p>{label}</p>
      {items.map((i) => <span key={i} className="chip">{i}</span>)}
    </div>
  );
}

export default function Platforms() {
  return (
    <section aria-label="Platforms" className="platforms">
      <div className="plat-in">
        <Row label="Creates & posts to" items={POST_TO} />
        <Row label="Gets you found on" items={FOUND_ON} />
      </div>
    </section>
  );
}
