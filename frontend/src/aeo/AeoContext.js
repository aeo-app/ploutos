import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { withTokenExpiry } from '../api/authApi';
import { historyApi } from '../api/historyApi';
import { aeoApi } from '../api/aeoApi';

const Ctx = createContext(null);
const EMPTY = { custom_prompts: [], custom_competitors: [], selected_prompts: [], social_links: {}, blog_state: {}, post_state: {} };

export function AeoProvider({ children }) {
  const { state, runApi, toast, requirePayment } = useApp();
  const { goScreen, logout } = useAuth();
  const analysis = state.results.aeoPrompts || null;

  const [saved, setSaved] = useState(EMPTY);
  const [savedLoaded, setSavedLoaded] = useState(false);
  const [prev, setPrev] = useState(null);                 // the analysis before the latest one → KPI deltas
  const [lastRun, setLastRun] = useState(null);           // ISO timestamp of the latest analysis
  const [content, setContent] = useState({ strategy: {}, blog: {}, social: {} });
  const [busy, setBusy] = useState({});                   // "strategy|prompt" → true while generating
  const inflight = useRef(new Set());                 // de-dupes concurrent generations of the same asset
  const savedRef = useRef(saved);
  savedRef.current = saved;

  /* ── saved dashboard state ─────────────────────────────── */
  useEffect(() => {
    let off = false;
    aeoApi.getState()
      .then(d => { if (!off) setSaved({ ...EMPTY, ...d }); })
      .catch(e => console.warn('[aeo] state load failed:', e?.message || e))
      .finally(() => { if (!off) setSavedLoaded(true); });
    // previous + latest timestamps for the deltas / "last run" label
    historyApi.list({ analysisType: 'aeo_prompts', limit: 2 })
      .then(async d => {
        const items = d?.items || [];
        if (items[0]?.created_at) setLastRun(items[0].created_at);
        if (items[1]) {
          const full = await historyApi.getOne(items[1].analysis_id);
          if (!off && full?.result) setPrev(full.result);
        }
      })
      .catch(e => console.warn('[aeo] history load failed:', e?.message || e));
    return () => { off = true; };
  }, []);

  const patch = useCallback(async (changes) => {
    const before = savedRef.current;
    setSaved(s => ({ ...s, ...changes }));
    try {
      const next = await withTokenExpiry(aeoApi.putState(changes), { goScreen, logout });
      setSaved({ ...EMPTY, ...next });
    } catch (e) {
      setSaved(before);
      if (e.code !== 'TokenExpired') toast({ type: 'error', message: e.message || 'Could not save that change.' });
    }
  }, [goScreen, logout, toast]);

  /* ── prompts / competitors / selection ─────────────────── */
  const addPrompt = (text) => {
    const t = text.trim();
    if (!t) return;
    if (saved.custom_prompts.some(p => p.toLowerCase() === t.toLowerCase())) return;
    patch({ custom_prompts: [t, ...saved.custom_prompts] });
  };
  const removePrompt = (text) => patch({
    custom_prompts: saved.custom_prompts.filter(p => p !== text),
    selected_prompts: saved.selected_prompts.filter(p => p !== text),
  });
  const addCompetitor = (name, domain) => {
    const n = name.trim();
    if (!n) return;
    if (saved.custom_competitors.some(c => c.name.toLowerCase() === n.toLowerCase())) return;
    patch({ custom_competitors: [...saved.custom_competitors, { name: n, domain: (domain || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '') }] });
  };
  const removeCompetitor = (name) => patch({ custom_competitors: saved.custom_competitors.filter(c => c.name !== name) });
  const togglePrompt = (text) => {
    const on = saved.selected_prompts.includes(text);
    if (!on && saved.selected_prompts.length >= 20) { toast({ type: 'info', message: 'You can select up to 20 prompts.' }); return; }
    patch({ selected_prompts: on ? saved.selected_prompts.filter(p => p !== text) : [...saved.selected_prompts, text] });
  };
  const clearSelection = () => patch({ selected_prompts: [] });

  /* ── the analysis itself ───────────────────────────────── */
  const runAnalysis = useCallback(async () => {
    const r = state.request;
    if (!r.company_name || !r.url) {
      toast({ type: 'error', message: 'Add your company name and website in your profile first.' });
      return null;
    }
    const before = state.results.aeoPrompts;
    try {
      const data = await runApi('aeoPrompts', aeoApi.prompts, {
        company_name: r.company_name, url: r.url, market: r.market || 'Singapore', industry: r.industry || 'General',
        extra_prompts: savedRef.current.custom_prompts,
        extra_competitors: savedRef.current.custom_competitors.map(c => c.name),
      });
      if (before) setPrev(before);
      setLastRun(new Date().toISOString());
      // generated content is per-prompt, cached server-side; a fresh run keeps those caches.
      return data;
    } catch (_) { return null; }
  }, [state.request, state.results.aeoPrompts, runApi, toast]);

  /* ── per-prompt generated content (paid) ───────────────── */
  const generate = useCallback(async (kind, key, payloadKey, call, refresh = false) => {
    const bk = `${kind}|${key}`;
    if (inflight.current.has(bk)) return null;
    inflight.current.add(bk);
    setBusy(b => ({ ...b, [bk]: true }));
    try {
      const r = state.request;
      const data = await withTokenExpiry(call({
        company_name: r.company_name, url: r.url, market: r.market || 'Singapore', industry: r.industry || 'General', refresh, ...payloadKey,
      }), { goScreen, logout });
      setContent(c => ({ ...c, [kind]: { ...c[kind], [key]: data } }));
      return data;
    } catch (e) {
      if (e.code === 'PaymentRequired') requirePayment(kind === 'strategy' ? 'aeoStrategy' : kind === 'blog' ? 'aeoBlog' : 'aeoSocial');
      else if (e.code !== 'TokenExpired') toast({ type: 'error', message: e.message });
      return null;
    } finally {
      inflight.current.delete(bk);
      setBusy(b => { const n = { ...b }; delete n[bk]; return n; });
    }
  }, [state.request, goScreen, logout, toast, requirePayment]);

  const loadStrategy = (prompt, refresh) => generate('strategy', prompt, { prompt }, aeoApi.strategy, refresh);
  const loadSocial   = (prompt, refresh) => generate('social', prompt, { prompt }, aeoApi.socialPosts, refresh);
  const loadBlogDraft = (prompt, topic, refresh) =>
    generate('blog', `${prompt}|${topic.title}`, { prompt, type: topic.type, title: topic.title, words: topic.words || 1000 }, aeoApi.blogDraft, refresh);

  /* ── social links ──────────────────────────────────────── */
  const linkSocial = useCallback(async (platform, url) => {
    try {
      const next = await withTokenExpiry(aeoApi.linkSocial(platform, url), { goScreen, logout });
      setSaved({ ...EMPTY, ...next });
      return { ok: true };
    } catch (e) { return { ok: false, message: e.message }; }
  }, [goScreen, logout]);
  const unlinkSocial = useCallback(async (platform) => {
    try { setSaved({ ...EMPTY, ...(await withTokenExpiry(aeoApi.unlinkSocial(platform), { goScreen, logout })) }); } catch (e) { toast({ type: 'error', message: e.message }); }
  }, [goScreen, logout, toast]);

  const setBlogState = (k, p) => patch({ blog_state: { ...saved.blog_state, [k]: { ...(saved.blog_state[k] || {}), ...p } } });
  const setPostState = (k, p) => patch({ post_state: { ...saved.post_state, [k]: { ...(saved.post_state[k] || {}), ...p } } });
  const setPostStates = (map) => patch({ post_state: { ...saved.post_state, ...Object.fromEntries(Object.entries(map).map(([k, p]) => [k, { ...(saved.post_state[k] || {}), ...p }])) } });

  const value = useMemo(() => ({
    analysis, prev, lastRun, saved, savedLoaded, content, busy, loading: !!state.loading.aeoPrompts,
    addPrompt, removePrompt, addCompetitor, removeCompetitor, togglePrompt, clearSelection, runAnalysis,
    loadStrategy, loadSocial, loadBlogDraft, linkSocial, unlinkSocial, setBlogState, setPostState, setPostStates,
    // eslint-disable-next-line
  }), [analysis, prev, lastRun, saved, savedLoaded, content, busy, state.loading.aeoPrompts, runAnalysis, generate, patch]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAeo = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAeo must be inside AeoProvider');
  return c;
};

/** Everything the Prompts/Dashboard tables need: backend rows + the user's pending custom prompts. */
export function usePromptRows() {
  const { analysis, saved } = useAeo();
  return useMemo(() => {
    const rows = (analysis?.prompts || []).map(p => ({ ...p }));
    const have = new Set(rows.map(p => p.text.toLowerCase()));
    const pending = saved.custom_prompts.filter(t => !have.has(t.toLowerCase()))
      .map(t => ({ rank: 0, text: t, intent: 'Custom', volume_estimate: 0, engines: [null, null, null, null], custom: true, locked: false, pending: true }));
    return { rows: [...pending, ...rows], pendingCount: pending.length };
  }, [analysis, saved.custom_prompts]);
}
