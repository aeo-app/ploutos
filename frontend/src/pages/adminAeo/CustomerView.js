import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AppCtx } from '../../context/AppContext';
import { PaymentContext } from '../../context/PaymentContext';
import { AeoProvider } from '../../aeo/AeoContext';
import { historyApi } from '../../api/historyApi';
import { setActAs } from '../../api/seoApi';
import { SkeletonCard } from '../../components/ui/UI';
import { UserHeader } from './shared';
import '../../aeo/aeo.css';

/**
 * Shows a customer's own AEO screens to an admin: the same components, the same data, the same
 * edits. Every request carries X-Act-As-User (the server re-checks the caller is an admin), so
 * keywords, blogs and the calendar are read and saved on the customer's account. Publishing and
 * connecting social accounts stay with the customer.
 */
export function CustomerView({ ws, children }) {
  const app = useContext(AppCtx);
  const pay = useContext(PaymentContext);
  const uid = ws.user.user_id;
  const [ready, setReady] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  // Everything below this point speaks for the customer until the admin leaves or switches customer.
  useEffect(() => {
    setReady(false); setAnalysis(null);
    setActAs(uid);
    let off = false;
    (async () => {
      try {
        const list = await historyApi.list({ analysisType: 'aeo_prompts', limit: 1 });
        const first = (list?.items || [])[0];
        if (first) { const full = await historyApi.getOne(first.analysis_id); if (!off) setAnalysis(full?.result || null); }
      } catch (_) { /* the customer may not have run an analysis yet */ }
      if (!off) setReady(true);
    })();
    return () => { off = true; setActAs(''); };
  }, [uid]);

  const appValue = useMemo(() => ({
    ...app,
    state: {
      ...app.state,
      isAdmin: false,
      request: { company_name: ws.user.company_name || ws.user.full_name || '', url: ws.user.domain ? (/^https?:/.test(ws.user.domain) ? ws.user.domain : `https://${ws.user.domain}`) : '', market: 'Global', industry: 'General' },
      results: { ...app.state.results, aeoPrompts: analysis },
      loading: { ...app.state.loading, aeoPrompts: false },
    },
  }), [app, ws.user, analysis]);
  const payValue = useMemo(() => ({ ...pay, isPaid: !!ws.user.is_paid }), [pay, ws.user.is_paid]);

  if (!ready) return <SkeletonCard rows={4} />;
  return (
    <AppCtx.Provider value={appValue}>
      <PaymentContext.Provider value={payValue}>
        {/* key: a fresh provider per customer so nothing from the previous one lingers */}
        <AeoProvider key={uid}>
          <div className="ae-app" style={{ background: 'transparent' }}>
            {children}
          </div>
        </AeoProvider>
      </PaymentContext.Provider>
    </AppCtx.Provider>
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
