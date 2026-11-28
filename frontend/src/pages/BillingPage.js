import React, { useState, useEffect, useCallback } from 'react';
import { usePayment } from '../context/PaymentContext';
import { useAuth } from '../context/AuthContext';
import { paymentApi } from '../api/paymentApi';
import { withTokenExpiry } from '../api/authApi';
import { PlanCards, PricingSectionHeader, PricingFooter } from '../components/payment/PlanCards';
import { PaymentDropIn } from '../components/payment/PaymentDropIn';
import { PaymentReceipt, PaymentFailure, AutoRenewNotice, waitForPaymentOutcome } from '../components/payment/PaymentResult';
import { PaymentDetailsModal } from '../components/payment/PaymentDetails';
import { StarterPassOffer, StarterPassStatus } from '../components/payment/StarterPass';
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
  const [detailPayment, setDetailPayment] = useState(null);
  const [togglingRenew, setTogglingRenew] = useState(false);
  const [renewToggleError, setRenewToggleError] = useState(null);

  const [catalog, setCatalog] = useState(null);
  const [history, setHistory] = useState(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [pageError, setPageError] = useState(null);

  const [checkoutIntent, setCheckoutIntent] = useState(null);
  const [checkoutStage, setCheckoutStage] = useState('idle'); // idle | loading | ready | confirming | success | failed
  const [checkoutError, setCheckoutError] = useState(null);
  const [checkoutResult, setCheckoutResult] = useState(null);   // the settled payment (receipt or failure)

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
    setCheckoutResult(null);
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
    setCheckoutResult(null);
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
    setCheckoutStage('confirming'); setCheckoutError(null);
    const data = await waitForPaymentOutcome(paymentIntentId);
    if (!data) {
      setCheckoutStage('ready');
      setCheckoutError('Payment is still being confirmed — this can take a moment. Check back shortly.');
      return;
    }
    setCheckoutResult(data.payment);
    if (data.payment.outcome === 'failed') { setCheckoutStage('failed'); load(); return; }   // not active: nothing unlocks
    setCheckoutStage('success');
    await refresh();   // the plan is active on the server: update the app
    load();            // plan highlighting + payment history
  };

  const cols = [
    { key: 'plan_id', label: 'Plan', render: v => <Badge variant="brand">{v || '—'}</Badge> },
    { key: 'amount', label: 'Amount', render: (v, row) => `${v} ${row.currency}` },
    { key: 'status', label: 'Status', render: (v, row) => (<div><Badge variant={v === 'SUCCEEDED' ? 'success' : ['FAILED', 'CANCELLED', 'EXPIRED'].includes(v) || row.failure_reason ? 'danger' : 'default'}>{row.failure_reason && !['FAILED', 'CANCELLED', 'EXPIRED'].includes(v) ? 'FAILED' : v}</Badge>{row.failure_reason && <div style={{ fontSize: 11.5, color: 'var(--c-danger)', marginTop: 3, maxWidth: 260 }}>{row.failure_reason}</div>}</div>) },
    { key: 'is_renewal', label: 'Type', render: v => v ? <Badge>Auto-renewal</Badge> : <Badge variant="brand">Checkout</Badge> },
    { key: 'created_at', label: 'Date', render: v => formatDate(v) || '—' },
    { key: 'credited', label: 'Credited', render: (v, row) => v ? <Badge variant="success">✓ Received</Badge> : <Badge variant={row.outcome === 'failed' ? 'danger' : 'default'}>{row.outcome === 'failed' ? '✕ Not received' : 'Pending'}</Badge> },
    { key: 'payment_intent_id', label: '', render: (v, row) => <button type="button" className={s.autoRenewToggleBtn} onClick={() => setDetailPayment(row)}>View details</button> },
  ];

  return (
    <div className={s.page}>
      <SectionHeader title="Billing & Plans" subtitle="Your current plan, upgrade or renew, and past payments." />

      <StarterPassOffer onDone={load} />
      <StarterPassStatus style={{ marginBottom: 20 }} />

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
          {checkoutError && checkoutStage !== 'failed' && <div className={s.errorBox} style={{ marginTop: 12 }}>{checkoutError}</div>}

          {checkoutStage === 'success' && checkoutResult && (
            <div style={{ marginTop: 14 }}><PaymentReceipt payment={checkoutResult} onContinue={cancelCheckout} continueLabel="Done" /></div>
          )}
          {checkoutStage === 'failed' && (checkoutResult || checkoutError) && (
            <div style={{ marginTop: 14 }}><PaymentFailure message={checkoutResult?.failure_reason || checkoutError} onRetry={() => selectPlan(checkoutIntent.plan_id)} /></div>
          )}

          {checkoutStage === 'ready' && checkoutIntent && (
            <div className={s.checkoutBox}>
              <div className={s.checkoutHead}>
                <span className={s.checkoutPrice}>{checkoutIntent.amount} {checkoutIntent.currency} — {checkoutIntent.plan_name}</span>
                <button type="button" className={s.cancelLink} onClick={cancelCheckout}>Cancel</button>
              </div>
              <AutoRenewNotice amount={checkoutIntent.amount} currency={checkoutIntent.currency} />
              <PaymentDropIn
                intent={checkoutIntent}
                onSuccess={() => pollForConfirmation(checkoutIntent.payment_intent_id)}
                onError={(msg) => { setCheckoutResult(null); setCheckoutStage('failed'); setCheckoutError(msg); }}
                onCancel={cancelCheckout}
              />
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
      {detailPayment && <PaymentDetailsModal payment={detailPayment} onClose={() => setDetailPayment(null)} />}
    </div>
  );
}
