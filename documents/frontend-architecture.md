# Frontend Architecture — Ploutos

React 18 (Create React App, JSX), react-scripts 5.0.1, framer-motion. **Active code is `frontend/src/`**. The root `App.jsx`/`index.js` are legacy single-file code — NOT used by CRA; treat as reference only.

> This is the canonical frontend reference. It documents both the **structure** of `src/` and the **coding conventions** it follows (see §11). Update this doc when structure or conventions change.

---

## 1. Overview

A single-page app with **no router library**. Navigation is a state-machine driven by stacked Contexts. Features: SEO analyses, blog/article generation, social content calendar + publishing, Canva poster generation, and payments (Airwallex). The admin surface is a separate shell. Dark theme with a custom design-token system.

```
frontend/src/
├── App.js              # Root, page lookup tables, auth/profile/admin gating, framer-motion
├── index.js            # ReactDOM entry point
├── api/                # API client modules (camelCase.js) + config.js
├── context/            # AuthContext, AppContext, PaymentContext (useReducer / useState)
├── hooks/              # useOTPInput, useLatestHistoryRequest
├── utils/              # oauthReturn.js (page restore across OAuth redirects)
├── components/
│   ├── forms/          # AnalyseForm
│   ├── layout/         # AppShell, AdminShell, Sidebar, TopBar
│   ├── ui/             # Button, Toast, UI (Card/Badge/DataTable/…)
│   ├── payment/        # UnlockModal, PaymentDropIn, PlanCards, LockedTeaser,
│   │                   #   UnlockBanner, BlurredPreview, FeaturePaywall, dummyData
│   ├── canva/          # CanvaPosterPanel, SocialPublishPanel, ScheduledPostsList
│   └── AdminErrorBoundary.js
├── pages/
│   ├── auth/           # AuthLayout, Login, LoginVerify, Signup, SignupVerify,
│   │                   #   CompleteProfile, OTPBoxes, PasswordInput, PasswordRequirements
│   ├── landing/        # LandingPage (+ components/)
│   ├── *.Page.js       # the app pages (below)
│   └── AdminApp + sub-pages
└── styles/  globals.css · tokens.css
```

---

## 2. Component Tree / Provider Hierarchy

```
<App>                                                   (default export — root)
└─ <AuthProvider>                                       Tier 1 — wraps everything
   └─ <Root>
      ├─ auth.authScreen !== null  →  AUTH_SCREENS[authScreen]
      │    Landing | Login | LoginVerify | Signup | SignupVerify
      │
      └─ auth.authScreen === null (authenticated)
         └─ <ProfileGate>                               one-time profile completion
            └─ <PaymentProvider>                        PaymentContext (status poll)
               └─ <AppProvider>                         AppContext (page, results, 402)
                  └─ <AdminAwareRoot profile>
                     ├─ non-admin: <AppShell><AppRouter/></AppShell>
                     └─ admin:     <AdminErrorBoundary><AdminApp/></AdminErrorBoundary>
                                    (+ hidden <AppShell><AppRouter/> for "my account")
                  └─ <Toasts/>
```

Key gating rules:
- **`AppProvider` mounts only after authentication** (`auth.authScreen === null`) **and** profile completion (`ProfileGate`). It never concerns itself with auth screens.
- **`PaymentProvider` is NOT a gate.** It provides `isPaid`/`paidUntil`/`plan` via `usePayment()` for components that need it. Payment is triggered **contextually** (402 response or a locked teaser card), not upfront.
- **Admin** is a separate shell: `AdminAwareRoot` checks `profile.is_admin`. Admins default to `AdminApp`; both shells stay mounted (display toggled) so "Exit to my account" works instantly. `AdminErrorBoundary` prevents an admin crash from taking down the sibling app shell.

---

## 3. State Management (Contexts)

### Tier 1 — `AuthContext` (`context/AuthContext.js`) — `useReducer`

Manages auth screens + session.

State: `authScreen` (`'landing' | 'login' | 'login-verify' | 'signup' | 'signup-verify' | null`), `user`, `pendingEmail`, `pendingName`, `pendingPassword`.

Actions: `GO_SCREEN`, `SET_PENDING`, `AUTHENTICATED`, `LOGOUT`.

Exposes: `goScreen(screen)`, `setPending(...)`, `login(user)`, `logout()`.

Session restore (`useEffect` on mount): checks `localStorage` (`id_token`, `access_token`, `user_id`), validates expiry (JWT decode), rehydrates the stored `user` or fetches via `getUserInfo()`, else `logout()`.

### Tier 2 — `AppContext` (`context/AppContext.js`) — `useReducer`

Mounted post-auth post-profile. Holds page, shared request, per-feature results/loading/errors, toasts, and the payment-gate state.

State:
```
page:  'home'
isAdmin: false
request: { company_name, url, market, industry }
results:   { competitors, keywords, profile, domainAuthority, fullReport,
             contentStrategy, relocationCalendar }
loading:   { same keys → false }
errors:    { same keys → null }
toasts:    []
paymentRequiredFor: null     // feature key set on 402
```

Actions: `SET_PAGE`, `SET_ADMIN`, `SET_REQUEST`, `SET_LOADING`, `SET_RESULT`, `SET_ERROR`, `SET_PAYMENT_REQUIRED`, `CLEAR_PAYMENT_REQUIRED`, `ADD_TOAST`, `REM_TOAST`, `CLEAR`.

Exposes: `state`, `setPage`, `setRequest`, `clearAll`, `toast`, `dismissToast`, **`runApi(key, fn, req)`**, raw setters `setLoadingKey`/`setResultKey`/`setErrorKey` (for SSE), plus `setAdmin`, `clearPaymentRequired`.

### Tier 3 — `PaymentContext` (`context/PaymentContext.js`) — `useState`

Wrapped around AppProvider. Calls `paymentApi.getStatus()` on mount; exposes via `usePayment()`: `isPaid`, `paidUntil`, `plan`, `planName`, `checking`, `error`, `refresh(paymentIntentId?)`. Not a gate — just makes entitlement available to `BillingPage`, `FeaturePaywall`, etc.

### Consumer hooks
Each context exports a guarded hook (`useAuth`, `useApp`, `usePayment`) that throws if used outside its provider.

---

## 4. Routing (State-Driven Lookup Tables)

`App.js` maps screen/page keys to components. No router, no URLs.

```js
const APP_PAGES = {
  home: HomePage,  compete: CompetitorsPage,  keywords: KeywordsPage,
  profile: ProfilePage,  da: DomainAuthorityPage,  report: FullReportPage,
  contentStrategy: ContentStrategyPage,  relocationCalendar: RelocationCalendarPage,
  history: HistoryPage,  billing: BillingPage,
  blogTopics: BlogTopicsPage,  articleGenerator: ArticleGeneratorPage,
};

const AUTH_SCREENS = {
  'landing': LandingPage, 'login': LoginPage, 'login-verify': LoginVerifyPage,
  'signup': SignupPage,   'signup-verify': SignupVerifyPage,
};
```

- **App pages** switch via `AppContext.setPage(...)`; **auth screens** via `AuthContext.goScreen(...)`.
- **Admin navigation** is internal to `AdminApp` (its own `useState('dashboard')` for `dashboard` / `calendars` / `blogs`), independent of `AppContext.state.page`.
- Page transitions use `AnimatePresence` + framer-motion.

> **Dead code:** `CheckoutPage.js` is a standalone checkout not wired into any lookup table (superseded by the inline checkout in `BillingPage`/`UnlockModal`). `AdminPage.js` is an older monolithic admin page superseded by `AdminApp`; also not referenced.

---

## 5. API Layer (`src/api/`)

Native `fetch` only. No axios. `authApi.js` is the shared plumbing hub; `seoApi.js` exports `BASE` reused by all other modules.

| Module | Exports / functions | Backend endpoint |
|--------|--------------------|------------------|
| `authApi.js` | `ApiError`, `fetchClient`, `withTokenExpiry`, `getUserInfo`; `authApi.signup/verifyEmail/login/resendCode/getProfile/setProfile` | `/api/v1/auth/*` |
| `seoApi.js` | **`BASE`**, `checkAuthTokens`, `getAuthHeaders`; `seoApi.competitors/keywords/profile/domainAuthority/fullReport/contentStrategy/contentStrategyStream` | `/api/v1/seo/*` |
| `socialApi.js` | `socialApi.relocationCalendar/relocationCalendarStream`; re-exports `withTokenExpiry` | `/api/v1/social/*` |
| `historyApi.js` | `historyApi.list/stats/getOne/remove` | `/api/v1/history/*` |
| `paymentApi.js` | `paymentApi.getPlans/createIntent/getStatus/getHistory` | `/api/v1/payment/*` |
| `adminApi.js` | ~19 admin functions (users, calendars, blogs, social-publish, canva) | `/api/v1/admin/*` |
| `blogApi.js` | `blogApi.suggestTopics/generate` | `/api/v1/blog/*` |
| `articleApi.js` | `articleApi.researchBrief/generate` | `/api/v1/articles/*` |
| `canvaApi.js` | ~10 canva functions (connect/status/templates/assets/posters/export) | `/api/v1/canva/*` |
| `socialPublishApi.js` | connect/disconnect/publish/schedule/list/cancel + uploads | `/api/v1/social-publish/*` |
| `config.js` | `AIRWALLEX_ENV` (hardcoded `"prod"`) | — |

Auth plumbing (in `authApi.js` + `seoApi.js`):
- `checkAuthTokens()` — validates `id_token` + `user_id` in `localStorage`; throws `ApiError("TokenExpired")` if missing.
- `getAuthHeaders()` — `Authorization: Bearer <id_token>` + `X-User-ID: <user_id>`.
- `withTokenExpiry(apiPromise, { goScreen, logout })` — on `401`, clears session, `logout()`, redirects to login.
- `ApiError` — `new ApiError(code, message, field)`.
- `fetchClient` — unified fetch wrapper (used for auth calls with `useAccessToken`).

> **Known config inconsistency (base URL).** `seoApi.js` hardcodes `export const BASE = "http://localhost:8000/api/v1"` (line 7; the production URL is commented out), while `authApi.js` uses `process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:8000/api/v1"`. So in a production build only auth endpoints would honor an env override — all SEO/blog/payment/admin/canva/social-publish endpoints would still hit localhost. `seoApi.js`'s `BASE` should be wired to the same env var (the intent is acknowledged in a comment, not implemented).

---

## 6. Analysis Request Flow (sequence)

A page-level analysis (e.g. Competitors):

```
Page                    AppContext           withTokenExpiry      seoApi → backend
  │  submit AnalyseForm
  │─────────────────────────────►│
  │  runApi('competitors', seoApi.competitors, req)
  │                             │  SET_LOADING competitors=true
  │                             │  checkAuthTokens() → 401? throw
  │                             │  seoApi.competitors(req) → POST /seo/competitors
  │                             │───────────────────────────────────────►│
  │                             │◄───────────────────────────────────────│ 200 | 401 | 402
  │                             │  on 401 → withTokenExpiry: logout() + goScreen('login')
  │                             │  on 402 → SET_PAYMENT_REQUIRED (UnlockModal)
  │                             │  on 200 → SET_RESULT competitors=data
  │  result/loading re-render ◄─┤
```

`runApi` contract — handles loading, token expiry, **and 402 Payment Required**:
```js
const runApi = async (key, fn, req) => {
  dispatch({ type: 'SET_LOADING', key, val: true });
  try {
    const data = await withTokenExpiry(fn(req), { goScreen, logout });
    dispatch({ type: 'SET_RESULT', key, data });
    return data;
  } catch (e) {
    if (e.status === 402) { dispatch({ type: 'SET_PAYMENT_REQUIRED', key }); }
    else if (e.code !== 'TokenExpired') {
      dispatch({ type: 'SET_ERROR', key, err: e.message });
      toast({ type: 'error', message: e.message });
    }
    throw e;
  } finally {
    dispatch({ type: 'SET_LOADING', key, val: false });
  }
};
```

**Streaming (SSE):** content-strategy and relocation-calendar pages use `setLoadingKey`/`setResultKey`/`setErrorKey` incrementally (one `fetch` + `ReadableStream`, per-event dispatch). Server-driven `locked: true` items render as `LockedTeaser` (blurred skeleton + unlock CTA).

---

## 7. Payment / Upgrade Flow

Payment is contextual, never a blanket gate:

1. **402 from gated endpoints** — `runApi` dispatches `SET_PAYMENT_REQUIRED`; `AppShell` renders a shared `UnlockModal`.
2. **Locked teaser cards** (content-strategy keywords, relocation-calendar days) — backend returns `locked: true` items; `LockedTeaser` + `UnlockBanner` prompt the same `UnlockModal`.
3. **`UnlockModal`** — `PlanCards` (tiers from `GET /payment/plans`) + `CycleToggle` (monthly/annual — annual checkout disabled/"coming soon") + `PaymentDropIn` (Airwallex SDK). Flow: pick plan → `createIntent` → mount Drop-in → pay → poll `getStatus` until `is_paid`.
4. **`BillingPage`** — same inline checkout plus current plan, payment history, plan switching.
5. **`FeaturePaywall`** — simple card shown when `isPaid === false` → links to Billing.

See `documents/backend-architecture.md` §7 for the server-side free-preview limits that produce the locked items.

---

## 8. API → Page Mapping

| Page (route key) | API module + function | Result store key |
|------------------|----------------------|------------------|
| Home (`home`) | — (dashboard/nav) | — |
| Competitors (`compete`) | `seoApi.competitors` | `competitors` |
| Keywords (`keywords`) | `seoApi.keywords` | `keywords` |
| Profile (`profile`) | `seoApi.profile` | `profile` |
| Domain Authority (`da`) | `seoApi.domainAuthority` | `domainAuthority` |
| Full Report (`report`) | `seoApi.fullReport` | `fullReport` |
| Content Strategy (`contentStrategy`) | `seoApi.contentStrategy` (+stream) | `contentStrategy` |
| Relocation Calendar (`relocationCalendar`) | `socialApi.relocationCalendar` (+stream) | `relocationCalendar` |
| History (`history`) | `historyApi` | — (page-local) |
| Billing (`billing`) | `paymentApi` | — |
| Blog Topics (`blogTopics`) | `blogApi.suggestTopics` / `.generate` | — |
| Article Generator (`articleGenerator`) | `articleApi.researchBrief` / `.generate` | — |
| Admin (`dashboard`/`calendars`/`blogs`) | `adminApi`, `canvaApi`, `socialPublishApi` | — |

`AppContext` `results`/`loading`/`errors` share the same key set (see §3).

---

## 9. Class Diagram (Key Objects)

```
┌────────────────┐   ┌────────────────┐   ┌──────────────────────┐
│  AuthProvider  │   │  AppProvider   │   │  PaymentProvider     │
│  ───────────── │   │  ─────────────  │   │  ─────────────────── │
│  authReducer   │   │  reducer       │   │  isPaid/paidUntil/   │
│  goScreen()    │   │  runApi()      │   │  plan/planName       │
│  setPending()  │   │  setPage()     │   │  checking/error      │
│  login/logout  │   │  toast()       │   │  refresh()           │
│  restoreSession│   │  raw setters   │   └──────────────────────┘
└───────┬────────┘   │  setAdmin()    │
        │ useAuth    └───────┬────────┘
        ▼                    ▼  useApp
┌──────────────────────────────────────────────────────────────┬──────────┐
│  App.js: APP_PAGES · AUTH_SCREENS · AppRouter · Root ·       │  Admin:  │
│  ProfileGate · AdminAwareRoot                                │  AdminApp│
│  api/ authApi·seoApi·socialApi·historyApi·paymentApi·        │  Admin   │
│       adminApi·blogApi·articleApi·canvaApi·socialPublishApi  │  Dashboard│
│  components/ layout{AppShell,AdminShell,Sidebar,TopBar}      │  Admin   │
│              forms{AnalyseForm}  ui{Button,Toast,UI}         │  Content │
│              payment{UnlockModal,PlanCards,PaymentDropIn,    │  (Error   │
│                     LockedTeaser,UnlockBanner,BlurredPreview,│  Boundary) │
│                     FeaturePaywall,dummyData}                │          │
│              canva{CanvaPosterPanel,SocialPublishPanel,      │          │
│                    ScheduledPostsList}                       │          │
│  pages/ auth{...} landing{...} 9 data pages + Billing/Blog/  │          │
│         Article + AdminApp                                   │          │
│  styles/ tokens.css · globals.css                            │          │
└──────────────────────────────────────────────────────────────┴──────────┘
```

---

## 10. Design System

Design tokens in `styles/tokens.css` (CSS custom properties), referenced everywhere:

Token naming: `--c-{color}-{shade}`, `--font-{role}`, `--r-{size}`, `--shadow-{size}`, `--t-{speed}`. `globals.css` imports token + reset/keyframes.

```css
:root {
  --c-indigo-600: #4F46E5;
  --font-display: 'Plus Jakarta Sans', sans-serif;
  --font-body: 'Inter', sans-serif;
  --r-md: 12px;
  --sidebar-w: 256px;
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,.1);
  --t-fast: 0.12s ease;
}
```

- **Primary:** CSS Modules (co-located `ComponentName.module.css`), imported as `s`.
- **Dynamic values only** use inline styles, always referencing a token — never hardcoded hex: `style={{ color: score >= 80 ? 'var(--c-success)' : 'var(--c-warning)' }}`.
- **Class composition:** template literals for one condition, `.join(' ')` for multiple.
- **Animation:** framer-motion for page/UI transitions (`AnimatePresence`, `motion.div`, staggered `delay: i * 0.07`, springs); CSS keyframes (`shimmer`) for ambient effects. **Always respect `prefers-reduced-motion`.**

---

## 11. React Coding Conventions

Derived from the existing codebase. Follow these when adding or modifying `frontend/src/`.

### File naming
| Type | Convention | Example |
|------|-----------|---------|
| Component files | `PascalCase.js` | `HomePage.js`, `AppShell.js`, `CanvaPosterPanel.js` |
| API / utility files | `camelCase.js` | `authApi.js`, `seoApi.js` |
| Custom hooks | `useXxx.js` | `useOTPInput.js`, `useLatestHistoryRequest.js` |
| CSS Modules | `PascalCase.module.css` | `DataPage.module.css`, `Auth.module.css` |
| Global styles | `lowercase.css` | `globals.css`, `tokens.css` |

### Components
Always **function declarations** (never arrow functions/classes):
```jsx
export function Button({ children, variant = 'primary', size = 'md', ...rest }) { ... }
```

### Exports
Named exports for everything except the root `App` (the single default export). No barrel/index files — import directly from source.

### Imports
Order: React → third-party → context/hooks → API → components → CSS Modules. CSS Module variable: use `s`.

### State
- `useReducer` + Context for global/shared; `useState` for local (and lightweight providers like `PaymentContext`).
- **Never `useMemo`** — derived values computed inline.
- `useCallback` for dispatchers/handlers; `useEffect` for session restore, `AbortController` cleanup, timers; `useRef` for DOM refs/AbortControllers.
- Shared hooks in `src/hooks/`; co-located (single-page) hooks in the page file.

### Props
Destructure with defaults. No PropTypes and no TypeScript — keep it consistent.

### Styling
CSS Modules + CSS custom properties; inline styles only for dynamic values and always via `var(--...)`. Respect `prefers-reduced-motion`.

### API calls
Native `fetch` only. `ApiError` + `checkAuthTokens()` + `withTokenExpiry()`. The 402 → `SET_PAYMENT_REQUIRED` path in `runApi`.

### Error handling
Page-level `catch (_) {}` is **intentional** — errors already dispatch via `runApi`/SSE. Streaming flows use per-item error states (`keyword_error`).

### Anti-patterns to avoid
- Arrow-function components; default exports (except root `App`); barrel/index files; hardcoded colors in inline styles; PropTypes or TypeScript; `useMemo`; `var`, `eval()`, leftover `console.*`.

---

## 12. Auth & Token Expiry

- Tokens in `localStorage`: `id_token`, `access_token`, `user_id`, plus a JSON `user`.
- `AuthContext.getInitialAuthState()` checks expiry on load; expired/missing → `authScreen: 'landing'`.
- Every API call goes through `checkAuthTokens()` (throws `ApiError("TokenExpired")`) and `withTokenExpiry` (handles runtime `401`).
- On expiry: clear `localStorage`, `logout()`, `goScreen('login')`.
- **Profile gate:** `GET /auth/profile` determines `hasProfile`; incomplete users are blocked by `CompleteProfilePage` (fail-open on network errors).

> **CORS note:** the backend CORS allows `localhost:3000`, `api.aeo-app.ai`, `www.aeo-app.ai`. The frontend API modules point at base URLs — see the config inconsistency in §5 before shipping a production build.
