# Agent Guide

## Repository Map

- `backend/` is the FastAPI service. `main.py` owns app startup, router registration, CORS, health checks, and the in-process scheduler.
- `backend/routers/` defines HTTP endpoints, `backend/models/` defines Pydantic contracts, `backend/services/` owns external integrations, and `backend/db/` owns DynamoDB access.
- `backend/core/security.py` centralizes Cognito JWT checks, payment checks, and admin authorization.
- `frontend/src/` is the active React CRA application. `frontend/App.jsx` and `frontend/index.js` are legacy reference files and are not used by the CRA entrypoint.
- Frontend API adapters live in `frontend/src/api/`; shared auth, application, and payment state lives in `frontend/src/context/`; screens live in `frontend/src/pages/`.

Read the area-specific documentation before making broad changes: [backend README](backend/README.md), [frontend README](frontend/README.md), and [root README](README.md).

## Development Commands

Backend commands run from `backend/` and use `uv` with Python 3.11 or newer:

```bash
uv sync --group dev
uv run uvicorn main:app --reload --port 8000
uv run pytest
```

Frontend commands run from `frontend/`:

```bash
npm install
npm start
npm run build
```

There is no configured standalone frontend test or lint script. The production build is the usual frontend validation and may run CRA checks.

## Change Conventions

- Preserve the `/api/v1/...` API prefix and FastAPI dependency-injection patterns when adding routes.
- Update the relevant Pydantic model and frontend API adapter together when changing an API contract.
- Keep persistence in the DynamoDB helpers and external-provider behavior in services; routers should coordinate these layers.
- Preserve the existing token-expiry handling around authenticated frontend requests. POST-based SSE endpoints are manually streamed and parsed because native `EventSource` cannot send POST bodies or authorization headers.
- Payments are contextual: free previews return locked placeholders and the frontend opens checkout when needed. Do not turn payment into a blanket route gate without checking the current router and security behavior.
- The scheduler is in-process; scheduled publishing requires a persistent backend process and is not suitable for per-request serverless execution.

## Local Environment and Safety

- Copy `backend/.env.example` and `frontend/.env.example` for local configuration. Never commit real credentials, `.env` files, Terraform state, or `*.tfvars` files.
- `SKIP_JWT_VERIFICATION`, `SKIP_PAYMENT_VERIFICATION`, and `DYNAMODB_ENDPOINT_URL` are local-development switches only. Never enable them in production.
- `DYNAMODB_ENDPOINT_URL` can point at local DynamoDB and causes local table setup during backend startup.
- Prefer `uv` and `backend/pyproject.toml`/`backend/uv.lock` as backend dependency sources; do not modify dependencies by treating `requirements.txt` as authoritative.
- Keep the repository's secret-scanning pre-commit protection enabled when present, and inspect staged files before committing.

## Validation

- For backend changes, run the narrowest relevant `uv run pytest` selection when tests exist, then verify imports or startup with the development Uvicorn command if practical.
- For frontend changes, run `npm run build` from `frontend/`.
- For API changes, check both the backend router/model and the corresponding frontend adapter or consumer.
- Do not use production AWS, Cognito, Bedrock, or Airwallex credentials for local experiments.