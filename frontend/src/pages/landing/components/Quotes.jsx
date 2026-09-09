import { useState } from 'react';
import { Arrow } from './icons.jsx';

const QUOTES = [
  {
    co: 'Mercury', accent: '#635bff',
    quote: 'aeo-app is the only tool that told us which paragraph the answer engines actually quote. That changed everything about how we brief writers.',
    name: 'Diego Marín', role: 'Director, SEO/AEO at Mercury',
    avatarBg: 'linear-gradient(135deg, #635bff, #b56cff)', initials: 'DM',
    stats: [
      { v: '9/9', l: 'Major engines won, in one quarter' },
      { v: '+2.3pt', l: 'Share of voice gained on key prompts' },
      { v: '12 weeks', l: 'End-to-end implementation' }
    ]
  },
  {
    co: 'Northbeam', accent: '#ff8a65',
    quote: 'We were invisible in ChatGPT eight weeks ago. Now we own three of the top five citations on the prompt that drives 38% of our pipeline.',
    name: 'Hannah Lo', role: 'Head of Growth at Northbeam',
    avatarBg: 'linear-gradient(135deg, #ff6ec7, #ff8a65)', initials: 'HL',
    stats: [
      { v: '+412%', l: 'AI citations per month, ongoing' },
      { v: '−71%', l: 'Inbound CAC versus baseline' },
      { v: '8 weeks', l: 'To reach top-3 visibility' }
    ]
  },
  {
    co: 'Cradlewise', accent: '#06d6a0',
    quote: 'The playbook told our writers exactly which review to cite. That was the unlock that scaled our hardware checkout by 3.4×.',
    name: 'Priya Subramanian', role: 'Brand Director at Cradlewise',
    avatarBg: 'linear-gradient(135deg, #06d6a0, #4cc9f0)', initials: 'PS',
    stats: [
      { v: '3.4×', l: 'Checkout volume month over month' },
      { v: '+18', l: 'Top-10 prompts captured' },
      { v: '6 weeks', l: 'Payback period on Premium plan' }
    ]
  }
];

export default function Quotes() {
  const [idx, setIdx] = useState(0);
  const q = QUOTES[idx];
  return (
    <section className="quotes">
      <div className="quotes-inner">
        <div className="section-eyebrow" style={{ color: 'rgba(255,255,255,0.7)' }}>
          <span className="mono">06</span><span>Customer stories</span>
        </div>
        <h2 className="section-title" style={{ color: 'white', maxWidth: '20ch', marginBottom: 48 }}>
          Teams that <em>chose to show up</em> in the answer.
        </h2>
        <div className="quotes-tabs">
          {QUOTES.map((qq, i) => (
            <button key={qq.co} className={`quotes-tab ${i === idx ? 'on' : ''}`} onClick={() => setIdx(i)}>
              {qq.co}
            </button>
          ))}
        </div>
        <div className="quote-card">
          <div>
            <p className="quote-text">"{q.quote}"</p>
            <div className="quote-attr">
              <div className="quote-avatar" style={{ background: q.avatarBg }}>{q.initials}</div>
              <div>
                <div className="quote-name">{q.name}</div>
                <div className="quote-role">{q.role}</div>
              </div>
            </div>
          </div>
          <div className="quote-stats">
            {q.stats.map((s) => (
              <div className="quote-stat" key={s.l}>
                <div className="quote-stat-v">{s.v}</div>
                <div className="quote-stat-l">{s.l}</div>
              </div>
            ))}
            <a href="#" className="quote-link">Read full story <Arrow size={13} /></a>
          </div>
        </div>
      </div>
    </section>
  );
}
