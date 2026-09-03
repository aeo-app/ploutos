# Backend Architecture — Ploutos

FastAPI + boto3 (AWS Bedrock, Cognito, DynamoDB, S3), Pydantic v2. Entry point: `backend/main.py`. Current API version: **4.1.0**.

> This is the canonical backend reference. It documents both the **structure** of the codebase and the **coding conventions** it follows (see §14). Update this doc when structure or conventions change.

---

## 1. Overview

The backend is a single FastAPI process exposing a JSON + SSE API for AI-powered SEO competitive intelligence, content generation, social scheduling/publishing, and payments. It has **no external search APIs** — all "research" is a **two-call anti-hallucination knowledge-declaration pipeline** on AWS Bedrock (see §6). Paid access is enforced through a free-preview / entitlement model (see §7).

```
                        ┌──────────────────────────────────────────────┐
   React SPA (frontend) │  FastAPI backend (:8000)                     │
   :3000 ─────────────► │  main.py  v4.1.0                             │
                        │  ├─ auth_router         /api/v1/auth          │──► Cognito
                        │  ├─ seo_router          /api/v1/seo, /history │──► Bedrock
                        │  ├─ social_router       /api/v1/social        │──► DynamoDB
                        │  ├─ payment_router      /api/v1/payment       │──► Airwallex
                        │  ├─ canva_router        /api/v1/canva         │──► Canva API
                        │  ├─ admin_router        /api/v1/admin         │
                        │  ├─ blog_router         /api/v1/blog          │──► Bedrock
                        │  ├─ social_publish_rt   /api/v1/social-publish│──► Meta/LinkedIn/Google
                        │  └─ article_router      /api/v1/articles      │──► Bedrock
                        └──────────────────────────────────────────────┘
```

Nine routers are mounted in `main.py` (lines 168–186):

| Router | Prefix style | Paths |
|--------|--------------|-------|
| `auth_router` | `APIRouter(prefix="/api/v1/auth")` | `/api/v1/auth/*` |
| `seo_router` | full paths per decorator | `/api/v1/seo/*`, `/api/v1/history/*` |
| `social_router` | full paths | `/api/v1/social/*` |
| `payment_router` | full paths | `/api/v1/payment/*` |
| `canva_router` | `APIRouter(prefix="/api/v1/canva")` | `/api/v1/canva/*` |
| `admin_router` | `APIRouter(prefix="/api/v1/admin")` | `/api/v1/admin/*` |
| `blog_router` | `APIRouter(prefix="/api/v1/blog")` | `/api/v1/blog/*` |
| `social_publish_router` | `APIRouter(prefix="/api/v1/social-publish")` | `/api/v1/social-publish/*` |
| `article_router` | `APIRouter(prefix="/api/v1/articles")` | `/api/v1/articles/*` |

> **Convention note:** some routers declare the prefix once on `APIRouter(...)` (`auth`, `canva`, `admin`, `blog`, `social_publish`, `articles`); `seo_router`, `social_router`, and `payment_router` spell out full paths per decorator. Do **not** mix both in the same router.

---

## 2. Component / Class Diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│                             main.py  (v4.1.0)                            │
│   FastAPI() · CORS · lifespan · APScheduler · include_router ×9           │
│   GET / · GET /health                                                    │
└───┬───────────┬───────────┬───────────┬───────────┬───────────┬──────────┘
    │           │           │           │           │           │
  auth      seo+history  social     payment      canva      admin/blog/
  router     router      router     router      router   social_publish/
                                                          article routers
    │           │           │           │           │           │
    ▼           ▼           ▼           ▼           ▼           ▼
┌────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│cognito │ │ bedrock  │ │ social   │ │airwallex │ │ canva    │ │(many)    │
│service │ │ service  │ │ service  │ │ service  │ │ service  │ │ services │
└───┬────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
    │           │            │           │            │            │
    ▼           ▼            ▼           ▼            ▼            ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        db/  dynamo.py + payments_dynamo.py              │
│  save_analysis · get_analysis · list_analyses · delete_analysis         │
│  get_user_stats · domain-lock · canva/social connections · posters      │
│  scheduled posts · admin registry · set_admin · update_analysis_result  │
│  payments: save_payment_intent · set_user_paid · get_user_entitlement   │
│  is_user_paid                                                           │
└────────────────────────────────┬────────────────────────────────────────┘
                                 ▼
              ┌────────────────────────────┐
              │  DynamoDB                  │
              │  apac_seo_analyses         │
              │  apac_payments             │
              └────────────────────────────┘
```

Other services: `aws_service.py` (STS credential resolution), `image_generation_service.py` (Amazon Nova Canvas), `media_upload_service.py` (S3), `mail_check_service.py` (business-email validation), and the `services/social_publish/` subpackage (`publish_service`, `scheduler`, `google_business_service`, `linkedin_service`, `meta_service`).

> **Architecture note:** routers query DynamoDB **directly** for many reads (history, connections, scheduled posts) rather than going through a dedicated DB service layer. Keep this in mind when touching history/CRUD paths.

---

## 3. Endpoint Inventory

### 3a. Auth — `/api/v1/auth` (`auth_router`, prefix)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/auth/signup` | — | Create Cognito user, send OTP, register in admin registry, auto-promote admin if in `ADMIN_EMAILS` |
| POST | `/api/v1/auth/verify` | — | Confirm 6-digit OTP |
| POST | `/api/v1/auth/resend-code` | — | Resend OTP |
| POST | `/api/v1/auth/login` | — | Login → access/id/refresh tokens, backfill admin registry |
| POST | `/api/v1/auth/refresh` | — | Renew access token from refresh token |
| POST | `/api/v1/auth/forgot-password` | — | Send reset code |
| POST | `/api/v1/auth/reset-password` | — | Confirm new password |
| GET | `/api/v1/auth/me` | Bearer | Current user attributes |
| GET | `/api/v1/auth/profile` | Bearer | Profile: company_name, domain, has_profile, is_admin |
| POST | `/api/v1/auth/profile` | Bearer | One-time profile completion; locks the domain |

### 3b. SEO + History — `/api/v1/seo`, `/api/v1/history` (`seo_router`, full paths)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/seo/competitors` | user | Competitor analysis (free-preview) |
| POST | `/api/v1/seo/keywords` | user | Keyword volume (free-preview) |
| POST | `/api/v1/seo/profile` | user | Company profile (free-preview) |
| POST | `/api/v1/seo/domain-authority` | user | DA strategy (free-preview) |
| POST | `/api/v1/seo/full-report` | user | All 4 analyses combined |
| POST | `/api/v1/seo/content-strategy` | user | Keyword → competitor → content strategy (free-preview) |
| POST | `/api/v1/seo/content-strategy/stream` | user | Same, streamed via SSE |
| GET | `/api/v1/history` | user | List analyses (paginated, optional type filter) |
| GET | `/api/v1/history/stats` | user | Counts by type + token usage |
| GET | `/api/v1/history/{analysis_id}` | user | Full record |
| DELETE | `/api/v1/history/{analysis_id}` | user | Delete record |

### 3c. Social — `/api/v1/social` (`social_router`, full paths)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/social/relocation-calendar` | user | Relocation content calendar (free-preview) |
| POST | `/api/v1/social/relocation-calendar/stream` | user | Same, streamed via SSE (day-by-day) |

### 3d. Payments — `/api/v1/payment` (`payment_router`, full paths)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/payment/plans` | user | Plan catalog (Starter/Growth/Scale) |
| POST | `/api/v1/payment/create-intent` | user | Create Airwallex PaymentIntent (server-side price lookup) |
| GET | `/api/v1/payment/status` | user | Current entitlement (+ optional live poll) |
| GET | `/api/v1/payment/history` | user | Past transactions |
| POST | `/api/v1/payment/webhook` | — (HMAC) | Airwallex callback — verified via HMAC signature |

### 3e. Canva — `/api/v1/canva` (`canva_router`, prefix)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/canva/connect` | user | OAuth authorize URL (PKCE) |
| GET | `/api/v1/canva/callback` | — | OAuth redirect: exchange code for tokens |
| GET | `/api/v1/canva/status` | user | Is Canva connected? |
| GET | `/api/v1/canva/brand-templates` | user | List brand templates |
| GET | `/api/v1/canva/brand-templates/{id}/dataset` | user | Autofillable fields for a template |
| POST | `/api/v1/canva/assets/upload` | user | Upload image as Canva asset |
| POST | `/api/v1/canva/posters` | user | Manual poster from template |
| POST | `/api/v1/canva/posters/auto-generate` | user | Auto-generate poster (template + AI image + autofill) |
| POST | `/api/v1/canva/posters/{poster_id}/regenerate` | user | Replace images/text and recreate |
| GET | `/api/v1/canva/posters` | user | List saved posters |
| POST | `/api/v1/canva/posters/{poster_id}/export` | user | Export design to PNG |

### 3f. Admin — `/api/v1/admin` (`admin_router`, prefix, all require `require_admin`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/admin/users` | All registered users |
| POST | `/api/v1/admin/users/{user_id}/set-admin` | Grant/revoke admin |
| GET | `/api/v1/admin/users/{user_id}/calendars` | User's relocation calendars |
| GET | `/api/v1/admin/users/{user_id}/calendars/{analysis_id}` | Full calendar payload |
| PUT | `/api/v1/admin/users/{user_id}/calendars/{analysis_id}` | Direct edit |
| POST | `/api/v1/admin/users/{user_id}/calendars/{analysis_id}/revise-post` | AI-assisted edit via Bedrock |
| POST | `/api/v1/admin/users/{user_id}/calendars/create` | Create calendar on behalf of user (is_paid=True) |
| GET | `/api/v1/admin/users/{user_id}/blogs` | User's saved blog posts |
| GET | `/api/v1/admin/users/{user_id}/blogs/{analysis_id}` | Full blog payload |
| PUT | `/api/v1/admin/users/{user_id}/blogs/{analysis_id}` | Direct edit |
| POST | `/api/v1/admin/users/{user_id}/blogs/{analysis_id}/revise` | AI-assisted edit via Bedrock |
| POST | `/api/v1/admin/users/{user_id}/blogs/create` | Create blog on behalf of user |
| GET | `/api/v1/admin/users/{user_id}/social-publish/status` | Which platforms connected |
| POST | `/api/v1/admin/users/{user_id}/social-publish/uploads` | Upload image on behalf of user |
| POST | `/api/v1/admin/users/{user_id}/social-publish/publish` | Post to user's platforms |
| POST | `/api/v1/admin/users/{user_id}/social-publish/schedule` | Schedule a future post |
| GET | `/api/v1/admin/users/{user_id}/social-publish/scheduled` | List scheduled posts |
| DELETE | `/api/v1/admin/users/{user_id}/social-publish/scheduled/{schedule_id}` | Cancel pending post |
| POST | `/api/v1/admin/users/{user_id}/canva/posters/auto-generate` | Poster for user using their Canva |

### 3g. Blog — `/api/v1/blog` (`blog_router`, prefix)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/blog/suggest-topics` | user | Topic suggestions (free-preview) |
| POST | `/api/v1/blog/generate` | user | Full blog post for one topic, saved to history |

### 3h. Social Publish — `/api/v1/social-publish` (`social_publish_router`, prefix)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/social-publish/status` | user | Platform connection status |
| POST | `/api/v1/social-publish/{platform}/disconnect` | user | Disconnect a platform |
| GET | `/api/v1/social-publish/meta/connect` | user | Meta OAuth URL (Facebook + Instagram) |
| GET | `/api/v1/social-publish/meta/callback` | — | Meta OAuth callback |
| GET | `/api/v1/social-publish/linkedin/connect` | user | LinkedIn OAuth URL |
| GET | `/api/v1/social-publish/linkedin/callback` | — | LinkedIn OAuth callback |
| GET | `/api/v1/social-publish/google_business/connect` | user | Google Business OAuth URL |
| GET | `/api/v1/social-publish/google_business/callback` | — | Google Business OAuth callback |
| POST | `/api/v1/social-publish/uploads` | user | Upload image to S3 |
| POST | `/api/v1/social-publish/publish` | user | Post now to platforms |
| POST | `/api/v1/social-publish/schedule` | user | Schedule future post |
| GET | `/api/v1/social-publish/scheduled` | user | List scheduled posts |
| DELETE | `/api/v1/social-publish/scheduled/{schedule_id}` | user | Cancel pending post |

### 3i. Articles — `/api/v1/articles` (`article_router`, prefix)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/articles/research-brief` | user | Phase 1: research plan |
| POST | `/api/v1/articles/generate` | user | Phase 2: write full article (saved as `seo_article`) |

### 3j. Health

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Service metadata |
| GET | `/health` | `{status: "ok", version: "4.1.0"}` |

Total: **68 endpoints** across 9 routers + 2 health.

---

## 4. Request → Response Flow (sequence)

An authenticated SEO analysis round-trip:

```
Client            FastAPI            core/security     bedrock_service       DynamoDB
  │  POST /seo/competitors (Bearer JWT + AnalyseRequest)
  │─────────────────────────────►│
  │                              │  Depends(get_current_user_id)
  │                              │──────────►│  JWKS (cached), verify RS256
  │                              │◄──────────│  user_id = sub
  │                              │  is_paid = is_user_paid(user_id)   ← payments_dynamo
  │                              │──────────►┐
  │                              │  generate_competitor_analysis(req, is_paid)
  │                              │──────────►│  Call 1: knowledge audit
  │                              │           │  Call 2: structure from confirmed
  │                              │           │  free-preview: real rows + locked placeholders
  │                              │◄──────────│  return Pydantic model
  │                              │  _save(...) → save_analysis()
  │                              │──────────────────────────────────────────►│
  │                              │◄──────────────────────────────────────────│ analysis_id
  │  200 { result, _meta }
  │◄─────────────────────────────│
```

Notes:
- Auth is injected via `Depends(get_current_user_id)` (see §5). Payment gating is **not** a blanket auth check — the router reads `is_user_paid(user_id)` and passes it to the service, which tailors how much (real) content to generate.
- `_save()` never blocks the response on DynamoDB failure; it falls back to `"save-failed"` and logs.
- `_response()` attaches `_meta = {analysis_id, user_id}`.

---

## 5. Authentication & Authorization (`core/security.py`)

Cognito issues **RS256-signed JWTs**. The backend verifies them with PyJWT:

1. Fetch JWKS once from the Cognito public endpoint, cached for process lifetime (`@lru_cache(maxsize=1)`).
2. Get `kid` from the unverified header, find the matching key.
3. `pyjwt.decode(..., algorithms=["RS256"], audience=CLIENT_ID, issuer=ISSUER)` — validates signature, `exp`, `iss`, `aud`.
4. Unknown `kid` → one-shot JWKS cache clear + refetch (key rotation).

Dependencies:
- `get_current_user_id(authorization, x_user_id)` — Bearer token path returns the `sub` claim (the DynamoDB partition key); dev fallback via `X-User-ID` when `SKIP_JWT_VERIFICATION=true`. Neither present → `HTTPException(401)`.
- `require_paid_access()` — composes on `get_current_user_id`, then checks `is_user_paid()` (used where payment is mandatory, e.g. some flows). Bypassed when `SKIP_PAYMENT_VERIFICATION=true`.
- `require_admin()` — checks the Cognito `cognito:groups` claim first, then a DynamoDB `ADMIN_ROLE` fallback.

### Dev bypass env vars

| Env var | Effect |
|---------|--------|
| `SKIP_JWT_VERIFICATION=true` | `_stub_decode` (base64 only, **no signature check**) + `X-User-ID` fallback. Local dev only. |
| `SKIP_PAYMENT_VERIFICATION=true` | Skips paid-access checks. Local dev only. |

---

## 6. Anti-Hallucination Pipeline (`services/bedrock_service.py`)

`bedrock_service.py` (~1600 lines) implements the **two-call knowledge-declaration architecture** — no external search APIs:

1. **Call 1 — knowledge audit:** Bedrock tags every fact `confirmed / approximate / unknown`.
2. **Call 2 — structure:** Output is built **only from confirmed facts**.

Data-quality conventions:
- `null` numeric → could not confirm from training data.
- `"not found"` string → not in confirmed knowledge.
- `current_da = 0` → DA unconfirmed; check Moz/Ahrefs directly.
- Content-strategy and backlink outputs include a `methodology_disclaimer`: no live SERP/backlink-index API, so competitor names/ranks and backlink categories are **strategic estimates, not a live crawl**; it deliberately returns **no fabricated backlink URLs**.

Robustness measures: `_converse_with_retry` (exponential backoff), `_converse` (truncation detection), `_parse_json` (markdown-stripping, trailing-comma repair), `_converse_and_validate` (Pydantic validation with one retry on schema mismatch). Streaming bridges sync Bedrock calls to async via `_bridge_stream_to_asyncio`.

### Streaming (SSE)

`stream_content_strategy_events` (and `astream_keyword_report`) yield `(event_name, data)` tuples; `seo_router` formats them as `event: {name}\ndata: {json}\n\n`. Content-strategy stream events: `start`, `analysis`, `backlink_deep_dive`, `content_delta`, `keyword_report`, `keyword_error`, `executive_summary`, `done`, `saved`. Keywords/days are processed **concurrently (bounded)**; the generator checks `request.is_disconnected` and cancels remaining Bedrock calls if the client drops. `StreamingResponse` sets `Cache-Control: no-cache` and `X-Accel-Buffering: no`.

---

## 7. Free-Preview / Paid Tier Model

Payment is never a blanket blocker — the app works for unpaid users, but produces a real-but-partial result.

### Mechanism
1. The router computes `is_user_paid(user_id)` (`payments_dynamo.is_user_paid`): admins always pass; otherwise checks the entitlement `is_paid` flag + `paid_until` expiry (None = never). Malformed timestamps fail closed.
2. It passes the boolean to the service generator, which asks Bedrock for **fewer real rows** on unpaid runs (genuine token savings) and **pads back up** with zero-cost `locked: true` placeholders (`MASK = "██████"`).

### Per-feature free-preview limits
| Feature | Unpaid (real → padded) | Paid |
|---------|------------------------|------|
| Competitors | 2 → 7/8/5 rows | all |
| Keywords | 2 → 8/10/10/5 rows | all |
| Domain Authority | 2 → 5/11/5 rows | all |
| Company Profile | skips `linkedin_overview` + `google_business_description` (masked) | full |
| Content Strategy | first keyword generated, rest `KeywordReportSlot(locked=True)` | all |
| Social Calendar | first day generated, rest `DayScheduleSlot(locked=True)` | all |
| Blog Topics | 2 real topics | all |

### Entitlement
Plans (Starter $29 / Growth $99 / Scale $179 — all identical access, only price differs; monthly/annual). Entitlement is granted by the Airwallex webhook on success or by a live poll at `GET /payment/status` (fallback). Access duration `PAID_ACCESS_DAYS` (default 30). Because row/placeholders are server-driven, the frontend only ever sees locked items on the free tier.

---

## 8. Data Layer (`db/`)

Two DynamoDB tables.

### `db/dynamo.py` — table `APAC_SEO_TABLE` (default `apac_seo_analyses`)
- PK `USER#<user_id>`, SK `<ts>#<analysis_type>#<analysis_id>` (timestamp-first for chronological ordering).
- GSI `gsi_analysis_id`: PK `analysis_id`, SK `user_id`.

Item types sharing this table: analysis records, `DOMAIN_LOCK`, `CANVA_PKCE#<state>`, `CANVA_CONNECTION`, `POSTER#<poster_id>`, `SOCIAL_CONNECTION#<platform>`, scheduled posts (global PK `SCHEDULED_QUEUE`), user registry (`REGISTRY`), and `ADMIN_ROLE`.

Key functions: `save_analysis`, `get_analysis`, `list_analyses` (paginated), `delete_analysis`, `get_user_stats`, `normalize_domain`/`check_and_lock_domain`, Canva PKCE/connection save+get+delete, `save_social_connection`/`get_social_connection`/`list_social_connections`/`delete_social_connection`, scheduled-post CRUD (`save_scheduled_post`, `list_due_scheduled_posts`, `list_scheduled_posts_for_user`, `update_scheduled_post_status`, `cancel_scheduled_post`), poster CRUD, admin registry (`register_user`, `list_all_users`, `is_admin`, `set_admin`), `update_analysis_result` (admin edits), `create_table_if_not_exists`.

### `db/payments_dynamo.py` — table `APAC_PAYMENTS_TABLE` (default `apac_payments`)
- PK `user_id`, SK `ENTITLEMENT` or `PAYMENT#<ts>#<payment_intent_id>`.
- GSI `gsi_payment_intent_id`: PK `payment_intent_id`.

Functions: `save_payment_intent`, `get_payment_intent`, `update_payment_intent_status`, `list_user_payments`, `set_user_paid`, `get_user_entitlement`, `is_user_paid`, `create_payments_table_if_not_exists`.

**Local dev:** set `DYNAMODB_ENDPOINT_URL`; `main.py` lifespan auto-creates **both** tables on startup.

**Pydantic DB models** (`models/db_models.py`): `AnalysisMeta`, `AnalysisRecord`, `TokenUsage`, `SavedAnalysisResponse`, `ListAnalysesResponse`, `UserStatsResponse`, `DeleteResponse`.

---

## 9. Services (`services/`)

| Service | Purpose |
|---------|---------|
| `bedrock_service.py` | AI inference — SEO/blog/article/content/clone analysis, SSE streaming, free-preview handling |
| `cognito_service.py` | Cognito signup/verify/login/refresh/forgot-password/user-info/profile |
| `social_service.py` | Relocation calendar generation + admin post revision |
| `aws_service.py` | STS credential resolution (cross-account `ROLE_ARN`) |
| `airwallex_service.py` | PaymentIntent create/poll, plan catalog, webhook HMAC verification |
| `canva_service.py` | Canva OAuth (PKCE), templates, asset upload, autofill + export jobs |
| `image_generation_service.py` | Amazon Nova Canvas image generation (returns PNG bytes) |
| `media_upload_service.py` | S3 image upload → public URL |
| `mail_check_service.py` | Business-email validation (syntax/free/disposable/DNS MX) |
| `article_service.py` | Two-phase article writer (research brief + generate) |
| `social_publish/publish_service.py` | Post to one/many platforms (never raises) |
| `social_publish/scheduler.py` | Poll + execute due scheduled posts |
| `social_publish/google_business_service.py` / `linkedin_service.py` / `meta_service.py` | Per-platform OAuth + posting |

### Background jobs
`main.py` lifespan starts an APScheduler `AsyncIOScheduler` that runs `process_due_scheduled_posts()` every `SCHEDULED_POSTS_POLL_SECONDS` (default 60). Why in-process: Instagram's API has no native "post later" parameter, so the app holds the post and triggers it at the right time. Fine while running as a persistent process (not per-request serverless). Shut down cleanly on app shutdown.

---

## 10. Models (`models/`)

Pydantic v2, grouped by domain, one file per domain: `auth_models.py`, `seo_models.py`, `social_models.py`, `db_models.py`, `payment_models.py`, `admin_models.py`, `blog_models.py`, `article_models.py`, `canva_models.py`, `social_publish_models.py`.

Notable:
- `seo_models.py` — `AnalyseRequest`, `ContentStrategyRequest(AnalyseRequest)`, response models with `locked: bool` on row classes (`CompetitorOverview`, `SEOVisibility`, `KeywordRanking`), `KeywordReportSlot`, `ContentStrategyResponse`, plus `MAX_TOTAL_KEYWORDS = 8`.
- `social_models.py` — `RelocationSocialRequest`, `RelocationSocialResponse` (`DailySchedule`, `SocialPost`, `DayScheduleSlot(locked)`), `MAX_DATE_RANGE_DAYS = 62`.
- `auth_models.py` — `SignUpRequest` (includes `domain`), `SetProfileRequest`, `ProfileResponse` (includes `is_admin`).
- `payment_models.py` — `PlanId = Literal["starter","growth","scale"]`, plan catalog/intent/status/history models.
- `blog_models.py` — `BlogTopicSuggestion(locked)`.
- `article_models.py` — `ArticleBrief`, `ArticleSection`, `ArticleResponse`.

---

## 11. Configuration & Environment Variables

See `backend/.env.example` for the canonical list. Categories:

**Core / Bedrock**
- `BEDROCK_MODEL_ID` (default `us.amazon.nova-pro-v1:0`), `BEDROCK_AWS_REGION` (default `us-east-1`), `BEDROCK_MAX_TOKENS`, `BEDROCK_ANALYSIS_MAX_TOKENS`, `BEDROCK_BACKLINK_MAX_TOKENS`, `BEDROCK_CONTENT_MAX_TOKENS`, `BEDROCK_ARTICLE_MAX_TOKENS`, `BEDROCK_MAX_CONCURRENT_KEYWORDS`, `BEDROCK_READ_TIMEOUT_SECONDS`, `BEDROCK_IMAGE_WIDTH/HEIGHT`

**AWS / credentials**
- `AWS_REGION` (default `ap-southeast-1`), `EIGENAI_AWS_ACCESS_KEY_ID`/`EIGENAI_AWS_SECRET_ACCESS_KEY`/`EIGENAI_AWS_SESSION_TOKEN`, optional `ROLE_ARN` (cross-account STS)

**DynamoDB**
- `DYNAMODB_ENDPOINT_URL` (set for local dev), `APAC_SEO_TABLE` (default `apac_seo_analyses`), `APAC_PAYMENTS_TABLE` (default `apac_payments`), `ANALYSIS_TTL_DAYS` (default 0 = no expiry)

**Auth**
- `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `SKIP_JWT_VERIFICATION`, `SKIP_PAYMENT_VERIFICATION`, `ADMIN_EMAILS` (comma-separated allowlist)

**Payments (Airwallex)**
- `AIRWALLEX_ENV` (`demo`/`prod`), `AIRWALLEX_CLIENT_ID`, `AIRWALLEX_API_KEY`, `AIRWALLEX_WEBHOOK_SECRET`, `AIRWALLEX_TIMEOUT_SECONDS`, `PAYMENT_CURRENCY` (default `USD`), `PLAN_STARTER_PRICE`/`PLAN_GROWTH_PRICE`/`PLAN_SCALE_PRICE` (defaults 29/99/179), `PAID_ACCESS_DAYS` (default 30)

**Canva / media**
- `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, `CANVA_REDIRECT_URI`, `CANVA_TIMEOUT_SECONDS`; `MEDIA_UPLOAD_BUCKET` (default `aeo-app-media-uploads`), `MEDIA_UPLOAD_ROLE_ARN`, `S3_ENDPOINT_URL`

**Social publishing**
- `SCHEDULED_POSTS_POLL_SECONDS` (default 60), `FRONTEND_URL` (default `http://localhost:3000`)

**Logging**
- `LOG_LEVEL` (default `INFO`)

No credentials are hardcoded: `main.py` warns if neither `AWS_ACCESS_KEY_ID` nor `DYNAMODB_ENDPOINT_URL` is present (relying on an IAM role, correct for EC2/ECS/Lambda).

---

## 12. Infrastructure (`backend/infra/`)

Terraform configs (not Python):
- `cognito.tf` — User Pool + App Client (email OTP, confidential client)
- `dynamodb_table.tf` — `apac_seo_analyses` table (PAY_PER_REQUEST, GSI `gsi_analysis_id`, TTL, encryption)
- `iam_policy.json` — DynamoDB access policy

> `terraform.tfstate` / `infra/terraform.tfstate` exist in the repo — **do not commit state changes or secrets** (enforced by `.githooks/pre-commit`).

---

## 13. Startup & Lifecycle (`main.py`)

- `load_dotenv()` — called only here, not in service modules.
- `logging.basicConfig(...)` with `LOG_LEVEL`.
- `lifespan` logs warnings for missing Cognito/Bedrock config, auto-creates both DynamoDB tables locally, starts the APScheduler background job, and logs the active model.
- CORS allows `http://localhost:3000`, `https://api.aeo-app.ai`, `https://www.aeo-app.ai`. **Add new origins here**.
- `GET /` returns service metadata; `GET /health` returns `{status: ok, version: 4.1.0}`.

> `main.py` contains a leftover `print("CURRENT DIR:", os.getcwd())` debug line — ignore it.

---

## 14. Python Coding Conventions

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
| Async generators | `stream_..._events` / `astream_` prefix | `stream_content_strategy_events`, `astream_keyword_report` |

### Type hints
Use on all public function signatures; private helpers may omit. Use `dict[str, Any]`, `list[str]`, `str | None` generics. Reserve `Any` for boto3 clients and unstructured data.

### Pydantic v2
`BaseModel`, `Field`, `field_validator`, `model_validator`. `Field(...)` for required, `Field(default=..., example=...)` for optional. Extract reusable validators into module functions. Use `model_validator(mode="after")` for cross-field checks. Use `model_dump()` / `model_dump_json()` — **not** `.dict()`.

### FastAPI routers
- Use `Depends(get_current_user_id)` / `require_admin()` / `require_paid_access()` as appropriate — never manual header reads.
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
Lazy-init boto3/HTTP clients from module globals via a `_get_client()` helper. Acceptable for boto3 (idempotent, thread-safe enough here).

### Streaming (SSE)
`StreamingResponse(media_type="text/event-stream")`, format `event: {name}\ndata: {json}\n\n`. Check `request.is_disconnected()`. Bridge sync boto3 to async via `asyncio.to_thread()` or a generator bridge.

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
- Mixed auth patterns — always use the shared dependencies.
- Bare `except:`, mutable default arguments, wildcard imports, leftover `print(`/`breakpoint()`.

---

## 15. Health & Versioning

- API version: `4.1.0` (matches `version="4.1.0"` in `main.py`).
- `GET /health` → `{status: "ok", version: "4.1.0"}`.
- Swagger/OpenAPI docs: `http://localhost:8000/docs`.
