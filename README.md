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
cd frontend && REACT_APP_API_URL=http://localhost:8000/api/v1 npm start
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

**Stack**: FastAPI, uvicorn, boto3 (Bedrock + Cognito + DynamoDB), Pydantic v2

### Environment Variables

| Variable | Default | Required |
|----------|---------|----------|
| `DYNAMODB_ENDPOINT_URL` | `http://localhost:8000` | For local dev |
| `BEDROCK_MODEL_ID` | `us.amazon.nova-pro-v1:0` | |
| `AWS_REGION` | `ap-southeast-1` | |
| `COGNITO_USER_POOL_ID` | — | For auth |
| `COGNITO_CLIENT_ID` | — | For auth |

### API Endpoints

All SEO endpoints require a valid Cognito `Bearer` token.

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

**Auth**: Cognito tokens in `localStorage`. Auto-redirect on expiry. See `frontend/TOKEN_EXPIRY_USAGE.md`.

**Design**: Dark theme, CSS custom properties, Plus Jakarta Sans + Syne display fonts.

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
