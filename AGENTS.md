# AGENTS.md — Ploutos (APAC SEO Intelligence)

## Repo layout

Two independent projects, no monorepo tooling, no shared root `package.json`:

```
backend/   FastAPI + boto3 (Python)   — entry: backend/main.py
frontend/  Create React App (JSX)     — active code: src/   (CRA standard)
```

### Frontend: two codebases exist

- **`src/`** — modular version (components, pages, context, api). This is what `npm start` runs.
- **Root `App.jsx` + `index.js`** — legacy single-file version (~1700 lines). NOT used by CRA; treat as reference only.

## Quick start

```bash
# one command starts both (backend :8000, frontend :3000)
./scripts/start-local.sh
```

Or start individually:

```bash
# backend (from repo root)
cd backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# frontend (from repo root)
cd frontend && REACT_APP_API_BASE_URL=http://localhost:8000/api/v1 npm start
```

Backend API docs: `http://localhost:8000/docs`

## Backend

**Stack**: FastAPI, uvicorn, boto3 (Bedrock + Cognito + DynamoDB), Pydantic v2.

**Entry**: `backend/main.py` — mounts nine routers:
- `routers/auth_router.py` — Cognito signup/verify/login/refresh, profile
- `routers/seo_router.py` — competitors, keywords, profile, domain-authority, full-report, content-strategy + history
- `routers/social_router.py` — relocation calendar
- `routers/payment_router.py` — Airwallex plans, create-intent, status, webhook
- `routers/canva_router.py` — Canva OAuth, templates, posters
- `routers/admin_router.py` — admin users/calendars/blogs/social-publish
- `routers/blog_router.py` — topic suggestions + blog generation
- `routers/social_publish_router.py` — connect/publish/schedule to Meta, LinkedIn, Google Business
- `routers/article_router.py` — research brief + article generation

**Services**: `services/bedrock_service.py` (AI inference), `cognito_service.py` (auth), `social_service.py`, `airwallex_service.py` (payments), `canva_service.py`, `image_generation_service.py`, `media_upload_service.py` (S3), `mail_check_service.py`, `article_service.py`, and `services/social_publish/` (publish + scheduler per platform).

**DB**: `db/dynamo.py` (table `apac_seo_analyses`) + `db/payments_dynamo.py` (table `apac_payments`). Both auto-created locally when `DYNAMODB_ENDPOINT_URL` is set.

**Key env vars for local dev** (see `backend/.env.example` for the full list):

| Var | Default | Notes |
|-----|---------|-------|
| `DYNAMODB_ENDPOINT_URL` | `http://localhost:8000` | Set this or DynamoDB calls fail |
| `BEDROCK_MODEL_ID` | `us.amazon.nova-pro-v1:0` | |
| `AWS_REGION` | `ap-southeast-1` | |
| `COGNITO_USER_POOL_ID` | _(empty)_ | Auth endpoints fail without this |
| `COGNITO_CLIENT_ID` | _(empty)_ | Auth endpoints fail without this |

`scripts/start-local.sh` sets sensible defaults for all of these.

**Anti-hallucination architecture**: Two-call knowledge-declaration pipeline — Bedrock first audits its own knowledge (`confirmed / approximate / unknown`), then structures output from confirmed facts only. `null` numerics = unconfirmed; `"not found"` strings = not in training data. No external search APIs.

## Frontend

**Stack**: React 18, react-scripts 5.0.1, framer-motion. No router library — uses a custom `AppContext` state-machine (`state.page`) for navigation.

**API URL**: `authApi.js` reads `REACT_APP_API_BASE_URL` (defaults to `http://127.0.0.1:8000/api/v1`). ⚠️ Note: `seoApi.js` exposes `BASE = "http://localhost:8000/api/v1"` (hardcoded, production URL commented out) and every non-auth API module imports `BASE` from it — so env overrides only affect auth endpoints today. See `documents/frontend-architecture.md` §5.

**Auth flow**: **Password**-based (email + password → Cognito), plus email OTP only for signup confirmation / login-verify edge case. Tokens stored in `localStorage` (`access_token`, `id_token`, `user_id`). Token expiry checked on every API call; expired tokens auto-redirect to login (`withTokenExpiry`).

**Payments**: Contextual, not a gate. Free-preview results carry `locked: true` items; a `402` or a locked teaser opens `UnlockModal` → Airwallex. `PaymentContext` exposes `isPaid`. See `documents/backend-architecture.md` §7.

**Admin**: Separate `AdminApp` shell (`dashboard`/`calendars`/`blogs`) shown when `profile.is_admin`.

**Design tokens**: CSS custom properties in `src/styles/tokens.css` (imported by `globals.css`). Dark theme, Plus Jakarta Sans + Inter fonts.

## Gotchas

- **No tests, no lint, no formatter, no CI** configured in this repo. There is nothing to run besides the dev servers.
- **Terraform state files** exist at `backend/terraform.tfstate` and `backend/infra/terraform.tfstate` — do not commit secrets or state changes.
- **CORS** allows `localhost:3000`, `api.aeo-app.ai`, and `www.aeo-app.ai`. Add new origins in `backend/main.py`.
- Backend `main.py` has a `print("CURRENT DIR:", ...)` debug line — ignore it.
- The root `App.jsx` is **not** the active frontend. Changes to `src/App.js` are what matter.
