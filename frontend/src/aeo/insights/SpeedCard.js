import React, { useEffect, useState } from 'react';
import { aeoApi } from '../../api/aeoApi';
import { fmtDate, hostOf } from '../utils';
import './insights.css';

/* ── Website speed (audit tasks A5 + A6) ──────────────────────────────────────
   Google PageSpeed Insights, run by our backend on the customer's own website.
   The backend saves the last test, so opening the page never starts a new one. */

const DEVICES = [['mobile', 'On phones'], ['desktop', 'On computers']];
const SCORE_WORD = { good: 'Fast', warn: 'Needs work', bad: 'Slow' };

export function SpeedCard() {
  const [data, setData] = useState(null);            // { report, history }
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    aeoApi.speedTest()
      .then(d => { if (active) setData(d); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const runTest = async () => {
    setTesting(true);
    setError('');
    try { setData(await aeoApi.runSpeedTest()); }
    catch (e) { setError(e.message); }
    finally { setTesting(false); }
  };

  if (loading) {
    return (
      <section className="ae-card">
        <h2>Website speed</h2>
        <span className="ae-sub">Loading your last test…</span>
      </section>
    );
  }

  const report = data?.report;
  if (!report) {
    return (
      <div className="ae-empty">
        <h2>{testing ? 'Testing your website…' : 'How fast is your website?'}</h2>
        <p>{testing
          ? 'Google is loading your website on a phone and on a computer. This takes about a minute.'
          : 'Google loads your website on a phone and on a computer, scores its speed from 0 to 100, and lists what slows it down.'}</p>
        {error && <span className="ae-err">{error}</span>}
        {testing
          ? <div className="ae-dots"><i /><i /><i /></div>
          : <button className="ae-btn primary" onClick={runTest}>Test my website</button>}
      </div>
    );
  }

  const checked = new Date(report.checked_at);
  const checkedLabel = `${fmtDate(checked, { day: 'numeric', month: 'short', year: 'numeric' })}, ${checked.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <section className="ae-card">
      <div className="ae-row">
        <div className="ae-speed-head">
          <h2>Website speed</h2>
          <span className="ae-sub">{hostOf(report.url)} · tested by Google on {checkedLabel}</span>
        </div>
        <button className="ae-btn sm" disabled={testing} onClick={runTest}>{testing ? 'Testing… about a minute' : 'Test again'}</button>
      </div>
      {error && <span className="ae-err">{error}</span>}
      <div className="ae-grid2">
        {DEVICES.map(([key, label]) => (
          <DeviceResult key={key} label={label} result={report[key]} change={scoreChange(data.history, key)} />
        ))}
      </div>
    </section>
  );
}

function DeviceResult({ label, result, change }) {
  if (result.error) {
    return (
      <div className="ae-speed-device">
        <span className="ae-eyebrow">{label}</span>
        <span className="ae-err">{result.error}</span>
      </div>
    );
  }
  return (
    <div className="ae-speed-device">
      <div className="ae-row">
        <span className="ae-eyebrow">{label}</span>
        {change && (
          <span className={`ae-speed-change ${change.diff > 0 ? 'up' : 'down'}`}>
            {change.diff > 0 ? '▲' : '▼'} {Math.abs(change.diff)} since {change.since}
          </span>
        )}
      </div>
      <div className="ae-speed-score">
        <b className={`ae-speed-${result.status}`}>{result.score ?? '–'}</b>
        <span>/ 100{SCORE_WORD[result.status] ? ` · ${SCORE_WORD[result.status]}` : ''}</span>
      </div>
      <MetricList title="In this test" metrics={result.lab} />
      <RealVisitors result={result} />
      <TopFixes fixes={result.fixes} />
    </div>
  );
}

function RealVisitors({ result }) {
  if (result.field_scope === 'none') {
    return (
      <div>
        <span className="ae-eyebrow">Real visitors</span>
        <p className="ae-note ae-speed-note">Google doesn't have enough visits to this website yet. This fills in by itself as more people visit it using Chrome.</p>
      </div>
    );
  }
  const title = result.field_scope === 'page' ? 'Real visitors · last 28 days' : 'Real visitors · whole website, last 28 days';
  return <MetricList title={title} metrics={result.field} />;
}

function MetricList({ title, metrics }) {
  if (!metrics.length) return null;
  return (
    <div>
      <span className="ae-eyebrow">{title}</span>
      {metrics.map(m => (
        <div key={m.key} className="ae-line">
          <span className="ae-speed-label">{m.label}</span>
          <b className={`ae-speed-${m.status}`}>{m.value}</b>
        </div>
      ))}
    </div>
  );
}

function TopFixes({ fixes }) {
  return (
    <div>
      <span className="ae-eyebrow">What slows it down most</span>
      {fixes.length ? (
        <ol className="ae-speed-fixes">
          {fixes.map(f => (
            <li key={f.title}>
              <span className="ae-speed-fix-title">{f.title}</span>
              {f.detail && <span className="ae-note"> · {f.detail}</span>}
              {f.action && <span className="ae-speed-fix-text">{f.action}</span>}
              {f.google_title && <span className="ae-speed-fix-text ae-note">For your developer: “{f.google_title}”</span>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="ae-note ae-speed-note">Google found nothing important to fix.</p>
      )}
    </div>
  );
}

/** Score change since the previous day tested, e.g. { diff: 8, since: '4 Nov' }; null when there is nothing to compare. */
function scoreChange(history, key) {
  if (!history || history.length < 2) return null;
  const [prev, last] = history.slice(-2);
  if (prev[key] == null || last[key] == null || prev[key] === last[key]) return null;
  return { diff: last[key] - prev[key], since: fmtDate(new Date(`${prev.date}T12:00:00`), { day: 'numeric', month: 'short' }) };
}
