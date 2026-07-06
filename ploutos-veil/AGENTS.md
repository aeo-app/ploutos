# Ploutos-Veil — Agent Context

Frontend for [ploutos-gate](https://github.com/anomalyco/ploutos-gate). Independent repo — not a monorepo.

**Stack**: React 19, TypeScript 6, Vite 8, Tailwind CSS 4, shadcn/ui, TanStack Query, React Router v7, Framer Motion, Axios.

### Commands

```bash
npm run dev      # dev server on :5173, proxies /api → localhost:8000
npm run build    # tsc -b && vite build
npm run lint     # eslint
```

### Configuration

`.env` file at project root:http://localhost:5174/sample-report.pdf

```env
VITE_API_URL=/api          # default (Vite proxy). Set to backend URL for production.
```

### Auth

- Tokens stored in localStorage under `ploutos-auth` (id_token, access_token, refresh_token)
- Axios interceptor auto-attaches `Authorization: Bearer <id_token>`
- On 401, automatically tries refresh; if that fails, clears tokens and redirects to `/auth/login`
- After register+verify, user is set immediately from id_token JWT payload (no extra /auth/me wait)

### Architecture quirks

- **Single page** — Dashboard combines URL analyze + company profile + competitor search in one unified workflow. No separate pages for each step.
- **Analyze streaming** — uses raw `fetch()` with SSE reader for progress logs, not Axios
- **Competitor search** — uses TanStack `useMutation` via Axios
- **Badge-based selection** — company profile fields (products, audience, categories, terms) are clickable badges; selected items form the competitor search query
- **Custom terms** — free-form text tags merged with selected profile terms for competitor search
- **PDF sample** — `public/sample-report.pdf` served at `/sample-report.pdf`

### File layout

```
src/
├── App.tsx                       # Router + providers (QueryClient, Auth, BrowserRouter)
├── main.tsx                      # Entry point
├── index.css                     # Tailwind v4 + shadcn/ui theme tokens
├── lib/
│   ├── api.ts                    # Axios client with auth interceptors
│   └── utils.ts                  # cn() helper
├── hooks/
│   ├── use-auth.tsx              # AuthContext: login, logout, user state
│   ├── use-competitors.ts        # TanStack useMutation for /competitors
│   └── use-analyze.ts            # (reserved)
├── types/
│   └── api.ts                    # Request/response interfaces
├── components/
│   ├── ui/                       # shadcn/ui primitives (button, card, input, badge, etc.)
│   └── layout/
│       ├── PublicLayout.tsx      # Guest pages shell
│       └── ProtectedLayout.tsx   # Authenticated shell (sidebar + top bar)
└── pages/
    ├── Landing.tsx               # Public landing hero
    ├── Register.tsx              # Register form → redirects to Verify
    ├── Verify.tsx                # OTP verification → auto-login on success
    ├── Login.tsx                 # Request OTP for existing account
    ├── LoginVerify.tsx           # OTP login → stores tokens → redirects
    └── Dashboard.tsx             # Main workspace: analyze + profile + competitors
```
