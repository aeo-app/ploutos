import React, { useState, useRef, useEffect, useCallback } from 'react';
import { init, createElement } from '@airwallex/components-sdk';
import { usePayment } from '../context/PaymentContext';
import { useAuth } from '../context/AuthContext';
import { paymentApi } from '../api/paymentApi';
import { withTokenExpiry } from '../api/authApi';
import { PlanCards, PricingSectionHeader, CycleToggle, PricingFooter } from '../components/payment/PlanCards';
import s from './CheckoutPage.module.css';

// 'demo' (sandbox) | 'prod' — flip when deploying, same convention as the
// hardcoded API BASE URL in seoApi.js.
const AIRWALLEX_ENV = 'prod';

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
  const [cycle, setCycle] = useState('monthly');
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [intent, setIntent] = useState(null);        // { payment_intent_id, client_secret, plan_id, plan_name, amount, currency, description }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stage, setStage] = useState('plans');        // plans | loading | ready | confirming | success | failed
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
        });
        if (cancelled) return;
        elementRef.current = element;
        element.mount(containerRef.current);

        element.on('success', () => {
          setStage('confirming');
          pollForConfirmation(intent.payment_intent_id);
        });
        element.on('error', (evt) => {
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
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      try {
        const data = await refreshPayment(paymentIntentId);
        if (data?.is_paid) {
          setStage('success');
          return;
        }
      } catch {
        // keep polling — a transient error here shouldn't abort confirmation
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    // Gave up waiting — payment likely succeeded (webhook may just be slow)
    // but we can't confirm yet. Let the user retry the check manually.
    setStage('ready');
    setError('Payment is still being confirmed. This can take a moment — click below to check again.');
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
            subtitle="Pick the number of prompts you want tracked — 10, 50 or 100. Every plan includes site audits, automated fixes and your own AI agent. No overage fees. Cancel anytime."
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
                <CycleToggle cycle={cycle} onChange={setCycle} />
                <PlanCards
                  plans={catalog.plans}
                  cycle={cycle}
                  selectedPlanId={selectedPlanId}
                  onSelect={selectPlan}
                  ctaLabel="Start now"
                />
                <PricingFooter />
              </>
            )}
          </>
        )}

        {stage !== 'plans' && intent && stage !== 'success' && (
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

        {error && stage !== 'plans' && (
          <div className={s.errorBox}>{error}</div>
        )}

        {stage === 'confirming' && (
          <div className={s.loadingRow}>
            <span className={s.spinner} />
            <span>Confirming your payment…</span>
          </div>
        )}

        {stage === 'success' && (
          <div className={s.successBox}>
            <span className={s.successIcon}>✅</span>
            <strong>Payment confirmed — you're all set!</strong>
            <span style={{ fontSize: 13, color: 'var(--c-slate-500)' }}>Loading your dashboard…</span>
          </div>
        )}

        {!loading && (stage === 'ready' || stage === 'failed') && (
          <div ref={containerRef} className={s.dropinContainer} />
        )}

        {stage === 'failed' && (
          <button type="button" className={s.retryBtn} onClick={retry}>Try again</button>
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
