# Backend Architecture — Ploutos

FastAPI + boto3 (AWS Bedrock, Cognito, DynamoDB), Pydantic v2. Entry point: `backend/main.py`.

> This is the canonical backend reference. It documents both the **structure** of the codebase and the **coding conventions** it follows. Update this doc when structure or conventions change.

---

## 1. Overview

The backend is a single FastAPI process exposing a JSON + SSE API for AI-powered SEO competitive intelligence. It has no external search APIs — all "research" comes from a **two-call anti-hallucination knowledge-declaration pipeline** run against AWS Bedrock (see §6).

```
                        ┌───────────────────────────────┐
   React SPA (frontend) │  FastAPI backend (:8000)      │
   https://:3000 ─────► │  main.py                       │
                        │  ├─ auth_router   /api/v1/auth  │────► Cognito
                        │  ├─ seo_router    /api/v1/seo   │────► Bedrock
                        │  └─ social_router /api/v1/social│────► DynamoDB
                        └───────────────────────────────┘
```

Three routers are mounted in `main.py`:
- `routers/auth_router.py` — prefix `/api/v1/auth`, tags `Authentication`
- `routers/seo_router.py` — full paths, tags `SEO Intelligence`
- `routers/social_router.py` — full paths, tags `Social Media Content`

> **Convention note:** `auth_router` uses `APIRouter(prefix="/api/v1/auth")`, while `seo_router` and `social_router` use full paths in each decorator. Do **not** mix both in the same router.

---

## 2. Component / Class Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              main.py                                     │
│   FastAPI() · CORS · lifespan · include_router ×3 · GET / · GET /health  │
└───────────────┬──────────────────────────┬───────────────────┬───────────┘
                │                          │                   │
        ┌───────▼──────┐           ┌───────▼───────┐   ┌───────▼──────────┐
        │ auth_router  │           │  seo_router   │   │  social_router   │
        │ /api/v1/auth │           │ /api/v1/seo   │   │ /api/v1/social   │
        │ tags=Auth    │           │ + /api/v1/    │   │ tags=Social      │
        └───────┬──────┘           │   history     │   └───────┬──────────┘
                │                  └───────┬───────┘           │
                ▼                          ▼                   ▼
        ┌─────────────────┐   ┌─────────────────────────┐ ┌───────────────┐
        │ cognito_service │   │    bedrock_service      │ │ social_service│
        └────────┬────────┘   │ (two-call pipeline)     │ └───────┬───────┘
                 │            └────────────┬────────────┘         │
                 │                         │                      │
                 │                 ┌───────▼────────┐             │
                 │                 │ aws_service    │             │
                 │                 └───────┬────────┘             │
                 ▼                         │                      │
        ┌──────────────────────────────────┴──────────────────────┐
        │                        db / dynamo                      │
        │  save_analysis · get_analysis · list_analyses           │
        │  delete_analysis · get_user_stats ·                    │
        │  create_table_if_not_exists                            │
        └────────────────────────────┬────────────────────────────┘
                                     ▼
                             ┌─────────────┐
                             │  DynamoDB   │
                             │ apac_seo_   │
                             │ analyses    │
                             └─────────────┘
```

### Awkward dependency the diagram hides

`seo_router` and `social_router` query DynamoDB **directly** for the history endpoints (`list_analyses`, `get_analysis`, etc.), while analytics writes go through `bedrock_service` / `social_service` → `db.dynamo`. There is no database service layer standing between routers and `db/dynamo.py`. Keep this in mind when adding history/CRUD endpoints.

---

## 3. Router → Service → Model mapping

| Router | Path | Service function | Persistence |
|--------|------|------------------|-------------|
| auth | `POST /api/v1/auth/signup` | `cognito_service` | Cognito |
| auth | `POST /api/v1/auth/verify` | `cognito_service` | Cognito |
| auth | `POST /api/v1/auth/resend-code` | `cognito_service` | Cognito |
| auth | `POST /api/v1/auth/login` | `cognito_service` | Cognito |
| auth | `POST /api/v1/auth/refresh` | `cognito_service` | Cognito |
| auth | `POST /api/v1/auth/forgot-password` | `cognito_service` | Cognito |
| auth | `POST /api/v1/auth/confirm-forgot-password` | `cognito_service` | Cognito |
| auth | `GET /api/v1/auth/me` | `cognito_service` | Cognito |
| seo | `POST /api/v1/seo/competitors` | `generate_competitor_analysis` | DynamoDB (via `_save`) |
| seo | `POST /api/v1/seo/keywords` | `generate_keyword_volume` | DynamoDB (via `_save`) |
| seo | `POST /api/v1/seo/profile` | `generate_company_profile` | DynamoDB (via `_save`) |
| seo | `POST /api/v1/seo/domain-authority` | `generate_da_strategy` | DynamoDB (via `_save`) |
| seo | `POST /api/v1/seo/full-report` | `generate_full_report` | DynamoDB (via `_save`) |
| seo | `POST /api/v1/seo/content-strategy` | `generate_content_strategy` | DynamoDB (via `_save`) |
| seo | `POST /api/v1/seo/content-strategy/stream` | `stream_content_strategy_events` | DynamoDB (on `done`) |
| seo | `GET /api/v1/history` | `list_analyses` | DynamoDB |
| seo | `GET /api/v1/history/stats` | `get_user_stats` | DynamoDB |
| seo | `GET /api/v1/history/{id}` | `get_analysis` | DynamoDB |
| seo | `DELETE /api/v1/history/{id}` | `delete_analysis` | DynamoDB |
| social | `POST /api/v1/social/relocation-calendar` | `social_service` | DynamoDB |
| social | `POST /api/v1/social/relocation-calendar/stream` | `social_service` (SSE) | DynamoDB |

> **Route path style:** `auth_router` declares the prefix once on the `APIRouter`; `seo_router` and `social_router` spell out full paths per decorator. The slow-blocking SEO/social endpoints are `POST` and return full JSON; the `/stream` variants return `text/event-stream` (SSE) so day/keyword-level results arrive incrementally.

---

## 4. Request → Response flow (sequence)

An authenticated SEO analysis round-trip looks like this:

```
Client            FastAPI            core/security    bedrock_service        DynamoDB
  │   POST /seo/competitors (Bearer JWT + AnalyseRequest)
  │──────────────────────────►│
  │                            │  Depends(get_current_user_id)
  │                            │─────►│  fetch JWKS (cached)
  │                            │◄─────│  verify RS256, exp, iss, aud
  │                            │  user_id = sub
  │                            │
  │                            │  generate_competitor_analysis(req)
  │                            │─────────────►│
  │                            │              │  Call 1: knowledge audit
  │                            │              │           (confirmed/approx/unknown)
  │                            │              │  Call 2: structure from confirmed
  │                            │◄─────────────│  return Pydantic model
  │                            │
  │                            │  _save(...) → save_analysis()
  │                            │───────────────────────────────────►│
  │                            │◄───────────────────────────────────│  analysis_id
  │  200 { result, _meta }    │
  │◄─────────────────────────│
```

Key points:
- Auth is injected via FastAPI dependency `get_current_user_id` (see §5) — never read headers manually in a handler.
- Each `_save()` is wrapped in try/except and **never blocks the response** on failure; it falls back to the string `"save-failed"` and logs.
- `_response()` attaches `_meta = {analysis_id, user_id}` to the payload.

---

## 5. Authentication & Authorization (`core/security.py`)

Cognito issues **RS256-signed JWTs**. The backend verifies them with PyJWT:

1. Fetch JWKS once from the Cognito public endpoint, cached for process lifetime (`@lru_cache(maxsize=1)`).
2. Get the `kid` from the unverified JWT header, find the matching key.
3. `pyjwt.decode(..., algorithms=["RS256"], audience=CLIENT_ID, issuer=ISSUER)` — validates signature, `exp`, `iss`, `aud`.
4. Unknown `kid` triggers a one-shot JWKS cache clear + refetch (key rotation).

The dependency `get_current_user_id(authorization, x_user_id)`:
- **Bearer token path** — if `Authorization: Bearer <token>`, decode and return the `sub` claim (the stable user UUID). This is the DynamoDB partition key.
- **Dev fallback** — `X-User-ID` header, used only when `SKIP_JWT_VERIFICATION=true`.
- If neither is present → `HTTPException(401)`.

### Dev bypass

| Env var | Effect |
|---------|--------|
| `SKIP_JWT_VERIFICATION=true` | Uses `_stub_decode` (base64 only, **no signature check**) for any Bearer token; the `X-User-ID` fallback also works. For local dev only — never in production. |

> If PyJWT is not installed, the code falls back to `_stub_decode` and logs a warning.

---

## 6. Anti-Hallucination Pipeline (`services/bedrock_service.py`)

`bedrock_service.py` is the largest service (~55 KB). It implements a **two-call knowledge-declaration architecture** — no external search APIs:

1. **Call 1 — knowledge audit:** Bedrock audits its own knowledge and tags every fact `confirmed / approximate / unknown`.
2. **Call 2 — structure:** Output is built **only from confirmed facts**.

Data-quality conventions in responses:
- `null` numeric fields → value could not be confirmed from training data.
- `"not found"` string fields → not in Bedrock's confirmed knowledge.
- `current_da = 0` → DA score not confirmed; check Moz/Ahrefs directly.
- Content-strategy & backlink outputs include a `methodology_disclaimer`: it has **no live SERP/backlink-index API**, so competitor names/ranks and backlink categories are real-time AI estimates for strategic planning, **not** a live crawl. It deliberately returns **no fabricated backlink URLs**.

### Streaming (SSE)

`stream_content_strategy_events` (and the social calendar stream) yields `(event_name, data)` tuples. `seo_router` formats them as `event: {name}\ndata: {json}\n\n`.

Content-strategy stream events:
- `start` — `{keywords, total}`
- `analysis` — per-keyword competitor/content/SEO analysis
- `backlink_deep_dive` — named platform categories + step-by-step acquisition plan
- `content_delta` — token-by-token article deltas
- `keyword_report` — fully assembled report for one keyword
- `keyword_error` — one keyword failed; the rest continue
- `executive_summary` — cross-keyword synthesis
- `done` — `{failed_keywords, result}` final saved response
- `saved` — `{analysis_id}` after DynamoDB write

Keywords are processed **concurrently (bounded)**, so the first keyword's results arrive quickly. The `StreamingResponse` sets `Cache-Control: no-cache` and `X-Accel-Buffering: no` (disables proxy buffering); the generator checks `request.is_disconnected` and cancels remaining Bedrock calls if the client drops.

---

## 7. Data Layer (`db/dynamo.py`)

DynamoDB table: `apac_seo_analyses` (override with `APAC_SEO_TABLE` env var).

Functions:
- `save_analysis(...)` → returns analysis id
- `get_analysis(user_id, analysis_id)`
- `list_analyses(user_id, ...)` → paginated metadata (uses the GSI `gsi_analysis_id`)
- `delete_analysis(user_id, analysis_id)`
- `get_user_stats(user_id)` → counts by type
- `create_table_if_not_exists()` → auto-creates the table on startup when `DYNAMODB_ENDPOINT_URL` is set (local dev)

The partition key is the user's Cognito `sub`. The `gsi_analysis_id` GSI supports lookup by analysis id. TTL + server-side encryption are configured in Terraform.

**Local dev:** set `DYNAMODB_ENDPOINT_URL` (e.g. `http://localhost:8000`) and `main.py`'s lifespan auto-creates the table.

### Pydantic DB models (`models/db_models.py`)
- `AnalysisMeta` — metadata-only record (id, type, company, url, market, created_at…)
- `AnalysisRecord(AnalysisMeta)` — full record incl. result payload
- `SavedAnalysisResponse`, `ListAnalysesResponse`, `UserStatsResponse`, `DeleteResponse`

---

## 8. Models (`models/`)

Pydantic v2 models, grouped by domain. One file per domain.

| File | Notable classes |
|------|-----------------|
| `auth_models.py` | `SignUpRequest`, `VerifyEmailRequest`, `ResendCodeRequest`, `LoginRequest`, `RefreshTokenRequest`, `ForgotPasswordRequest`, `ConfirmForgotPasswordRequest`, `SignUpResponse`, `VerifyEmailResponse`, `TokenResponse`, `RefreshTokenResponse`, `UserResponse`, `MessageResponse`, `AuthErrorResponse` |
| `seo_models.py` | `AnalyseRequest` (+ `ContentStrategyRequest(AnalyseRequest)`), and per-analysis response models: `CompetitorAnalysisResponse`, `KeywordVolumeResponse`, `CompanyProfile`, `DomainAuthorityResponse`, `FullSEOReport`, `ContentStrategyResponse` (with nested `KeywordContentReport`, `BacklinkDeepDive`, `ReplicationPlan`, `GeneratedContentPiece`, etc.) |
| `social_models.py` | `RelocationSocialRequest`, `RelocationSocialResponse` (with `DailySchedule`, `SocialPost`, `PlatformCaptions`, `CarouselSlide`, `RecommendedTimes`), `CompanyDetails` |
| `db_models.py` | See §7 |

`AnalyseRequest` fields: `company_name` (required), `url` (required, validated to start with `http://`/`https://`), `market` (default `"Singapore"`), `industry` (required).

---

## 9. Core Security (`services/cognito_service.py` + `core/security.py`)

- `cognito_service.py` wraps Cognito SignUp / Verify / Resend / Login (`InitiateAuth` + `AdminInitiateAuth`-style) / Refresh / Forgot-password / user-info. It raises typed domain exceptions (e.g. `CognitoError`) that `auth_router` maps to `HTTPException` with a `{code, message}` detail body.
- `core/security.py` — JWT verification + `get_current_user_id` dependency (§5).

Cognito config is via env vars; if `COGNITO_USER_POOL_ID`/`COGNITO_CLIENT_ID` are unset, auth endpoints fail (a warning is logged on startup). `scripts/start-local.sh` sets local defaults.

---

## 10. Configuration & Environment Variables

| Var | Default | Required | Notes |
|-----|---------|----------|-------|
| `DYNAMODB_ENDPOINT_URL` | `http://localhost:8000` | For local dev | Set this or DynamoDB calls fail |
| `BEDROCK_MODEL_ID` | `us.amazon.nova-pro-v1:0` | — | Active Bedrock model |
| `AWS_REGION` | `ap-southeast-1` | — | Used for Bedrock, Cognito JWKS URL, DynamoDB |
| `COGNITO_USER_POOL_ID` | — | For auth | Auth endpoints fail without it |
| `COGNITO_CLIENT_ID` | — | For auth | Required for JWT `aud` check |
| `SKIP_JWT_VERIFICATION` | `false` | — | `true` = dev bypass (no signature check) |
| `APAC_SEO_TABLE` | `apac_seo_analyses` | — | DynamoDB table name |
| `LOG_LEVEL` | `INFO` | — | Logging level |

No AWS credentials are hardcoded: `main.py` logs a warning if neither `AWS_ACCESS_KEY_ID` nor `DYNAMODB_ENDPOINT_URL` is present (relying on an IAM role, correct for EC2/ECS/Lambda).

---

## 11. Infrastructure (`backend/infra/`)

Terraform configs (not Python):
- `cognito.tf` — User Pool + App Client (email OTP, confidential client)
- `dynamodb_table.tf` — `apac_seo_analyses` table (PAY_PER_REQUEST, GSI `gsi_analysis_id`, TTL, encryption)
- `iam_policy.json` — DynamoDB access policy (PutItem/GetItem/DeleteItem/Query/UpdateItem/DescribeTable)

> `terraform.tfstate` / `infra/terraform.tfstate` exist in the repo — **do not commit state changes or secrets**.

---

## 12. Startup & Lifecycle (`main.py`)

- `load_dotenv()` — called only here, not in service modules.
- `logging.basicConfig(...)` with `LOG_LEVEL`.
- `lifespan` logs warnings for missing Cognito/Bedrock config, auto-creates the local DynamoDB table, and logs the active model.
- CORS allows `http://localhost:3000`, `https://api.aeo-app.ai`, `https://www.aeo-app.ai`. **Add new origins here** (not in every router).
- `GET /` returns service metadata; `GET /health` returns `{status: ok, version}`.

> `main.py` contains a leftover `print("CURRENT DIR:", os.getcwd())` debug line — ignore it.

---

## 13. Python Coding Conventions

Derived from the existing codebase. Follow these when adding or modifying backend code.

### Imports
Order: stdlib → third-party → local. Use `from __future__ import annotations` at the top of every module. Prefer `dict`, `list`, `str | None` over `typing.Dict` / `typing.List` / `Optional[str]`.

### Naming
| Element | Style | Example |
|---------|-------|---------|
| Functions / methods | `snake_case` | `generate_competitor_analysis()` |
| Private helpers | `_snake_case` | `_get_client()`, `_parse_json()` |
| Classes / Pydantic models | `PascalCase` | `CompetitorAnalysisResponse` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_TOKENS`, `SYSTEM_PROMPT` |
| Module-level singletons | `_snake_case` | `_bedrock`, `_table` |
| Async generators | `astream_` prefix | `astream_keyword_report()` |

### Type hints
Use on all public function signatures; private helpers may omit. Use `dict[str, Any]`, `list[str]`, `str | None` generics. Reserve `Any` for boto3 clients and unstructured data.

### Pydantic v2
`BaseModel`, `Field`, `field_validator`, `model_validator`. Use `Field(...)` for required, `Field(default=..., example=...)` for optional. Extract reusable validators into module functions (`_validate_email()`, `_validate_password()`). Use `model_validator(mode="after")` for cross-field checks. Use `model_dump()` / `model_dump_json()` — **not** `.dict()`.

### FastAPI routers
- Use `Depends(get_current_user_id)` for auth on protected routes — never manual header reads.
- Specify `response_model` and `summary="..."` on route decorators.
- Keep route path style consistent per router (prefix vs full path, not both).

### Error handling — three-layer pattern
- **Service layer** raises domain exceptions (e.g. `CognitoError`, `RuntimeError`).
- **Router layer** catches and maps to `HTTPException` with the right status code and a structured `detail` body.
- Log unexpected errors with `exc_info=True`.
- Save operations (`_save()`) never block responses — catch, log, return a fallback.

### Logging
`logging.getLogger(__name__)` at module level. Prefix messages with `[module]`. Use `exc_info=True` for exception tracebacks. f-strings for structured messages.

### Singleton / client pattern
Lazy-init boto3 clients from module globals via a `_get_client()` helper. Acceptable for boto3 (idempotent, thread-safe enough here).

### Streaming (SSE)
`StreamingResponse(media_type="text/event-stream")`, format `event: {name}\ndata: {json}\n\n`. Check `request.is_disconnected()`. Bridge sync boto3 to async via `asyncio.to_thread()` / `ThreadPoolExecutor`.

### Section comments
Use decorative dividers to separate logical sections within files:

```python
# ── DynamoDB Table ────────────────────────────────────────────────────────────
```

### Anti-patterns to avoid
- Redundant `load_dotenv()` outside `main.py`.
- Hardcoded secrets — always `os.getenv()` with sensible defaults.
- Blocking boto3 calls in async routes — wrap in `asyncio.to_thread()`.
- Swallowing exceptions silently — always log, even when returning a fallback.
- Mixed auth patterns — always `Depends(get_current_user_id)`.
- Bare `except:`, mutable default arguments, wildcard imports, leftover `print(`/`breakpoint()`.

---

## 14. Health & Versioning

- API version: `4.0.0` (matches `version="4.0.0"` in `main.py` and the docstring "APAC SEO Intelligence API v4").
- `GET /health` → `{status: "ok", version: "4.0.0"}`.
- Swagger/OpenAPI interactive docs: `http://localhost:8000/docs`.
