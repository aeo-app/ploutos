#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-5173}"

exec npx vite --host "$HOST" --port "$PORT"
