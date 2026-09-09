import { Tick } from './icons.jsx';

function ScoreDial({ label, value, stage, accent = '1' }) {
  const C = 2 * Math.PI * 38;
  const live = stage === 'idle' || stage === 'report';
  const pct = live ? value / 100 : 0;
  return (
    <div className="dial">
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="38" stroke="#e3e8ee" strokeWidth="6" fill="none" />
        <circle cx="50" cy="50" r="38"
          stroke={accent === '2' ? '#0a2540' : 'var(--accent)'}
          strokeWidth="6" fill="none" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.2,.7,.2,1)' }} />
      </svg>
      <div className="dial-center">
        <div className="dial-value">{live ? value : '—'}</div>
        <div className="dial-label">{label}</div>
      </div>
    </div>
  );
}

function Kpi({ label, value, delta }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {delta && <div className="kpi-delta">{delta}</div>}
    </div>
  );
}

export default function ReportCard({ stage, report }) {
  return (
    <div className="report">
      <div className="report-chrome">
        <div className="report-dots"><span /><span /><span /></div>
        <div className="report-url">
          <span className="report-lock">●</span>
          aeo-app.ai/r/{report ? report.host : 'demo'}
        </div>
        <div className="report-status">
          {stage === 'idle' && <span className="status-idle">Live preview</span>}
          {stage === 'scanning' && <span className="status-live"><span className="blink" />Scanning</span>}
          {stage === 'report' && <span className="status-ok"><Tick /> Ready</span>}
        </div>
      </div>
      <div className="report-body">
        <div className="report-head">
          <span className="report-label">Visibility · last 30d</span>
          <span className="report-host">{report ? report.host : 'stripe.com'}</span>
        </div>
        <div className="score-grid">
          <ScoreDial label="AEO" value={report?.aeo ?? 64} stage={stage} />
          <ScoreDial label="GEO" value={report?.geo ?? 41} stage={stage} accent="2" />
          <ScoreDial label="SEO" value={report?.seo ?? 72} stage={stage} />
          <ScoreDial label="Social Media" value={report?.social ?? 38} stage={stage} accent="2" />
          <ScoreDial label="Videos" value={report?.videos ?? 45} stage={stage} />
          <ScoreDial label="Forums" value={report?.forums ?? 29} stage={stage} accent="2" />
        </div>
        <div className="kpi-row">
          <Kpi label="Citations/wk" value={report?.citations ?? 12} delta="+3" />
          <Kpi label="Share of voice" value={`${report?.share ?? '3.8'}%`} delta="+0.8%" />
          <Kpi label="Prompts" value="500" />
        </div>
        <div className="engine-list">
          <div className="engine-head">
            <span>Engine</span>
            <span>Visibility</span>
          </div>
          {(report?.engines ?? [
            { name: 'ChatGPT', v: 68 },
            { name: 'Perplexity', v: 54 },
            { name: 'Google AI Overviews', v: 42 },
            { name: 'Claude', v: 47 },
            { name: 'Gemini', v: 38 }
          ]).map((e, i) => (
            <div className="engine-row" key={e.name} style={{ '--i': i }}>
              <span className="engine-name">{e.name}</span>
              <span className="engine-bar">
                <span className="engine-bar-fill"
                  style={{ width: stage === 'idle' ? `${e.v}%` : stage === 'report' ? `${e.v}%` : '0%' }} />
              </span>
              <span className="engine-val">{stage === 'idle' || stage === 'report' ? e.v : '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
