import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { historyApi } from '../api/historyApi';
import { withTokenExpiry } from '../api/authApi';

export function useLatestHistoryRequest() {
  const { state, setRequest } = useApp();
  const { goScreen, logout } = useAuth();

  useEffect(() => {
    if (state.request.company_name || state.request.url) return;

    let cancelled = false;
    const authCtx = { goScreen, logout };

    const load = async () => {
      try {
        const page = await withTokenExpiry(historyApi.list({ limit: 1 }), authCtx);
        const latest = page.items?.[0];
        if (!latest || cancelled) return;

        const record = await withTokenExpiry(historyApi.getOne(latest.analysis_id), authCtx);
        if (cancelled || !record?.request) return;

        const { company_name, url, market, industry } = record.request;
        setRequest({
          company_name: company_name || '',
          url: url || '',
          market: market || 'Singapore',
          industry: industry || '',
        });
      } catch {
        // Ignore prefill failures; the user can still fill the form manually.
      }
    };

    load();
    return () => { cancelled = true; };
  }, [state.request.company_name, state.request.url, setRequest, goScreen, logout]);
}
