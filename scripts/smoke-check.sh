#!/usr/bin/env bash
# Automated checks before manual smoke tests (see docs/STANDALONE.md).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OLD_LOVABLE_REF="zjldhczhlyxzvswbxeuq"

echo "→ Typecheck…"
npx tsc --noEmit

echo "→ Lint skipped (run npm run lint separately if needed)"

if [[ ! -f .env ]]; then
  echo "→ No .env — run: bash scripts/fresh-start.sh"
  exit 1
fi

if grep -q "$OLD_LOVABLE_REF" .env 2>/dev/null; then
  echo "→ .env still points at Lovable Supabase. Run: bash scripts/fresh-start.sh"
  exit 1
fi

if grep -q "your-project-ref" .env 2>/dev/null; then
  echo "→ .env has placeholders. Run: bash scripts/fresh-start.sh"
  exit 1
fi

echo "→ Connection check…"
node scripts/test-supabase-connection.mjs

echo ""
echo "Manual smoke tests (fresh DB): sign up, create race, upload, crop, compress, export, delete race."
echo "See docs/STANDALONE.md checklist."
