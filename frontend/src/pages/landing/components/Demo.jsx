import { useState } from 'react';

// Example results for a typical business in each industry (not live data).
const DATA = [
  { id: 'resort', name: 'Resort',
    questions: [
      { text: 'Best family resorts near Singapore for a weekend', status: 'Not mentioned', ok: false },
      { text: 'Bintan resorts with private pool villas', status: 'Mentioned · #3', ok: true },
      { text: 'Where to hold a company retreat near Singapore', status: 'Not mentioned', ok: false },
    ],
    plan: [{ type: 'Blog', title: 'A family weekend in Bintan' }, { type: 'Reel', title: '3 things to do on your first morning' }, { type: 'Google post', title: 'Book direct: free breakfast' }] },
  { id: 'movers', name: 'Movers',
    questions: [
      { text: 'Best international movers in Singapore', status: 'Not mentioned', ok: false },
      { text: 'How much does moving overseas cost?', status: 'Not mentioned', ok: false },
      { text: 'Reliable movers for a 3-room HDB', status: 'Mentioned · #5', ok: true },
    ],
    plan: [{ type: 'Blog', title: 'Overseas moving costs explained' }, { type: 'Reel', title: '3 things to do before you move' }, { type: 'Google post', title: 'Free quote this month' }] },
  { id: 'cleaning', name: 'Cleaning company',
    questions: [
      { text: 'Best home cleaning service in Singapore', status: 'Not mentioned', ok: false },
      { text: 'How much does post-renovation cleaning cost?', status: 'Mentioned · #4', ok: true },
      { text: 'Office cleaning companies near Jurong', status: 'Not mentioned', ok: false },
    ],
    plan: [{ type: 'Reel', title: 'Before & after: kitchen deep clean' }, { type: 'Blog', title: 'Post-renovation cleaning checklist' }, { type: 'Google post', title: 'First clean 20% off' }] },
  { id: 'food', name: 'Restaurants',
    questions: [
      { text: 'Good date-night restaurants in Tanjong Pagar', status: 'Not mentioned', ok: false },
      { text: 'Halal Italian food in Singapore', status: 'Mentioned · #2', ok: true },
      { text: 'Restaurants with private dining rooms', status: 'Not mentioned', ok: false },
    ],
    plan: [{ type: 'Reel', title: 'Behind the kitchen pass' }, { type: 'Poster', title: 'New weekend set menu' }, { type: 'Google post', title: 'Book a private room' }] },
  { id: 'retail', name: 'Retail stores',
    questions: [
      { text: 'Where to buy running shoes in Orchard', status: 'Not mentioned', ok: false },
      { text: 'Best gift shops in Singapore', status: 'Mentioned · #5', ok: true },
      { text: 'Shops open late near Bugis', status: 'Not mentioned', ok: false },
    ],
    plan: [{ type: 'Poster', title: 'Weekend sale: up to 30% off' }, { type: 'Reel', title: 'New arrivals this week' }, { type: 'Google post', title: 'Store hours & directions' }] },
  { id: 'health', name: 'Health',
    questions: [
      { text: 'GP clinic open on Sunday near Bedok', status: 'Not mentioned', ok: false },
      { text: 'How much is a health screening in Singapore?', status: 'Not mentioned', ok: false },
      { text: 'Best physiotherapy for back pain', status: 'Mentioned · #3', ok: true },
    ],
    plan: [{ type: 'Blog', title: 'Health screening packages explained' }, { type: 'Reel', title: 'When to see a physio' }, { type: 'Google post', title: 'Sunday clinic hours' }] },
  { id: 'beauty', name: 'Beauty',
    questions: [
      { text: 'Best facial in Singapore for acne', status: 'Mentioned · #2', ok: true },
      { text: 'Korean hair salon near Tanjong Pagar', status: 'Not mentioned', ok: false },
      { text: 'How much are eyelash extensions?', status: 'Not mentioned', ok: false },
    ],
    plan: [{ type: 'Reel', title: 'Facial: before and after' }, { type: 'Poster', title: 'New client offer' }, { type: 'Blog', title: 'Lash extension aftercare' }] },
  { id: 'wellness', name: 'Wellness',
    questions: [
      { text: 'Best massage in Singapore for stress', status: 'Not mentioned', ok: false },
      { text: 'Yoga studios for beginners near Tiong Bahru', status: 'Mentioned · #4', ok: true },
      { text: 'Corporate wellness programmes in Singapore', status: 'Not mentioned', ok: false },
    ],
    plan: [{ type: 'Reel', title: '5-minute desk stretch' }, { type: 'Blog', title: 'Yoga for complete beginners' }, { type: 'LinkedIn', title: 'Wellness days for teams' }] },
  { id: 'realestate', name: 'Real estate',
    questions: [
      { text: 'Best property agent for HDB resale', status: 'Not mentioned', ok: false },
      { text: 'Is now a good time to buy a condo in Singapore?', status: 'Not mentioned', ok: false },
      { text: 'New condo launches near an MRT station', status: 'Mentioned · #5', ok: true },
    ],
    plan: [{ type: 'Blog', title: 'HDB resale, step by step' }, { type: 'Reel', title: 'Showflat walkthrough' }, { type: 'LinkedIn', title: 'This month’s market update' }] },
  { id: 'it', name: 'Information technology',
    questions: [
      { text: 'Best IT support company for SMEs in Singapore', status: 'Not mentioned', ok: false },
      { text: 'Managed cloud services in Singapore', status: 'Mentioned · #4', ok: true },
      { text: 'How to protect a small business from ransomware', status: 'Not mentioned', ok: false },
    ],
    plan: [{ type: 'Blog', title: 'Ransomware checklist for SMEs' }, { type: 'LinkedIn', title: '3 signs you’ve outgrown your IT' }, { type: 'Reel', title: 'Backups in 60 seconds' }] },
  { id: 'others', name: 'Others',
    questions: [
      { text: 'Best [your service] near me', status: 'Not mentioned', ok: false },
      { text: 'How much does [your service] cost?', status: 'Not mentioned', ok: false },
      { text: '[Your service] with good reviews', status: 'Mentioned · #4', ok: true },
    ],
    plan: [{ type: 'Blog', title: 'Answering your top customer question' }, { type: 'Reel', title: 'Meet the team' }, { type: 'Google post', title: 'This month’s offer' }] },
];

export default function Demo({ onGetStarted }) {
  const [current, setCurrent] = useState('resort');
  const active = DATA.find((d) => d.id === current) || DATA[0];

  return (
    <section className="sec tint bordered" id="demo">
      <div className="sec-in split top">
        <div className="split-copy">
          <p className="eyebrow">See it in action</p>
          <h2>Try AEO App for your business.</h2>
          <p className="lead">Pick a business type to see what customers ask AI, whether a typical business shows up, and the content we'd create first.</p>
          <div role="group" aria-label="Choose an industry" className="pills">
            {DATA.map((d) => (
              <button key={d.id} type="button" className={'pill-btn' + (d.id === current ? ' on' : '')}
                aria-pressed={d.id === current} onClick={() => setCurrent(d.id)}>{d.name}</button>
            ))}
          </div>
          <a className="link-arrow" href="#audit" onClick={(e) => { e.preventDefault(); onGetStarted?.(); }}>
            Run it on my own website
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </a>
        </div>

        <div className="demo-panel" aria-live="polite">
          <div className="demo-head">
            <p>{active.name}: sample results</p>
            <span className="pill">Example data</span>
          </div>
          <p className="demo-label">Questions customers ask AI</p>
          <div>
            {active.questions.map((q) => (
              <div className="q-row" key={q.text}>
                <span>“{q.text}”</span>
                <span className={'q-status ' + (q.ok ? 'good' : 'bad')}>{q.status}</span>
              </div>
            ))}
          </div>
          <p className="demo-label spaced">Content we'd create first</p>
          <div className="plan-grid">
            {active.plan.map((p) => (
              <div className="plan-card" key={p.title}><p className="type">{p.type}</p><p className="ttl">{p.title}</p></div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
