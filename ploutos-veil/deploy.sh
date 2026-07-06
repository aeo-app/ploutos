#!/usr/bin/env bash
set -euo pipefail

BUCKET="www.aeo-app.ai"
API_URL="https://api.aeo-app.ai"

echo "→ Building frontend with API URL: $API_URL"
VITE_API_URL="$API_URL" npm run build

echo ""
echo "→ Uploading to s3://$BUCKET"
aws s3 sync dist/ "s3://$BUCKET" --delete

echo ""
echo "✅ Deployed to https://$BUCKET"
