# Ploutos — APAC SEO Intelligence

AI-powered SEO competitive intelligence platform for the Asia-Pacific market. Built with **FastAPI**, **React**, and **AWS Bedrock**.

## Architecture

```
ploutos/
├── backend/          FastAPI API (Python)
│   ├── main.py         App entry, CORS, router mounts
│   ├── routers/        auth, seo, social endpoints
│   ├── services/       Bedrock, Cognito, social integrations
│   ├── models/         Pydantic request/response schemas
│   ├── db/             DynamoDB helpers (local + production)
│   ├── core/           JWT security, token verification
│   └── infra/          Terraform (Cognito, DynamoDB, IAM)
├── frontend/         React SPA
│   ├── src/            Active codebase (components, pages, context, api)
│   └── App.jsx         Legacy single-file version (reference only)
├── scripts/          Dev convenience scripts
├── .githooks/        Git hooks for commit safety checks
└── documents/        Project documentation
```

## Quick Start

```bash
# Start both backend and frontend in one command
./scripts/start-local.sh
```

| Service | URL | Notes |
|---------|-----|-------|
| Backend API | `http://localhost:8000` | Swagger docs at `/docs` |
| Frontend | `http://localhost:3000` | CRA dev server |

### Start individually

```bash
# Backend
cd backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd frontend && REACT_APP_API_BASE_URL=http://localhost:8000/api/v1 npm start
```

### Prerequisites

- Python 3.10+ with `pip install -r backend/requirements.txt`
- Node.js 18+ with `cd frontend && npm install`
- AWS credentials (or set `DYNAMODB_ENDPOINT_URL` for local DynamoDB)
- Cognito User Pool ID + Client ID (auth endpoints fail without these)

### Commit Safety

Enable the pre-commit hook once per clone:

```bash
git config core.hooksPath .githooks
```

The hook blocks common secret files and credential patterns in staged changes, and checks staged Python files for syntax errors.

## Backend

**Stack**: FastAPI, uvicorn, boto3 (Bedrock + Cognito + DynamoDB + S3), Pydantic v2

### Environment Variables

See `backend/.env.example` for the full list. Key ones:

| Variable | Default | Required |
|----------|---------|----------|
| `DYNAMODB_ENDPOINT_URL` | `http://localhost:8000` | For local dev |
| `BEDROCK_MODEL_ID` | `us.amazon.nova-pro-v1:0` | |
| `AWS_REGION` | `ap-southeast-1` | |
| `COGNITO_USER_POOL_ID` | — | For auth |
| `COGNITO_CLIENT_ID` | — | For auth |
| `AIRWALLEX_ENV` | `demo` | `demo`/`prod` — payments |
| `CANVA_CLIENT_ID` / `CANVA_CLIENT_SECRET` | — | Canva integration |

### API Endpoints

All SEO, social, blog, article, payment, canva, admin and social-publish endpoints require a valid Cognito `Bearer` token (payment webhook uses an Airwallex HMAC signature). Full endpoint inventory in `documents/backend-architecture.md` §3. Highlights:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/seo/competitors` | Competitor analysis |
| POST | `/api/v1/seo/keywords` | Keyword research |
| POST | `/api/v1/seo/profile` | Company profile generation |
| POST | `/api/v1/seo/domain-authority` | DA strategy & backlink plan |
| POST | `/api/v1/seo/full-report` | All four analyses combined |
| POST | `/api/v1/seo/content-strategy` | Content strategy generator |
| POST | `/api/v1/social/relocation-calendar` | Relocation content calendar |
| GET | `/api/v1/history` | User analysis history |
| GET | `/api/v1/payment/plans` | Plan catalog (Starter/Growth/Scale) |
| POST | `/api/v1/payment/create-intent` | Start Airwallex payment |
| POST | `/api/v1/blog/generate` | Generate a blog post |
| POST | `/api/v1/articles/research-brief` | Article research brief |

**Free-preview / paid model**: no endpoint requires payment to be called. Unpaid users get a real-but-partial result — a couple of real rows per table, with the rest returned as zero-cost `locked: true` placeholders. Paid users get full rows. Payment is triggered contextually by the frontend (a locked row's "Unlock" button), never forced upfront. See `documents/backend-architecture.md` §7.

### Anti-Hallucination Pipeline

Two-call knowledge-declaration architecture — no external search APIs:
1. Bedrock audits its own knowledge (`confirmed / approximate / unknown`)
2. Output structured from confirmed facts only

`null` numerics = unconfirmed. `"not found"` strings = not in training data.

## Frontend

**Stack**: React 18, react-scripts 5.0.1, framer-motion

Two codebases exist in `frontend/`:
- **`src/`** — modular version (components, pages, context, api). This is the active codebase.
- **Root `App.jsx`** — legacy single-file version. Not used by CRA.

**Auth**: Password-based — email + password → Cognito (tokens in `localStorage`). Email OTP only for signup confirmation. Auto-redirect on expiry. See `TOKEN_EXPIRY_USAGE.md`.

**Payments**: Contextual, not a gate. Free-preview results carry `locked: true` items; a `402` or a locked teaser opens an Airwallex checkout modal. `PaymentContext` exposes `isPaid`.

**Design**: Dark theme, CSS custom properties, Plus Jakarta Sans + Inter fonts.

## Infrastructure

Terraform configs in `backend/infra/`:
- `dynamodb_table.tf` — `apac_seo_analyses` table (PAY_PER_REQUEST, GSI, TTL, encryption)
- `cognito.tf` — User Pool + App Client (email OTP, confidential client)
- `iam_policy.json` — DynamoDB access policy

```bash
cd backend/infra
terraform init
terraform apply
```

## Project Documentation

See the `documents/` folder for additional docs:
- `backend-architecture.md` — FastAPI backend structure, data flow, endpoints, and Python conventions
- `frontend-architecture.md` — React frontend structure, state/routing, data flow, and React conventions

## License

Proprietary — APAC Relocation / APAC Intel.
