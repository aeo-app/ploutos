import React, { useState, useRef, useEffect, useCallback } from 'react';
import { init, createElement } from '@airwallex/components-sdk';
import { usePayment } from '../context/PaymentContext';
import { useAuth } from '../context/AuthContext';
import { paymentApi } from '../api/paymentApi';
import { withTokenExpiry } from '../api/authApi';
import { AIRWALLEX_ENV } from '../api/config';
import { PlanCards, PricingSectionHeader, PricingFooter } from '../components/payment/PlanCards';
import { cardSaveOptions } from '../components/payment/PaymentDropIn';
import { PaymentReceipt, PaymentFailure, AutoRenewNotice, waitForPaymentOutcome } from '../components/payment/PaymentResult';
import s from './CheckoutPage.module.css';

// Previously this had its own local `const AIRWALLEX_ENV = 'demo'`, with a
// comment noting it needed to be "flipped when deploying" — same
// hardcoded-toggle anti-pattern as the API base URL fix, and it was never
// actually flipped, meaning production was always initializing the
// Airwallex SDK in sandbox mode while the backend creates real PaymentIntents
// in prod — exactly the mismatch behind Airwallex's "Access denied,
// authentication failed" error. Now uses the same shared, configurable
// value as PaymentDropIn.js.

// How long to keep polling /payment/status after the Drop-in reports
// success, before giving up and telling the user to refresh (the webhook
// usually lands within a second or two, but this covers slow delivery).
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 15;

export function CheckoutPage() {
  const { refresh: refreshPayment } = usePayment();
  const { goScreen, logout } = useAuth();

  const [catalog, setCatalog] = useState(null);      // { currency, billing_cycle_days, plans: [...] }
  const [catalogError, setCatalogError] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [intent, setIntent] = useState(null);        // { payment_intent_id, client_secret, plan_id, plan_name, amount, currency, description }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stage, setStage] = useState('plans');        // plans | loading | ready | confirming | success | failed
  const [result, setResult] = useState(null);         // the settled payment: a receipt on success, the bank's reason on failure
  const containerRef = useRef(null);
  const elementRef = useRef(null);

  const authCtx = { goScreen, logout };

  // Load the plan catalog once on mount — the dashboard pricing cards
  // always reflect real, current prices from the backend, never hardcoded.
  useEffect(() => {
    withTokenExpiry(paymentApi.getPlans(), authCtx)
      .then(setCatalog)
      .catch(e => { if (e?.code !== 'TokenExpired') setCatalogError(e.message || 'Could not load plans.'); });
    // eslint-disable-next-line
  }, []);

  const startCheckout = useCallback(async (planId) => {
    setLoading(true);
    setError(null);
    setStage('loading');
    try {
      const data = await withTokenExpiry(paymentApi.createIntent(planId), authCtx);
      setIntent(data);
      setStage('ready');
    } catch (e) {
      if (e?.code !== 'TokenExpired') {
        setError(e.message || 'Could not start checkout.');
        setStage('plans');
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line
  }, []);

  const selectPlan = (planId) => {
    setSelectedPlanId(planId);
    startCheckout(planId);
  };

  const backToPlans = () => {
    elementRef.current?.destroy?.();
    elementRef.current = null;
    setIntent(null);
    setError(null);
    setStage('plans');
  };

  // Mount the Airwallex Drop-in element once we have a client_secret and the container is in the DOM.
  useEffect(() => {
    if (!intent || stage !== 'ready' || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        await init({ env: AIRWALLEX_ENV, enabledElements: ['payments'] });
        if (cancelled) return;
        const element = await createElement('dropIn', {
          intent_id: intent.payment_intent_id,
          client_secret: intent.client_secret,
          currency: intent.currency,
          ...cardSaveOptions(true),   // card saved by default for the automatic renewal; the notice above the form says so
        });
        if (cancelled) return;
        elementRef.current = element;
        element.mount(containerRef.current);

        element.on('success', () => {
          setStage('confirming');
          pollForConfirmation(intent.payment_intent_id);
        });
        element.on('error', (evt) => {
          setResult(null);
          setStage('failed');
          setError(evt?.detail?.error?.message || 'Payment failed. Please try a different payment method.');
        });
        element.on('cancel', () => {
          setStage('ready');
        });
      } catch (e) {
        setStage('failed');
        setError(e.message || 'Could not load the payment form.');
      }
    })();

    return () => {
      cancelled = true;
      elementRef.current?.destroy?.();
    };
    // eslint-disable-next-line
  }, [intent, stage]);

  const pollForConfirmation = async (paymentIntentId) => {
    setError(null);
    // Asks the server, which asks Airwallex directly, until the payment is settled either way. Access is granted
    // server-side only for a SUCCEEDED payment; this screen just reports what happened.
    const data = await waitForPaymentOutcome(paymentIntentId, { tries: POLL_MAX_ATTEMPTS, interval: POLL_INTERVAL_MS });
    if (!data) {
      // Still pending: the payment may well succeed, but we can't confirm yet.
      setStage('ready');
      setError('Payment is still being confirmed. This can take a moment — please check again shortly.');
      return;
    }
    setResult(data.payment);
    if (data.payment.outcome === 'failed') { setStage('failed'); return; }   // not active: stay on checkout with the reason
    setStage('success');   // the receipt stays on screen until they continue
  };

  const retry = () => {
    elementRef.current?.destroy?.();
    elementRef.current = null;
    startCheckout(selectedPlanId);
  };

  return (
    <div className={s.wrap}>
      <div className={s.card} style={stage === 'plans' ? { maxWidth: 1020 } : undefined}>
        {stage === 'plans' ? (
          <PricingSectionHeader
            eyebrow="Pricing"
            title="Simple pricing,"
            accent="priced by prompts."
            subtitle="Pick the publishing cadence that fits your team. Every plan tracks AI-search visibility and ships content automatically. Cancel anytime."
          />
        ) : (
          <div className={s.header}>
            <span className={s.icon}>🔒</span>
            <span className={s.title}>Complete your payment</span>
            <span className={s.subtitle}>Your account is set up — one quick payment unlocks the full platform.</span>
          </div>
        )}

        {stage === 'plans' && (
          <>
            {catalogError && <div className={s.errorBox}>{catalogError}</div>}
            {!catalog && !catalogError && (
              <div className={s.loadingRow}><span className={s.spinner} /><span>Loading plans…</span></div>
            )}
            {catalog && (
              <>
                <PlanCards
                  plans={catalog.plans}
                  selectedPlanId={selectedPlanId}
                  onSelect={selectPlan}
                  ctaLabel="Start now"
                />
                <PricingFooter />
              </>
            )}
          </>
        )}

        {stage !== 'plans' && intent && stage !== 'success' && stage !== 'failed' && (
          <>
            <div className={s.priceBox}>
              <span className={s.priceAmount}>{intent.amount}</span>
              <span className={s.priceCurrency}>{intent.currency}</span>
            </div>
            <div className={s.priceDesc}>{intent.description}</div>
          </>
        )}

        {loading && (
          <div className={s.loadingRow}>
            <span className={s.spinner} />
            <span>Preparing checkout…</span>
          </div>
        )}

        {error && stage !== 'plans' && stage !== 'failed' && (
          <div className={s.errorBox}>{error}</div>
        )}

        {stage === 'failed' && (
          <PaymentFailure message={result?.failure_reason || error} onRetry={retry} />
        )}

        {stage === 'confirming' && (
          <div className={s.loadingRow}>
            <span className={s.spinner} />
            <span>Confirming your payment…</span>
          </div>
        )}

        {stage === 'success' && (
          <PaymentReceipt payment={result} onContinue={() => refreshPayment()} />
        )}

        {!loading && stage === 'ready' && intent && <AutoRenewNotice amount={intent.amount} currency={intent.currency} />}
        {!loading && stage === 'ready' && (
          <div ref={containerRef} className={s.dropinContainer} />
        )}

        {(stage === 'ready' || stage === 'failed') && (
          <button type="button" className={s.logoutLink} onClick={backToPlans} style={{ alignSelf: 'center' }}>
            ← Choose a different plan
          </button>
        )}

        <div className={s.logoutRow}>
          <button type="button" className={s.logoutLink} onClick={logout}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
