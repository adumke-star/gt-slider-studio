#!/usr/bin/env bash
# Deploy to the staging worker using .env.staging.local (gitignored).
# Usage: npm run deploy:staging
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

echo "Building with staging Supabase project: $VITE_SUPABASE_PROJECT_ID"
npx vite build

npx wrangler deploy \
  --name adumke-star-gt-slider-studio-staging \
  --keep-vars \
  --var SUPABASE_URL:"$SUPABASE_URL" \
  --var SUPABASE_PUBLISHABLE_KEY:"$SUPABASE_PUBLISHABLE_KEY" \
  --var SUPABASE_PROJECT_ID:"$SUPABASE_PROJECT_ID"

echo ""
echo "Staging: https://adumke-star-gt-slider-studio-staging.gt-sliderstudio.workers.dev"
