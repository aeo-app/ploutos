# Ploutos — Agent Context

Three independent repos co-located in one directory. Each has its own `.git/`.

| Directory | Description |
|-----------|-------------|
| `ploutos-gate/` | FastAPI backend: website analysis + competitor search + Cognito auth + scheduler + DynamoDB persistence |
| `ploutos-veil/` | Frontend for ploutos-gate (React 19, Vite 8, Tailwind 4, shadcn/ui) — see `ploutos-veil/AGENTS.md` |

---

## ploutos-gate

**Stack**: Python 3.12, `uv` package manager, pytest, no configured formatter/linter/typechecker.

**Package layout**: `common/` (shared infra — llm, auth, contact, deps, models, store), `website_analyzer/` (analysis pipeline), `scheduler/` (content schedule generation), `api.py` (FastAPI app entry point).

### Commands

```bash
uv sync                          # install deps
uv run uvicorn api:app --reload # dev server on :8000
bash start.sh                    # production (workers=nproc, no reload)
uv run pytest                    # all tests (offline, external services mocked)
uv run pytest tests/test_crawler.py -v -k "test_name"
uv run python setup-cognito.py   # one-time Cognito pool creation → prints .env values
```

### Tests

`tests/conftest.py` uses `TestClient` + `load_dotenv()`. All external services mocked via `unittest.mock`. `pyproject.toml` sets `asyncio_mode = "auto"` and `pythonpath = ["."]`.

### Architecture

`api.py` is the sole FastAPI app. Protected endpoints require Bearer id_token.

**Dashboard endpoints** (all protected):
- `POST /analyze` — crawl → LLM query gen → Tavily/DuckDuckGo search → LLM extraction → `CompanyProfile`. Writes to DynamoDB.
- `POST /analyze/stream` — SSE version of `/analyze` (progress logs + final result).
- `POST /competitors` — search with selected profile terms. On-the-fly only, no DB caching.
- `POST /scheduler/generate` — (patched by `common/startup.py`) generates 90-day content schedule. Writes to DynamoDB.

**Cached data endpoints** (all protected, return 404 if not in DB):
- `GET /analyze/{url}` — cached `CompanyProfile`
- `GET /scheduler/{url}` — cached schedule

### Scheduler

Patched at import time by `common/startup.py` which adds `/scheduler/generate` (POST) and `/scheduler/{url}` (GET) to `api.app`. The generator has per-agent fallbacks (strategy, audience, schedule, campaigns, caption templates) — if an LLM agent fails, it falls back to template-driven data.

Two entrypoints for production:
- `main.py` — imports `common.startup` first, then exposes `api.app` (used by `start.sh` and systemd)
- `api.py` — has `if __name__ == "__main__"` for `uvicorn.run` (dev only, no scheduler wired)

### Persistence (DynamoDB)

`common/store/` package provides a repository abstraction. Currently DynamoDB; swap by implementing the `DbStore` ABC.

Two tables in `us-east-1`, provisioned (25 RCU / 25 WCU, free tier eligible):

| Table | PK | SK | Data |
|-------|----|----|------|
| `ploutos-analyze` | `userId` (String) | `url` (String) | `data` (JSON string — CompanyProfile), `updatedAt` |
| `ploutos-schedule` | `userId` (String) | `url` (String) | `data` (JSON string — ScheduleOutput), `updatedAt` |

`userId` is the Cognito `sub` claim. Frontend calls GET `/analyze/{url}` on mount to load cached analysis and toggle the button between "Analyze" and "Reanalyze". Competitors are fetched on-the-fly (no DB caching).

### Auth quirks

- `/auth/me` requires **id_token** (not access_token) as `Authorization: Bearer <id_token>`
- Passwordless OTP via Cognito `ForgotPassword` + `USER_PASSWORD_AUTH` workaround (not custom triggers)
- Token verification: `python-jose[cryptography]` fetches Cognito JWKS, verifies RSA sig + audience + issuer
- Cognito pool created once via `setup-cognito.py`

### Architecture quirks

- **No Playwright** — Ubuntu 26.04 unsupported. Crawl4AI uses `AsyncHTTPCrawlerStrategy` (HTTP-only)
- **LLM**: AWS Bedrock (Claude Haiku) via `langchain-aws` `ChatBedrock`. Supports STS assume-role (`BEDROCK_ASSUME_ROLE_ARN`). Uses default credentials / instance profile.
- **Search**: Tavily (API key) + DuckDuckGo (`ddgs`, no key). Plugin pattern via `SearchSource` ABC + `_REGISTRY` in `search_sources/__init__.py`
- **Competitor filter**: `BLOCKED_DOMAINS` strips social/video/Wikipedia/forums pre-LLM. Falls back unfiltered if Bedrock unavailable
- **Contact**: `/contact` public endpoint sends email via AWS SES (`sesv2`)
- **Stateless** — API returns JSON, nothing persisted beyond DynamoDB cache

### Env vars (what code actually reads)

| Var | Default | Used in |
|-----|---------|---------|
| `TAVILY_API_KEY` | (required) | `search.py`, `tavily_source.py` |
| `BEDROCK_MODEL` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | `llm.py` |
| `BEDROCK_ASSUME_ROLE_ARN` | (optional, STS assume-role) | `llm.py`, `api.py` health check |
| `AWS_REGION` | `us-east-1` | `llm.py`, `api.py`, store |
| `COGNITO_USER_POOL_ID` | (required) | `auth.py` |
| `COGNITO_CLIENT_ID` | (required) | `auth.py` |
| `COGNITO_REGION` | `us-east-1` | `auth.py` |
| `CONTACT_EMAIL` | `sales@aeo-app.ai` | `contact.py` |
| `CONTACT_SENDER` | `noreply@aeo-app.ai` | `contact.py` |
| `CONTACT_REGION` | `us-east-1` | `contact.py` |

### Production (EC2 systemd)

```bash
sudo cp ploutos-gate.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable ploutos-gate
sudo systemctl start ploutos-gate
journalctl -u ploutos-gate -f
sudo systemctl restart ploutos-gate
```

`start.sh` auto-detects CPU count for workers. Service auto-restarts on failure (5s delay). `deploy.sh` copies the service file (if missing) and restarts.

---

## ploutos-veil

See `ploutos-veil/AGENTS.md` (separate git repo, independent file).

---

## react-app

Standalone Vite + React 18 landing page (unrelated). `npm run dev` on :5173, `npm run build`. Not a git repo here.
