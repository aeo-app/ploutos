import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { paymentApi } from '../api/paymentApi';
import { withTokenExpiry } from '../api/authApi';
import { useAuth } from './AuthContext';

const PaymentCtx = createContext(null);

export function PaymentProvider({ children }) {
  const { goScreen, logout } = useAuth();
  const [status, setStatus] = useState({
    is_paid: false, paid_until: null, plan: null, plan_name: null,
    auto_renew: false, payment_method_summary: null, renewal_status: null,
    renewal_failure_reason: null, last_renewal_attempt_at: null,
  });
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async (paymentIntentId) => {
    setChecking(true);
    setError(null);
    try {
      const data = await withTokenExpiry(paymentApi.getStatus(paymentIntentId), { goScreen, logout });
      setStatus(data);
      return data;
    } catch (e) {
      // withTokenExpiry already redirected to login for an expired session;
      // for any other error we fail closed (treat as "not paid") rather
      // than silently unlocking the app on a network hiccup.
      if (e?.code !== 'TokenExpired') {
        setError(e.message || 'Could not check payment status.');
        setStatus({
          is_paid: false, paid_until: null, plan: null, plan_name: null,
          auto_renew: false, payment_method_summary: null, renewal_status: null,
          renewal_failure_reason: null, last_renewal_attempt_at: null,
        });
      }
      return null;
    } finally {
      setChecking(false);
    }
    // eslint-disable-next-line
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <PaymentCtx.Provider value={{
      isPaid: status.is_paid, paidUntil: status.paid_until, plan: status.plan, planName: status.plan_name,
      autoRenew: status.auto_renew, paymentMethodSummary: status.payment_method_summary,
      renewalStatus: status.renewal_status, renewalFailureReason: status.renewal_failure_reason,
      lastRenewalAttemptAt: status.last_renewal_attempt_at,
      checking, error, refresh,
    }}>
      {children}
    </PaymentCtx.Provider>
  );
}

export function usePayment() {
  const ctx = useContext(PaymentCtx);
  if (!ctx) throw new Error('usePayment must be used within a PaymentProvider');
  return ctx;
}
