#!/usr/bin/env bash
# Bootstrap standalone Supabase for gt-slider-studio.
# Prerequisites: supabase login (or SUPABASE_ACCESS_TOKEN), new empty Supabase project created in your org.
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

echo ""
echo "Done. Next steps:"
echo "  1. Copy .env.example → .env and paste anon URL/key from the new project."
echo "  2. Update supabase/config.toml project_id to ${SUPABASE_PROJECT_REF}"
echo "  3. In Supabase Dashboard → Authentication → URL Configuration, add:"
echo "       http://localhost:8080/**"
echo "       (and your production URL once deployed)"
echo "  4. Run: npm run standalone:migrate  (after setting OLD_/NEW_ service role keys in .env.migration)"
echo "  5. Run: npm run standalone:verify"
