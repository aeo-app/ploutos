import React from 'react';
import { SpeedCard } from '../insights/SpeedCard';

/* ── Insights ─────────────────────────────────────────────────────────────────
   Real measurements of the customer's own website, not AI estimates. Each data
   source is its own card in ../insights/, so Google Analytics, Search Console,
   Bing, backlinks and the combined health report each slot in as one more card. */
export function InsightsPage() {
  return <SpeedCard />;
}
