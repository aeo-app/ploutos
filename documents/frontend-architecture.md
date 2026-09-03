# Frontend Architecture — Ploutos

React 18 (Create React App, JSX), react-scripts 5.0.1, framer-motion. **Active code is `frontend/src/`**. The root `App.jsx`/`index.js` are legacy single-file code — NOT used by CRA; treat as reference only.

> This is the canonical frontend reference. It documents both the **structure** of `src/` and the **coding conventions** it follows. Update this doc when structure or conventions change.

---

## 1. Overview

A single-page app with **no router library**. Navigation is a state-machine driven by two nested React Contexts. The UI is dark-themed with a custom design-token system.

```
frontend/src/
├── App.js              # Root component, page lookup tables, auth gating, framer-motion
├── index.js            # ReactDOM entry point
├── api/                # API client modules (camelCase.js)
├── context/            # AuthContext + AppContext (useReducer-based)
├── components/
│   ├── forms/          # AnalyseForm
│   ├── layout/         # AppShell, Sidebar, TopBar
│   └── ui/             # Button, Toast, UI (Card/Badge/DataTable/SkeletonCard…)
├── pages/
│   ├── auth/           # AuthLayout, Login, LoginVerify, Signup, SignupVerify, OTPBoxes
│   ├── landing/        # LandingPage
│   └── *.Page.js       # Home, Competitors, Keywords, Profile, DomainAuthority,
│                       #   FullReport, ContentStrategy, RelocationCalendar, History
└── styles/
    ├── globals.css     # Reset + keyframes
    └── tokens.css      # CSS custom properties (design tokens)
```

One component per file. CSS Modules co-located (`ComponentName.module.css`).

---

## 2. Component Tree / Provider Hierarchy

```
<App>                                                  (default export — root)
└─ <AuthProvider>                                      Tier 1 — wraps everything
   └─ <Root>
      ├─ auth.authScreen !== null  →  AUTH_SCREENS[authScreen]
      │                               Landing | Login | Signup | SignupVerify
      │                               (wrapped in AnimatePresence/motion)
      │
      └─ auth.authScreen === null (authenticated)
         └─ <AppProvider>                              Tier 2 — only mounted when authed
            └─ <AppShell>
               ├─ <Sidebar>          nav → goScreen between app pages
               ├─ <TopBar>
               └─ <AppRouter>        APP_PAGES[state.page] || HomePage
                  └─ <Page>          Home/Competitors/Keywords/Profile/DA/
                                     FullReport/ContentStrategy/RelocCalendar/History
            └─ <Toasts>
```

> **Critical gating rule:** `AppProvider` is mounted **only after authentication** (`auth.authScreen === null`). `AppContext` therefore never concerns itself with auth screens. `AuthProvider` wraps the entire tree.

---

## 3. State Management (Two-Tier Contexts)

No external state library. Pure `useReducer` + Context.

### Tier 1 — `AuthContext` (`context/AuthContext.js`)

Manages the auth screens and session.

State shape:
```
authScreen:   'landing' | 'signup' | 'signup-verify' | 'login' | null (= authed)
user:         { name, email } | null
pendingEmail: string
pendingName:  string
pendingPassword: string
```

Actions: `GO_SCREEN`, `SET_PENDING`, `AUTHENTICATED`, `LOGOUT`.

Exposes: `goScreen(screen)`, `setPending(...)`, `login(user)`, `logout()`.

Session restoration:
- `getInitialAuthState()` runs once at reducer init — checks `localStorage` (`id_token` / `access_token` / `user_id`) and `isTokenExpired()`.
- `useEffect` on mount calls `restoreSession()`: if tokens missing/expired → `logout()`; else rehydrates the stored `user` object or fetches it via `getUserInfo()`.

### Tier 2 — `AppContext` (`context/AppContext.js`)

Mounted only when authenticated (§2). Holds page, the shared analysis request, and per-analysis results/loading/errors + toasts.

State shape:
```
page:     'home'
request:  { company_name, url, market, industry }
results:  { competitors, keywords, profile, domainAuthority, fullReport,
            contentStrategy, relocationCalendar }        // each null initially
loading:  { same keys → false }
errors:   { same keys → null }
toasts:   []
```

Actions: `SET_PAGE`, `SET_REQUEST`, `SET_LOADING`, `SET_RESULT`, `SET_ERROR`, `ADD_TOAST`, `REM_TOAST`, `CLEAR`.

Exposes: `setPage`, `setRequest`, `clearAll`, `toast`, `dismissToast`, **`runApi(key, fn, req)`**, plus raw setters `setLoadingKey` / `setResultKey` / `setErrorKey` (used by SSE streaming flows).

### Context consumer hooks
Both files export guarded hooks:

```jsx
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp must be inside AppProvider');
  return c;
};
// useAuth() likewise (throw, export as useXxx)
```

---

## 4. Routing (State-Driven Page Lookup Tables)

`App.js` maps screen keys to components. No React Router, no URLs.

```jsx
const APP_PAGES = {
  home:   HomePage,   compete: CompetitorsPage,   keywords: KeywordsPage,
  profile: ProfilePage, da: DomainAuthorityPage,  report: FullReportPage,
  contentStrategy: ContentStrategyPage,
  relocationCalendar: RelocationCalendarPage,     history: HistoryPage,
};

const AUTH_SCREENS = {
  'landing': LandingPage, 'login': LoginPage,
  'signup': SignupPage,   'signup-verify': SignupVerifyPage,
};
```

`AppRouter` reads `state.page` from `useApp()`, renders `APP_PAGES[state.page] || HomePage`, wrapped in `AnimatePresence mode="wait"` + `motion.div key={state.page}` for page transitions.

- **App pages** switch via `AppContext.setPage('compete')` etc.
- **Auth screens** switch via `AuthContext.goScreen('login')` etc.; the same `goScreen` is reused inside `AppContext.runApi` for token-expiry redirects (see §6).

---

## 5. API Layer (`src/api/`)

Native `fetch` only. No axios. Modules: `authApi.js`, `seoApi.js`, `socialApi.js`, `historyApi.js`.

`seoApi.js` is the shared auth plumbing hub:
- `const BASE = "https://api.aeo-app.ai/api/v1";` (react-scripts injects nothing here; `REACT_APP_API_URL` is **not** actually consumed by these modules — BASE is hardcoded).
- `checkAuthTokens()` — validates `id_token` + `user_id` in `localStorage`; if missing, clears storage and throws `ApiError("TokenExpired", …)`. Exported and reused by `socialApi`/`historyApi`.
- `getAuthHeaders()` — returns `Authorization: Bearer <id_token>` + `X-User-ID: <user_id>`.
- Generic `post(path, body)` helper with token-expiry handling.
- `withTokenExpiry(apiCall, { goScreen, logout })` — wraps any call; on `401` clears session, calls `logout()`, redirects to login.
- `ApiError` class — structured error `new ApiError(code, message, field)`.

> **Known latent bug — `BASE` is not exported.** In `seoApi.js` line 3, `BASE` is declared as a plain `const` (not `export const`), while the local-dev override on line 4 is commented out. However `socialApi.js` and `historyApi.js` import `{ BASE } from "./seoApi"`. Under ES module semantics this throws a SyntaxError (`export 'BASE' not found`) if those modules are imported. It currently "works" only because CRA's bundling tolerates it in practice; **fix by changing line 3 to `export const BASE = ...`** when you next touch it.

### API surface per module
| Module | Functions | Backend endpoint |
|--------|-----------|------------------|
| `authApi` | signup, verify, resendCode, login, refresh, forgotPassword, confirmForgotPassword, getUserInfo | `/api/v1/auth/*` |
| `seoApi` | competitors, keywords, profile, domainAuthority, fullReport, contentStrategy, + SSE stream | `/api/v1/seo/*` |
| `socialApi` | relocationCalendar, + SSE stream | `/api/v1/social/relocation-calendar*` |
| `historyApi` | list, get, del (+ stats) | `/api/v1/history*` |

---

## 6. Analysis Request Flow (sequence)

A typical page-level analysis (e.g. Competitors):

```
Page (e.g. CompetitorsPage)     AppContext            withTokenExpiry      seoApi → backend
  │  user submits AnalyseForm
  │─────────────────────────►│
  │  runApi('competitors', seoApi.competitors, req)
  │                              │
  │                              ├─ SET_LOADING competitors=true
  │                              ├─ checkAuthTokens()  → 401? throw ApiError
  │                              │     seoApi.competitors(req) → POST /seo/competitors
  │                              │───────────────────────────────────────────────►│
  │                              │◄───────────────────────────────────────────────│ 200 or 401
  │                              │
  │                              │  on 401 → withTokenExpiry: clearSession,
  │                              │            logout(), goScreen('login')
  │                              │  on success → SET_RESULT competitors=data
  │                              │
  │  result/loading re-render ◄──┤
```

### `runApi` contract (`AppContext.js:54`)
```jsx
const runApi = async (key, fn, req) => {
  dispatch({ type: 'SET_LOADING', key, val: true });
  try {
    const data = await withTokenExpiry(fn(req), { goScreen, logout });
    dispatch({ type: 'SET_RESULT', key, data });
    return data;
  } catch (e) {
    if (e.code !== 'TokenExpired') {          // TokenExpired already redirected
      dispatch({ type: 'SET_ERROR', key, err: e.message });
      toast({ type: 'error', message: e.message });
    }
    throw e;
  } finally {
    dispatch({ type: 'SET_LOADING', key, val: false });
  }
};
```

### Streaming (SSE) flow
Non-blocking analysis pages (ContentStrategy, RelocationCalendar) use the raw setters instead of a single awaited `runApi`:
- `setLoadingKey(key, true)` → read the stream via `fetch` + `ReadableStream` → on each named event dispatch `setResultKey`/`setErrorKey` incrementally → `setLoadingKey(key, false)` on `done`.
- Per-item error events update per-item UI state (e.g. `keyword_error`).

---

## 7. API → Page Mapping

| App page | API module + function | Result store key |
|----------|----------------------|------------------|
| Home (`home`) | — (dashboard/nav) | — |
| Competitors (`compete`) | `seoApi.competitors` | `competitors` |
| Keywords (`keywords`) | `seoApi.keywords` | `keywords` |
| Profile (`profile`) | `seoApi.profile` | `profile` |
| Domain Authority (`da`) | `seoApi.domainAuthority` | `domainAuthority` |
| Full Report (`report`) | `seoApi.fullReport` | `fullReport` |
| Content Strategy (`contentStrategy`) | `seoApi.contentStrategy` (+stream) | `contentStrategy` |
| Relocation Calendar (`relocationCalendar`) | `socialApi.relocationCalendar` (+stream) | `relocationCalendar` |
| History (`history`) | `historyApi` | — (page-local) |

`AppContext` `results`/`loading`/`errors` share the same key set (see §3).

---

## 8. Class Diagram (Key Objects)

```
┌─────────────────────────────┐   ┌──────────────────────────────┐
│  AuthProvider               │   │  AppProvider                 │
│  ─────────────────────────  │   │  ──────────────────────────  │
│  + authReducer(state,act)   │   │  + reducer(state, act)       │
│  + goScreen(screen)         │   │  + runApi(key, fn, req)      │
│  + setPending(...)          │   │  + setPage(p)                │
│  + login(user) / logout()   │   │  + setRequest(partial)       │
│  + restoreSession() [effect]│   │  + setLoadingKey/setResultKey│
│  - isTokenExpired()         │   │  + setErrorKey / clearAll    │
│  - getStoredUser()          │   │  + toast(...)                │
└──────────────┬──────────────┘   └──────────────┬───────────────┘
               │  provides                      │  provides
               ▼                                ▼
        useAuth() → {auth, goScreen,   useApp() → {state, setPage, runApi,
                    setPending, login,            toast, ...}
                    logout}
```

```
┌─────────────────────────────────────────────────────────────┐
│  App.js                                                     │
│  ├─ APP_PAGES / AUTH_SCREENS (lookup tables)               │
│  ├─ AppRouter() → AnimatePresence + motion(Page)           │
│  └─ Root() → auth gate: AUTH_SCREENS vs <AppProvider>       │
├─────────────────────────────────────────────────────────────┤
│  api/                                                       │
│  ├─ authApi.js  → withTokenExpiry, checkAuthTokens, ApiError│
│  ├─ seoApi.js   → BASE, getAuthHeaders, post, SSE          │
│  ├─ socialApi.js→ relocationCalendar (+SSE)                │
│  └─ historyApi.js→ list/get/del                            │
├─────────────────────────────────────────────────────────────┤
│  components/    layout/ {AppShell, Sidebar, TopBar}         │
│                 forms/  {AnalyseForm}                      │
│                 ui/     {Button, Toast, UI}                │
├─────────────────────────────────────────────────────────────┤
│  pages/  auth/ {AuthLayout, Login, LoginVerify, Signup,     │
│                 SignupVerify, OTPBoxes}                     │
│          landing/ {LandingPage}                             │
│          {Home, Competitors, Keywords, Profile,             │
│           DomainAuthority, FullReport, ContentStrategy,     │
│           RelocationCalendar, History}Page                  │
├─────────────────────────────────────────────────────────────┤
│  styles/  tokens.css (design tokens) · globals.css          │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Design System

Design tokens are CSS custom properties in `styles/tokens.css`, referenced everywhere (including inline styles):

Token naming: `--c-{color}-{shade}`, `--font-{role}`, `--r-{size}`, `--shadow-{size}`, `--t-{speed}`.

```css
:root {
  --c-indigo-600: #4F46E5;
  --font-display: 'Plus Jakarta Sans', sans-serif;
  --r-md: 12px;
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,.1);
  --t-fast: 0.12s ease;
}
```

- **Primary:** CSS Modules (co-located `ComponentName.module.css`), imported as `s`.
- **Dynamic values only** use inline styles, always referencing a token — never hardcoded hex: `style={{ color: score >= 80 ? 'var(--c-success)' : 'var(--c-warning)' }}`.
- **Class composition:** template literals for one condition, `.join(' ')` for multiple.
- `tokens.css` + `globals.css` — fonts are Plus Jakarta Sans (body) + Syne (display). Dark theme.

### Animation
- **Page transitions / UI:** framer-motion (`AnimatePresence mode="wait"`, `motion.div` with `pageVariants`, staggered lists via `delay: i * 0.07`, springs `type:'spring'`).
- **Ambient effects:** CSS keyframes (`shimmer`, `sonar-ring`).
- **Always respect `prefers-reduced-motion`** with a global reduce override in `globals.css`.

---

## 10. React Coding Conventions

Derived from the existing codebase. Follow these when adding or modifying `frontend/src/`.

### File naming
| Type | Convention | Example |
|------|-----------|---------|
| Component files | `PascalCase.js` | `HomePage.js`, `AppShell.js` |
| API / utility files | `camelCase.js` | `authApi.js`, `seoApi.js` |
| Custom hooks | `useXxx.js` | `useOTPInput.js` |
| CSS Modules | `PascalCase.module.css` | `DataPage.module.css`, `Auth.module.css` |
| Global styles | `lowercase.css` | `globals.css`, `tokens.css` |

### Components
Always **function declarations** (never arrow functions/classes):

```jsx
export function Button({ children, variant = 'primary', size = 'md', ...rest }) { ... }
```

### Exports
Named exports for everything except the root `App` (the one default export in the codebase). No barrel/index files — import directly from source.

### Imports
Order: React → third-party → context/hooks → API → components → CSS Modules. CSS Module variable: use `s` (primary), `ds` (secondary DataPage shared styles).

### State
- `useReducer` + Context for global/shared; `useState` for local UI state.
- **Never `useMemo`** — derived values are computed inline.
- `useCallback` for memoizing dispatchers/handlers; `useEffect` for session restore, `AbortController` cleanup, timers; `useRef` for DOM refs/AbortControllers.
- Custom hooks live in `src/hooks/`; co-located (single-page) hooks live in the page file.

### Props
Destructure with defaults. No PropTypes and no TypeScript — keep it consistent.

### Styling
CSS Modules + CSS custom properties; inline styles only for dynamic values and always via `var(--...)`. Respect `prefers-reduced-motion`.

### API calls
Native `fetch` only. `ApiError` for structured errors; `withTokenExpiry()` for auto-logout on 401; `checkAuthTokens()` before every request.

### Error handling
Page-level `catch (_) {}` is **intentional** — errors are dispatched to global state via `runApi`/`withTokenExpiry`. Streaming flows use per-item error states (`keyword_error`, etc.).

### Anti-patterns to avoid
- Arrow-function components — always `function` declarations.
- Default exports (except root `App`).
- Barrel/index files.
- Hardcoded colors in inline styles — always `var(--c-...)`.
- PropTypes or TypeScript.
- `useMemo`.
- `var`, `eval()`, leftover `console.*`.

---

## 11. Auth & Token Expiry

- Tokens stored in `localStorage`: `id_token`, `access_token`, `user_id`, plus a JSON `user` object.
- `AuthContext.getInitialAuthState()` checks expiry on app load (decodes JWT `exp`, base64-safe). Expired/missing → land on `authScreen: 'landing'`.
- Every API call goes through `checkAuthTokens()` (throws `ApiError("TokenExpired")`) and `withTokenExpiry` (handles runtime `401` from the backend).
- On expiry: `clearSessionStorage()`, `logout()`, `goScreen('login')`.
- See `frontend/TOKEN_EXPIRY_USAGE.md` for the detailed `withTokenExpiry` usage pattern.

> **Test hook CORS note:** the backend CORS allows `localhost:3000`, `api.aeo-app.ai`, `www.aeo-app.ai`. The frontend `BASE` defaults to the production API URL; for local dev the intended override `export const BASE = "http://127.0.0.1:8000/api/v1"` exists but is commented out (see the `BASE` bug in §5).
