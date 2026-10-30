import React, { useEffect, useState } from 'react';
import { UnlockModal } from './UnlockModal';
import { registerPaywallHost, LAPSE_TEXT } from '../../utils/paywall';
import { useApp } from '../../context/AppContext';

/** Shows the pricing plans whenever a paid action is refused for a lapsed subscription (see utils/paywall.js). */
export function PaywallHost() {
  const { toast } = useApp();
  const [req, setReq] = useState(null);

  useEffect(() => registerPaywallHost((info, done) => setReq({ info, done })), []);

  if (!req) return null;
  const finish = (paid) => {
    const { done } = req;
    setReq(null);
    if (paid) toast({ type: 'success', message: '✓ Payment confirmed — continuing with what you asked for.' });
    done(paid);
  };
  const why = LAPSE_TEXT[req.info.reason] || req.info.message || LAPSE_TEXT.expired;
  return (
    <UnlockModal
      title="Choose a plan to continue"
      subtitle={`${why} Pick a plan and complete the payment to carry on where you left off.`}
      onClose={() => finish(false)}
      onUnlocked={() => finish(true)}
    />
  );
}
