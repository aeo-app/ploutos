// Served from public/ as static files rather than imported through the JS
// module graph — an ES `import` of a binary image gets run through
// webpack's module/loader graph, which breaks some Windows builds (Node's
// CJS loader tries to parse the raw PNG bytes as JavaScript). A plain
// process.env.PUBLIC_URL path sidesteps that entirely since public/ files
// are just copied/served, never bundled.
const trackImg = process.env.PUBLIC_URL + '/assets/screens/track.png';
const analyzeImg = process.env.PUBLIC_URL + '/assets/screens/analyze.png';
const planImg = process.env.PUBLIC_URL + '/assets/screens/plan.png';
const auditImg = process.env.PUBLIC_URL + '/assets/screens/audit.png';
const agentImg = process.env.PUBLIC_URL + '/assets/screens/agent.png';

const TABS = [
  {
    id: 't1', label: '01 Track', title: 'Track',
    text: 'See where you rank across ChatGPT, Gemini, Perplexity, Copilot and Google for the prompts your customers actually ask.',
    fig: 'chatgpt.com · cited at #2 for "best [category] in Singapore"',
    img: trackImg,
    alt: 'Track tab: ranking list across ChatGPT, Gemini, Perplexity, Copilot & Google for your tracked prompts',
  },
  {
    id: 't2', label: '02 Analyze', title: 'Analyze',
    text: "Understand why competitors get cited and you don't — content gaps, missing schema, weak citations.",
    fig: '3 competitors outrank you on 12 tracked prompts',
    img: analyzeImg,
    alt: 'Analyze tab: side-by-side competitor comparison, content gaps highlighted',
  },
  {
    id: 't3', label: '03 Plan & Create', title: 'Plan & Create',
    text: 'Builds your social media calendar, then turns a single prompt into on-brand posts, reels and blogs.',
    fig: 'Next 7 days: 5 posts · 1 reel · 1 blog — drafted',
    img: planImg,
    alt: 'Plan & Create tab: 30-day content calendar with drafted posts, reels and blogs',
  },
  {
    id: 't4', label: '04 Audit', title: 'Audit',
    text: "A technical AEO/SEO audit flags what's broken; AEO-APP.AI fixes what it can automatically.",
    fig: '14 issues found · 9 fixed automatically',
    img: auditImg,
    alt: 'Audit tab: issue list with severity tags and an auto-fixed status per item',
  },
  {
    id: 't5', label: '05 Agent', title: 'Agent',
    text: "One agent runs the loop continuously — auditing, fixing, publishing — so you don't have to.",
    fig: 'Running since Aug 2026 · no manual steps this week',
    img: agentImg,
    alt: 'Agent tab: activity timeline showing recent automated actions',
  },
];

export default function HowItWorks() {
  return (
    <section id="how" style={{ background: 'var(--white)', borderBlock: '1px solid var(--border)' }}>
      <div className="wrap">
        <div className="head">
          <span className="eyebrow">How it works</span>
          <h2>The whole loop, in one workspace.</h2>
          <p>Track, analyze, plan, audit and automate — five tabs, one continuous loop.</p>
        </div>
        <div className="tabs">
          {TABS.map((t, i) => (
            <input key={t.id} className="tab-input" type="radio" name="tabs" id={t.id} defaultChecked={i === 0} />
          ))}
          <div className="tab-labels">
            {TABS.map((t) => <label htmlFor={t.id} key={t.id}>{t.label}</label>)}
          </div>
          <div className="tab-panels">
            {TABS.map((t, i) => (
              <div className={`tab-panel panel${i + 1}`} key={t.id}>
                <div>
                  <h4>{t.title}</h4>
                  <p>{t.text}</p>
                  <p className="fig" style={{ marginTop: 10 }}>{t.fig}</p>
                </div>
                <div className="tab-visual" style={{ borderRadius: 14, overflow: 'hidden', aspectRatio: '16 / 10', border: '1px solid var(--border)' }}>
                  <img src={t.img} alt={t.alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
