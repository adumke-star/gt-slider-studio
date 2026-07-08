#!/usr/bin/env bash
# Local dev server wired to the staging Supabase project (.env.staging.local).
# Usage: npm run dev:staging
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.staging.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — create it with the staging Supabase values (see docs/DEPLOY_CLOUDFLARE.md)."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "Dev server → staging Supabase project: ${VITE_SUPABASE_PROJECT_ID:-unknown}"
echo "Open http://localhost:8080 (not the production DB from .env)"
echo ""

exec npx vite dev
