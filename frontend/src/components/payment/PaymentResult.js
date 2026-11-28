import React from 'react';
import { paymentApi } from '../../api/paymentApi';

/**
 * What the customer sees once a payment attempt has finished: a full receipt when the money was received, or the
 * exact reason when it was not. Shared by the checkout page, the Billing page and the Starter Pass so all three
 * say the same thing. Nothing here grants access: the plan is only active when the server says the payment SUCCEEDED.
 */

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Polls the server (which asks Airwallex directly) until the payment is settled one way or the other.
 *  Resolves with the status response ({ payment, is_paid, ... }), or null if it is still pending after `tries`. */
export async function waitForPaymentOutcome(paymentIntentId, { tries = 15, interval = 2000 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const data = await paymentApi.getStatus(paymentIntentId);
      if (data?.payment && data.payment.outcome !== 'pending') return data;
    } catch { /* a blip here must not abort the check */ }
    await sleep(interval);
  }
  return null;
}

const fmt = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const fmtDay = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
};

const box = { border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' };
const bad = { border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' };
const row = { display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 13.5, padding: '6px 0', borderTop: '1px solid #dcfce7' };
const btn = { background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer', alignSelf: 'flex-start' };

/** Shown above the card form: the card is kept for automatic renewal, and how to stop it. */
export function AutoRenewNotice({ amount, currency, days = 30 }) {
  return (
    <div data-testid="autorenew-notice" style={{ fontSize: 12.5, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 12px', lineHeight: 1.5 }}>
      <strong style={{ color: '#0f172a' }}>Automatic renewal.</strong> Your card is saved securely with Airwallex, and your plan renews automatically every {days} days
      {amount ? <> at <strong>{amount} {currency}</strong></> : null}. You can cancel any time in Billing; you keep access until the end of the period you paid for.
    </div>
  );
}

export function PaymentReceipt({ payment, onContinue, continueLabel = 'Continue to dashboard' }) {
  if (!payment) return null;
  const card = payment.card || {};
  const cardText = card.brand || card.last4 ? `${card.brand || 'Card'}${card.last4 ? ` •••• ${card.last4}` : ''}` : (card.summary || '');
  const rows = [
    ['Amount received', `${payment.amount} ${payment.currency}`],
    ['Plan', payment.plan_name || payment.description],
    payment.paid_at ? ['Paid on', fmt(payment.paid_at)] : null,
    cardText ? ['Paid with', cardText] : null,
    payment.access_until ? ['Access until', fmtDay(payment.access_until)] : null,
    ['Payment ID', payment.payment_intent_id],
  ].filter(Boolean);
  return (
    <div style={box} data-testid="payment-receipt" role="status">
      <strong style={{ color: '#047857', fontSize: 16 }}>✓ Payment received — your {payment.is_pass ? 'Starter Pass' : 'plan'} is active</strong>
      <div>{rows.map(([k, v]) => (
        <div key={k} style={row}><span style={{ color: '#475569' }}>{k}</span><span style={{ fontWeight: 600, color: '#0f172a', wordBreak: 'break-all', textAlign: 'right' }}>{v}</span></div>
      ))}</div>
      {!payment.is_pass && (
        <div style={{ fontSize: 13, color: '#334155' }} data-testid="receipt-renewal">
          {payment.auto_renew
            ? <>Auto-renewal is <strong>on</strong>. Your card will be charged automatically on {fmtDay(payment.access_until)}. Cancel any time in Billing.</>
            : <>Auto-renewal will switch on as soon as your bank confirms the saved card (usually within a minute). You can check it in Billing.</>}
        </div>
      )}
      {onContinue && <button type="button" style={btn} onClick={onContinue} data-testid="receipt-continue">{continueLabel}</button>}
    </div>
  );
}

export function PaymentFailure({ message, onRetry }) {
  return (
    <div style={bad} data-testid="payment-failed" role="alert">
      <strong style={{ color: '#b91c1c', fontSize: 16 }}>Payment failed — your plan was not activated</strong>
      <div style={{ fontSize: 13.5, color: '#7f1d1d' }}>{message || 'The payment did not go through.'}</div>
      <div style={{ fontSize: 12.5, color: '#475569' }}>You have not been charged for a plan. Please check the card details or try a different card.</div>
      {onRetry && <button type="button" style={btn} onClick={onRetry}>Try again</button>}
    </div>
  );
}
