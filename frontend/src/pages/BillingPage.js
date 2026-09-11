import React, { useState, useEffect, useCallback } from 'react';
import { usePayment } from '../context/PaymentContext';
import { useAuth } from '../context/AuthContext';
import { paymentApi } from '../api/paymentApi';
import { withTokenExpiry } from '../api/authApi';
import { PlanCards, PricingSectionHeader, PricingFooter } from '../components/payment/PlanCards';
import { PaymentDropIn } from '../components/payment/PaymentDropIn';
import { Card, Badge, SectionHeader, DataTable, SkeletonCard, ErrorCard } from '../components/ui/UI';
import s from './BillingPage.module.css';

function formatDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function BillingPage() {
  const {
    isPaid, paidUntil, plan, planName, refresh,
    autoRenew, paymentMethodSummary, renewalStatus, renewalFailureReason,
  } = usePayment();
  const { goScreen, logout } = useAuth();
  const authCtx = { goScreen, logout };
  const [togglingRenew, setTogglingRenew] = useState(false);
  const [renewToggleError, setRenewToggleError] = useState(null);

  const [catalog, setCatalog] = useState(null);
  const [history, setHistory] = useState(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [pageError, setPageError] = useState(null);

  const [checkoutIntent, setCheckoutIntent] = useState(null);
  const [checkoutStage, setCheckoutStage] = useState('idle'); // idle | loading | ready | confirming | success | failed
  const [checkoutError, setCheckoutError] = useState(null);

  const load = useCallback(async () => {
    setLoadingPage(true);
    setPageError(null);
    try {
      const [plansData, historyData] = await Promise.all([
        withTokenExpiry(paymentApi.getPlans(), authCtx),
        withTokenExpiry(paymentApi.getHistory(), authCtx),
      ]);
      setCatalog(plansData);
      setHistory(historyData);
    } catch (e) {
      if (e?.code !== 'TokenExpired') setPageError(e.message || 'Could not load billing information.');
    } finally {
      setLoadingPage(false);
    }
    // eslint-disable-next-line
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectPlan = async (planId) => {
    setCheckoutStage('loading');
    setCheckoutError(null);
    try {
      const data = await withTokenExpiry(paymentApi.createIntent(planId), authCtx);
      setCheckoutIntent(data);
      setCheckoutStage('ready');
    } catch (e) {
      if (e?.code !== 'TokenExpired') {
        setCheckoutError(e.message || 'Could not start checkout.');
        setCheckoutStage('idle');
      }
    }
  };

  const cancelCheckout = () => {
    setCheckoutIntent(null);
    setCheckoutStage('idle');
    setCheckoutError(null);
  };

  const handleToggleAutoRenew = async () => {
    setTogglingRenew(true);
    setRenewToggleError(null);
    try {
      await withTokenExpiry(paymentApi.setAutoRenew(!autoRenew), authCtx);
      await refresh();
    } catch (e) {
      if (e?.code !== 'TokenExpired') setRenewToggleError(e.message || 'Could not update auto-renewal.');
    } finally {
      setTogglingRenew(false);
    }
  };

  const pollForConfirmation = async (paymentIntentId) => {
    setCheckoutStage('confirming');
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        const data = await refresh(paymentIntentId);
        if (data?.is_paid) {
          setCheckoutStage('success');
          load(); // refresh plan catalog highlighting + payment history
          return;
        }
      } catch { /* keep polling */ }
      await new Promise(r => setTimeout(r, 2000));
    }
    setCheckoutStage('ready');
    setCheckoutError('Payment is still being confirmed — this can take a moment. Check back shortly.');
  };

  const cols = [
    { key: 'plan_id', label: 'Plan', render: v => <Badge variant="brand">{v || '—'}</Badge> },
    { key: 'amount', label: 'Amount', render: (v, row) => `${v} ${row.currency}` },
    { key: 'status', label: 'Status', render: v => <Badge variant={v === 'SUCCEEDED' ? 'success' : v === 'FAILED' ? 'danger' : 'default'}>{v}</Badge> },
    { key: 'is_renewal', label: 'Type', render: v => v ? <Badge>Auto-renewal</Badge> : <Badge variant="brand">Checkout</Badge> },
    { key: 'created_at', label: 'Date', render: v => formatDate(v) || '—' },
  ];

  return (
    <div className={s.page}>
      <SectionHeader title="Billing & Plans" subtitle="Your current plan, upgrade or renew, and past payments." />

      <Card style={{ marginBottom: 20 }}>
        <div className={s.statusRow}>
          {isPaid ? (
            <>
              <Badge variant="success">✓ {planName || catalog?.plans?.find(p => p.plan_id === plan)?.name || plan} plan active</Badge>
              {paidUntil && (
                <span className={s.statusText}>
                  {autoRenew ? 'Auto-renews' : 'Expires'} {formatDate(paidUntil)}
                </span>
              )}
            </>
          ) : paidUntil ? (
            <>
              <Badge variant="warning">⚠ Plan expired</Badge>
              <span className={s.statusText}>Your {planName || plan || 'previous'} plan expired on {formatDate(paidUntil)} — pick a plan below to renew and regain access.</span>
            </>
          ) : (
            <Badge variant="warning">No active plan</Badge>
          )}
        </div>

        {renewalStatus === 'failed' && (
          <div className={s.renewalFailedBox}>
            <span className={s.renewalFailedIcon}>⚠</span>
            <div>
              <div className={s.renewalFailedTitle}>Last auto-renewal attempt failed</div>
              <div className={s.renewalFailedReason}>{renewalFailureReason || 'Your payment method was declined.'}</div>
              <div className={s.renewalFailedNote}>
                {paidUntil && new Date(paidUntil) > new Date()
                  ? "Your access is still active — we'll automatically retry before your plan expires. You can also update your payment method by starting a new checkout below."
                  : 'Your access has lapsed. Pick a plan below to renew.'}
              </div>
            </div>
          </div>
        )}

        {paymentMethodSummary && (
          <div className={s.paymentMethodRow}>
            <span className={s.paymentMethodLabel}>💳 Saved payment method:</span>
            <span className={s.paymentMethodValue}>{paymentMethodSummary}</span>
            <button
              type="button" className={s.autoRenewToggleBtn}
              disabled={togglingRenew}
              onClick={handleToggleAutoRenew}
              title={autoRenew ? 'Turn off automatic renewal' : 'Turn on automatic renewal'}
            >
              {togglingRenew ? '…' : autoRenew ? 'Auto-renew: On' : 'Auto-renew: Off'}
            </button>
          </div>
        )}
        {renewToggleError && <div className={s.errorBox} style={{ marginTop: 10 }}>{renewToggleError}</div>}
      </Card>

      {loadingPage && <SkeletonCard rows={4} />}
      {pageError && <ErrorCard message={pageError} />}

      {catalog && !loadingPage && (
        <Card style={{ marginBottom: 20 }}>
          <PricingSectionHeader
            eyebrow="Pricing"
            title="Pricing built around"
            accent="how often you publish."
            subtitle="Every plan tracks your AI-search visibility and ships content automatically. Pick the cadence that matches your team."
          />
          <PlanCards
            plans={catalog.plans}
            currentPlanId={plan}
            selectedPlanId={checkoutIntent?.plan_id}
            onSelect={selectPlan}
            disabled={checkoutStage === 'loading' || checkoutStage === 'confirming'}
            ctaLabel={isPaid ? 'Switch to this plan' : 'Choose plan'}
          />
          <PricingFooter />

          {checkoutStage === 'loading' && (
            <div className={s.loadingRow}><span className={s.spinner} /><span>Preparing checkout…</span></div>
          )}
          {checkoutError && <div className={s.errorBox} style={{ marginTop: 12 }}>{checkoutError}</div>}

          {checkoutStage === 'success' && (
            <div className={s.successBox} style={{ marginTop: 14 }}>✅ Payment confirmed — your plan is now active.</div>
          )}

          {(checkoutStage === 'ready' || checkoutStage === 'failed') && checkoutIntent && (
            <div className={s.checkoutBox}>
              <div className={s.checkoutHead}>
                <span className={s.checkoutPrice}>{checkoutIntent.amount} {checkoutIntent.currency} — {checkoutIntent.plan_name}</span>
                <button type="button" className={s.cancelLink} onClick={cancelCheckout}>Cancel</button>
              </div>
              <PaymentDropIn
                intent={checkoutIntent}
                onSuccess={() => pollForConfirmation(checkoutIntent.payment_intent_id)}
                onError={(msg) => { setCheckoutStage('failed'); setCheckoutError(msg); }}
                onCancel={cancelCheckout}
              />
              {checkoutStage === 'failed' && (
                <button type="button" className={s.retryBtn} onClick={() => selectPlan(checkoutIntent.plan_id)}>Try again</button>
              )}
            </div>
          )}
        </Card>
      )}

      {history && !loadingPage && (
        <Card padded={false}>
          <div style={{ padding: '18px 20px 0' }}><SectionHeader title="Payment history" /></div>
          {history.items.length === 0
            ? <div style={{ padding: '0 20px 20px', fontSize: 13, color: 'var(--c-slate-400)' }}>No payments yet.</div>
            : <DataTable cols={cols} rows={history.items} keyFn={r => r.payment_intent_id} />}
        </Card>
      )}
    </div>
  );
}
