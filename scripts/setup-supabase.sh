#!/usr/bin/env bash
# Bootstrap standalone Supabase for gt-slider-studio.
# For full fresh start (link + db push + .env), use: bash scripts/fresh-start.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  echo "Set SUPABASE_PROJECT_REF to your new Supabase project ref (Dashboard → Project Settings → General)."
  exit 1
fi

echo "Linking Supabase project ${SUPABASE_PROJECT_REF}…"
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"

echo "Pushing migrations (schema + storage buckets)…"
npx supabase db push

sed -i.bak "s/^project_id = .*/project_id = \"${SUPABASE_PROJECT_REF}\"/" supabase/config.toml
rm -f supabase/config.toml.bak

echo ""
echo "Done. Next: bash scripts/fresh-start.sh (if .env not written yet) or copy .env.example → .env"
echo "Auth redirects: http://localhost:8080/** in Supabase Dashboard → Authentication"
