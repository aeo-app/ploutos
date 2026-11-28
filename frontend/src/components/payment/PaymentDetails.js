import React, { useEffect, useState } from 'react';
import { paymentApi } from '../../api/paymentApi';

const fmt = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
};

/** Full details of one payment: received (credited) or not received, with the reason. */
export function PaymentDetailsModal({ payment, onClose }) {
  const [d, setD] = useState(payment);   // show what the list already knows straight away, then the live details
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    paymentApi.getPaymentDetail(payment.payment_intent_id)
      .then(r => { if (live) setD(r); })
      .catch(e => { if (live) setErr(e.message || 'Could not load the latest details.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [payment.payment_intent_id]);

  const ok = d.outcome === 'succeeded';
  const failed = d.outcome === 'failed';
  const tone = ok ? '#15803d' : failed ? '#b91c1c' : '#a16207';
  const bg = ok ? '#f0fdf4' : failed ? '#fef2f2' : '#fefce8';
  const card = d.card_last4 ? `${d.card_brand || 'Card'} •••• ${d.card_last4}` : '—';
  const rows = [
    ['Amount', `${d.amount} ${d.currency}`],
    ['Plan', d.plan_name || d.plan_id || '—'],
    ['Type', d.is_renewal ? 'Automatic renewal' : 'Checkout'],
    ['Payment status', d.status || '—'],
    ['Card', card],
    ['Started', fmt(d.created_at)],
    ['Last updated', fmt(d.updated_at)],
    ...(ok ? [['Access until', d.access_until ? fmt(d.access_until) : '—'], ['Auto-renewal', d.auto_renew ? 'On' : 'Off']] : []),
    ['Payment ID', d.payment_intent_id],
  ];
  const row = { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: '1px solid #eef0f4', fontSize: 13.5 };

  return (
    <div role="dialog" aria-modal="true" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, maxWidth: 480, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 22, boxShadow: '0 20px 50px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ fontSize: 16 }}>Payment details</strong>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: 0, background: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ background: bg, color: tone, borderRadius: 10, padding: '11px 13px', marginBottom: 12, fontSize: 13.5 }}>
          <div style={{ fontWeight: 700 }}>{ok ? '✓ Credited — payment received' : failed ? '✕ Not credited — payment failed' : '… Not credited yet — waiting for the bank'}</div>
          <div style={{ marginTop: 3 }}>{d.note || (ok ? 'Your plan is active.' : failed ? 'No money was taken and your plan was not activated.' : 'Nothing has been charged or activated yet.')}</div>
        </div>

        {failed && (
          <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 13px', marginBottom: 12, fontSize: 13.5 }}>
            <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 3 }}>Why it failed</div>
            <div>{d.failure_reason}</div>
            {(d.bank_error_code || d.bank_error_message) && (
              <div style={{ marginTop: 6, fontSize: 12.5, color: '#64748b' }}>
                Bank / Airwallex said: {[d.bank_error_code, d.bank_error_message].filter(Boolean).join(' — ')}
              </div>
            )}
          </div>
        )}

        {rows.map(([k, v]) => (
          <div key={k} style={row}><span style={{ color: '#64748b' }}>{k}</span><span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-all' }}>{v}</span></div>
        ))}
        {loading && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>Checking the latest status…</div>}
        {err && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 10 }}>{err}</div>}
      </div>
    </div>
  );
}
