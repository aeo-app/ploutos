import { useRef, useEffect } from 'react';
import { init, createElement } from '@airwallex/components-sdk';
import { AIRWALLEX_ENV } from '../../api/config';

// Previously this had its OWN local `const AIRWALLEX_ENV = 'demo'`, completely
// separate from and ignoring src/api/config.js's shared value ("prod") — the
// SDK was initializing in sandbox mode while the backend (almost certainly
// configured for prod Airwallex credentials in a real deployment) creates
// PaymentIntents whose client_secret only works in ITS environment. That
// mismatch is exactly what produces Airwallex's "Access denied,
// authentication failed" error — the two sides were never in the same
// environment to begin with.

/**
 * Mounts an Airwallex Drop-in element for a given PaymentIntent. Pure
 * SDK-mounting concern only — the parent owns the intent/stage state
 * machine (see BillingPage.js and CheckoutPage.js, which both need this but
 * drive their own surrounding UI/flow differently).
 */
export function PaymentDropIn({ intent, onSuccess, onError, onCancel }) {
  const containerRef = useRef(null);
  const elementRef = useRef(null);

  useEffect(() => {
    if (!intent || !containerRef.current) return;
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

        element.on('success', () => onSuccess?.());
        element.on('error', (evt) => onError?.(evt?.detail?.error?.message || 'Payment failed.'));
        element.on('cancel', () => onCancel?.());
      } catch (e) {
        onError?.(e.message || 'Could not load the payment form.');
      }
    })();

    return () => {
      cancelled = true;
      elementRef.current?.destroy?.();
    };
    // eslint-disable-next-line
  }, [intent]);

  return <div ref={containerRef} style={{ minHeight: 240 }} />;
}
