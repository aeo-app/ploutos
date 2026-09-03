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
cd frontend && REACT_APP_API_URL=http://localhost:8000/api/v1 npm start
```

Backend API docs: `http://localhost:8000/docs`

## Backend

**Stack**: FastAPI, uvicorn, boto3 (Bedrock + Cognito + DynamoDB), Pydantic v2.

**Entry**: `backend/main.py` — mounts three routers:
- `routers/auth_router.py` — Cognito signup/verify/login/refresh
- `routers/seo_router.py` — competitors, keywords, profile, domain-authority, full-report, content-strategy
- `routers/social_router.py` — relocation calendar

**Services**: `services/bedrock_service.py` (AI inference), `services/cognito_service.py` (auth), `services/social_service.py`.

**DB**: `db/dynamo.py` — DynamoDB table auto-created locally when `DYNAMODB_ENDPOINT_URL` is set.

**Key env vars for local dev**:

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

**API URL**: `REACT_APP_API_URL` env var (defaults to `https://api.aeo-app.ai/api/v1` in code). Set to `http://localhost:8000/api/v1` for local dev.

**Auth flow**: Cognito tokens stored in `localStorage` (`access_token`, `id_token`, `user_id`). Token expiry checked on every API call; expired tokens auto-redirect to login. See `TOKEN_EXPIRY_USAGE.md` for the `withTokenExpiry` pattern.

**Design tokens**: CSS custom properties in `src/styles/globals.css`. Dark theme, Plus Jakarta Sans + Syne display fonts.

## Gotchas

- **No tests, no lint, no formatter, no CI** configured in this repo. There is nothing to run besides the dev servers.
- **Terraform state files** exist at `backend/terraform.tfstate` and `backend/infra/terraform.tfstate` — do not commit secrets or state changes.
- **CORS** allows `localhost:3000`, `api.aeo-app.ai`, and `www.aeo-app.ai`. Add new origins in `backend/main.py`.
- Backend `main.py` has a `print("CURRENT DIR:", ...)` debug line — ignore it.
- The root `App.jsx` is **not** the active frontend. Changes to `src/App.js` are what matter.
