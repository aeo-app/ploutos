import React from 'react';
import { Button } from '../ui/Button';
import { Card, SectionHeader } from '../ui/UI';
import { usePayment } from '../../context/PaymentContext';
import { useApp } from '../../context/AppContext';

export function FeaturePaywall({ title, subtitle, bullets = [] }) {
  const { isPaid } = usePayment();
  const { setPage } = useApp();

  if (isPaid) return null;

  return (
    <Card>
      <SectionHeader title={title} subtitle={subtitle} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
        <div style={{ color: 'var(--c-slate-600)', lineHeight: 1.7 }}>
          This module is only available on a paid plan. Upgrade to unlock live generation, saved history, and full result export.
        </div>
        {bullets.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--c-slate-700)', display: 'grid', gap: 10 }}>
            {bullets.map((item, idx) => <li key={idx}>{item}</li>)}
          </ul>
        )}
        <div>
          <Button onClick={() => setPage('billing')}>Go to Billing</Button>
        </div>
      </div>
    </Card>
  );
}
