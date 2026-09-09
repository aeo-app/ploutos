# APAC SEO Intelligence API

AI-powered SEO competitive intelligence, content strategy, and relocation
social-media content generation — built on **FastAPI + AWS Bedrock (Nova
Pro) + Cognito + DynamoDB**, gated behind **Airwallex** payment.

Everything in the app requires a paid account except signing up and logging
in — see [Payments](#payments-airwallex) below.

---

## Architecture at a glance

| Concern | Technology |
|---|---|
| API framework | FastAPI |
| AI generation | AWS Bedrock (Nova Pro) — no external search/SEO APIs; see [Data quality](#data-quality--no-external-search-apis) |
| Auth | AWS Cognito (JWT, verified against Cognito's JWKS) |
| Data storage | DynamoDB — two tables: analyses (single-table design, GSI for cross-partition lookups) and payments/entitlements (separate table, its own GSI — see db/payments_dynamo.py) |
| Payments | Airwallex (PaymentIntents + webhooks) |
| Package management | [uv](https://docs.astral.sh/uv/) |

---

## Project structure

```
apac_seo_api_v2/
├── main.py                      # FastAPI app, lifespan startup checks, router mounting
├── pyproject.toml                # Dependencies (uv) — see "Setup" below
├── uv.lock                       # Locked dependency versions — commit this
├── .env.example                  # Every configuration variable, documented
├── core/
│   └── security.py               # JWT verification, get_current_user_id, require_paid_access
├── db/
│   └── dynamo.py                 # Single-table DynamoDB access — analyses, payments, entitlements
├── models/
│   ├── auth_models.py
│   ├── db_models.py
│   ├── seo_models.py             # Competitor/keyword/profile/domain-authority/content-strategy
│   ├── social_models.py          # Relocation social media calendar
│   └── payment_models.py
├── routers/
│   ├── auth_router.py            # signup / verify / login / refresh / forgot-password — no payment gate
│   ├── seo_router.py             # SEO analyses + history — payment gated
│   ├── social_router.py          # Relocation content calendar — payment gated
│   └── payment_router.py         # Airwallex create-intent / status / history / webhook
├── services/
│   ├── bedrock_service.py        # Bedrock Converse calls, retry/backoff, JSON parsing
│   ├── social_service.py         # Deterministic scheduling + per-day Bedrock calls
│   ├── airwallex_service.py      # Airwallex auth, PaymentIntents, webhook signature verification
│   ├── cognito_service.py
│   └── aws_service.py
└── infra/                        # Terraform: Cognito, DynamoDB table (see infra/*.tf)
```

---

## Setup

This project uses **[uv](https://docs.astral.sh/uv/)** instead of pip/requirements.txt.

### 1. Install uv (once)
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 2. Install dependencies
```bash
uv sync
```
This creates `.venv/` and installs exactly what's locked in `uv.lock`. There's
nothing else to run — no separate `pip install`.

Need the dev tools too (pytest, moto — for the kind of testing described
below)?
```bash
uv sync --group dev
```

### 3. Configure environment
```bash
cp .env.example .env
```
Then fill in real values. See [.env.example](.env.example) for every
variable this app reads, with explanations. At minimum, for a real
deployment you need: Cognito pool/client IDs, a Bedrock-capable AWS role
(`ROLE_ARN`), and Airwallex client ID/API key/webhook secret.

### 4. Start the server

**Development** (auto-reload on file changes):
```bash
uv run uvicorn main:app --reload --port 8000
```

**Production** (no reload, bind to all interfaces, multiple workers):
```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

You do **not** need to activate the virtualenv first — `uv run` executes
the command inside the project's environment directly. (If you'd rather
activate it yourself: `source .venv/bin/activate` then plain
`uvicorn main:app --reload`.)

### 5. Open the API docs
```
http://localhost:8000/docs       # Swagger UI
http://localhost:8000/redoc      # ReDoc
```

---

## Local development shortcuts

Running everything for real (Cognito + Bedrock + a provisioned DynamoDB
table + Airwallex) isn't always necessary just to work on one endpoint.
Three env vars make local dev much faster — **all default to safe/off and
must never be enabled in production**:

| Variable | Effect |
|---|---|
| `SKIP_JWT_VERIFICATION=true` | Accepts an `X-User-ID` header instead of a real Cognito Bearer token. |
| `SKIP_PAYMENT_VERIFICATION=true` | Bypasses the payment gate — every authenticated request is treated as paid. |
| `DYNAMODB_ENDPOINT_URL=http://localhost:8000` | Points at a local DynamoDB (e.g. `docker run -p 8000:8000 amazon/dynamodb-local`) and **auto-creates the table + GSI on startup** — no manual Terraform needed for local dev. |

A fast local loop with no real AWS/Airwallex credentials at all:
```bash
docker run -d -p 8001:8000 amazon/dynamodb-local
SKIP_JWT_VERIFICATION=true SKIP_PAYMENT_VERIFICATION=true DYNAMODB_ENDPOINT_URL=http://localhost:8001 \
  uv run uvicorn main:app --reload --port 8000
```
You still need real Bedrock credentials to actually generate content — Nova
Pro isn't mockable locally. Everything else (auth flow, history, payment
gating logic) works without any AWS account at all in this mode.

---

## Authentication

```
POST /api/v1/auth/signup      → register, get OTP by email
POST /api/v1/auth/verify      → confirm OTP → account activated
POST /api/v1/auth/login       → returns access_token + refresh_token
POST /api/v1/auth/forgot-password
POST /api/v1/auth/refresh     → renew access_token without password
```
Use `Authorization: Bearer <access_token>` on every other request. These are
the **only** endpoints that don't require payment.

---

## Payments (Airwallex)

Every endpoint below auth requires an active paid entitlement
(`core.security.require_paid_access`) — unpaid requests get **402 Payment
Required**. See `services/airwallex_service.py` and `routers/payment_router.py`.
Payment transactions and entitlements live in their own DynamoDB table,
separate from analyses — see `db/payments_dynamo.py` and `APAC_PAYMENTS_TABLE`
below.

**Three plans (Starter/Growth/Scale)** — priced differently, but every paid
plan gets full platform access (no feature gating between tiers yet).
Billing is **manual renewal**, not auto-recurring: no card is stored on
file and nothing charges automatically — a successful payment grants
`PAID_ACCESS_DAYS` (30 by default) of access, after which the user pays
again to continue. Set `PAID_ACCESS_DAYS=0` for one-time-forever access
instead.

```
GET  /api/v1/payment/plans           # auth only — the plan catalog (single source of truth for pricing)
POST /api/v1/payment/create-intent   # auth only — {"plan_id": "starter"|"growth"|"scale"} -> creates a PaymentIntent
GET  /api/v1/payment/status          # auth only — current entitlement incl. plan (+ optional live poll)
GET  /api/v1/payment/history         # auth only — past transactions, each tagged with its plan_id
POST /api/v1/payment/webhook         # no auth — verified via Airwallex's HMAC signature instead
```

**One-time setup in the Airwallex web app:**
1. Settings → Developer → API keys → click **Generate** next to your organization/account (an "admin" key), or better, **Create restricted API key** and scope it to just Payment Acceptance — enter your login password when prompted, then **copy the key immediately**: it's shown once and can't be retrieved again (only regenerated, which invalidates the old one). Set `AIRWALLEX_CLIENT_ID` (shown on the same page, fixed, doesn't change) and `AIRWALLEX_API_KEY`.
2. Settings → Developer → Webhooks → **Add webhook** → set the Notification URL to
   `https://<your-domain>/api/v1/payment/webhook`, subscribe to all events under
   **Payment Intents** (at minimum `payment_intent.succeeded`; add `.failed`/`.cancelled`
   for explicit failure logging) → after saving, open the webhook and copy its secret
   key (each notification URL gets its own unique secret) into `AIRWALLEX_WEBHOOK_SECRET`.
3. `AIRWALLEX_ENV=demo` while testing in the sandbox; switch to `prod` (with
   production credentials, after your business account passes KYC review) to go live.

**Pricing is decided server-side** — `PLAN_STARTER_PRICE` / `PLAN_GROWTH_PRICE` /
`PLAN_SCALE_PRICE` / `PAYMENT_CURRENCY` in `services/airwallex_service.py`'s
`PLANS` dict — never trusted from the client (the client only picks a
`plan_id`). `PAID_ACCESS_DAYS=30` (the default) means a successful payment
unlocks the app for 30 days, after which the user pays again — set it to
`0` for one-time-forever access instead.

---

## SEO Analysis

```
POST /api/v1/seo/competitors
POST /api/v1/seo/keywords
POST /api/v1/seo/profile
POST /api/v1/seo/domain-authority
POST /api/v1/seo/full-report                 # all four above, one call
POST /api/v1/seo/content-strategy            # keyword → competitor → backlink plan → content, blocking
POST /api/v1/seo/content-strategy/stream     # same, streamed via Server-Sent Events
```

## Social Media Content

```
POST /api/v1/social/relocation-calendar          # relocation content calendar for a date range, blocking
POST /api/v1/social/relocation-calendar/stream   # same, streamed via SSE (one day at a time)
```

## History

Every analysis you run (any type above) is saved automatically, including
Bedrock **token usage measured per flow** (per `analysis_type`) — every
Converse/ConverseStream call across an entire flow (e.g. all 3 calls per
keyword in content-strategy, or all 4 sub-analyses in a full report) is
accumulated into one `token_usage` figure and stored on that flow's record.
```
GET    /api/v1/history            # paginated, newest first, optional ?analysis_type= filter — each item includes token_usage
GET    /api/v1/history/stats      # counts AND total token usage, both broken down by type (by flow)
GET    /api/v1/history/{id}       # full result payload + token_usage
DELETE /api/v1/history/{id}
```
`token_usage` is also returned inline in every analysis endpoint's response
(`_meta.token_usage`) and in the SSE streaming endpoints' final `done` event
— you don't have to look it up in history separately.

---

## Data quality — no external search APIs

This app never calls a live SEO/search index (no SERP API, no
Ahrefs/Semrush/Moz/Majestic connector). Every "competitor," "backlink
opportunity," or "keyword volume" figure is Bedrock's expert estimate based
on training-data patterns, not a live crawl — and every response that could
be mistaken for verified data says so explicitly (see `methodology_disclaimer`
/ `content_disclaimer` fields in the content-strategy and social-calendar
responses). If you need genuinely real-time rankings or a real backlink
index, that requires integrating a paid third-party provider — the schema
is designed so that's a drop-in swap later, not a rewrite.

---

## Testing

There's no live external dependency required to test the core logic — the
DynamoDB access layer, payment gating, and webhook signature verification
are all deterministic and can be exercised against a mocked AWS backend:

```bash
uv sync --group dev
uv run pytest   # once you've added test files under tests/ — see below
```

This repo doesn't ship a `tests/` directory yet, but everything is written
to be testable this way:
- **DynamoDB logic** (`db/dynamo.py`) — use [`moto`](https://github.com/getmoto/moto)
  to mock DynamoDB in-process; create the table with the same schema as
  `db/dynamo.py::create_table_if_not_exists`, monkeypatch
  `dynamo._get_table` to return the moto-backed table directly (bypasses
  the STS-assume-role path, which moto can't intercept), then call
  `save_analysis` / `list_analyses` / `save_payment_intent` /
  `is_user_paid` etc. directly.
- **Webhook signature verification** (`services/airwallex_service.py::verify_webhook_signature`)
  — pure function, no network calls; test with a known secret and a
  hand-computed HMAC.
- **Full request flow** — `fastapi.testclient.TestClient` against `main.app`
  with `SKIP_JWT_VERIFICATION=true` and a mocked `bedrock_service._converse`
  / `airwallex_service.create_payment_intent`, to exercise real endpoints
  (including the 402 payment gate) without any live AWS/Airwallex account.

---

## Deployment

`infra/` contains Terraform for the Cognito user pool and DynamoDB table
(with its GSI). State should live in a remote backend (S3 + a DynamoDB lock
table), not committed locally — `*.tfstate` is gitignored for this reason.

In production:
- Don't set `DYNAMODB_ENDPOINT_URL` — the app talks to real DynamoDB, and
  table creation should go through Terraform, not the app's own
  `create_table_if_not_exists` (that path only runs when
  `DYNAMODB_ENDPOINT_URL` is set, specifically so it can't fire against a
  real table by accident).
- Don't set `SKIP_JWT_VERIFICATION` or `SKIP_PAYMENT_VERIFICATION`.
- Set real AWS credentials via an IAM role (EC2/ECS/Lambda), not env vars,
  where possible.
