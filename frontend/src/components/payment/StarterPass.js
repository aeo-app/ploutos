import React, { useState, useEffect } from 'react';
import { usePayment } from '../../context/PaymentContext';
import { useAuth } from '../../context/AuthContext';
import { paymentApi } from '../../api/paymentApi';
import { withTokenExpiry } from '../../api/authApi';
import { PaymentDropIn } from './PaymentDropIn';

const SYMBOL = { INR: '₹', SGD: 'S$' };
const WHAT = [
  'The full audit, nothing locked',
  'Select up to 5 prompts',
  '1 content strategy page',
  '1 blog',
  '1 week of posters and reels (3 posters, 2 reels)',
];
/** The pass price for this person's country ("₹700" or "S$10"). Null until known. */
export function usePassPrice() {
  const { pass } = usePayment();
  const [info, setInfo] = useState(null);
  const want = !!pass?.eligible;
  useEffect(() => {
    if (!want) return undefined;
    let live = true;
    paymentApi.getPass().then(d => { if (live && d?.currency) setInfo(d); }).catch(() => {});
    return () => { live = false; };
  }, [want]);
  if (!info) return null;
  const n = Number(info.amount);
  return { currency: info.currency, label: `${SYMBOL[info.currency] || ''}${n.toLocaleString(info.currency === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: 0 })}` };
}

const NAMES = { page: 'content strategy page', blog: 'blog', poster: 'posters', reel: 'reels' };

const card = { border: '1.5px solid #c7d2fe', background: 'linear-gradient(180deg,#eef2ff,#fff)', borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 };
const btn = { border: 'none', background: '#4f46e5', color: '#fff', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' };

/**
 * The one-time Starter Pass offer, shown to free accounts only. The server decides the amount; the person only picks INR or SGD.
 * Self-contained: it runs its own checkout (same Airwallex drop-in as the plans) and calls onDone() once the pass is active.
 */
export function StarterPassOffer({ onDone, compact = false }) {
  const { pass, refresh } = usePayment();
  const { goScreen, logout } = useAuth();
  const price = usePassPrice();
  const [stage, setStage] = useState('idle');   // idle | loading | ready | confirming | success
  const [intent, setIntent] = useState(null);
  const [error, setError] = useState('');

  if (!pass?.eligible && stage === 'idle') return null;

  const start = async () => {
    setStage('loading'); setError('');
    try {
      const data = await withTokenExpiry(paymentApi.createPassIntent(), { goScreen, logout });
      setIntent(data); setStage('ready');
    } catch (e) {
      if (e?.code !== 'TokenExpired') { setError(e.message || 'Could not start checkout.'); setStage('idle'); }
    }
  };
  const confirm = async (id) => {
    setStage('confirming');
    for (let i = 0; i < 15; i++) {
      try {
        const d = await refresh(id);
        if (d?.pass?.active) { setStage('success'); setTimeout(() => onDone?.(), 900); return; }
      } catch { /* keep polling */ }
      await new Promise(r => setTimeout(r, 2000));
    }
    setStage('ready'); setError('Payment is still being confirmed. This can take a moment. Check back shortly.');
  };

  return (
    <div style={card} data-testid="starter-pass-offer">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 17 }}>Starter Pass</strong>
        <span style={{ fontSize: 22, fontWeight: 800, color: '#3730a3' }} data-testid="pass-price">{price?.label || ''}</span>
        <span style={{ fontSize: 12.5, color: '#64748b' }}>one-time payment, no subscription</span>
      </div>
      {!compact && <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: '4px 18px', fontSize: 13.5, color: '#334155' }}>{WHAT.map(w => <li key={w}>{w}</li>)}</ul>}
      {stage === 'idle' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" style={{ ...btn, marginLeft: 'auto' }} onClick={start} disabled={!price} data-testid="pass-buy">{price ? `Get the Starter Pass · ${price.label}` : 'Get the Starter Pass'}</button>
        </div>
      )}
      {stage === 'loading' && <span style={{ fontSize: 13, color: '#64748b' }}>Preparing checkout…</span>}
      {stage === 'confirming' && <span style={{ fontSize: 13, color: '#64748b' }}>Confirming your payment…</span>}
      {stage === 'success' && <strong style={{ color: '#047857' }} data-testid="pass-success">✓ Payment confirmed. Your Starter Pass is active.</strong>}
      {(stage === 'ready') && intent && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700 }}>
            <span>{intent.amount} {intent.currency} · {intent.plan_name}</span>
            <button type="button" style={{ background: 'none', border: 'none', color: '#64748b', textDecoration: 'underline', cursor: 'pointer', fontSize: 12.5 }} onClick={() => { setIntent(null); setStage('idle'); setError(''); }}>Back</button>
          </div>
          <PaymentDropIn intent={intent} onSuccess={() => confirm(intent.payment_intent_id)} onError={(m) => setError(m)} onCancel={() => { setIntent(null); setStage('idle'); }} />
        </div>
      )}
      {error && <div role="alert" style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
    </div>
  );
}

/** What is left of a bought Starter Pass. Renders nothing for anyone else. */
export function StarterPassStatus({ style }) {
  const { pass } = usePayment();
  if (!pass?.active) return null;
  const rem = pass.remaining || {};
  return (
    <div style={{ border: '1px solid #c7d2fe', background: '#eef2ff', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#312e81', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', ...style }} data-testid="pass-status">
      <strong>Starter Pass</strong>
      <span>Up to {pass.prompts || 5} prompts</span>
      {Object.keys(NAMES).map(k => <span key={k} data-testid={`pass-left-${k}`} style={{ opacity: rem[k] ? 1 : .55 }}>{rem[k] || 0} {NAMES[k]} left</span>)}
    </div>
  );
}
