import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar }  from './TopBar';
import { useApp } from '../../context/AppContext';
import { UnlockModal } from '../payment/UnlockModal';
import { historyApi } from '../../api/historyApi';
import s from './AppShell.module.css';

const FEATURE_LABEL = {
  competitors: 'competitor analysis', keywords: 'keyword data', profile: 'company profiles',
  domainAuthority: 'domain authority strategy', fullReport: 'the full report',
};

// Backend analysis_type (snake_case, saved to DynamoDB) -> frontend result
// key (camelCase, used in AppContext's state.results).
const ANALYSIS_TYPE_TO_RESULT_KEY = {
  competitors: 'competitors',
  keywords: 'keywords',
  profile: 'profile',
  domain_authority: 'domainAuthority',
  full_report: 'fullReport',
  content_strategy: 'contentStrategy',
  relocation_social_calendar: 'relocationCalendar',
};

export function AppShell({ children, profile }) {
  const [open, setOpen] = useState(false);
  const { state, setRequest, setResultKey, clearPaymentRequired, toast } = useApp();

  // Prepopulate the shared request form (company_name/url/market/industry —
  // used by every analysis page via AnalyseForm), so users aren't retyping
  // the same details every visit. Profile (set at signup or one-time
  // completion — see CompleteProfilePage) is the authoritative source and
  // takes priority; history is only a fallback for market/industry, which
  // aren't captured in the profile.
  useEffect(() => {
    if (state.request.company_name) return; // already filled (this session or by the user)

    if (profile?.company_name && profile?.domain) {
      setRequest({ company_name: profile.company_name, url: profile.domain });
      // still pull market/industry from history if available, since the
      // profile only carries company_name/domain, not those two.
      historyApi.list({ limit: 1 })
        .then(data => {
          const latest = data?.items?.[0];
          if (latest) setRequest({ market: latest.market || 'Singapore', industry: latest.industry || '' });
        })
        .catch(err => console.warn("[AppShell] market/industry prepopulation failed:", err?.message || err));
      return;
    }

    historyApi.list({ limit: 1 })
      .then(data => {
        const latest = data?.items?.[0];
        if (latest) {
          setRequest({
            company_name: latest.company_name || '',
            url: latest.url || '',
            market: latest.market || 'Singapore',
            industry: latest.industry || '',
          });
        }
      })
      .catch(err => console.warn("[AppShell] history prepopulation failed:", err?.message || err));
    // eslint-disable-next-line
  }, [profile]);

  // Rehydrate RESULTS (not just form fields) from history on every fresh
  // load/refresh. state.results only ever lives in memory — a full page
  // refresh wipes it, even though the analysis is safely saved server-side.
  // Without this, running a Full Report and then refreshing showed "no
  // analysis yet" everywhere despite the data existing in history.
  //
  // Fetches the latest record of EACH analysis type independently (not one
  // combined query) so a type with no recent activity doesn't get crowded
  // out by frequent activity in another type. Competitors/Keywords/Profile/
  // Domain-Authority pages already fall back to
  // `state.results.fullReport?.<section>` when their own slot is empty, so
  // rehydrating just `fullReport` alone is enough to light all 4 of those
  // pages back up too if that's the user's most recent activity.
  useEffect(() => {
    Object.entries(ANALYSIS_TYPE_TO_RESULT_KEY).forEach(([analysisType, resultKey]) => {
      historyApi.list({ analysisType, limit: 1 })
        .then(data => {
          const latest = data?.items?.[0];
          if (!latest) return null;
          return historyApi.getOne(latest.analysis_id);
        })
        .then(full => {
          if (full?.result) setResultKey(resultKey, full.result);
        })
        .catch(err => console.warn(`[AppShell] results rehydration failed for ${analysisType}:`, err?.message || err));
    });
    // Runs once per fresh mount (i.e. once per page load/refresh) — safe to
    // fire-and-forget in parallel, and safe to only ever run once since a
    // real page refresh is the only thing that wipes state.results anyway.
    // eslint-disable-next-line
  }, []);

  return (
    <div className={s.shell}>
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className={s.main}>
        <TopBar onMenu={() => setOpen(v => !v)} />
        <main className={s.content}>{children}</main>
      </div>

      {state.paymentRequiredFor && (
        <UnlockModal
          title="Payment required"
          subtitle={`Unlock ${FEATURE_LABEL[state.paymentRequiredFor] || 'this feature'} by choosing a plan.`}
          onClose={clearPaymentRequired}
          onUnlocked={() => {
            clearPaymentRequired();
            toast({ type: 'success', message: '✓ Unlocked — click the button again to run it.' });
          }}
        />
      )}
    </div>
  );
}
