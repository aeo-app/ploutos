import { useState, useEffect, useRef, useReducer, useCallback, useId, createContext, useContext } from "react";

/* ═══════════════════════════════════════════════════════════
   DESIGN TOKENS & GLOBAL STYLES
═══════════════════════════════════════════════════════════ */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 16px; -webkit-font-smoothing: antialiased; scroll-behavior: smooth; }
  body { font-family: 'Plus Jakarta Sans', sans-serif; background: #07090F; color: #E2E8F0; min-height: 100vh; overflow-x: hidden; }
  button { font-family: inherit; cursor: pointer; }
  input, textarea { font-family: inherit; }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

  :root {
    --bg:           #07090F;
    --bg1:          #0C0F1A;
    --bg2:          #111522;
    --bg3:          #161B2E;
    --glass:        rgba(255,255,255,0.035);
    --glass-border: rgba(255,255,255,0.09);
    --glass-hover:  rgba(255,255,255,0.06);

    --p:            #7C6FFF;
    --p2:           #9D93FF;
    --p-dim:        rgba(124,111,255,0.14);
    --p-glow:       rgba(124,111,255,0.28);
    --p-border:     rgba(124,111,255,0.35);

    --teal:         #2DD4BF;
    --teal-dim:     rgba(45,212,191,0.12);
    --rose:         #FB7185;
    --rose-dim:     rgba(251,113,133,0.12);
    --amber:        #FCD34D;
    --amber-dim:    rgba(252,211,77,0.12);
    --sky:          #38BDF8;
    --sky-dim:      rgba(56,189,248,0.12);
    --green:        #4ADE80;
    --green-dim:    rgba(74,222,128,0.12);

    --t1: #F1F5F9;
    --t2: #94A3B8;
    --t3: #475569;
    --t4: #1E293B;

    --r1: 8px;
    --r2: 14px;
    --r3: 20px;
    --r4: 28px;

    --sidebar: 256px;
    --topbar:  64px;

    --ease: cubic-bezier(0.4,0,0.2,1);
    --spring: cubic-bezier(0.34,1.56,0.64,1);
  }

  @keyframes fadeUp    { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
  @keyframes spin      { to{transform:rotate(360deg)} }
  @keyframes spinRev   { to{transform:rotate(-360deg)} }
  @keyframes pulse     { 0%,100%{opacity:.55;transform:scale(1)} 50%{opacity:1;transform:scale(1.06)} }
  @keyframes shimmer   { 0%{background-position:-600px 0} 100%{background-position:600px 0} }
  @keyframes toastIn   { from{opacity:0;transform:translateX(120%)} to{opacity:1;transform:translateX(0)} }
  @keyframes toastOut  { from{opacity:1;transform:translateX(0)} to{opacity:0;transform:translateX(120%)} }
  @keyframes orbitA    { to{transform:rotate(360deg)} }
  @keyframes orbitB    { to{transform:rotate(-360deg)} }
  @keyframes float     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
  @keyframes shake     { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-7px)} 60%{transform:translateX(7px)} }
  @keyframes progress  { from{width:0%} to{width:var(--p-width,100%)} }
  @keyframes countUp   { from{opacity:0;transform:scale(.8)} to{opacity:1;transform:scale(1)} }

  .fadeUp  { animation: fadeUp  .5s var(--ease) both }
  .fadeIn  { animation: fadeIn  .3s var(--ease) both }
  .d100 { animation-delay:.1s } .d200 { animation-delay:.2s }
  .d300 { animation-delay:.3s } .d400 { animation-delay:.4s }

  .skeleton {
    background: linear-gradient(90deg, rgba(255,255,255,.03) 25%, rgba(255,255,255,.08) 50%, rgba(255,255,255,.03) 75%);
    background-size: 600px 100%;
    animation: shimmer 1.6s ease infinite;
    border-radius: var(--r2);
  }

  @media(prefers-reduced-motion:reduce) { *,*::before,*::after { animation-duration:.01ms!important;transition-duration:.01ms!important } }
`;

/* ═══════════════════════════════════════════════════════════
   CONTEXT
═══════════════════════════════════════════════════════════ */
const AppCtx = createContext(null);

let _tid = 0;
const initState = {
  view: "auth",           // auth | dash-home | competitors | keywords | profile | da | report
  authStep: "login",      // signup | verify | login | verify-login
  pendingEmail: "",
  pendingName: "",
  req: { company_name: "", url: "", market: "Singapore", industry: "" },
  results: { competitors: null, keywords: null, profile: null, da: null, report: null },
  loading: {},
  errors: {},
  toasts: [],
};

function reducer(s, a) {
  switch (a.t) {
    case "VIEW":      return { ...s, view: a.v };
    case "AUTH_STEP": return { ...s, authStep: a.v };
    case "PENDING":   return { ...s, pendingEmail: a.email, pendingName: a.name || "" };
    case "REQ":       return { ...s, req: { ...s.req, ...a.v } };
    case "LOADING":   return { ...s, loading: { ...s.loading, [a.k]: a.v } };
    case "RESULT":    return { ...s, results: { ...s.results, [a.k]: a.v }, errors: { ...s.errors, [a.k]: null } };
    case "ERROR":     return { ...s, errors: { ...s.errors, [a.k]: a.v } };
    case "TOAST_ADD": return { ...s, toasts: [...s.toasts, a.toast] };
    case "TOAST_DEL": return { ...s, toasts: s.toasts.filter(t => t.id !== a.id) };
    case "CLEAR":     return { ...s, results: initState.results, errors: {}, loading: {} };
    default:          return s;
  }
}

function parseJwt(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(json.split('').map(c => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`).join('')));
  } catch {
    return null;
  }
}

function isTokenExpired(token) {
  const payload = parseJwt(token);
  if (!payload || typeof payload.exp !== 'number') return false;
  return payload.exp * 1000 < Date.now();
}

function clearAuthStorage() {
  localStorage.removeItem('id_token');
  localStorage.removeItem('access_token');
  localStorage.removeItem('user_id');
}

function AppProvider({ children }) {
  const [s, d] = useReducer(reducer, initState);

  useEffect(() => {
    const token = localStorage.getItem('access_token') || localStorage.getItem('id_token');
    if (token) {
      if (isTokenExpired(token)) {
        clearAuthStorage();
        d({ t: 'VIEW', v: 'auth' });
        d({ t: 'AUTH_STEP', v: 'login' });
      } else {
        d({ t: 'VIEW', v: 'dash-home' });
      }
    }
  }, []);

  const toast = useCallback(({ msg, type = "info", dur = 4200 }) => {
    const id = ++_tid;
    d({ t: "TOAST_ADD", toast: { id, msg, type, dur } });
    setTimeout(() => d({ t: "TOAST_DEL", id }), dur);
  }, []);

  const api = useCallback(async (key, url, body) => {
    d({ t: "LOADING", k: key, v: true });
    d({ t: "ERROR", k: key, v: null });
    try {
      const base = process.env.REACT_APP_API_URL || "https://api.aeo-app.ai/api/v1";
      const res = await fetch(`${base}${url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.message || `Error ${res.status}`);
      d({ t: "RESULT", k: key, v: data });
      return data;
    } catch (err) {
      d({ t: "ERROR", k: key, v: err.message });
      toast({ msg: err.message, type: "error" });
      throw err;
    } finally {
      d({ t: "LOADING", k: key, v: false });
    }
  }, [toast]);

  return <AppCtx.Provider value={{ s, d, toast, api }}>{children}</AppCtx.Provider>;
}
const useApp = () => useContext(AppCtx);

/* ═══════════════════════════════════════════════════════════
   PRIMITIVE COMPONENTS
═══════════════════════════════════════════════════════════ */

function Spinner({ size = 18, color = "var(--p2)" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: "spin .7s linear infinite", flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.1)" strokeWidth="2.5"/>
      <path d="M21 12a9 9 0 0 0-9-9" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

function Btn({ children, variant = "primary", size = "md", loading, disabled, onClick, type = "button", full, style: sx }) {
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    fontWeight: 600, letterSpacing: ".01em", borderRadius: "var(--r2)",
    border: "none", transition: "all .18s var(--ease)", whiteSpace: "nowrap",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    width: full ? "100%" : undefined,
    opacity: disabled && !loading ? .45 : 1,
    ...(size === "sm" && { padding: "7px 14px", fontSize: 13 }),
    ...(size === "md" && { padding: "11px 22px", fontSize: 14 }),
    ...(size === "lg" && { padding: "14px 32px", fontSize: 15 }),
    ...(variant === "primary" && {
      background: "linear-gradient(135deg,#7C6FFF,#9D93FF)",
      color: "#fff",
      boxShadow: disabled || loading ? "none" : "0 4px 22px var(--p-glow)",
    }),
    ...(variant === "secondary" && {
      background: "var(--glass)", color: "var(--t2)",
      border: "1px solid var(--glass-border)",
      boxShadow: "none",
    }),
    ...(variant === "ghost" && {
      background: "transparent", color: "var(--t2)",
      border: "1px solid var(--glass-border)",
    }),
    ...(variant === "danger" && {
      background: "var(--rose-dim)", color: "var(--rose)",
      border: "1px solid rgba(251,113,133,.25)",
    }),
    ...(variant === "teal" && {
      background: "var(--teal-dim)", color: "var(--teal)",
      border: "1px solid rgba(45,212,191,.25)",
    }),
    ...sx,
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} style={base}
      onMouseEnter={e => { if (!disabled && !loading && variant === "primary") e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; }}
      onMouseDown={e  => { if (!disabled && !loading) e.currentTarget.style.transform = "scale(.97)"; }}
      onMouseUp={e    => { e.currentTarget.style.transform = "translateY(-1px)"; }}
    >
      {loading && <Spinner size={14} color="#fff" />}
      {children}
    </button>
  );
}

function Card({ children, style: sx, glass, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: glass ? "rgba(255,255,255,0.04)" : "var(--bg2)",
      border: "1px solid var(--glass-border)",
      borderRadius: "var(--r3)",
      boxShadow: "0 4px 24px rgba(0,0,0,.35), 0 1px 0 rgba(255,255,255,.06) inset",
      transition: onClick ? "border-color .15s,transform .15s" : undefined,
      cursor: onClick ? "pointer" : undefined,
      ...sx,
    }}
      onMouseEnter={onClick ? e => { e.currentTarget.style.borderColor = "var(--p-border)"; e.currentTarget.style.transform = "translateY(-2px)"; } : undefined}
      onMouseLeave={onClick ? e => { e.currentTarget.style.borderColor = "var(--glass-border)"; e.currentTarget.style.transform = ""; } : undefined}
    >
      {children}
    </div>
  );
}

function Badge({ children, variant = "default" }) {
  const map = {
    default: { bg: "rgba(255,255,255,.07)", c: "var(--t2)" },
    purple:  { bg: "var(--p-dim)",          c: "var(--p2)" },
    teal:    { bg: "var(--teal-dim)",        c: "var(--teal)" },
    amber:   { bg: "var(--amber-dim)",       c: "var(--amber)" },
    rose:    { bg: "var(--rose-dim)",        c: "var(--rose)" },
    sky:     { bg: "var(--sky-dim)",         c: "var(--sky)" },
    green:   { bg: "var(--green-dim)",       c: "var(--green)" },
  };
  const { bg, c } = map[variant] || map.default;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "3px 10px",
      borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: ".04em",
      background: bg, color: c,
    }}>{children}</span>
  );
}

function ProgressBar({ value, max = 100, color = "var(--p)" }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ height: 5, background: "rgba(255,255,255,.06)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{
        height: "100%", width: `${pct}%`, borderRadius: 3,
        background: color, transition: "width 1s var(--ease)",
      }} />
    </div>
  );
}

function Skeleton({ h = 16, w = "100%", mb = 8 }) {
  return <div className="skeleton" style={{ height: h, width: w, marginBottom: mb }} />;
}

function SkelCard({ rows = 4 }) {
  return (
    <Card style={{ padding: 22 }}>
      <Skeleton h={14} w="38%" mb={18} />
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} h={11} w={i % 2 ? "72%" : "100%"} />)}
    </Card>
  );
}

function Empty({ icon = "🔍", title, body }) {
  return (
    <div style={{ textAlign: "center", padding: "64px 24px" }}>
      <div style={{ fontSize: 44, marginBottom: 16 }}>{icon}</div>
      <div style={{ fontWeight: 700, color: "var(--t1)", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 14, color: "var(--t3)", maxWidth: 320, margin: "0 auto", lineHeight: 1.7 }}>{body}</div>
    </div>
  );
}

function SectionHeader({ title, subtitle, right }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 700, color: "var(--t1)", marginBottom: subtitle ? 3 : 0 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: "var(--t3)" }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text || "").then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} style={{
      padding: "5px 12px", borderRadius: "var(--r1)", fontSize: 12, fontWeight: 600,
      background: copied ? "var(--teal-dim)" : "rgba(255,255,255,.05)",
      border: `1px solid ${copied ? "rgba(45,212,191,.3)" : "var(--glass-border)"}`,
      color: copied ? "var(--teal)" : "var(--t2)", cursor: "pointer",
      transition: "all .15s", fontFamily: "inherit",
      display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      {copied ? "✓ Copied" : "⎘ Copy"}
    </button>
  );
}

function DataTable({ cols, rows }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c.key} style={{
                padding: "10px 14px", textAlign: c.align || "left",
                borderBottom: "1px solid var(--glass-border)",
                fontSize: 11, fontWeight: 700, color: "var(--t3)",
                textTransform: "uppercase", letterSpacing: ".05em",
                background: "var(--bg1)", whiteSpace: "nowrap",
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: "1px solid rgba(255,255,255,.03)", transition: "background .1s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.02)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              {cols.map(c => (
                <td key={c.key} style={{
                  padding: "11px 14px", textAlign: c.align || "left",
                  color: c.color || "var(--t1)",
                  whiteSpace: c.wrap ? "normal" : "nowrap",
                  maxWidth: c.maxW || undefined,
                }}>
                  {c.render ? c.render(row[c.key], row) : (row[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TOAST SYSTEM
═══════════════════════════════════════════════════════════ */
function ToastItem({ toast }) {
  const { d } = useApp();
  const [leaving, setLeaving] = useState(false);
  const icons = { success: "✓", error: "✕", info: "ℹ", warning: "⚠" };
  const colors = {
    success: { border: "rgba(74,222,128,.3)", icon: "var(--green)" },
    error:   { border: "rgba(251,113,133,.3)", icon: "var(--rose)" },
    info:    { border: "rgba(124,111,255,.3)", icon: "var(--p2)" },
    warning: { border: "rgba(252,211,77,.3)", icon: "var(--amber)" },
  };
  const c = colors[toast.type] || colors.info;

  const dismiss = () => { setLeaving(true); setTimeout(() => d({ t: "TOAST_DEL", id: toast.id }), 280); };
  useEffect(() => {
    const t = setTimeout(dismiss, toast.dur - 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div onClick={dismiss} style={{
      display: "flex", alignItems: "flex-start", gap: 10, padding: "13px 16px",
      background: "rgba(10,13,24,.97)", border: `1px solid ${c.border}`,
      borderRadius: "var(--r2)", backdropFilter: "blur(20px)",
      boxShadow: "0 8px 32px rgba(0,0,0,.5)", cursor: "pointer",
      maxWidth: 360, minWidth: 250,
      animation: `${leaving ? "toastOut" : "toastIn"} ${leaving ? ".28s" : ".38s"} var(--spring) forwards`,
    }}>
      <span style={{ color: c.icon, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{icons[toast.type]}</span>
      <span style={{ fontSize: 13, color: "var(--t1)", lineHeight: 1.5 }}>{toast.msg}</span>
    </div>
  );
}

function Toasts() {
  const { s } = useApp();
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
      {s.toasts.map(t => <div key={t.id} style={{ pointerEvents: "all" }}><ToastItem toast={t} /></div>)}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   AUTH — BRAND PANEL (left side)
═══════════════════════════════════════════════════════════ */
function Globe() {
  return (
    <div style={{ position: "relative", width: 260, height: 260, margin: "0 auto" }}>
      {/* Rings */}
      {[{ s: 0, w: 260, col: "rgba(124,111,255,.25)", dur: "14s", dotR: 6, dotC: "var(--p)" },
        { s: 24, w: 212, col: "rgba(45,212,191,.2)",  dur: "9s",  dotR: 5, dotC: "var(--teal)", rev: true },
        { s: 50, w: 160, col: "rgba(124,111,255,.15)", dur: "6s", dotR: 4, dotC: "var(--p2)" },
      ].map((r, i) => (
        <div key={i} style={{
          position: "absolute", top: r.s, left: r.s,
          width: r.w, height: r.w,
          border: `1.5px solid ${r.col}`, borderRadius: "50%",
          animation: `${r.rev ? "orbitB" : "orbitA"} ${r.dur} linear infinite`,
        }}>
          <div style={{
            position: "absolute", top: -r.dotR, left: "50%", transform: "translateX(-50%)",
            width: r.dotR * 2, height: r.dotR * 2, borderRadius: "50%",
            background: r.dotC, boxShadow: `0 0 12px ${r.dotC}`,
          }} />
        </div>
      ))}
      {/* Core */}
      <div style={{
        position: "absolute", inset: 80, borderRadius: "50%",
        background: "radial-gradient(circle at 35% 35%, rgba(124,111,255,.35), rgba(124,111,255,.05))",
        border: "1.5px solid rgba(124,111,255,.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "pulse 3s ease infinite",
        boxShadow: "0 0 50px rgba(124,111,255,.2), inset 0 0 30px rgba(124,111,255,.08)",
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="rgba(157,147,255,.5)" strokeWidth="1"/>
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z"
            stroke="var(--p2)" strokeWidth="1.2" fill="none"/>
        </svg>
      </div>
      {/* Floating tags */}
      {[
        { label: "DA +52", top: "6%",  left: "65%", delay: "0s" },
        { label: "#1 SEO", top: "70%", left: "5%",  delay: ".5s" },
        { label: "80+ mkts",top: "18%",left: "0%",  delay: "1s" },
        { label: "AI Intel",top: "68%",left: "68%", delay: ".3s" },
      ].map((f, i) => (
        <div key={i} style={{
          position: "absolute", top: f.top, left: f.left,
          background: "rgba(124,111,255,.12)", border: "1px solid rgba(124,111,255,.28)",
          borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 700,
          color: "var(--p2)", backdropFilter: "blur(8px)",
          animation: `float 3s ease infinite`, animationDelay: f.delay, whiteSpace: "nowrap",
        }}>{f.label}</div>
      ))}
    </div>
  );
}

function BrandPanel() {
  const features = [
    { icon: "⚡", text: "AI-powered analysis in seconds via Claude" },
    { icon: "🌏", text: "Singapore & Asia-Pacific market intelligence" },
    { icon: "📈", text: "Competitor, keyword, DA & profile generation" },
  ];
  return (
    <div style={{
      flex: "0 0 50%", minHeight: "100vh",
      background: "linear-gradient(145deg,#0D1033 0%,#070A18 50%,#130A2E 100%)",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "56px 44px",
      position: "relative", overflow: "hidden",
    }}>
      {/* Blobs */}
      <div style={{ position:"absolute", top:-100, left:-80, width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle,rgba(124,111,255,.1) 0%,transparent 70%)", pointerEvents:"none" }} />
      <div style={{ position:"absolute", bottom:-60, right:-60, width:300, height:300, borderRadius:"50%", background:"radial-gradient(circle,rgba(45,212,191,.07) 0%,transparent 70%)", pointerEvents:"none" }} />

      {/* Logo */}
      <div style={{ alignSelf:"flex-start", display:"flex", alignItems:"center", gap:10, marginBottom:52 }}>
        <div style={{ width:38, height:38, borderRadius:10, background:"linear-gradient(135deg,#7C6FFF,#9D93FF)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px var(--p-glow)" }}>
          <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><circle cx="9" cy="9" r="7"/><path d="M3.5 9.5C5.5 6.5 9 5 9 5s3.5 1.5 5.5 4.5"/></svg>
        </div>
        <span style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:"var(--t1)" }}>
          AEO<span style={{ color:"var(--p2)" }}>Intel</span>
        </span>
      </div>

      <Globe />

      <h1 style={{
        fontFamily:"'Syne',sans-serif", fontSize:"clamp(24px,3vw,32px)",
        fontWeight:800, color:"var(--t1)", textAlign:"center",
        lineHeight:1.2, margin:"40px 0 12px", letterSpacing:"-.02em",
      }}>
        SEO Intelligence<br />
        <span style={{ background:"linear-gradient(135deg,var(--p2),var(--teal))", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
          Built for Asia-Pacific
        </span>
      </h1>

      <p style={{ fontSize:14, color:"rgba(255,255,255,.45)", textAlign:"center", lineHeight:1.8, marginBottom:36, maxWidth:320 }}>
        Competitive analysis, keyword intelligence, and domain authority strategies — powered by Claude AI.
      </p>

      <div style={{ display:"flex", flexDirection:"column", gap:10, alignSelf:"stretch" }}>
        {features.map((f, i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 16px", background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:"var(--r2)" }}>
            <span style={{ fontSize:15 }}>{f.icon}</span>
            <span style={{ fontSize:13, color:"rgba(255,255,255,.6)" }}>{f.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   FLOATING INPUT
═══════════════════════════════════════════════════════════ */
function FloatInput({ label, name, type = "text", value, onChange, onBlur, error, autoFocus, disabled, autoComplete }) {
  const [focused, setFocused] = useState(false);
  const lifted = focused || (value && value.length > 0);
  const id = useId();
  return (
    <div style={{ position:"relative", width:"100%" }}>
      <input id={id} name={name} type={type} value={value} autoFocus={autoFocus} disabled={disabled} autoComplete={autoComplete}
        aria-invalid={!!error} onChange={e => onChange && onChange(name, e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); onBlur && onBlur(name); }}
        style={{
          width:"100%", padding:"22px 16px 10px",
          background: focused ? "rgba(124,111,255,.06)" : "rgba(255,255,255,.04)",
          border:`1.5px solid ${error ? "rgba(251,113,133,.6)" : focused ? "var(--p-border)" : "var(--glass-border)"}`,
          borderRadius:"var(--r2)", color:"var(--t1)", fontSize:15, outline:"none",
          transition:"all .18s var(--ease)",
          boxShadow: error ? "0 0 0 3px rgba(251,113,133,.12)" : focused ? "0 0 0 3px var(--p-dim)" : "none",
          caretColor:"var(--p2)", opacity: disabled ? .5 : 1,
        }}
      />
      <label htmlFor={id} style={{
        position:"absolute", left:16,
        top: lifted ? 8 : "50%",
        transform: lifted ? "none" : "translateY(-50%)",
        fontSize: lifted ? 10 : 15,
        fontWeight: lifted ? 700 : 400,
        letterSpacing: lifted ? ".06em" : "normal",
        textTransform: lifted ? "uppercase" : "none",
        color: error ? "rgba(251,113,133,.8)" : lifted && focused ? "var(--p2)" : "rgba(255,255,255,.35)",
        transition:"all .18s var(--ease)", pointerEvents:"none",
      }}>{label}</label>
      {error && (
        <p role="alert" style={{ marginTop:6, fontSize:12, color:"var(--rose)", display:"flex", alignItems:"center", gap:4 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" opacity=".2"/><path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none"/></svg>
          {error}
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   OTP INPUT
═══════════════════════════════════════════════════════════ */
function OTPInput({ onComplete, error, disabled }) {
  const LEN = 6;
  const [digits, setDigits] = useState(Array(LEN).fill(""));
  const refs = useRef([]);
  const focus = i => { const el = refs.current[i]; if (el) { el.focus(); el.select(); } };

  useEffect(() => { focus(0); }, []);
  useEffect(() => {
    if (digits.every(d => d) && digits.join("").length === LEN) onComplete && onComplete(digits.join(""));
  }, [digits]);

  const onChange = (i, val) => {
    const ch = val.replace(/\D/g, "").slice(-1);
    const next = [...digits]; next[i] = ch; setDigits(next);
    if (ch && i < LEN - 1) focus(i + 1);
  };
  const onKeyDown = (i, e) => {
    if (e.key === "Backspace") {
      if (digits[i]) { const n = [...digits]; n[i] = ""; setDigits(n); }
      else if (i > 0) { focus(i - 1); const n = [...digits]; n[i - 1] = ""; setDigits(n); }
    }
    if (e.key === "ArrowLeft" && i > 0) focus(i - 1);
    if (e.key === "ArrowRight" && i < LEN - 1) focus(i + 1);
  };
  const onPaste = e => {
    e.preventDefault();
    const p = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LEN);
    const n = Array(LEN).fill(""); p.split("").forEach((c, i) => { n[i] = c; });
    setDigits(n); focus(Math.min(p.length, LEN - 1));
  };

  return (
    <div>
      <div onPaste={onPaste} role="group" aria-label="Verification code"
        style={{ display:"flex", gap:10, justifyContent:"center", animation: error ? "shake .4s ease" : "none" }}>
        {digits.map((d, i) => (
          <input key={i} ref={el => refs.current[i] = el} type="text" inputMode="numeric"
            maxLength={1} value={d} disabled={disabled} aria-label={`Digit ${i + 1}`}
            onChange={e => onChange(i, e.target.value)} onKeyDown={e => onKeyDown(i, e)}
            style={{
              width:54, height:64, textAlign:"center", fontSize:24, fontWeight:700,
              fontFamily:"var(--font-mono,'JetBrains Mono',monospace)",
              color: d ? "var(--t1)" : "rgba(255,255,255,.15)",
              background: d ? "var(--p-dim)" : "rgba(255,255,255,.04)",
              border:`1.5px solid ${error ? "rgba(251,113,133,.6)" : d ? "var(--p-border)" : "var(--glass-border)"}`,
              borderRadius:"var(--r2)", outline:"none", caretColor:"transparent",
              transition:"all .18s", boxShadow: d ? "0 0 16px var(--p-dim)" : "none",
            }}
            onFocus={e => { e.target.style.borderColor = error ? "rgba(251,113,133,.8)" : "var(--p)"; e.target.style.boxShadow = "0 0 0 3px var(--p-dim)"; e.target.select(); }}
            onBlur={e => { if (!d) { e.target.style.borderColor = "var(--glass-border)"; e.target.style.boxShadow = "none"; } }}
          />
        ))}
      </div>
      {error && <p role="alert" style={{ marginTop:12, textAlign:"center", fontSize:13, color:"var(--rose)", animation:"fadeUp .15s ease" }}>{error}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   COUNTDOWN + RESEND
═══════════════════════════════════════════════════════════ */
function Resend({ onResend }) {
  const [sec, setSec] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const timer = useRef(null);

  const startTimer = () => {
    setSec(60); setCanResend(false);
    clearInterval(timer.current);
    timer.current = setInterval(() => setSec(p => { if (p <= 1) { clearInterval(timer.current); setCanResend(true); return 0; } return p - 1; }), 1000);
  };
  useEffect(() => { startTimer(); return () => clearInterval(timer.current); }, []);

  const handleResend = async () => { if (!canResend) return; await onResend?.(); startTimer(); };
  const circ = 2 * Math.PI * 8;

  return (
    <div style={{ textAlign:"center", marginTop:20 }}>
      {canResend ? (
        <button onClick={handleResend} style={{ background:"none", border:"none", color:"var(--p2)", fontSize:14, fontWeight:500, cursor:"pointer", fontFamily:"inherit", padding:"4px 8px", borderRadius:6 }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--p-dim)"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}
        >Resend code →</button>
      ) : (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, color:"rgba(255,255,255,.3)", fontSize:13 }}>
          <svg width="20" height="20" viewBox="0 0 20 20" style={{ transform:"rotate(-90deg)" }}>
            <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="1.5"/>
            <circle cx="10" cy="10" r="8" fill="none" stroke="var(--p)" strokeWidth="1.5"
              strokeDasharray={circ} strokeDashoffset={circ - circ * (sec / 60)} strokeLinecap="round"
              style={{ transition:"stroke-dashoffset 1s linear" }}/>
          </svg>
          Resend in {sec}s
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   AUTH CARD SHELL
═══════════════════════════════════════════════════════════ */
function AuthCard({ children }) {
  return (
    <div style={{
      flex: 1, display:"flex", alignItems:"center", justifyContent:"center",
      padding:"40px 24px",
      background:"linear-gradient(160deg,#07090F 0%,#0E1224 100%)",
      minHeight:"100vh", overflowY:"auto", position:"relative",
    }}>
      {/* Grid bg */}
      <div style={{ position:"absolute", inset:0, backgroundImage:"linear-gradient(rgba(124,111,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(124,111,255,.04) 1px,transparent 1px)", backgroundSize:"44px 44px", pointerEvents:"none" }} />
      <div style={{ width:"100%", maxWidth:420, position:"relative", zIndex:1, animation:"fadeUp .5s var(--spring) both" }}>
        {/* Glass card */}
        <div style={{
          background:"rgba(255,255,255,.04)", border:"1px solid var(--glass-border)",
          borderRadius:"var(--r4)", padding:"40px 36px",
          backdropFilter:"blur(24px)",
          boxShadow:"0 24px 64px rgba(0,0,0,.55), 0 1px 0 rgba(255,255,255,.08) inset",
          position:"relative",
        }}>
          {/* Top accent */}
          <div style={{ position:"absolute", top:0, left:"18%", right:"18%", height:1, background:"linear-gradient(90deg,transparent,rgba(124,111,255,.85),transparent)", borderRadius:1 }} />
          {/* Mobile logo */}
          <div style={{ display:"none" }} className="mobile-logo">
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:28 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:"linear-gradient(135deg,#7C6FFF,#9D93FF)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontSize:14 }}>⚡</span>
              </div>
              <span style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:800, color:"var(--t1)" }}>AEO<span style={{ color:"var(--p2)" }}>Intel</span></span>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   AUTH SCREENS
═══════════════════════════════════════════════════════════ */
function useValidation(fields) {
  const v = {
    fullName: val => !val?.trim() ? "Name is required" : val.trim().length < 2 ? "At least 2 characters" : "",
    email: val => !val?.trim() ? "Email is required" : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? "Enter a valid email" : "",
  };
  const [values, setValues] = useState(fields);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const change = (name, val) => {
    setValues(p => ({ ...p, [name]: val }));
    if (touched[name]) setErrors(p => ({ ...p, [name]: v[name]?.(val) || "" }));
  };
  const blur = name => {
    setTouched(p => ({ ...p, [name]: true }));
    setErrors(p => ({ ...p, [name]: v[name]?.(values[name]) || "" }));
  };
  const validate = () => {
    const e = {}; const t = {};
    Object.keys(values).forEach(k => { t[k] = true; e[k] = v[k]?.(values[k]) || ""; });
    setTouched(t); setErrors(e);
    return Object.values(e).every(x => !x);
  };
  return { values, errors, touched, change, blur, validate };
}

function SignupScreen() {
  const { s, d, toast, api } = useApp();
  const [loading, setLoading] = useState(false);
  const form = useValidation({ fullName: "", email: "" });

  const submit = async e => {
    e.preventDefault();
    if (!form.validate()) return;
    setLoading(true);
    try {
      // Mock: await api("signup", "/auth/signup", { full_name: form.values.fullName, email: form.values.email });
      d({ t: "PENDING", email: form.values.email, name: form.values.fullName });
      toast({ msg: "Account created! Check your email for a verification code.", type: "success" });
      d({ t: "AUTH_STEP", v: "verify" });
    } catch (_) {} finally { setLoading(false); }
  };

  return (
    <AuthCard>
      <div style={{ marginBottom:28 }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"4px 12px", background:"var(--p-dim)", border:"1px solid var(--p-border)", borderRadius:20, marginBottom:14 }}>
          <span style={{ width:6, height:6, borderRadius:"50%", background:"var(--p2)" }}/>
          <span style={{ fontSize:11, color:"var(--p2)", fontWeight:700 }}>Free account</span>
        </div>
        <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:26, fontWeight:800, color:"var(--t1)", letterSpacing:"-.02em", marginBottom:8 }}>Create your account</h2>
        <p style={{ fontSize:13, color:"rgba(255,255,255,.4)", lineHeight:1.7 }}>Start uncovering SEO intelligence for your market.</p>
      </div>
      <form onSubmit={submit} noValidate>
        <div style={{ display:"flex", flexDirection:"column", gap:16, marginBottom:22 }}>
          <FloatInput label="Full Name" name="fullName" value={form.values.fullName} onChange={form.change} onBlur={form.blur} error={form.touched.fullName ? form.errors.fullName : ""} autoFocus disabled={loading} autoComplete="name" />
          <FloatInput label="Email Address" name="email" type="email" value={form.values.email} onChange={form.change} onBlur={form.blur} error={form.touched.email ? form.errors.email : ""} disabled={loading} autoComplete="email" />
        </div>
        <Btn type="submit" loading={loading} full>Create account</Btn>
      </form>
      <div style={{ display:"flex", alignItems:"center", gap:12, margin:"22px 0" }}>
        <div style={{ flex:1, height:1, background:"var(--glass-border)" }}/>
        <span style={{ fontSize:11, color:"var(--t3)" }}>No password required</span>
        <div style={{ flex:1, height:1, background:"var(--glass-border)" }}/>
      </div>
      <div style={{ display:"flex", gap:10, padding:"13px 14px", background:"rgba(124,111,255,.05)", border:"1px solid rgba(124,111,255,.12)", borderRadius:"var(--r2)", marginBottom:24 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--p2)" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink:0, marginTop:2 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <p style={{ fontSize:12, color:"rgba(255,255,255,.4)", lineHeight:1.6 }}>We use magic codes instead of passwords — safer and simpler.</p>
      </div>
      <p style={{ textAlign:"center", fontSize:13, color:"rgba(255,255,255,.3)" }}>
        Already have an account?{" "}
        <button onClick={() => d({ t:"AUTH_STEP", v:"login" })} style={{ background:"none", border:"none", color:"var(--p2)", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Sign in</button>
      </p>
    </AuthCard>
  );
}

function VerifyScreen({ mode = "signup" }) {
  const { s, d, toast } = useApp();
  const [otpError, setOtpError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const masked = s.pendingEmail.replace(/(.{2}).+(@.+)/, "$1***$2");

  const verify = async code => {
    if (code.length < 6) return;
    setLoading(true); setOtpError("");
    try {
      // Mock verification — in production: await api(...)
      if (code !== "123456") throw new Error("Invalid code. Try 123456 for demo.");
      setDone(true);
      toast({ msg: mode === "signup" ? "Email verified! Welcome aboard." : "Signed in successfully.", type: "success" });
      setTimeout(() => d({ t: "VIEW", v: "dash-home" }), 1100);
    } catch (err) { setOtpError(err.message); } finally { setLoading(false); }
  };

  return (
    <AuthCard>
      {done ? (
        <div style={{ textAlign:"center", padding:"20px 0" }}>
          <div style={{ width:72, height:72, margin:"0 auto 22px", borderRadius:"50%", background:"var(--teal-dim)", border:"2px solid rgba(45,212,191,.4)", display:"flex", alignItems:"center", justifyContent:"center", animation:"pulse 1.5s ease infinite" }}>
            <svg width="32" height="32" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color:"var(--t1)", marginBottom:8 }}>
            {mode === "signup" ? "Email verified!" : "Welcome back!"}
          </h2>
          <p style={{ fontSize:13, color:"var(--t3)" }}>Taking you to your dashboard…</p>
        </div>
      ) : (
        <>
          <div style={{ textAlign:"center", marginBottom:30 }}>
            <div style={{ width:58, height:58, margin:"0 auto 18px", borderRadius:14, background:"var(--p-dim)", border:"1.5px solid var(--p-border)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="24" height="24" fill="none" stroke="var(--p2)" strokeWidth="1.8" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </div>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, color:"var(--t1)", letterSpacing:"-.02em", marginBottom:8 }}>Check your email</h2>
            <p style={{ fontSize:13, color:"rgba(255,255,255,.4)", lineHeight:1.7 }}>
              We sent a 6-digit code to<br/>
              <span style={{ color:"var(--p2)", fontWeight:600 }}>{masked}</span>
            </p>
          </div>
          <div style={{ marginBottom:20 }}>
            <OTPInput onComplete={verify} error={otpError} disabled={loading} />
          </div>
          {loading && <div style={{ textAlign:"center", marginBottom:16 }}><Spinner /></div>}
          <Resend onResend={() => toast({ msg:"New code sent to your email.", type:"info" })} />
          <div style={{ marginTop:20 }}>
            <Btn variant="ghost" full onClick={() => d({ t:"AUTH_STEP", v: mode === "login" ? "login" : "signup" })}>
              ← Use a different email
            </Btn>
          </div>
          <p style={{ textAlign:"center", fontSize:11, color:"rgba(255,255,255,.2)", marginTop:18, lineHeight:1.6 }}>
            Demo: enter <strong style={{ color:"var(--p2)" }}>123456</strong> to continue
          </p>
        </>
      )}
    </AuthCard>
  );
}

function LoginScreen() {
  const { d, toast } = useApp();
  const [loading, setLoading] = useState(false);
  const form = useValidation({ email: "" });

  const submit = async e => {
    e.preventDefault();
    if (!form.validate()) return;
    setLoading(true);
    try {
      d({ t:"PENDING", email: form.values.email });
      toast({ msg:"Code sent — check your inbox.", type:"info" });
      d({ t:"AUTH_STEP", v:"verify-login" });
    } catch (_) {} finally { setLoading(false); }
  };

  return (
    <AuthCard>
      <div style={{ marginBottom:28 }}>
        <div style={{ width:50, height:50, borderRadius:13, background:"var(--p-dim)", border:"1.5px solid var(--p-border)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:18 }}>
          <svg width="22" height="22" fill="none" stroke="var(--p2)" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:26, fontWeight:800, color:"var(--t1)", letterSpacing:"-.02em", marginBottom:8 }}>Welcome back</h2>
        <p style={{ fontSize:13, color:"rgba(255,255,255,.4)", lineHeight:1.7 }}>Enter your email and we'll send a sign-in code.</p>
      </div>
      <form onSubmit={submit} noValidate>
        <div style={{ marginBottom:22 }}>
          <FloatInput label="Email Address" name="email" type="email" value={form.values.email} onChange={form.change} onBlur={form.blur} error={form.touched.email ? form.errors.email : ""} autoFocus disabled={loading} autoComplete="email" />
        </div>
        <Btn type="submit" loading={loading} full>Send sign-in code</Btn>
      </form>
      <div style={{ margin:"22px 0", display:"flex", flexDirection:"column", gap:8 }}>
        {["Enter your email above", "Get a 6-digit code in your inbox", "Enter the code to sign in instantly"].map((txt, i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 0", borderBottom: i < 2 ? "1px solid rgba(255,255,255,.04)" : "none" }}>
            <div style={{ width:22, height:22, borderRadius:"50%", background:"var(--p-dim)", border:"1px solid var(--p-border)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"var(--p2)", flexShrink:0 }}>{i + 1}</div>
            <span style={{ fontSize:13, color:"rgba(255,255,255,.4)" }}>{txt}</span>
          </div>
        ))}
      </div>
      <p style={{ textAlign:"center", fontSize:13, color:"rgba(255,255,255,.3)" }}>
        Don't have an account?{" "}
        <button onClick={() => d({ t:"AUTH_STEP", v:"signup" })} style={{ background:"none", border:"none", color:"var(--p2)", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Create one free</button>
      </p>
    </AuthCard>
  );
}

/* ═══════════════════════════════════════════════════════════
   AUTH LAYOUT
═══════════════════════════════════════════════════════════ */
function AuthLayout() {
  const { s } = useApp();
  const screen = {
    signup:       <SignupScreen />,
    verify:       <VerifyScreen mode="signup" />,
    login:        <LoginScreen />,
    "verify-login": <VerifyScreen mode="login" />,
  }[s.authStep] || <SignupScreen />;

  return (
    <div style={{ display:"flex", minHeight:"100vh" }}>
      <style>{`.mobile-logo { display: none; } @media(max-width:768px){ .auth-brand{ display:none!important; } .mobile-logo{ display:flex!important; } }`}</style>
      <div className="auth-brand" style={{ flex:"0 0 50%", display:"flex" }}>
        <BrandPanel />
      </div>
      <div style={{ flex:1, display:"flex" }}>{screen}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD SIDEBAR
═══════════════════════════════════════════════════════════ */
const NAV_ITEMS = [
  { id:"dash-home", icon:"⊞", label:"Dashboard" },
  { id:"competitors", icon:"⚔", label:"Competitors" },
  { id:"keywords", icon:"🔑", label:"Keywords" },
  { id:"profile", icon:"📋", label:"Company Profile" },
  { id:"da", icon:"📈", label:"Domain Authority" },
  { id:"report", icon:"⚡", label:"Full Report" },
];

function Sidebar({ mobileOpen, onClose }) {
  const { s, d } = useApp();
  const go = id => { d({ t:"VIEW", v:id }); onClose?.(); };

  return (
    <>
      {mobileOpen && <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:199, backdropFilter:"blur(4px)" }}/>}
      <aside style={{
        width:"var(--sidebar)", height:"100vh",
        background:"var(--bg1)", borderRight:"1px solid var(--glass-border)",
        display:"flex", flexDirection:"column", position:"fixed", top:0, left:0, zIndex:200,
        transform: mobileOpen ? "translateX(0)" : undefined,
        transition:"transform .22s var(--ease)",
      }}>
        {/* Logo */}
        <div style={{ padding:"20px 20px 16px", borderBottom:"1px solid var(--glass-border)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:34, height:34, borderRadius:9, background:"linear-gradient(135deg,#7C6FFF,#9D93FF)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 14px var(--p-glow)", fontSize:15 }}>⚡</div>
            <div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, color:"var(--t1)", lineHeight:1 }}>AEO<span style={{ color:"var(--p2)" }}>Intel</span></div>
              <div style={{ fontSize:10, color:"var(--t3)", marginTop:2 }}>SEO Intelligence</div>
            </div>
          </div>
        </div>

        {/* Active company chip */}
        {s.req.company_name && (
          <div style={{ margin:"14px 12px 2px", padding:"10px 14px", background:"var(--p-dim)", border:"1px solid var(--p-border)", borderRadius:"var(--r2)" }}>
            <div style={{ fontSize:10, color:"var(--p2)", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em", marginBottom:2 }}>Analysing</div>
            <div style={{ fontSize:13, color:"var(--t1)", fontWeight:600, wordBreak:"break-all" }}>{s.req.company_name}</div>
            <div style={{ fontSize:11, color:"var(--t3)", marginTop:2 }}>{s.req.market}</div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex:1, overflowY:"auto", padding:"10px 10px" }}>
          {NAV_ITEMS.map(item => {
            const active = s.view === item.id;
            return (
              <button key={item.id} onClick={() => go(item.id)} style={{
                width:"100%", display:"flex", alignItems:"center", gap:10,
                padding:"10px 12px", marginBottom:2,
                background: active ? "var(--p-dim)" : "transparent",
                border: `1px solid ${active ? "var(--p-border)" : "transparent"}`,
                borderRadius:"var(--r2)", cursor:"pointer",
                color: active ? "var(--p2)" : "var(--t2)",
                fontSize:13, fontWeight: active ? 700 : 400,
                transition:"all .15s", textAlign:"left", fontFamily:"inherit",
              }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "rgba(255,255,255,.04)"; e.currentTarget.style.color = "var(--t1)"; }}}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--t2)"; }}}
              >
                <span style={{ width:18, textAlign:"center", fontSize:15 }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding:"14px 16px", borderTop:"1px solid var(--glass-border)" }}>
          <div style={{ fontSize:11, color:"var(--t3)", lineHeight:1.7 }}>
            Powered by <span style={{ color:"var(--p2)" }}>Claude AI</span><br/>FastAPI · React 18
          </div>
        </div>
      </aside>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   TOPBAR
═══════════════════════════════════════════════════════════ */
const PAGE_META = {
  "dash-home":  { title:"Dashboard",        sub:"Run a new analysis or review results" },
  competitors:  { title:"Competitors",       sub:"SEO visibility, rankings & competitor scores" },
  keywords:     { title:"Keywords",          sub:"Search volume, intent & position estimates" },
  profile:      { title:"Company Profile",   sub:"LinkedIn & Google Business descriptions" },
  da:           { title:"Domain Authority",  sub:"Gap analysis & backlink strategy" },
  report:       { title:"Full Report",       sub:"All four analyses in one consolidated view" },
};

function TopBar({ onMenu }) {
  const { s, d } = useApp();
  const info = PAGE_META[s.view] || PAGE_META["dash-home"];
  const hasResults = Object.values(s.results).some(Boolean);

  return (
    <header style={{
      height:"var(--topbar)", display:"flex", alignItems:"center", padding:"0 24px", gap:16,
      borderBottom:"1px solid var(--glass-border)",
      background:"rgba(7,9,15,.9)", backdropFilter:"blur(14px)",
      position:"sticky", top:0, zIndex:100,
    }}>
      <button onClick={onMenu} style={{ display:"none", background:"none", border:"none", color:"var(--t2)", fontSize:20, cursor:"pointer", padding:4 }} className="menu-btn">☰</button>
      <div style={{ flex:1 }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:700, color:"var(--t1)", lineHeight:1 }}>{info.title}</div>
        <div style={{ fontSize:11, color:"var(--t3)", marginTop:2 }}>{info.sub}</div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        {hasResults && (
          <Btn variant="ghost" size="sm" onClick={() => { d({ t:"CLEAR" }); d({ t:"VIEW", v:"dash-home" }); }}>New Analysis</Btn>
        )}
        <div style={{ width:34, height:34, borderRadius:"50%", background:"linear-gradient(135deg,#7C6FFF,#9D93FF)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"#fff" }}>A</div>
      </div>
    </header>
  );
}

/* ═══════════════════════════════════════════════════════════
   ANALYSE FORM (shared across pages)
═══════════════════════════════════════════════════════════ */
function AnalyseForm({ onSubmit, loading, btnLabel = "Analyse", compact }) {
  const { s, d } = useApp();
  const req = s.req;
  const set = (k, v) => d({ t:"REQ", v:{ [k]: v } });
  const [focused, setFocused] = useState({});
  const submit = e => { e.preventDefault(); if (!req.company_name) return; onSubmit(req); };

  const Field = ({ label, k, type = "text", placeholder }) => (
    <div style={{ flex:1, minWidth:compact ? 140 : 200 }}>
      <label style={{ fontSize:10, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:".06em", display:"block", marginBottom:6 }}>{label}</label>
      <input type={type} value={req[k]} placeholder={placeholder}
        onChange={e => set(k, e.target.value)}
        onFocus={() => setFocused(p => ({ ...p, [k]:true }))}
        onBlur={() => setFocused(p => ({ ...p, [k]:false }))}
        style={{
          width:"100%", padding:"10px 14px",
          background: focused[k] ? "rgba(124,111,255,.07)" : "rgba(255,255,255,.04)",
          border:`1.5px solid ${focused[k] ? "var(--p-border)" : "var(--glass-border)"}`,
          borderRadius:"var(--r2)", color:"var(--t1)", fontSize:14, outline:"none",
          transition:"all .15s", boxShadow: focused[k] ? "0 0 0 3px var(--p-dim)" : "none",
          fontFamily:"inherit",
        }}
      />
    </div>
  );

  if (compact) {
    return (
      <form onSubmit={submit} style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end", marginBottom:24 }}>
        <Field label="Company" k="company_name" placeholder="APAC Relocation" />
        <Field label="Website URL" k="url" placeholder="https://apacrelocation.com" />
        <Field label="Market" k="market" placeholder="Singapore" />
        <Btn type="submit" loading={loading} disabled={!req.company_name || !req.url} style={{ flexShrink:0, alignSelf:"flex-end" }}>
          {loading ? "Analysing…" : btnLabel}
        </Btn>
      </form>
    );
  }

  return (
    <Card style={{ padding:"28px", marginBottom:28, position:"relative" }}>
      <div style={{ position:"absolute", top:0, left:"14%", right:"14%", height:1, background:"linear-gradient(90deg,transparent,rgba(124,111,255,.8),transparent)" }} />
      <div style={{ marginBottom:20 }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:"var(--t1)", marginBottom:4 }}>Run SEO Analysis</div>
        <div style={{ fontSize:13, color:"var(--t3)" }}>Enter any company's details to generate AI-powered competitive intelligence.</div>
      </div>
      <form onSubmit={submit}>
        <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginBottom:14 }}>
          <Field label="Company Name" k="company_name" placeholder="e.g. My Company" />
          <Field label="Website URL" k="url" placeholder="https://mycompany.com" />
        </div>
        <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginBottom:22 }}>
          <Field label="Market / City" k="market" placeholder="Singapore" />
          <Field label="Industry" k="industry" placeholder="International Relocation / Moving Services" />
        </div>
        <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
          <Btn type="submit" size="lg" loading={loading} disabled={!req.company_name || !req.url}>{loading ? "Analysing…" : btnLabel}</Btn>
          {loading && <span style={{ fontSize:13, color:"var(--t3)" }}>This may take 15–30 seconds…</span>}
        </div>
      </form>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   STAT TILE
═══════════════════════════════════════════════════════════ */
function StatTile({ label, value, sub, accent = "var(--p2)", icon }) {
  return (
    <Card style={{ padding:"20px 22px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <span style={{ fontSize:11, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:".06em" }}>{label}</span>
        {icon && <span style={{ fontSize:18 }}>{icon}</span>}
      </div>
      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:30, fontWeight:800, color:accent, lineHeight:1, marginBottom:6 }}>{value ?? "—"}</div>
      {sub && <div style={{ fontSize:12, color:"var(--t3)" }}>{sub}</div>}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD HOME PAGE
═══════════════════════════════════════════════════════════ */
const QUICK = [
  { company_name:"APAC Relocation",   url:"https://www.apacrelocation.com",     market:"Singapore", industry:"International Relocation / Moving Services" },
  { company_name:"Crown Relocations", url:"https://www.crownrelo.com",          market:"Singapore", industry:"International Relocation / Moving Services" },
  { company_name:"PropertyGuru",      url:"https://www.propertyguru.com.sg",    market:"Singapore", industry:"Real Estate Portal" },
];

const MODULE_CARDS = [
  { id:"competitors", icon:"⚔",  title:"Competitors",      desc:"SEO visibility, DA estimates & keyword rankings", color:"#7C6FFF", result:"competitors" },
  { id:"keywords",   icon:"🔑",  title:"Keywords",          desc:"Volume, intent & position estimates",             color:"#2DD4BF", result:"keywords" },
  { id:"profile",    icon:"📋",  title:"Company Profile",   desc:"LinkedIn + Google Business ready copy",           color:"#FCD34D", result:"profile" },
  { id:"da",         icon:"📈",  title:"Domain Authority",  desc:"Gap analysis & backlink strategy",                color:"#38BDF8", result:"da" },
  { id:"report",     icon:"⚡",   title:"Full Report",       desc:"All 4 analyses in one API call",                  color:"#FB7185", result:"report" },
];

function DashHome() {
  const { s, d, api, toast } = useApp();
  const loading = s.loading.report;

  const submit = async req => {
    try {
      await api("report", "/seo/full-report", req);
      toast({ msg:"Full report ready — explore each module.", type:"success" });
      d({ t:"VIEW", v:"competitors" });
    } catch (_) {}
  };

  const comp = s.results.report?.competitor_analysis || s.results.competitors;
  const kw   = s.results.report?.keyword_volume || s.results.keywords;
  const da   = s.results.report?.domain_authority_strategy || s.results.da;
  const hasAny = Object.values(s.results).some(Boolean);

  return (
    <div style={{ maxWidth:900 }}>
      <div style={{ marginBottom:28 }} className="fadeUp">
        <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"4px 12px", background:"var(--p-dim)", border:"1px solid var(--p-border)", borderRadius:20, marginBottom:14 }}>
          <span style={{ width:6, height:6, borderRadius:"50%", background:"var(--p2)" }}/>
          <span style={{ fontSize:11, color:"var(--p2)", fontWeight:700 }}>AI-Powered · Claude Sonnet</span>
        </div>
        <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:"clamp(22px,3vw,30px)", fontWeight:800, color:"var(--t1)", letterSpacing:"-.02em", marginBottom:8, lineHeight:1.2 }}>
          SEO Intelligence<br/>for Asia-Pacific Markets
        </h1>
        <p style={{ fontSize:14, color:"var(--t2)", lineHeight:1.8, maxWidth:520 }}>
          Enter any company to instantly generate competitor analysis, keyword intelligence, company profiles, and domain authority strategies — powered by Claude AI.
        </p>
      </div>

      {/* Quick starts */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:".06em", marginBottom:10 }}>Quick start</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {QUICK.map((q, i) => (
            <button key={i} onClick={() => d({ t:"REQ", v:q })} style={{
              padding:"7px 16px", background:"rgba(255,255,255,.04)", border:"1px solid var(--glass-border)",
              borderRadius:20, color:"var(--t2)", fontSize:13, cursor:"pointer", fontFamily:"inherit",
              transition:"all .15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--p-border)"; e.currentTarget.style.color = "var(--p2)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--glass-border)"; e.currentTarget.style.color = "var(--t2)"; }}
            >{q.company_name}</button>
          ))}
        </div>
      </div>

      <AnalyseForm onSubmit={submit} loading={loading} btnLabel="Run Full Report" />

      {/* Summary stats if data exists */}
      {hasAny && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))", gap:12, marginBottom:28 }} className="fadeUp d200">
          <StatTile label="Competitors" value={comp?.competitor_overview?.length} icon="⚔" sub="companies mapped" />
          <StatTile label="Keywords" value={(() => { if (!kw) return null; return (kw.high_volume_head_terms?.length||0)+(kw.mid_volume_service_terms?.length||0)+(kw.long_tail_high_intent?.length||0); })()} icon="🔑" sub="terms tracked" accent="var(--teal)" />
          <StatTile label="Current DA" value={da?.current_da} icon="📊" sub="estimated" accent="var(--sky)" />
          <StatTile label="DA Target" value={da?.target_da_12m} icon="🎯" sub="12-month goal" accent="var(--amber)" />
        </div>
      )}

      {/* Module cards */}
      <div style={{ fontSize:11, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:".06em", marginBottom:12 }}>Modules</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:14 }}>
        {MODULE_CARDS.map((m, i) => {
          const ready = m.result === "report" ? !!s.results.report : !!s.results[m.result];
          return (
            <Card key={m.id} glass onClick={() => d({ t:"VIEW", v:m.id })} style={{ padding:20 }} className={`fadeUp d${(i+1)*100 > 400 ? 400 : (i+1)*100}`}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                <div style={{ width:40, height:40, borderRadius:"var(--r2)", background:`${m.color}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>{m.icon}</div>
                {ready && <Badge variant="teal">Ready</Badge>}
              </div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, color:"var(--t1)", marginBottom:4 }}>{m.title}</div>
              <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.6 }}>{m.desc}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */
function diffVariant(d) {
  return { Easy:"teal", Medium:"amber", Hard:"rose", "Very High":"rose", High:"amber", Medium:"sky", Low:"teal" }[d] || "default";
}
function posColor(v) {
  const n = parseInt(v?.replace(/\D.*$/, ""));
  return n <= 3 ? "var(--green)" : n <= 8 ? "var(--amber)" : "var(--rose)";
}

/* ═══════════════════════════════════════════════════════════
   COMPETITORS PAGE
═══════════════════════════════════════════════════════════ */
function CompetitorsPage() {
  const { s, api, toast } = useApp();
  const loading = s.loading.competitors;
  const data = s.results.competitors || s.results.report?.competitor_analysis;

  const submit = async req => {
    try { await api("competitors", "/seo/competitors", req); toast({ msg:"Competitor analysis complete.", type:"success" }); }
    catch (_) {}
  };

  return (
    <div style={{ maxWidth:1100 }}>
      <AnalyseForm onSubmit={submit} loading={loading} btnLabel="Analyse Competitors" compact={!!data} />
      {loading && <div style={{ display:"flex", flexDirection:"column", gap:16 }}>{[1,2,3].map(i=><SkelCard key={i} rows={5}/>)}</div>}
      {s.errors.competitors && !loading && <Card style={{ padding:24, textAlign:"center" }}><span style={{ color:"var(--rose)" }}>⚠ {s.errors.competitors}</span></Card>}
      {data && !loading && (
        <div style={{ display:"flex", flexDirection:"column", gap:22 }} className="fadeUp">
          {/* Overview table */}
          <Card style={{ overflow:"hidden" }}>
            <div style={{ padding:"20px 20px 0" }}><SectionHeader title="Competitor Overview" subtitle={`${data.competitor_overview?.length} companies mapped`} /></div>
            <DataTable
              cols={[
                { key:"rank",          label:"#",             align:"center", color:"var(--t3)" },
                { key:"company",       label:"Company",        render:v=><strong style={{ color:"var(--t1)" }}>{v}</strong> },
                { key:"hq",            label:"HQ / Presence",  color:"var(--t2)", wrap:true },
                { key:"focus",         label:"Focus",          color:"var(--t2)", wrap:true },
                { key:"scale",         label:"Scale",          color:"var(--t2)", wrap:true, maxW:200 },
                { key:"accreditation", label:"Accreditation",  color:"var(--t3)" },
              ]}
              rows={data.competitor_overview}
            />
          </Card>

          {/* SEO Visibility */}
          <Card style={{ overflow:"hidden" }}>
            <div style={{ padding:"20px 20px 0" }}><SectionHeader title="SEO Visibility & Digital Presence" subtitle="Domain authority, organic traffic and content presence" /></div>
            <DataTable
              cols={[
                { key:"company", label:"Company", render:v=><strong style={{ color:"var(--t1)" }}>{v}</strong> },
                { key:"seo_visibility_score", label:"SEO Score", render:(v,row)=>(
                  <div style={{ minWidth:130 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:12, fontWeight:700, color: v>=70?"var(--green)":v>=50?"var(--p2)":"var(--amber)" }}>{v}/100</span>
                    </div>
                    <ProgressBar value={v} max={100} color={v>=70?"var(--green)":v>=50?"var(--p)":"var(--amber)"} />
                  </div>
                )},
                { key:"domain_authority_estimate", label:"Est. DA", align:"center", render:v=><span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:600, color:"var(--p2)", fontSize:13 }}>{v}</span> },
                { key:"organic_traffic_estimate", label:"Traffic", render:v=><Badge variant={diffVariant(v)}>{v}</Badge> },
                { key:"has_blog", label:"Blog", align:"center", render:v=><span style={{ color:v?"var(--green)":"var(--rose)", fontSize:16 }}>{v?"✓":"✕"}</span> },
                { key:"google_rating", label:"Google ★", align:"center", render:v=><span style={{ color:"var(--amber)", fontWeight:700 }}>{v}★</span> },
              ]}
              rows={data.seo_visibility}
            />
          </Card>

          {/* Keyword rankings */}
          <Card style={{ overflow:"hidden" }}>
            <div style={{ padding:"20px 20px 0" }}><SectionHeader title="Keyword Ranking Comparison" subtitle="Estimated SERP positions across key industry terms" /></div>
            <DataTable
              cols={[
                { key:"keyword", label:"Keyword", render:v=><span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"var(--t1)" }}>{v}</span>, wrap:true },
                { key:"monthly_searches_estimate", label:"Monthly Vol.", align:"center", render:v=><span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"var(--p2)", fontWeight:600 }}>{v}</span> },
                { key:"apac_rank",    label:"Your Co.",  align:"center", render:v=><strong style={{ color:posColor(v), fontFamily:"'JetBrains Mono',monospace" }}>{v}</strong> },
                { key:"crown_rank",   label:"Crown",     align:"center", color:"var(--t2)" },
                { key:"allied_rank",  label:"Allied",    align:"center", color:"var(--t2)" },
                { key:"asiatic_rank", label:"Asiatic",   align:"center", color:"var(--t2)" },
              ]}
              rows={data.keyword_rankings}
            />
          </Card>

          {/* Scores */}
          <Card style={{ padding:"22px" }}>
            <SectionHeader title="Overall Competitor Scores" subtitle="Composite ranking with strengths & weaknesses" />
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {data.competitor_scores.map(c => (
                <div key={c.company} style={{ padding:16, background:"rgba(255,255,255,.03)", border:"1px solid var(--glass-border)", borderRadius:"var(--r2)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10, flexWrap:"wrap" }}>
                    <div style={{ width:28, height:28, borderRadius:"50%", background:"var(--p-dim)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700, color:"var(--p2)", flexShrink:0 }}>{c.rank}</div>
                    <strong style={{ flex:1, fontSize:14, color:"var(--t1)" }}>{c.company}</strong>
                    <Badge variant={c.score>=80?"teal":c.score>=60?"purple":c.score>=40?"amber":"rose"}>{c.score}</Badge>
                    <div style={{ width:120 }}><ProgressBar value={c.score} max={100} color={c.score>=80?"var(--teal)":c.score>=60?"var(--p)":"var(--amber)"} /></div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    <div style={{ fontSize:12, color:"var(--t2)" }}><span style={{ color:"var(--green)", marginRight:5 }}>✓</span>{c.key_strengths}</div>
                    <div style={{ fontSize:12, color:"var(--t2)" }}><span style={{ color:"var(--rose)", marginRight:5 }}>✕</span>{c.key_weaknesses}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Takeaways */}
          <Card style={{ padding:"22px" }}>
            <SectionHeader title="Strategic Takeaways" subtitle="AI-generated insights based on competitive landscape" />
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {data.key_takeaways.map((t, i) => (
                <div key={i} style={{ display:"flex", gap:14, padding:14, background:"rgba(124,111,255,.06)", border:"1px solid rgba(124,111,255,.15)", borderRadius:"var(--r2)" }}>
                  <div style={{ width:24, height:24, borderRadius:"50%", background:"var(--p-dim)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"var(--p2)", flexShrink:0 }}>{i+1}</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"var(--t1)", marginBottom:3 }}>{t.insight}</div>
                    <div style={{ fontSize:13, color:"var(--t2)", lineHeight:1.7 }}>{t.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
      {!data && !loading && !s.errors.competitors && <Empty icon="⚔" title="No competitor analysis yet" body="Fill in the form above and click Analyse Competitors." />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   KEYWORDS PAGE
═══════════════════════════════════════════════════════════ */
function KeywordsPage() {
  const { s, api, toast } = useApp();
  const loading = s.loading.keywords;
  const data = s.results.keywords || s.results.report?.keyword_volume;
  const [tab, setTab] = useState("all");

  const submit = async req => {
    try { await api("keywords", "/seo/keywords", req); toast({ msg:"Keyword intelligence ready.", type:"success" }); }
    catch (_) {}
  };

  const all = data ? [...(data.high_volume_head_terms||[]),...(data.mid_volume_service_terms||[]),...(data.long_tail_high_intent||[])] : [];
  const winners = all.filter(k => { const n=parseInt(k.apac_estimated_position?.replace(/\D.*$/,"")); return n>=1&&n<=5; });

  const INTENT_V = { Transactional:"teal", Informational:"sky", Navigational:"amber" };
  const COMP_V   = { "Very High":"rose", High:"amber", Medium:"sky", Low:"teal" };

  const kwTable = (rows) => (
    <DataTable
      cols={[
        { key:"rank",                    label:"#",          align:"center", color:"var(--t3)" },
        { key:"keyword",                 label:"Keyword",    render:v=><span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"var(--t1)" }}>{v}</span>, wrap:true },
        { key:"monthly_volume_estimate", label:"Volume",     render:v=><span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:"var(--p2)", fontSize:12 }}>{v}</span> },
        { key:"competition",             label:"Competition",render:v=><Badge variant={COMP_V[v]||"default"}>{v}</Badge> },
        { key:"intent",                  label:"Intent",     render:v=><Badge variant={INTENT_V[v]||"default"}>{v}</Badge> },
        { key:"apac_estimated_position", label:"Your Pos.",  render:v=><strong style={{ color:posColor(v), fontFamily:"'JetBrains Mono',monospace", fontSize:13 }}>{v}</strong> },
      ]}
      rows={rows}
    />
  );

  return (
    <div style={{ maxWidth:1100 }}>
      <AnalyseForm onSubmit={submit} loading={loading} btnLabel="Analyse Keywords" compact={!!data} />
      {loading && <div style={{ display:"flex", flexDirection:"column", gap:16 }}>{[1,2,3].map(i=><SkelCard key={i} rows={6}/>)}</div>}
      {data && !loading && (
        <div style={{ display:"flex", flexDirection:"column", gap:22 }} className="fadeUp">
          {/* Stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))", gap:12 }}>
            <StatTile label="Head Terms"    value={data.high_volume_head_terms?.length}  icon="🎯" sub="high volume" />
            <StatTile label="Service Terms" value={data.mid_volume_service_terms?.length} icon="🔑" sub="mid volume" accent="var(--teal)" />
            <StatTile label="Long-tail"     value={data.long_tail_high_intent?.length}   icon="💎" sub="high intent" accent="var(--amber)" />
            <StatTile label="Top 5"         value={winners.length} icon="🏆" sub="already #1–5" accent="var(--green)" />
          </div>

          {/* Tabs */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {[
              { id:"all",     label:`All (${all.length})` },
              { id:"head",    label:`High Volume (${data.high_volume_head_terms?.length})` },
              { id:"mid",     label:`Service Terms (${data.mid_volume_service_terms?.length})` },
              { id:"tail",    label:`Long-tail (${data.long_tail_high_intent?.length})` },
              { id:"winners", label:`Top 5 (${winners.length})` },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding:"7px 16px", borderRadius:20, fontSize:12, fontWeight:600,
                cursor:"pointer", border:"1px solid", fontFamily:"inherit", transition:"all .15s",
                background: tab===t.id ? "var(--p-dim)" : "transparent",
                borderColor: tab===t.id ? "var(--p-border)" : "var(--glass-border)",
                color: tab===t.id ? "var(--p2)" : "var(--t2)",
              }}>{t.label}</button>
            ))}
          </div>

          {(tab==="all"||tab==="head")  && <Card style={{ overflow:"hidden" }}><div style={{ padding:"20px 20px 0" }}><SectionHeader title="High-Volume Head Terms" subtitle="Broadest reach — most competitive" /></div>{kwTable(data.high_volume_head_terms)}</Card>}
          {(tab==="all"||tab==="mid")   && <Card style={{ overflow:"hidden" }}><div style={{ padding:"20px 20px 0" }}><SectionHeader title="Mid-Volume Service Terms" subtitle="Core revenue keywords" /></div>{kwTable(data.mid_volume_service_terms)}</Card>}
          {(tab==="all"||tab==="tail")  && <Card style={{ overflow:"hidden" }}><div style={{ padding:"20px 20px 0" }}><SectionHeader title="Long-Tail High-Intent" subtitle="Best conversion rate — lowest competition" /></div>{kwTable(data.long_tail_high_intent)}</Card>}
          {tab==="winners" && <Card style={{ overflow:"hidden" }}><div style={{ padding:"20px 20px 0" }}><SectionHeader title="Already Ranking Top 5" subtitle="Protect and strengthen these positions" /></div>{kwTable(winners)}</Card>}

          <Card style={{ padding:"22px" }}>
            <SectionHeader title="Strategic Priority Summary" subtitle="AI-generated keyword strategy recommendations" />
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {data.strategic_priority_summary.map((s, i) => (
                <div key={i} style={{ display:"flex", gap:12, padding:14, background:"rgba(45,212,191,.05)", border:"1px solid rgba(45,212,191,.12)", borderRadius:"var(--r2)" }}>
                  <span style={{ color:"var(--teal)", fontSize:16, flexShrink:0, marginTop:1 }}>→</span>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"var(--t1)", marginBottom:3 }}>{s.insight}</div>
                    <div style={{ fontSize:13, color:"var(--t2)", lineHeight:1.7 }}>{s.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
      {!data && !loading && !s.errors.keywords && <Empty icon="🔑" title="No keyword data yet" body="Run an analysis to get search volume, intent, and position data." />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PROFILE PAGE
═══════════════════════════════════════════════════════════ */
function ProfilePage() {
  const { s, api, toast } = useApp();
  const loading = s.loading.profile;
  const data = s.results.profile || s.results.report?.company_profile;
  const [expanded, setExpanded] = useState({});

  const submit = async req => {
    try { await api("profile", "/seo/profile", req); toast({ msg:"Company profiles generated.", type:"success" }); }
    catch (_) {}
  };

  const TextBlock = ({ title, icon, text, max, platform }) => {
    const n = text?.length || 0;
    const over = n > max;
    const key = title;
    const show = expanded[key];
    const preview = text?.slice(0, 200);
    return (
      <Card style={{ padding:"22px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, flexWrap:"wrap" }}>
          <span style={{ fontSize:20 }}>{icon}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, color:"var(--t1)" }}>{title}</div>
            {platform && <div style={{ fontSize:11, color:"var(--t3)" }}>→ {platform}</div>}
          </div>
          <span style={{ fontSize:11, fontFamily:"'JetBrains Mono',monospace", color: over?"var(--rose)":n>max*.9?"var(--amber)":"var(--t3)" }}>{n} / {max}</span>
          <CopyBtn text={text||""} />
        </div>
        <div style={{ background:"rgba(0,0,0,.25)", border:"1px solid var(--glass-border)", borderRadius:"var(--r2)", padding:16, fontSize:14, color:"var(--t2)", lineHeight:1.8, whiteSpace:"pre-wrap", fontFamily:"inherit" }}>
          {text?.length > 200 && !show ? preview + "…" : text}
          {text?.length > 200 && (
            <button onClick={() => setExpanded(p=>({...p,[key]:!p[key]}))} style={{ display:"block", marginTop:8, background:"none", border:"none", color:"var(--p2)", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
              {show ? "↑ Show less" : "↓ Show full text"}
            </button>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div style={{ maxWidth:900 }}>
      <AnalyseForm onSubmit={submit} loading={loading} btnLabel="Generate Profiles" compact={!!data} />
      {loading && <div style={{ display:"flex", flexDirection:"column", gap:16 }}>{[1,2].map(i=><SkelCard key={i} rows={8}/>)}</div>}
      {data && !loading && (
        <div style={{ display:"flex", flexDirection:"column", gap:20 }} className="fadeUp">
          {/* Tagline */}
          <Card style={{ padding:"20px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:".06em", marginBottom:6 }}>Tagline</div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, color:"var(--t1)", lineHeight:1.3 }}>"{data.tagline}"</div>
              </div>
              <CopyBtn text={data.tagline} />
            </div>
          </Card>

          <TextBlock title="LinkedIn Company Overview" icon="🔵" text={data.linkedin_overview} max={2000} platform="LinkedIn → Edit page → Overview" />
          <TextBlock title="Google Business Profile" icon="🔴" text={data.google_business_description} max={750} platform="Google Business → Edit profile → Business description" />

          {/* Specialties */}
          <Card style={{ padding:"22px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8, marginBottom:14 }}>
              <SectionHeader title="LinkedIn Specialties" subtitle="Copy-paste into Specialties field" />
              <CopyBtn text={data.linkedin_specialties?.join(", ")||""} />
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:14 }}>
              {data.linkedin_specialties?.map((s,i) => (
                <span key={i} style={{ padding:"5px 12px", background:"var(--p-dim)", border:"1px solid var(--p-border)", borderRadius:20, fontSize:12, color:"var(--p2)", fontWeight:500 }}>{s}</span>
              ))}
            </div>
            <div style={{ padding:"10px 14px", background:"rgba(0,0,0,.25)", borderRadius:"var(--r1)", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"var(--t3)", wordBreak:"break-all" }}>
              {data.linkedin_specialties?.join(", ")}
            </div>
          </Card>

          {/* GBP Categories */}
          <Card style={{ padding:"22px" }}>
            <SectionHeader title="Google Business Categories" subtitle="Set in GBP → Business information → Category" />
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {data.google_business_categories?.map((cat,i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"rgba(255,255,255,.03)", border:"1px solid var(--glass-border)", borderRadius:"var(--r2)" }}>
                  <Badge variant={i===0?"teal":"default"}>{i===0?"Primary":`Secondary ${i}`}</Badge>
                  <span style={{ fontSize:14, color:"var(--t1)" }}>{cat}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
      {!data && !loading && !s.errors.profile && <Empty icon="📋" title="No profiles generated yet" body="Enter your company details to generate AI-written LinkedIn and Google Business descriptions." />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DOMAIN AUTHORITY PAGE
═══════════════════════════════════════════════════════════ */
function DAPage() {
  const { s, api, toast } = useApp();
  const loading = s.loading.da;
  const data = s.results.da || s.results.report?.domain_authority_strategy;

  const submit = async req => {
    try { await api("da", "/seo/domain-authority", req); toast({ msg:"Domain Authority strategy ready.", type:"success" }); }
    catch (_) {}
  };

  const pillars = data?.backlink_opportunities?.reduce((acc, item) => {
    if (!acc[item.pillar]) acc[item.pillar] = [];
    acc[item.pillar].push(item);
    return acc;
  }, {}) || {};

  return (
    <div style={{ maxWidth:1100 }}>
      <AnalyseForm onSubmit={submit} loading={loading} btnLabel="Build DA Strategy" compact={!!data} />
      {loading && <div style={{ display:"flex", flexDirection:"column", gap:16 }}>{[1,2,3].map(i=><SkelCard key={i} rows={5}/>)}</div>}
      {data && !loading && (
        <div style={{ display:"flex", flexDirection:"column", gap:22 }} className="fadeUp">
          {/* DA Gauge */}
          <Card style={{ padding:"24px" }}>
            <SectionHeader title="Domain Authority Trajectory" subtitle="Current estimate vs 6 and 12-month targets" />
            <div style={{ display:"flex", gap:16, flexWrap:"wrap", marginBottom:24 }}>
              {[
                { label:"Current DA",     val:data.current_da,   color:"var(--rose)" },
                { label:"6-Month Target", val:data.target_da_6m, color:"var(--amber)" },
                { label:"12-Month Target",val:data.target_da_12m,color:"var(--teal)" },
              ].map(item => (
                <div key={item.label} style={{ flex:1, minWidth:110, textAlign:"center", padding:"18px 12px", background:"rgba(255,255,255,.03)", border:"1px solid var(--glass-border)", borderRadius:"var(--r2)" }}>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontSize:38, fontWeight:800, color:item.color, lineHeight:1, animation:"countUp .6s var(--spring) both" }}>{item.val}</div>
                  <div style={{ fontSize:12, color:"var(--t3)", marginTop:6 }}>{item.label}</div>
                </div>
              ))}
            </div>
            {/* Visual bar */}
            <div style={{ position:"relative", height:10, background:"rgba(255,255,255,.06)", borderRadius:5, marginBottom:24, overflow:"visible" }}>
              <div style={{ position:"absolute", left:0, top:0, height:"100%", width:`${(data.current_da/(data.target_da_12m+10))*100}%`, background:"var(--rose)", borderRadius:5, transition:"width 1s var(--ease)" }} />
              {[
                { val:data.target_da_6m, color:"var(--amber)", label:"6m" },
                { val:data.target_da_12m,color:"var(--teal)",  label:"12m" },
              ].map((m,i) => {
                const pct = (m.val/(data.target_da_12m+10))*100;
                return (
                  <div key={i} style={{ position:"absolute", left:`${pct}%`, top:-4, transform:"translateX(-50%)" }}>
                    <div style={{ width:3, height:18, background:m.color, borderRadius:2 }} />
                    <div style={{ position:"absolute", top:22, left:"50%", transform:"translateX(-50%)", fontSize:10, color:m.color, whiteSpace:"nowrap" }}>{m.label}: {m.val}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ textAlign:"center", fontSize:13, color:"var(--t3)", marginTop:8 }}>
              +{data.target_da_6m - data.current_da} pts in 6 months · +{data.target_da_12m - data.current_da} pts in 12 months
            </div>
          </Card>

          {/* Gap Analysis */}
          <Card style={{ overflow:"hidden" }}>
            <div style={{ padding:"20px 20px 0" }}><SectionHeader title="Gap Analysis" subtitle="Current state vs targets vs top competitor benchmark" /></div>
            <DataTable
              cols={[
                { key:"metric",               label:"Metric",          render:v=><strong style={{ color:"var(--t1)" }}>{v}</strong>, wrap:true },
                { key:"current",              label:"Current",          color:"var(--rose)" },
                { key:"six_month_target",     label:"6-Month Target",   color:"var(--amber)" },
                { key:"twelve_month_target",  label:"12-Month Target",  color:"var(--teal)" },
                { key:"benchmark",            label:"Competitor Bench", color:"var(--t3)", wrap:true },
              ]}
              rows={data.gap_analysis}
            />
          </Card>

          {/* Backlinks by pillar */}
          {Object.entries(pillars).map(([pillar, ops]) => (
            <Card key={pillar} style={{ overflow:"hidden" }}>
              <div style={{ padding:"20px 20px 0" }}>
                <SectionHeader title={`${pillar} Links`} subtitle={`${ops.length} opportunities`} right={<Badge variant="purple">{ops.length}</Badge>} />
              </div>
              <DataTable
                cols={[
                  { key:"action",                label:"Action",          color:"var(--t1)", wrap:true, maxW:260 },
                  { key:"platform_or_target",    label:"Target",          color:"var(--t2)", wrap:true },
                  { key:"estimated_da",           label:"Est. DA",        render:v=><span style={{ fontFamily:"'JetBrains Mono',monospace", color:"var(--p2)", fontWeight:700, fontSize:13 }}>{v}</span> },
                  { key:"difficulty",             label:"Difficulty",     render:v=><Badge variant={diffVariant(v)}>{v}</Badge> },
                  { key:"estimated_monthly_links",label:"Links/Mo.",      color:"var(--t3)" },
                ]}
                rows={ops}
              />
            </Card>
          ))}

          {/* Priority Actions */}
          <Card style={{ padding:"22px" }}>
            <SectionHeader title="Top 5 Priority Actions" subtitle="Highest-impact moves to increase domain authority fast" />
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {data.top_5_priority_actions.map((a, i) => (
                <div key={i} style={{ display:"flex", gap:16, alignItems:"flex-start", padding:16, background:"rgba(124,111,255,.05)", border:"1px solid rgba(124,111,255,.14)", borderRadius:"var(--r2)" }}>
                  <div style={{ width:30, height:30, borderRadius:"50%", background:i===0?"var(--p)":"var(--p-dim)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:i===0?"#fff":"var(--p2)", flexShrink:0 }}>{i+1}</div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:"var(--t1)", marginBottom:4 }}>{a.insight}</div>
                    <div style={{ fontSize:13, color:"var(--t2)", lineHeight:1.7 }}>{a.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
      {!data && !loading && !s.errors.da && <Empty icon="📈" title="No DA strategy yet" body="Run an analysis to generate a full domain authority growth plan." />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   FULL REPORT PAGE
═══════════════════════════════════════════════════════════ */
function ReportPage() {
  const { s, api, toast } = useApp();
  const loading = s.loading.report;
  const report = s.results.report;
  const [sec, setSec] = useState("overview");

  const submit = async req => {
    try {
      await api("report", "/seo/full-report", req);
      toast({ msg:"Full report generated — all 4 analyses complete.", type:"success" });
      setSec("overview");
    } catch (_) {}
  };

  const SECTIONS = [
    { id:"overview",    label:"📊 Overview" },
    { id:"competitors", label:"⚔ Competitors" },
    { id:"keywords",    label:"🔑 Keywords" },
    { id:"profile",     label:"📋 Profile" },
    { id:"da",          label:"📈 Domain Authority" },
  ];

  const comp = report?.competitor_analysis;
  const kw   = report?.keyword_volume;
  const prof = report?.company_profile;
  const da   = report?.domain_authority_strategy;
  const totalKws = kw ? (kw.high_volume_head_terms?.length||0)+(kw.mid_volume_service_terms?.length||0)+(kw.long_tail_high_intent?.length||0) : 0;

  return (
    <div style={{ maxWidth:1100 }}>
      <AnalyseForm onSubmit={submit} loading={loading} btnLabel={loading?"Generating…":"⚡ Run Full Report"} compact={!!report} />

      {loading && (
        <div style={{ textAlign:"center", padding:"60px 24px" }}>
          <div style={{ width:52, height:52, borderRadius:"50%", border:"3px solid var(--p-dim)", borderTopColor:"var(--p)", margin:"0 auto 20px", animation:"spin .9s linear infinite" }} />
          <div style={{ color:"var(--t2)", marginBottom:8 }}>Running 4 AI analyses…</div>
          <div style={{ fontSize:13, color:"var(--t3)", marginBottom:20 }}>Competitor analysis → Keywords → Profile → Domain Authority</div>
          <div style={{ maxWidth:280, margin:"0 auto", height:3, background:"var(--bg3)", borderRadius:2, overflow:"hidden" }}>
            <div style={{ height:"100%", background:"linear-gradient(90deg,var(--p),var(--teal))", borderRadius:2, animation:"progress 28s linear forwards" }} />
          </div>
        </div>
      )}

      {report && !loading && (
        <>
          {/* Section nav */}
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:24, padding:6, background:"var(--bg1)", borderRadius:"var(--r3)", border:"1px solid var(--glass-border)" }}>
            {SECTIONS.map(sx => (
              <button key={sx.id} onClick={() => setSec(sx.id)} style={{
                padding:"8px 16px", borderRadius:"var(--r2)", fontSize:13, fontWeight:600,
                background: sec===sx.id ? "var(--p-dim)" : "transparent",
                border:`1px solid ${sec===sx.id?"var(--p-border)":"transparent"}`,
                color: sec===sx.id ? "var(--p2)" : "var(--t2)",
                cursor:"pointer", transition:"all .15s", fontFamily:"inherit",
              }}>{sx.label}</button>
            ))}
          </div>

          {/* Overview */}
          {sec==="overview" && (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }} className="fadeUp">
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))", gap:12 }}>
                <StatTile label="Competitors" value={comp?.competitor_overview?.length} icon="⚔" sub="companies mapped" />
                <StatTile label="Keywords" value={totalKws} icon="🔑" sub="terms tracked" accent="var(--teal)" />
                <StatTile label="Current DA" value={da?.current_da} icon="📊" sub="estimated" accent="var(--sky)" />
                <StatTile label="DA Target" value={da?.target_da_12m} icon="🎯" sub="12-month goal" accent="var(--amber)" />
              </div>
              {prof && (
                <Card style={{ padding:20 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:".06em", marginBottom:6 }}>Generated Tagline</div>
                      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, color:"var(--t1)" }}>"{prof.tagline}"</div>
                    </div>
                    <CopyBtn text={prof.tagline} />
                  </div>
                </Card>
              )}
              {comp && (
                <Card style={{ padding:22 }}>
                  <SectionHeader title="Competitor Score Summary" />
                  {comp.competitor_scores.slice(0,5).map(c => (
                    <div key={c.company} style={{ display:"flex", gap:12, alignItems:"center", marginBottom:12 }}>
                      <span style={{ fontSize:12, color:"var(--t3)", width:18, textAlign:"right" }}>{c.rank}</span>
                      <span style={{ flex:"0 0 150px", fontSize:13, color:"var(--t1)", fontWeight:500 }}>{c.company}</span>
                      <div style={{ flex:1 }}><ProgressBar value={c.score} max={100} color={c.score>=80?"var(--teal)":c.score>=60?"var(--p)":"var(--amber)"} /></div>
                      <span style={{ fontSize:13, fontWeight:700, color:"var(--t1)", width:28, textAlign:"right" }}>{c.score}</span>
                    </div>
                  ))}
                </Card>
              )}
              {da && (
                <Card style={{ padding:22 }}>
                  <SectionHeader title="Top DA Priority Actions" />
                  {da.top_5_priority_actions.map((a,i) => (
                    <div key={i} style={{ display:"flex", gap:12, padding:"12px 0", borderBottom:i<4?"1px solid rgba(255,255,255,.04)":"none" }}>
                      <Badge variant={i===0?"purple":"default"}>{i+1}</Badge>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:"var(--t1)", marginBottom:3 }}>{a.insight}</div>
                        <div style={{ fontSize:12, color:"var(--t3)", lineHeight:1.6 }}>{a.detail}</div>
                      </div>
                    </div>
                  ))}
                </Card>
              )}
              {comp?.key_takeaways && (
                <Card style={{ padding:22 }}>
                  <SectionHeader title="Strategic Takeaways" />
                  {comp.key_takeaways.map((t,i) => (
                    <div key={i} style={{ padding:"12px 0", borderBottom:i<comp.key_takeaways.length-1?"1px solid rgba(255,255,255,.04)":"none" }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"var(--t1)", marginBottom:3 }}>{t.insight}</div>
                      <div style={{ fontSize:13, color:"var(--t2)", lineHeight:1.7 }}>{t.detail}</div>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}

          {/* Competitors detail */}
          {sec==="competitors" && comp && (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }} className="fadeUp">
              <Card style={{ overflow:"hidden" }}><div style={{ padding:"20px 20px 0" }}><SectionHeader title="Competitor Overview" /></div>
                <DataTable cols={[{key:"rank",label:"#",align:"center",color:"var(--t3)"},{key:"company",label:"Company",render:v=><strong>{v}</strong>},{key:"hq",label:"HQ",color:"var(--t2)"},{key:"focus",label:"Focus",color:"var(--t2)",wrap:true},{key:"accreditation",label:"Accreditation",color:"var(--t3)"}]} rows={comp.competitor_overview} />
              </Card>
              <Card style={{ overflow:"hidden" }}><div style={{ padding:"20px 20px 0" }}><SectionHeader title="SEO Visibility" /></div>
                <DataTable cols={[{key:"company",label:"Company",render:v=><strong>{v}</strong>},{key:"seo_visibility_score",label:"SEO Score",render:v=><div style={{minWidth:110}}><ProgressBar value={v} max={100} /></div>},{key:"domain_authority_estimate",label:"DA",render:v=><span style={{fontFamily:"'JetBrains Mono',monospace",color:"var(--p2)",fontWeight:700,fontSize:13}}>{v}</span>,align:"center"},{key:"google_rating",label:"★",render:v=><span style={{color:"var(--amber)"}}>{v}</span>,align:"center"}]} rows={comp.seo_visibility} />
              </Card>
            </div>
          )}

          {/* Keywords detail */}
          {sec==="keywords" && kw && (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }} className="fadeUp">
              {[{title:"High-Volume Head Terms",rows:kw.high_volume_head_terms},{title:"Service Terms",rows:kw.mid_volume_service_terms},{title:"Long-tail",rows:kw.long_tail_high_intent}].map(({title,rows})=>(
                <Card key={title} style={{ overflow:"hidden" }}>
                  <div style={{ padding:"20px 20px 0" }}><SectionHeader title={title} /></div>
                  <DataTable cols={[{key:"keyword",label:"Keyword",render:v=><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>{v}</span>,wrap:true},{key:"monthly_volume_estimate",label:"Volume",render:v=><span style={{fontFamily:"'JetBrains Mono',monospace",color:"var(--p2)",fontWeight:700,fontSize:12}}>{v}</span>},{key:"competition",label:"Competition"},{key:"apac_estimated_position",label:"Position",render:v=><strong style={{color:posColor(v),fontFamily:"'JetBrains Mono',monospace",fontSize:13}}>{v}</strong>}]} rows={rows} />
                </Card>
              ))}
            </div>
          )}

          {/* Profile detail */}
          {sec==="profile" && prof && (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }} className="fadeUp">
              {[{title:"LinkedIn Overview",text:prof.linkedin_overview,max:2000},{title:"Google Business",text:prof.google_business_description,max:750}].map(({title,text,max})=>(
                <Card key={title} style={{ padding:22 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:8, marginBottom:12 }}>
                    <SectionHeader title={title} subtitle={`${text?.length||0} / ${max} chars`} />
                    <CopyBtn text={text||""} />
                  </div>
                  <div style={{ background:"rgba(0,0,0,.25)", borderRadius:"var(--r2)", padding:16, fontSize:13, color:"var(--t2)", lineHeight:1.8, whiteSpace:"pre-wrap" }}>{text}</div>
                </Card>
              ))}
              <Card style={{ padding:22 }}>
                <SectionHeader title="LinkedIn Specialties" />
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {prof.linkedin_specialties?.map((x,i) => <span key={i} style={{ padding:"5px 12px", background:"var(--p-dim)", border:"1px solid var(--p-border)", borderRadius:20, fontSize:12, color:"var(--p2)", fontWeight:500 }}>{x}</span>)}
                </div>
              </Card>
            </div>
          )}

          {/* DA detail */}
          {sec==="da" && da && (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }} className="fadeUp">
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
                <StatTile label="Current DA" value={da.current_da} accent="var(--rose)" />
                <StatTile label="6-Month" value={da.target_da_6m} accent="var(--amber)" />
                <StatTile label="12-Month" value={da.target_da_12m} accent="var(--teal)" />
              </div>
              <Card style={{ overflow:"hidden" }}><div style={{ padding:"20px 20px 0" }}><SectionHeader title="Gap Analysis" /></div>
                <DataTable cols={[{key:"metric",label:"Metric",render:v=><strong>{v}</strong>,wrap:true},{key:"current",label:"Current",color:"var(--rose)"},{key:"six_month_target",label:"6-Month",color:"var(--amber)"},{key:"twelve_month_target",label:"12-Month",color:"var(--teal)"},{key:"benchmark",label:"Benchmark",color:"var(--t3)",wrap:true}]} rows={da.gap_analysis} />
              </Card>
              <Card style={{ overflow:"hidden" }}><div style={{ padding:"20px 20px 0" }}><SectionHeader title="Backlink Opportunities" /></div>
                <DataTable cols={[{key:"pillar",label:"Pillar",render:v=><Badge variant="purple">{v}</Badge>},{key:"action",label:"Action",wrap:true,color:"var(--t1)"},{key:"platform_or_target",label:"Target",color:"var(--t2)",wrap:true},{key:"estimated_da",label:"DA",render:v=><span style={{fontFamily:"'JetBrains Mono',monospace",color:"var(--p2)",fontWeight:700,fontSize:13}}>{v}</span>},{key:"difficulty",label:"Effort",render:v=><Badge variant={diffVariant(v)}>{v}</Badge>}]} rows={da.backlink_opportunities} />
              </Card>
            </div>
          )}
        </>
      )}
      {!report && !loading && !s.errors.report && <Empty icon="⚡" title="No full report yet" body="Run a Full Report to get all 4 analyses — competitors, keywords, profile & domain authority — in one API call." />}
      {s.errors.report && !loading && (
        <Card style={{ padding:24, textAlign:"center" }}>
          <div style={{ color:"var(--rose)", marginBottom:8 }}>⚠ {s.errors.report}</div>
          <div style={{ fontSize:13, color:"var(--t3)" }}>Ensure ANTHROPIC_API_KEY is set and the backend is running at port 8000.</div>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD SHELL
═══════════════════════════════════════════════════════════ */
function DashLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { s } = useApp();

  const PAGE = {
    "dash-home": <DashHome />,
    competitors:  <CompetitorsPage />,
    keywords:     <KeywordsPage />,
    profile:      <ProfilePage />,
    da:           <DAPage />,
    report:       <ReportPage />,
  };

  return (
    <div style={{ display:"flex", minHeight:"100vh" }}>
      <style>{`
        @media(max-width:768px){
          .main-sidebar{ transform:translateX(-100%); }
          .main-sidebar.open{ transform:translateX(0)!important; }
          .main-content{ margin-left:0!important; }
          .menu-btn{ display:flex!important; }
        }
      `}</style>
      <div className={`main-sidebar${menuOpen?" open":""}`}>
        <Sidebar mobileOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      </div>
      <div className="main-content" style={{ flex:1, marginLeft:"var(--sidebar)", display:"flex", flexDirection:"column", minHeight:"100vh" }}>
        <TopBar onMenu={() => setMenuOpen(v => !v)} />
        <main style={{ flex:1, overflowY:"auto", padding:"28px 28px 60px" }}>
          {PAGE[s.view] || <DashHome />}
        </main>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ROOT APP
═══════════════════════════════════════════════════════════ */
export default function App() {
  return (
    <>
      <style>{STYLES}</style>
      <style>{`
        @media(max-width:768px){
          .auth-brand{ display:none!important; }
          .mobile-logo{ display:flex!important; }
        }
      `}</style>
      <AppProvider>
        <AppInner />
        <Toasts />
      </AppProvider>
    </>
  );
}

function AppInner() {
  const { s } = useApp();
  return s.view === "auth" ? <AuthLayout /> : <DashLayout />;
}
