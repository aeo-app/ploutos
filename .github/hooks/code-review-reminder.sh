#!/usr/bin/env bash

set -euo pipefail

changed_files="$(git status --porcelain --untracked-files=all -- backend frontend 2>/dev/null || true)"

backend_changed=false
frontend_changed=false

if grep -q 'backend/' <<<"$changed_files"; then
  backend_changed=true
fi

if grep -q 'frontend/' <<<"$changed_files"; then
  frontend_changed=true
fi

if [[ "$backend_changed" == false && "$frontend_changed" == false ]]; then
  exit 0
fi

messages=()

if [[ "$backend_changed" == true ]]; then
  messages+=("Backend files changed: run the backend-code-review skill before approving or committing.")
fi

if [[ "$frontend_changed" == true ]]; then
  messages+=("Frontend files changed: run the frontend-code-review skill before approving or committing.")
fi

message="$(printf '%s ' "${messages[@]}")"
printf '{"systemMessage":%s}\n' "$(printf '%s' "$message" | python3 -c 'import json, sys; print(json.dumps(sys.stdin.read()))')"