---
applyTo: "backend/**"
---

# Backend Instructions

- Work from the monorepo root, but run backend commands from `backend/`.
- Use Python 3.11 or newer and `uv`; treat `pyproject.toml` and `uv.lock` as the dependency source of truth. Use `uv sync --group dev` and `uv run ...` rather than changing dependencies through `requirements.txt`.
- Keep HTTP coordination in `routers/`, request and response contracts in `models/`, external-provider behavior in `services/`, DynamoDB access in `db/`, and authentication/authorization checks in `core/security.py`.
- Preserve the `/api/v1/...` route prefix and existing FastAPI dependency-injection patterns. When changing a response or request, inspect the matching frontend adapter in `../frontend/src/api/`.
- Treat Cognito, Bedrock, Airwallex, S3, and DynamoDB calls as external boundaries. Keep provider-specific logic in services and avoid embedding credentials or environment-specific assumptions in routers.
- Preserve the current contextual payment behavior and free-preview response shape. Check `core/security.py` and the relevant router before changing access rules.
- `SKIP_JWT_VERIFICATION`, `SKIP_PAYMENT_VERIFICATION`, and `DYNAMODB_ENDPOINT_URL` are local-only switches. Never enable them for production or commit `.env`, Terraform state, or `*.tfvars` files.
- The scheduler is in-process and requires a persistent backend process; do not assume scheduled publishing survives per-request serverless execution.
- Validate backend changes with the narrowest relevant `uv run pytest` command, then use `uv run uvicorn main:app --reload --port 8000` for startup-level checks when practical.

See [backend README](../../backend/README.md) for setup, environment variables, and endpoint details.