import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { withTokenExpiry } from '../api/authApi';
import { historyApi } from '../api/historyApi';
import { aeoApi } from '../api/aeoApi';
import { seoApi, isActingAs } from '../api/seoApi';
import { usePayment } from '../context/PaymentContext';

const Ctx = createContext(null);
const EMPTY = { custom_prompts: [], custom_competitors: [], hidden_competitors: [], hidden_prompts: [], selected_prompts: [], social_links: {}, blog_state: {}, post_state: {}, calendar_keywords: [], custom_blog_topics: [], calendar_start: '', brand: {} };

export function AeoProvider({ children }) {
  const { state, runApi, toast, requirePayment } = useApp();
  const { goScreen, logout } = useAuth();
  const { isPaid } = usePayment();
  const rawAnalysis = state.results.aeoPrompts || null;

  const [saved, setSaved] = useState(EMPTY);
  const [brand, setBrandState] = useState({ loaded: false, complete: false, missing: [], data: {} });
  const [savedLoaded, setSavedLoaded] = useState(false);
  // Everyone (free and paid): one analysis every 30 days. { can_run, next_available, ... } (null until loaded)
  const [quota, setQuota] = useState(null);
  const loadQuota = useCallback(() => aeoApi.analysisQuota().then(q => setQuota(q)).catch(() => {}), []);
  // Competitors the customer removed stay out of every screen (the table, share of voice, domain authority bars).
  const hiddenKey = (saved.hidden_competitors || []).join('\u0001').toLowerCase() + '\u0002' + (saved.hidden_prompts || []).join('\u0001').toLowerCase();
  const analysis = useMemo(() => {
    if (!rawAnalysis) return null;
    const hideC = new Set((saved.hidden_competitors || []).map(n => n.toLowerCase()));
    const hideP = new Set((saved.hidden_prompts || []).map(n => n.toLowerCase()));
    if (!hideC.size && !hideP.size) return rawAnalysis;
    return {
      ...rawAnalysis,
      competitors: (rawAnalysis.competitors || []).filter(c => c.is_you || !hideC.has(String(c.name).toLowerCase())),
      prompts: (rawAnalysis.prompts || []).filter(p => p.locked || !hideP.has(String(p.text).toLowerCase())),
    };
    // eslint-disable-next-line
  }, [rawAnalysis, hiddenKey]);
  const [team, setTeam] = useState({ blogs: [], social: [], strategy: [] });   // what our team has written for this customer
  const [prev, setPrev] = useState(null);                 // the analysis before the latest one → KPI deltas
  const [lastRun, setLastRun] = useState(null);           // ISO timestamp of the latest analysis
  const [content, setContent] = useState({ strategy: {}, blog: {}, social: {} });
  const [busy, setBusy] = useState({});                   // "strategy|prompt" → true while generating
  const inflight = useRef(new Set());                 // de-dupes concurrent generations of the same asset
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const contentRef = useRef(content);
  contentRef.current = content;

  // Upgrading earns one fresh analysis: re-check the limit as soon as the account becomes paid.
  useEffect(() => { loadQuota(); }, [isPaid, loadQuota]);

  /* ── saved dashboard state ─────────────────────────────── */
  useEffect(() => {
    let off = false;
    loadQuota();
    aeoApi.teamIndex().then(d => { if (!off && d) setTeam({ blogs: d.blogs || [], social: d.social || [], strategy: d.strategy || [] }); }).catch(() => {});
    aeoApi.getBrand().then(d => { if (!off && d) setBrandState({ loaded: true, complete: !!d.complete, missing: d.missing || [], data: d.brand || {}, found: null }); }).catch(() => { if (!off) setBrandState(b => ({ ...b, loaded: true })); });
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

  /* Pull in work our team has done (edits, verified blogs, images) without a page reload. */
  const lastSync = useRef(0);
  const refreshTeamWork = useCallback(async (force = false) => {
    if (Date.now() - lastSync.current < (force ? 0 : 15000)) return;
    lastSync.current = Date.now();
    try {
      const d = await aeoApi.getState();
      setSaved(s => ({ ...EMPTY, ...d }));
    } catch (_) { return; }
    aeoApi.teamIndex().then(t => { if (t) setTeam({ blogs: t.blogs || [], social: t.social || [], strategy: t.strategy || [] }); }).catch(() => {});
    const r = state.request;
    const base = { company_name: r.company_name, url: r.url, market: r.market || 'Global', industry: r.industry || 'General' };
    const jobs = [];
    Object.entries(contentRef.current.social).forEach(([key, c]) => c?.prompt && jobs.push(aeoApi.socialPosts({ ...base, prompt: c.prompt, cycle: c.cycle || 0 }).then(x => ['social', key, x])));
    Object.values(contentRef.current.blog).forEach(c => c?.prompt && c?.title && jobs.push(aeoApi.blogDraft({ ...base, prompt: c.prompt, type: c.type || 'Blog', title: c.title, words: 1000 }).then(x => ['blog', `${c.prompt}|${c.title}`, x])));
    Object.values(contentRef.current.strategy).forEach(c => c?.prompt && jobs.push(aeoApi.strategy({ ...base, prompt: c.prompt }).then(x => ['strategy', c.prompt, x])));
    const done = await Promise.allSettled(jobs);
    setContent(c => {
      const n = { strategy: { ...c.strategy }, blog: { ...c.blog }, social: { ...c.social } };
      done.forEach(j => { if (j.status === 'fulfilled') { const [k, key, x] = j.value; n[k][key] = x; } });
      return n;
    });
  }, [state.request]);
  useEffect(() => {
    const on = () => { if (document.visibilityState !== 'hidden') refreshTeamWork(); };
    window.addEventListener('focus', on); document.addEventListener('visibilitychange', on);
    return () => { window.removeEventListener('focus', on); document.removeEventListener('visibilitychange', on); };
  }, [refreshTeamWork]);

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
    patch({ custom_prompts: [t, ...saved.custom_prompts], hidden_prompts: (saved.hidden_prompts || []).filter(h => h.toLowerCase() !== t.toLowerCase()) });
  };
  // Works for prompts from a saved analysis too (they come back with every run), not just ones typed this session.
  const removePrompt = (text) => patch({
    custom_prompts: saved.custom_prompts.filter(p => p !== text),
    selected_prompts: saved.selected_prompts.filter(p => p !== text),
    hidden_prompts: [...(saved.hidden_prompts || []).filter(h => h.toLowerCase() !== text.toLowerCase()), text].slice(-80),
  });
  const addCompetitor = (name, domain) => {
    const n = name.trim();
    if (!n) return;
    if (saved.custom_competitors.some(c => c.name.toLowerCase() === n.toLowerCase())) return;
    patch({
      custom_competitors: [...saved.custom_competitors, { name: n, domain: (domain || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '') }],
      hidden_competitors: (saved.hidden_competitors || []).filter(h => h.toLowerCase() !== n.toLowerCase()),
    });
  };
  // Works for any competitor — ones we found as well as ones the customer added.
  const removeCompetitor = (name) => patch({
    custom_competitors: saved.custom_competitors.filter(c => c.name.toLowerCase() !== name.toLowerCase()),
    hidden_competitors: [...(saved.hidden_competitors || []).filter(h => h.toLowerCase() !== name.toLowerCase()), name].slice(-60),
  });
  const togglePrompt = (text) => {
    const on = saved.selected_prompts.includes(text);
    if (!on && saved.selected_prompts.length >= 20) { toast({ type: 'info', message: 'You can select up to 20 prompts.' }); return; }
    patch({ selected_prompts: on ? saved.selected_prompts.filter(p => p !== text) : [...saved.selected_prompts, text] });
  };
  const clearSelection = () => patch({ selected_prompts: [] });

  /* ── the analysis itself ───────────────────────────────── */
  const runningRef = useRef(false);
  const runAnalysis = useCallback(async () => {
    if (quota && quota.can_run === false) {
      const when = quota.next_available ? new Date(quota.next_available).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'later';
      toast({ type: 'info', message: `An analysis can be run once every ${quota.interval_days || 30} days. Your next one is available on ${when}.` });
      return null;
    }
    const r = state.request;
    if (!r.company_name || !r.url) {
      toast({ type: 'error', message: 'Add your company name and website in your profile first.' });
      return null;
    }
    if (runningRef.current) return null;        // one analysis at a time (e.g. a click while the plans popup is open)
    runningRef.current = true;
    const before = state.results.aeoPrompts;
    try {
      const data = await runApi('aeoPrompts', aeoApi.prompts, {
        company_name: r.company_name, url: r.url, market: r.market || 'Global', industry: r.industry || 'General',
        extra_prompts: savedRef.current.custom_prompts,
        extra_competitors: savedRef.current.custom_competitors.map(c => c.name),
      });
      if (before) setPrev(before);
      setLastRun(new Date().toISOString());
      loadQuota();
      // generated content is per-prompt, cached server-side; a fresh run keeps those caches.
      return data;
    } catch (e) { if (e.code === 'AnalysisLimit') loadQuota(); return null; }
    finally { runningRef.current = false; }
  }, [state.request, state.results.aeoPrompts, runApi, toast, quota, loadQuota]);

  /* ── per-prompt generated content (paid) ───────────────── */
  const generate = useCallback(async (kind, key, payloadKey, call, refresh = false) => {
    const bk = `${kind}|${key}`;
    if (inflight.current.has(bk)) return null;
    inflight.current.add(bk);
    setBusy(b => ({ ...b, [bk]: true }));
    try {
      const r = state.request;
      const data = await withTokenExpiry(call({
        company_name: r.company_name, url: r.url, market: r.market || 'Global', industry: r.industry || 'General', refresh, ...payloadKey,
      }), { goScreen, logout });
      setContent(c => ({ ...c, [kind]: { ...c[kind], [key]: data } }));
      // The server remembers the keywords it built the calendar around (top 10 from the website when none were given).
      if (kind === 'social' && data?.keywords?.length && !(savedRef.current.calendar_keywords || []).length) setSaved(s => ({ ...s, calendar_keywords: data.keywords }));
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
  // Month 1 is stored under the prompt itself (so our team's edits stay attached); later months under "<prompt>#m<n>".
  const socialKey = (prompt, cycle = 0) => (cycle ? `${prompt}#m${cycle}` : prompt);
  const loadSocial   = async (prompt, refresh, cycle = 0) => {
    return generate('social', socialKey(prompt, cycle), { prompt, cycle, keywords: savedRef.current.calendar_keywords || [] }, aeoApi.socialPosts, refresh);
  };
  const loadBlogDraft = (prompt, topic, refresh) =>
    generate('blog', `${prompt}|${topic.title}`, { prompt, type: topic.type, title: topic.title, words: topic.words || 1000 }, aeoApi.blogDraft, refresh);

  /** Saves the customer's edits to a blog draft and updates the open copy. Returns true on success. */
  const editBlog = async (prompt, title, fields) => {
    try {
      const r = await withTokenExpiry(aeoApi.editBlog({ prompt, title, ...fields }), { goScreen, logout });
      setContent(c => ({ ...c, blog: { ...c.blog, [`${prompt}|${title}`]: { ...(c.blog[`${prompt}|${title}`] || {}), ...r.data } } }));
      return true;
    } catch (e) {
      if (e.code !== 'TokenExpired') toast({ type: 'error', message: e.message || 'Could not save your changes.' });
      return false;
    }
  };

  /** A topic typed in by the customer (or admin). Saved on the account, listed under its prompt. Returns the topic, or null. */
  const addBlogTopic = (prompt, title, type = 'Blog') => {
    const t = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (t.length < 3 || !prompt) return null;
    const cur = savedRef.current.custom_blog_topics || [];
    const topic = { prompt, title: t, type: String(type || 'Blog').slice(0, 30) };
    if (!cur.some(x => x.prompt === prompt && x.title.toLowerCase() === t.toLowerCase())) {
      const next = [...cur, topic];
      savedRef.current = { ...savedRef.current, custom_blog_topics: next };
      patch({ custom_blog_topics: next });
    }
    return topic;
  };
  const removeBlogTopic = (prompt, title) => patch({ custom_blog_topics: (savedRef.current.custom_blog_topics || []).filter(x => !(x.prompt === prompt && x.title === title)) });

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

  /** Saves the customer's edits to one post and updates the open calendar. Returns true on success. */
  const editPost = async (prompt, chId, idx, fields, cycle = 0) => {
    const key = socialKey(prompt, cycle);
    try {
      const r = await withTokenExpiry(aeoApi.editPost(prompt, chId, idx, fields, cycle), { goScreen, logout });
      setContent(c => {
        const doc = c.social[key];
        if (!doc) return c;
        const list = [...(doc.channels[chId] || [])];
        list[idx] = { ...list[idx], ...r.post };
        return { ...c, social: { ...c.social, [key]: { ...doc, channels: { ...doc.channels, [chId]: list } } } };
      });
      return true;
    } catch (e) {
      if (e.code !== 'TokenExpired') toast({ type: 'error', message: e.message || 'Could not save your changes.' });
      return false;
    }
  };

  const setBlogState = (k, p) => { const cur = savedRef.current.blog_state || {}; const next = { ...cur, [k]: { ...(cur[k] || {}), ...p } }; savedRef.current = { ...savedRef.current, blog_state: next }; return patch({ blog_state: next }); };
  // Several blogs at once ("generate for all"): one save, so parallel saves can't overwrite each other.
  const setBlogStates = (map) => { const cur = savedRef.current.blog_state || {}; return patch({ blog_state: { ...cur, ...Object.fromEntries(Object.entries(map).map(([k, p]) => [k, { ...(cur[k] || {}), ...p }])) } }); };
  const setPostState = (k, p) => patch({ post_state: { ...saved.post_state, [k]: { ...(saved.post_state[k] || {}), ...p } } });
  const setPostStates = (map) => patch({ post_state: { ...saved.post_state, ...Object.fromEntries(Object.entries(map).map(([k, p]) => [k, { ...(saved.post_state[k] || {}), ...p }])) } });

  /* ── after paying, replace the locked previews with the full results ─── */
  const unlockedOnce = useRef(false);
  useEffect(() => {
    if (!isPaid || unlockedOnce.current) return;
    const locked = (o) => { try { return JSON.stringify(o || {}).includes('"locked":true'); } catch (_) { return false; } };
    const r = state.results;
    const todo = [];
    if (locked(r.aeoPrompts)) todo.push(() => runAnalysis());
    if (locked(r.domainAuthority)) todo.push(() => runApi('domainAuthority', seoApi.domainAuthority, state.request));
    if (locked(r.profile)) todo.push(() => runApi('profile', seoApi.profile, state.request));
    if (!todo.length) return;
    unlockedOnce.current = true;
    (async () => { for (const f of todo) { try { await f(); } catch (_) { /* shown by the page */ } } })();
    // eslint-disable-next-line
  }, [isPaid, state.results.aeoPrompts, state.results.domainAuthority, state.results.profile]);
  useEffect(() => { if (!isPaid) unlockedOnce.current = false; }, [isPaid]);

  /* ── Brand kit (logo + contact details) ────────────────── */
  const applyBrand = (d) => { if (d?.social_links) setSaved(sv => ({ ...sv, social_links: d.social_links })); if (d) setBrandState(b => ({ ...b, loaded: true, complete: !!d.complete, missing: d.missing || [], data: d.brand || {}, ...(d.found ? { found: d.found } : {}) })); return d; };
  const brandCall = async (promise) => applyBrand(await withTokenExpiry(promise, { goScreen, logout }));
  const saveBrand = (b) => brandCall(aeoApi.saveBrand(b));
  const uploadLogo = (file) => brandCall(aeoApi.uploadLogo(file));
  const [detecting, setDetecting] = useState(false);
  const detectBrand = async () => {
    setDetecting(true);
    try { return await brandCall(aeoApi.detectBrand(state.request.url, state.request.company_name)); } finally { setDetecting(false); }
  };
  const adoptSiteLogo = (u) => brandCall(aeoApi.logoFromSite(u));
  // On login: read the website once for contact details, the logo and the social accounts, so the dashboard can show them straight away.
  const detectRan = useRef(false);
  useEffect(() => {
    if (!brand.loaded || detectRan.current || brand.data?.detected || !state.request.url || isActingAs()) return;
    detectRan.current = true;
    detectBrand().catch(() => { /* the dashboard still works without it */ });
    // eslint-disable-next-line
  }, [brand.loaded, brand.data, state.request.url]);

  /* ── Calendar keywords ─────────────────────────────────── */
  const setCalendarKeywords = (list) => patch({ calendar_keywords: list });
  const setCalendarStart = (iso) => patch({ calendar_start: iso });
  const suggestKeywords = async () => {
    const r = state.request;
    const d = await withTokenExpiry(aeoApi.suggestKeywords({ company_name: r.company_name, url: r.url, market: r.market || 'Global', industry: r.industry || 'General' }), { goScreen, logout });
    return d?.keywords || [];
  };

  const value = useMemo(() => ({
    quota, analysis, prev, lastRun, saved, savedLoaded, team, content, busy, loading: !!state.loading.aeoPrompts,
    addPrompt, removePrompt, addCompetitor, removeCompetitor, togglePrompt, clearSelection, runAnalysis,
    loadStrategy, loadSocial, socialKey, loadBlogDraft, editBlog, addBlogTopic, removeBlogTopic, editPost, refreshTeamWork, linkSocial, unlinkSocial, setBlogState, setBlogStates, setPostState, setPostStates,
    brand, detecting, saveBrand, uploadLogo, detectBrand, adoptSiteLogo, setCalendarKeywords, setCalendarStart, suggestKeywords,
    // eslint-disable-next-line
  }), [analysis, prev, lastRun, saved, savedLoaded, team, content, busy, brand, state.loading.aeoPrompts, runAnalysis, generate, patch]);

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
