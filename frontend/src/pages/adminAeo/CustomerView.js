import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ViewAsContext, useViewAs } from '../../context/ViewAsContext';
import { adminAeoApi } from '../../api/adminApi';
import { AppCtx } from '../../context/AppContext';
import { withTokenExpiry } from '../../api/authApi';
import { useAuth } from '../../context/AuthContext';
import { PaymentContext } from '../../context/PaymentContext';
import { AeoProvider, useAeo } from '../../aeo/AeoContext';
import { BrandKitCard } from '../../aeo/BrandKit';
import { historyApi } from '../../api/historyApi';
import { setActAs, clearActAs } from '../../api/seoApi';
import { SkeletonCard } from '../../components/ui/UI';
import { UserHeader } from './shared';
import { AppShell } from '../../components/layout/AppShell';
import { AppRouter } from '../../AppRouter';
import '../../aeo/aeo.css';

/** Lets screens inside the customer view edit the market / industry the analysis is run with. */
const ReqCtx = createContext({ request: {}, setRequest: () => {} });
export const useCustomerRequest = () => useContext(ReqCtx);

const EMPTY_KEYS = { competitors: null, keywords: null, profile: null, domainAuthority: null, fullReport: null, contentStrategy: null, relocationCalendar: null, aeoPrompts: null };
const FALSE_KEYS = Object.fromEntries(Object.keys(EMPTY_KEYS).map(k => [k, false]));

/**
 * Shows a customer's own screens to an admin: the same components, the same data, the same
 * edits. Every request carries X-Act-As-User (the server re-checks the caller is an admin), so
 * everything is read and saved on the customer's account. Publishing and connecting social
 * accounts stay with the customer.
 *
 * Nothing is shared between customers: the header is set before anything below renders, and
 * all results live in a scope keyed by the customer, so switching customer starts from zero.
 */
export function CustomerView({ ws, children, setup = false, onNavigate, asApp = false }) {
  const uid = ws.user.user_id;
  const owner = useRef(null);
  if (!owner.current) owner.current = {};
  const alive = useRef(false);
  setActAs(uid, owner.current);                            // before any child renders or fetches
  // Leaving ends acting as the customer, but never in the middle of a hand-over: the view that is closing is
  // switched off a moment later, and only if no view (this one again, as React's development mode does, or the
  // next customer's) has taken over in the meantime.
  useEffect(() => {
    alive.current = true;
    setActAs(uid, owner.current);
    return () => {
      alive.current = false;
      setTimeout(() => { if (!alive.current) clearActAs(owner.current); }, 0);
    };
  }, [uid]);
  return <CustomerScope key={uid} ws={ws} setup={setup} onNavigate={onNavigate} asApp={asApp}>{children}</CustomerScope>;
}

function CustomerScope({ ws, children, setup, onNavigate, asApp }) {
  const app = useContext(AppCtx);
  const pay = useContext(PaymentContext);
  const { goScreen, logout } = useAuth();
  const [ready, setReady] = useState(false);
  const [results, setResults] = useState({ ...EMPTY_KEYS });
  const [loading, setLoading] = useState({ ...FALSE_KEYS });
  const [errors, setErrors] = useState({ ...EMPTY_KEYS });
  const [page, setPageLocal] = useState('home');          // asApp: which of the customer's pages is open
  const [request, setReq] = useState(() => asApp ? ({ company_name: '', url: '', market: 'Singapore', industry: '' }) : ({
    company_name: ws.user.company_name || ws.user.full_name || '',
    url: ws.user.domain ? (/^https?:/.test(ws.user.domain) ? ws.user.domain : `https://${ws.user.domain}`) : '',
    market: 'Global', industry: 'General',
  }));

  // The customer's latest analysis (and what it was run with).
  useEffect(() => {
    if (asApp) { setReady(true); return undefined; }     // the customer's own shell loads everything itself
    let off = false;
    (async () => {
      try {
        const list = await historyApi.list({ analysisType: 'aeo_prompts', limit: 1 });
        const first = (list?.items || [])[0];
        if (first) {
          const full = await historyApi.getOne(first.analysis_id);
          if (!off && full) {
            setResults(r => ({ ...r, aeoPrompts: full.result || null }));
            const q = full.request || {};
            setReq(r => ({ ...r, company_name: q.company_name || r.company_name, url: q.url || r.url, market: q.market || r.market, industry: q.industry || r.industry }));
          }
        }
      } catch (_) { /* the customer may not have run an analysis yet */ }
      if (!off) setReady(true);
    })();
    return () => { off = true; };
  }, []);

  const runApi = useCallback(async (key, fn, body) => {
    setLoading(l => ({ ...l, [key]: true }));
    try {
      const data = await withTokenExpiry(fn(body), { goScreen, logout });
      setResults(r => ({ ...r, [key]: data })); setErrors(e => ({ ...e, [key]: null }));
      return data;
    } catch (e) {
      if (e.code === 'PaymentRequired') app.toast({ type: 'info', message: 'This customer is on the free plan. That feature needs a paid plan.' });
      else if (e.code !== 'TokenExpired') { setErrors(x => ({ ...x, [key]: e.message })); app.toast({ type: 'error', message: e.message }); }
      throw e;
    } finally { setLoading(l => ({ ...l, [key]: false })); }
  }, [app, goScreen, logout]);

  const appValue = useMemo(() => ({
    ...app,
    state: { ...app.state, isAdmin: false, page, request, results, loading, errors, paymentRequiredFor: null },
    setAdmin: () => {},
    runApi,
    setRequest: (p) => setReq(r => ({ ...r, ...p })),
    clearAll: () => { setResults({ ...EMPTY_KEYS }); setErrors({ ...EMPTY_KEYS }); },
    setLoadingKey: (key, val) => setLoading(l => ({ ...l, [key]: val })),
    setResultKey: (key, data) => setResults(r => ({ ...r, [key]: data })),
    setErrorKey: (key, err) => setErrors(e => ({ ...e, [key]: err })),
    requirePayment: () => app.toast({ type: 'info', message: 'This customer is on the free plan. That feature needs a paid plan.' }),
    clearPaymentRequired: () => {},
    // The customer's own screens link to each other; inside the admin they switch pages instead of leaving.
    setPage: (p) => { if (asApp) setPageLocal(p); else if (onNavigate) onNavigate(p); },
  }), [app, page, request, results, loading, errors, runApi, onNavigate, asApp]);
  const payValue = useMemo(() => ({ ...pay, isPaid: !!ws.user.is_paid }), [pay, ws.user.is_paid]);
  const reqValue = useMemo(() => ({ request, setRequest: (p) => setReq(r => ({ ...r, ...p })) }), [request]);

  if (!ready) return <SkeletonCard rows={4} />;
  return (
    <ReqCtx.Provider value={reqValue}>
      <AppCtx.Provider value={appValue}>
        <PaymentContext.Provider value={payValue}>
          <AeoProvider>
            {asApp ? children : (
              <div className="ae-app" style={{ background: 'transparent', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {setup && <BrandKitCard />}
                {children}
              </div>
            )}
          </AeoProvider>
        </PaymentContext.Provider>
      </AppCtx.Provider>
    </ReqCtx.Provider>
  );
}

/** "Run analysis" for the customer, from the admin screen. */
export function RunAnalysisBar() {
  const { runAnalysis, loading, analysis, lastRun } = useAeo();
  const { request, setRequest } = useCustomerRequest();
  const when = lastRun ? new Date(lastRun).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <section className="ae-card" style={{ padding: 16, gap: 12 }}>
      <div className="ae-row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div className="ae-col" style={{ gap: 2, flex: 1, minWidth: 200 }}>
          <b style={{ fontSize: 15 }}>{analysis ? 'Run the analysis again for this customer' : 'Run the analysis for this customer'}</b>
          <span className="ae-sub" style={{ fontSize: 12.5 }}>{analysis ? `Last run${when ? ` ${when}` : ''}. ` : 'They have not run one yet. '}It is saved on their account, so they see it when they sign in.</span>
        </div>
        <label className="ae-col" style={{ gap: 3 }}><span className="ae-eyebrow">Market</span>
          <input className="ae-input" style={{ width: 150 }} value={request.market || ''} maxLength={60} onChange={e => setRequest({ market: e.target.value })} /></label>
        <label className="ae-col" style={{ gap: 3 }}><span className="ae-eyebrow">Industry</span>
          <input className="ae-input" style={{ width: 190 }} value={request.industry || ''} maxLength={80} onChange={e => setRequest({ industry: e.target.value })} /></label>
        <button type="button" className="ae-btn primary" disabled={loading} onClick={() => runAnalysis()}>{loading ? 'Analysing…' : analysis ? 'Re-run analysis' : 'Run analysis'}</button>
      </div>
    </section>
  );
}

/** Switch between the customer's own screen and the team's review tools. */
export function ViewTabs({ value, onChange }) {
  const tabs = [['customer', 'Customer view (edit everything)'], ['team', 'Team tools']];
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {tabs.map(([id, label]) => (
        <button key={id} type="button" onClick={() => onChange(id)} aria-pressed={value === id}
          style={{ padding: '8px 14px', borderRadius: 10, border: `1.5px solid ${value === id ? '#4f46e5' : '#e2e8f0'}`, background: value === id ? '#eef0ff' : '#fff', color: value === id ? '#3730a3' : '#334155', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
          {label}
        </button>
      ))}
    </div>
  );
}

export { UserHeader };

const fmtDay = (v) => { try { return v ? new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; } catch (_) { return '—'; } };

/** The customer's billing, read-only: what plan they are on and what they have paid. Nothing here can change it. */
function BillingView() {
  const uid = (useViewAs() || {}).uid;
  const [b, setB] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!uid) return undefined;
    let off = false;
    adminAeoApi.billing(uid).then(d => { if (!off) setB(d); }).catch(e => { if (!off) setErr(e.message || 'Could not load billing.'); });
    return () => { off = true; };
  }, [uid]);
  if (err) return <section className="ae-card"><b>Billing</b><span className="ae-sub">{err}</span></section>;
  if (!b) return <SkeletonCard rows={3} />;
  const rows = [
    ['Status', b.is_paid ? 'Active' : (b.plan ? 'Expired' : 'Free plan')],
    ['Plan', b.plan_name || (b.is_paid ? b.plan : 'Free')],
    ['Paid until', b.plan ? fmtDay(b.paid_until) : '—'],
    ['Automatic renewal', b.plan ? (b.auto_renew ? 'On' : 'Off') : '—'],
    ['Payment method', b.payment_method_summary || '—'],
    ['Last renewal', b.renewal_status ? `${b.renewal_status}${b.renewal_failure_reason ? ` (${b.renewal_failure_reason})` : ''}` : '—'],
  ];
  return (
    <>
      <section className="ae-card" style={{ gap: 12 }}>
        <div className="ae-row"><h2>Billing &amp; plan</h2><span className="ae-sub">View only. The customer manages their own plan and payments.</span></div>
        <div className="ae-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
          {rows.map(([k, v]) => <div key={k} className="ae-kpi"><span className="ae-eyebrow">{k}</span><b style={{ fontSize: 18, fontWeight: 800 }}>{v}</b></div>)}
        </div>
      </section>
      <section className="ae-card" style={{ gap: 8 }}>
        <h2>Payment history</h2>
        {b.items.length === 0 && <span className="ae-sub">No payments yet.</span>}
        {b.items.map(i => (
          <div key={i.payment_intent_id} className="ae-line" style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px 100px', gap: 12, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--ae-line2)', fontSize: 13.5 }}>
            <span>{fmtDay(i.created_at)}</span>
            <span>{String(i.plan_id || '').replace(/^./, c => c.toUpperCase())}{i.is_renewal ? ' · renewal' : ''}</span>
            <span className="ae-mono" style={{ fontWeight: 700 }}>{i.amount != null ? `${i.currency || ''} ${i.amount}` : '—'}</span>
            <span style={{ textTransform: 'capitalize' }}>{String(i.status || '').toLowerCase().replace(/_/g, ' ')}</span>
          </div>
        ))}
      </section>
    </>
  );
}

/**
 * The customer's actual app — sidebar, top bar, every page — running for the selected customer.
 * Same components and same code as the customer sees, only the account differs.
 */
export function CustomerApp({ ws }) {
  const profile = { company_name: ws.user.company_name || ws.user.full_name || '', domain: ws.user.domain || '', country: ws.user.country || '', is_admin: false, has_profile: true };
  return (
    <ViewAsContext.Provider value={{ uid: ws.user.user_id, name: ws.user.full_name || ws.user.company_name || '', email: ws.user.email || '' }}>
      <CustomerView ws={ws} asApp>
        <AppShell profile={profile}>
          <AppRouter overrides={{ billing: BillingView }} />
        </AppShell>
      </CustomerView>
    </ViewAsContext.Provider>
  );
}
