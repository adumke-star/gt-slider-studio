#!/usr/bin/env bash
# Automated checks before manual smoke tests (see docs/STANDALONE.md).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Typecheck…"
npx tsc --noEmit

echo "→ Lint skipped (run npm run lint separately if needed)"

if [[ -f .env ]]; then
  echo "→ Env vars present…"
  for v in VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY; do
    if [[ -z "${!v:-}" ]] && ! grep -q "^${v}=" .env 2>/dev/null; then
      echo "  missing ${v} in .env"
      exit 1
    fi
  done
  echo "  .env OK"
else
  echo "→ No .env (copy from .env.example after Supabase setup)"
fi

echo ""
echo "Manual smoke tests (after migration): login, upload, crop, compress, export, delete race."
echo "See docs/STANDALONE.md checklist."
