import React, { useState, useEffect, useCallback } from 'react';
import { usePayment } from '../../context/PaymentContext';
import { useAuth } from '../../context/AuthContext';
import { paymentApi } from '../../api/paymentApi';
import { withTokenExpiry } from '../../api/authApi';
import { PlanCards, PricingSectionHeader, PricingFooter } from './PlanCards';
import { PaymentDropIn } from './PaymentDropIn';
import s from './UnlockModal.module.css';

/**
 * A payment prompt triggered by attempting to access restricted content —
 * a locked teaser card (content-strategy/relocation-calendar) or a 402 from
 * a still-gated analysis endpoint (competitors/keywords/profile/domain-
 * authority/full-report) — never by simply logging in or navigating.
 *
 * Reuses the same PlanCards/PaymentDropIn as BillingPage.js — one plan
 * catalog, one checkout flow, shown either inline on the Billing page or as
 * this modal everywhere else content is actually gated.
 */
export function UnlockModal({
  onClose,
  onUnlocked,
  title = 'Unlock this content',
  subtitle = 'Choose a plan to view the full result.',
}) {
  const { refresh: refreshPayment } = usePayment();
  const { goScreen, logout } = useAuth();
  const authCtx = { goScreen, logout };

  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState(null);

  const [intent, setIntent] = useState(null);
  const [stage, setStage] = useState('plans'); // plans | loading | ready | confirming | success | failed
  const [error, setError] = useState(null);

  useEffect(() => {
    withTokenExpiry(paymentApi.getPlans(), authCtx)
      .then(setCatalog)
      .catch(e => { if (e?.code !== 'TokenExpired') setCatalogError(e.message || 'Could not load plans.'); });
    // eslint-disable-next-line
  }, []);

  const selectPlan = useCallback(async (planId) => {
    setStage('loading');
    setError(null);
    try {
      const data = await withTokenExpiry(paymentApi.createIntent(planId), authCtx);
      setIntent(data);
      setStage('ready');
    } catch (e) {
      if (e?.code !== 'TokenExpired') {
        setError(e.message || 'Could not start checkout.');
        setStage('plans');
      }
    }
    // eslint-disable-next-line
  }, []);

  const backToPlans = () => {
    setIntent(null);
    setStage('plans');
    setError(null);
  };

  const pollForConfirmation = async (paymentIntentId) => {
    setStage('confirming');
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        const data = await refreshPayment(paymentIntentId);
        if (data?.is_paid) {
          setStage('success');
          setTimeout(() => onUnlocked?.(), 900); // brief success flash, then let the caller re-fetch/re-render
          return;
        }
      } catch { /* keep polling */ }
      await new Promise(r => setTimeout(r, 2000));
    }
    setStage('ready');
    setError('Payment is still being confirmed — this can take a moment. Check back shortly.');
  };

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <button type="button" className={s.close} onClick={onClose}>×</button>

        {stage === 'plans' && (
          <>
            <PricingSectionHeader eyebrow="Pricing" title="Simple pricing," accent="priced by prompts." subtitle={subtitle} />
            {catalogError && <div className={s.errorBox}>{catalogError}</div>}
            {!catalog && !catalogError && <div className={s.loadingRow}><span className={s.spinner} /><span>Loading plans…</span></div>}
            {catalog && (
              <>
                <PlanCards plans={catalog.plans} onSelect={selectPlan} ctaLabel="Unlock now" />
                <PricingFooter />
              </>
            )}
            {error && <div className={s.errorBox}>{error}</div>}
          </>
        )}

        {stage !== 'plans' && (
          <div className={s.head}>
            <span className={s.icon}>🔒</span>
            <span className={s.title}>{title}</span>
          </div>
        )}

        {stage === 'loading' && (
          <div className={s.loadingRow}><span className={s.spinner} /><span>Preparing checkout…</span></div>
        )}

        {stage === 'confirming' && (
          <div className={s.loadingRow}><span className={s.spinner} /><span>Confirming your payment…</span></div>
        )}

        {stage === 'success' && (
          <div className={s.successBox}>
            <span className={s.successIcon}>✅</span>
            <strong>Payment confirmed — unlocking…</strong>
          </div>
        )}

        {(stage === 'ready' || stage === 'failed') && intent && (
          <div className={s.checkoutBox}>
            <div className={s.checkoutHead}>
              <span className={s.checkoutPrice}>{intent.amount} {intent.currency} — {intent.plan_name}</span>
              <button type="button" className={s.cancelLink} onClick={backToPlans}>Choose a different plan</button>
            </div>
            <PaymentDropIn
              intent={intent}
              onSuccess={() => pollForConfirmation(intent.payment_intent_id)}
              onError={(msg) => { setStage('failed'); setError(msg); }}
              onCancel={backToPlans}
            />
            {error && <div className={s.errorBox}>{error}</div>}
            {stage === 'failed' && (
              <button type="button" className={s.retryBtn} onClick={() => selectPlan(intent.plan_id)}>Try again</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
