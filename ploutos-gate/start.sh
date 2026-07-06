#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

exec uv run uvicorn main:app \
  --host "$HOST" \
  --port "$PORT" \
  --workers "$(nproc)" \
  --log-level info
