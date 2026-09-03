#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── colours ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; DIM='\033[2m'; RST='\033[0m'

log()  { echo -e "${GREEN}[start]${RST} $*"; }
warn() { echo -e "${DIM}[start]${RST} $*"; }
err()  { echo -e "${RED}[start]${RST} $*" >&2; }

# ── backend env defaults (override via env or .env) ──────────
export DYNAMODB_ENDPOINT_URL="${DYNAMODB_ENDPOINT_URL:-http://localhost:8000}"
export AWS_REGION="${AWS_REGION:-ap-southeast-1}"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
export BEDROCK_MODEL_ID="${BEDROCK_MODEL_ID:-us.amazon.nova-pro-v1:0}"
export APAC_SEO_TABLE="${APAC_SEO_TABLE:-apac_seo_analyses}"
export COGNITO_USER_POOL_ID="${COGNITO_USER_POOL_ID:-}"
export COGNITO_CLIENT_ID="${COGNITO_CLIENT_ID:-}"
export LOG_LEVEL="${LOG_LEVEL:-INFO}"

warn "DynamoDB endpoint : $DYNAMODB_ENDPOINT_URL"
warn "Bedrock model     : $BEDROCK_MODEL_ID"
warn "AWS region        : $AWS_REGION"
[[ -z "$COGNITO_USER_POOL_ID" ]] && warn "COGNITO_USER_POOL_ID not set — auth endpoints will fail locally"
[[ -z "$COGNITO_CLIENT_ID" ]]    && warn "COGNITO_CLIENT_ID not set    — auth endpoints will fail locally"
echo

# ── backend ──────────────────────────────────────────────────
log "Starting backend (FastAPI) on port 8000 …"
(cd "$ROOT/backend" && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000) &
BACKEND_PID=$!

# ── frontend ─────────────────────────────────────────────────
export REACT_APP_API_BASE_URL="${REACT_APP_API_BASE_URL:-http://localhost:8000/api/v1}"
log "Starting frontend (CRA) on port 3000 …"
(cd "$ROOT/frontend" && npx react-scripts start) &
FRONTEND_PID=$!

# ── cleanup ──────────────────────────────────────────────────
cleanup() {
  log "Shutting down …"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

log "Backend  → http://localhost:8000  (docs: /docs)"
log "Frontend → http://localhost:3000"
echo
wait
