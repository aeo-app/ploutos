import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { withTokenExpiry } from '../api/authApi';
import { useAuth } from './AuthContext';

const Ctx = createContext(null);

const init = {
  page: 'home',
  request: { company_name: '', url: '', market: 'Singapore', industry: '' },
  results:  { competitors: null, keywords: null, profile: null, domainAuthority: null, fullReport: null, contentStrategy: null, relocationCalendar: null },
  loading:  { competitors: false, keywords: false, profile: false, domainAuthority: false, fullReport: false, contentStrategy: false, relocationCalendar: false },
  errors:   { competitors: null, keywords: null, profile: null, domainAuthority: null, fullReport: null, contentStrategy: null, relocationCalendar: null },
  toasts: [],
  // Set (to a feature key, e.g. "competitors") whenever an API call returns
  // 402 Payment Required — payment is triggered by attempting to access
  // restricted content, never by simply logging in. AppShell renders a
  // single shared UnlockModal reacting to this instead of each page having
  // to handle it individually.
  paymentRequiredFor: null,
};

let tid = 0;

function reducer(s, a) {
  switch (a.type) {
    case 'SET_PAGE':    return { ...s, page: a.page };
    case 'SET_REQUEST': return { ...s, request: { ...s.request, ...a.payload } };
    case 'SET_LOADING': return { ...s, loading: { ...s.loading, [a.key]: a.val } };
    case 'SET_RESULT':  return { ...s, results: { ...s.results, [a.key]: a.data }, errors: { ...s.errors, [a.key]: null } };
    case 'SET_ERROR':   return { ...s, errors: { ...s.errors, [a.key]: a.err }, loading: { ...s.loading, [a.key]: false } };
    case 'ADD_TOAST':   return { ...s, toasts: [...s.toasts, a.toast] };
    case 'REM_TOAST':   return { ...s, toasts: s.toasts.filter(t => t.id !== a.id) };
    case 'SET_PAYMENT_REQUIRED': return { ...s, paymentRequiredFor: a.key, loading: { ...s.loading, [a.key]: false } };
    case 'CLEAR_PAYMENT_REQUIRED': return { ...s, paymentRequiredFor: null };
    case 'CLEAR':       return { ...s, results: init.results, errors: init.errors, loading: init.loading };
    default: return s;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, init);
  const { goScreen, logout } = useAuth();

  const setPage    = useCallback(p => dispatch({ type: 'SET_PAGE', page: p }), []);
  const setRequest = useCallback(f => dispatch({ type: 'SET_REQUEST', payload: f }), []);
  const clearAll   = useCallback(() => dispatch({ type: 'CLEAR' }), []);

  const toast = useCallback(({ message, type = 'info', duration = 4500 }) => {
    const id = ++tid;
    dispatch({ type: 'ADD_TOAST', toast: { id, message, type, duration } });
    setTimeout(() => dispatch({ type: 'REM_TOAST', id }), duration);
  }, []);

  const dismissToast = useCallback(id => dispatch({ type: 'REM_TOAST', id }), []);

  // Raw setters — for flows like SSE streaming that update state
  // incrementally over time rather than via a single awaited runApi() call.
  const setLoadingKey = useCallback((key, val) => dispatch({ type: 'SET_LOADING', key, val }), []);
  const setResultKey  = useCallback((key, data) => dispatch({ type: 'SET_RESULT', key, data }), []);
  const setErrorKey   = useCallback((key, err) => dispatch({ type: 'SET_ERROR', key, err }), []);

  const clearPaymentRequired = useCallback(() => dispatch({ type: 'CLEAR_PAYMENT_REQUIRED' }), []);

  const runApi = useCallback(async (key, fn, req) => {
    dispatch({ type: 'SET_LOADING', key, val: true });
    try {
      const apiCall = fn(req);
      const data = await withTokenExpiry(apiCall, { goScreen, logout });
      dispatch({ type: 'SET_RESULT', key, data });
      return data;
    } catch (e) {
      if (e.code === 'PaymentRequired') {
        // Restricted content — trigger payment here, contextually, rather
        // than blocking the whole app. No generic error toast for this one;
        // AppShell's shared UnlockModal takes over instead.
        dispatch({ type: 'SET_PAYMENT_REQUIRED', key });
      } else if (e.code !== 'TokenExpired') {
        // Only show error if not TokenExpired (withTokenExpiry already handles redirect)
        dispatch({ type: 'SET_ERROR', key, err: e.message });
        toast({ type: 'error', message: e.message });
      }
      throw e;
    } finally {
      dispatch({ type: 'SET_LOADING', key, val: false });
    }
  }, [toast, goScreen, logout]);

  return (
    <Ctx.Provider value={{
      state, setPage, setRequest, clearAll, toast, dismissToast, runApi,
      setLoadingKey, setResultKey, setErrorKey, clearPaymentRequired,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp must be inside AppProvider');
  return c;
};
