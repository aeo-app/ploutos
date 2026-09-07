# Repository Instructions — Ploutos

Repo-wide guidance for GitHub Copilot (chat, in-IDE, and coding agent).

## Project overview

Two independent codebases — no shared root `package.json`:
- `backend/` — FastAPI + boto3 (Bedrock, Cognito, DynamoDB), Pydantic v2. Entry: `backend/main.py`.
- `frontend/` — Create React App (JSX). **Active code is `frontend/src/`**. Root `App.jsx` + `index.js` are legacy single-file code — NOT used by CRA; treat as reference only.
- `scripts/start-local.sh` starts both (backend :8000, frontend :3000).
- `documents/backend-architecture.md` and `documents/frontend-architecture.md` hold the authoritative architecture + style conventions.
- `AGENTS.md` documents repo layout, env vars, and gotchas.

## Key conventions to honor

**Python (backend)** — consult `documents/backend-architecture.md` (§14 Coding Conventions):
- Type hints on public functions; `dict[...]` / `list[...]` / `str | None`.
- Pydantic v2 (`Field`, `field_validator`, `model_dump()`).
- FastAPI: `Depends(get_current_user_id)`, `response_model`, `summary`.
- Services raise domain exceptions; routers map to `HTTPException`.
- No bare `except:`, no mutable default args, no wildcard imports.

**React (frontend/src)** — consult `documents/frontend-architecture.md` (§11 Coding Conventions):
- Components are function declarations with named exports (only root `App` uses default export).
- Global state via `useReducer` + Context; local state via `useState`.
- CSS Modules + CSS custom properties; no hardcoded hex in inline styles.
- `runApi` + `withTokenExpiry` error pattern; `catch (_) {}` is intentional.
- No `var`, no `eval()`, no leftover `console.*`.

## Points of emphasis
- Never hardcode or commit secrets (AWS keys, Cognito secrets, `.env`, `.tfstate`).
