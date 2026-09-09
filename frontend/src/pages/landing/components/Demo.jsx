import { useState, useEffect, useRef } from 'react';

const DEMO_TABS = [
  { id: 'track',     label: 'Track',     icon: 'M3 11.5L8 3l5 8.5M5 9h6' },
  { id: 'analytics', label: 'Analytics', icon: 'M3 13V8M8 13V4M13 13V9' },
  { id: 'content',   label: 'Content',   icon: 'M4 4h8M4 8h8M4 12h5' },
  { id: 'audit',     label: 'Audit',     icon: 'M7 2a5 5 0 100 10A5 5 0 007 2zM11 11l3 3' },
  { id: 'agent',     label: 'Agent',     icon: 'M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2M4 4l1.4 1.4M12 12l-1.4-1.4M12 4l-1.4 1.4M4 12l1.4-1.4' },
];

function DemoIcon({ d }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ViewTrack() {
  const engines = [
    { name: 'ChatGPT', v: 68, rank: '#2' },
    { name: 'Perplexity', v: 54, rank: '#4' },
    { name: 'Google AI Overviews', v: 42, rank: '#6' },
    { name: 'Claude', v: 47, rank: '#5' },
    { name: 'Gemini', v: 38, rank: '#7' },
    { name: 'Copilot', v: 33, rank: '#9' },
  ];
  return (
    <div className="dv">
      <div className="dv-head">
        <div>
          <div className="dv-title">Visibility tracker</div>
          <div className="dv-sub">acme.com · 50 prompts · last 30 days</div>
        </div>
        <div className="dv-chip dv-chip-up">↑ 12% this week</div>
      </div>
      <div className="dv-cards">
        <div className="dv-stat"><div className="dv-stat-v">61</div><div className="dv-stat-l">AEO score</div></div>
        <div className="dv-stat"><div className="dv-stat-v">3.8%</div><div className="dv-stat-l">Share of voice</div></div>
        <div className="dv-stat"><div className="dv-stat-v">12</div><div className="dv-stat-l">Citations / wk</div></div>
      </div>
      <div className="dv-panel">
        <div className="dv-panel-h"><span>Engine</span><span>Visibility</span></div>
        {engines.map((e, i) => (
          <div className="dv-erow" key={e.name} style={{ '--d': `${i * 0.06}s` }}>
            <span className="dv-ename">{e.name}</span>
            <span className="dv-ebar"><span className="dv-ebar-fill" style={{ width: `${e.v}%` }} /></span>
            <span className="dv-erank">{e.rank}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ViewAnalytics() {
  const pts = [18, 24, 22, 30, 34, 42, 46, 55, 60, 68, 74, 82];
  const max = 90;
  const w = 460, h = 150;
  const step = w / (pts.length - 1);
  const line = pts.map((p, i) => `${i * step},${h - (p / max) * h}`).join(' ');
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <div className="dv">
      <div className="dv-head">
        <div>
          <div className="dv-title">Revenue attribution</div>
          <div className="dv-sub">AI-sourced pipeline · connected to HubSpot</div>
        </div>
        <div className="dv-chip dv-chip-up">+206% SoV</div>
      </div>
      <div className="dv-cards">
        <div className="dv-stat"><div className="dv-stat-v">£1.04m</div><div className="dv-stat-l">AI pipeline</div></div>
        <div className="dv-stat"><div className="dv-stat-v">312</div><div className="dv-stat-l">AI-sourced leads</div></div>
        <div className="dv-stat"><div className="dv-stat-v">−71%</div><div className="dv-stat-l">Inbound CAC</div></div>
      </div>
      <div className="dv-panel">
        <div className="dv-panel-h"><span>Pipeline from AI search</span><span>12 mo</span></div>
        <svg className="dv-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="dvgrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#dvgrad)" />
          <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div className="dv-srcs">
          <span className="dv-src">GA4</span>
          <span className="dv-src">Search Console</span>
          <span className="dv-src">HubSpot</span>
          <span className="dv-src">Salesforce</span>
        </div>
      </div>
    </div>
  );
}

function ViewContent() {
  return (
    <div className="dv">
      <div className="dv-head">
        <div>
          <div className="dv-title">Content engine</div>
          <div className="dv-sub">Citation-ready drafts in your brand voice</div>
        </div>
        <div className="dv-chip">Brand voice · on</div>
      </div>
      <div className="dv-doc">
        <div className="dv-doc-bar">
          <span className="dv-doc-tag">DRAFT</span>
          <span className="dv-doc-title">"X vs Y: the 2026 buyer's guide"</span>
        </div>
        <div className="dv-doc-body">
          <div className="dv-line w-90" />
          <div className="dv-line w-100" />
          <div className="dv-line w-75" />
          <div className="dv-callout">
            <span className="dv-callout-k">AEO tip</span>
            Define the term in sentence one — answer engines quote definitions 3× more often.
          </div>
          <div className="dv-line w-85" />
          <div className="dv-line w-60" />
        </div>
      </div>
      <div className="dv-doc-foot">
        <div className="dv-pills">
          <span className="dv-pill on">FAQ schema</span>
          <span className="dv-pill on">Cite G2</span>
          <span className="dv-pill">Comparison table</span>
        </div>
        <div className="dv-sched">Scheduled · Tue 9:00am</div>
      </div>
    </div>
  );
}

function ViewAudit() {
  const issues = [
    { sev: 'high', txt: 'llms.txt missing', fix: 'Auto-fix' },
    { sev: 'high', txt: 'No FAQ / HowTo schema', fix: 'Auto-fix' },
    { sev: 'med',  txt: 'Key content JS-rendered', fix: 'Brief' },
    { sev: 'med',  txt: 'Thin answer for 6 prompts', fix: 'Brief' },
    { sev: 'low',  txt: 'Slow LCP on /pricing', fix: 'Ticket' },
  ];
  return (
    <div className="dv">
      <div className="dv-head">
        <div>
          <div className="dv-title">Site audit</div>
          <div className="dv-sub">acme.com · 38 checks · agentic crawlability</div>
        </div>
        <div className="dv-gauge">
          <svg viewBox="0 0 36 36" width="44" height="44">
            <circle cx="18" cy="18" r="15" fill="none" stroke="var(--line)" strokeWidth="4" />
            <circle cx="18" cy="18" r="15" fill="none" stroke="#f5a623" strokeWidth="4"
              strokeLinecap="round" strokeDasharray="94.2" strokeDashoffset="26"
              transform="rotate(-90 18 18)" />
          </svg>
          <span className="dv-gauge-v">72</span>
        </div>
      </div>
      <div className="dv-panel">
        <div className="dv-panel-h"><span>Finding</span><span>Action</span></div>
        {issues.map((it, i) => (
          <div className="dv-irow" key={it.txt} style={{ '--d': `${i * 0.06}s` }}>
            <span className={`dv-dot dv-dot-${it.sev}`} />
            <span className="dv-itxt">{it.txt}</span>
            <span className={`dv-fix ${it.fix === 'Auto-fix' ? 'dv-fix-auto' : ''}`}>{it.fix}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ViewAgent() {
  const msgs = [
    { who: 'you', txt: 'What should I ship this week to win more answers?' },
    { who: 'agent', txt: 'Three moves. Your audit found llms.txt missing and no FAQ schema — I can ship both now.' },
    { who: 'agent', txt: 'You\'re #6 for "best X for teams" (38% of pipeline). I drafted a comparison page in your voice.', chips: ['Apply 2 fixes', 'Open draft'] },
    { who: 'you', txt: 'Do it — apply the fixes.' },
    { who: 'agent', txt: 'Done. Injected schema, generated llms.txt, opened PR #214. I\'ll re-audit in 24h.', done: true },
  ];
  return (
    <div className="dv">
      <div className="dv-head">
        <div>
          <div className="dv-title">Your AI agent</div>
          <div className="dv-sub">Learns your brand · acts on your audit</div>
        </div>
        <div className="dv-chip dv-chip-live"><span className="dv-live-dot" />Working</div>
      </div>
      <div className="dv-chat">
        {msgs.map((m, i) => (
          <div className={`dv-msg dv-msg-${m.who}`} key={i} style={{ '--d': `${i * 0.12}s` }}>
            {m.who === 'agent' && <span className="dv-msg-av">ae</span>}
            <div className="dv-bubble">
              <span>{m.txt}</span>
              {m.chips && (
                <div className="dv-msg-chips">
                  {m.chips.map((c) => <span className="dv-msg-chip" key={c}>{c}</span>)}
                </div>
              )}
              {m.done && <div className="dv-msg-done">✓ Shipped · PR #214</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const VIEWS = {
  track: ViewTrack,
  analytics: ViewAnalytics,
  content: ViewContent,
  audit: ViewAudit,
  agent: ViewAgent,
};

const TAB_BLURB = {
  track: 'Monitor share of voice and citations across every answer engine — for the prompts your buyers actually ask.',
  analytics: 'Connect GA, Search Console, HubSpot and Salesforce to tie AI visibility to traffic, leads and revenue.',
  content: 'Generate citation-ready briefs and articles in your brand voice, then schedule them to publish.',
  audit: 'Scan your site for what\'s blocking AI crawlers — schema, llms.txt, rendering and speed.',
  agent: 'A dedicated agent that learns your brand, reads your audit, and ships the fixes for you.',
};

export default function InteractiveDemo() {
  const [tab, setTab] = useState('track');
  const [paused, setPaused] = useState(false);
  const idxRef = useRef(0);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      idxRef.current = (idxRef.current + 1) % DEMO_TABS.length;
      setTab(DEMO_TABS[idxRef.current].id);
    }, 4500);
    return () => clearInterval(id);
  }, [paused]);

  const pick = (id, i) => { idxRef.current = i; setTab(id); };
  const View = VIEWS[tab];

  return (
    <section className="section idemo-section" id="demo">
      <div className="section-head" style={{ textAlign: 'center', margin: '0 auto 56px' }}>
        <div className="section-eyebrow" style={{ justifyContent: 'center' }}>
          <span className="mono">03</span><span>See it work</span>
        </div>
        <h2 className="section-title">
          The whole loop, <em>in one workspace.</em>
        </h2>
        <p className="section-sub" style={{ margin: '20px auto 0' }}>
          Track, analyze, write, audit and automate — click through a live preview of the product.
        </p>
      </div>

      <div className="idemo"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}>
        <div className="idemo-chrome">
          <div className="idemo-dots"><span /><span /><span /></div>
          <div className="idemo-url"><span className="idemo-lock">●</span> app.aeo-app.ai/{tab}</div>
          <div className="idemo-acct">AC</div>
        </div>
        <div className="idemo-body">
          <aside className="idemo-side">
            <div className="idemo-brand">
              <span className="idemo-brand-mark">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 11.5L8 3l5 8.5M5 9h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <span>aeo-app</span>
            </div>
            <nav className="idemo-nav">
              {DEMO_TABS.map((t, i) => (
                <button key={t.id}
                  className={`idemo-tab ${tab === t.id ? 'on' : ''}`}
                  onClick={() => pick(t.id, i)}>
                  <DemoIcon d={t.icon} />
                  <span>{t.label}</span>
                  {tab === t.id && !paused && <span className="idemo-tab-timer" />}
                </button>
              ))}
            </nav>
            <div className="idemo-side-foot">
              <div className="idemo-blurb">{TAB_BLURB[tab]}</div>
            </div>
          </aside>
          <div className="idemo-main">
            <div className="idemo-view" key={tab}>
              <View />
            </div>
          </div>
        </div>
      </div>

      <div className="idemo-tabsmobile">
        {DEMO_TABS.map((t, i) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => pick(t.id, i)}>{t.label}</button>
        ))}
      </div>
    </section>
  );
}
