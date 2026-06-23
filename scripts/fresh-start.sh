#!/usr/bin/env bash
# Fresh Start: link new Supabase project, push schema, write .env, verify connection.
# Prerequisites:
#   1. Create empty Supabase project in your org (Dashboard)
#   2. npx supabase login   OR   export SUPABASE_ACCESS_TOKEN=...
#   3. export SUPABASE_PROJECT_REF=your-project-ref
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OLD_LOVABLE_REF="zjldhczhlyxzvswbxeuq"

if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  echo "Error: set SUPABASE_PROJECT_REF to your new Supabase project ref."
  echo "  Dashboard → Project Settings → General → Reference ID"
  exit 1
fi

if [[ "$SUPABASE_PROJECT_REF" == "$OLD_LOVABLE_REF" ]]; then
  echo "Error: SUPABASE_PROJECT_REF must be your NEW project, not the Lovable one ($OLD_LOVABLE_REF)."
  exit 1
fi

echo "→ Linking project ${SUPABASE_PROJECT_REF}…"
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"

echo "→ Pushing migrations…"
npx supabase db push

echo "→ Updating supabase/config.toml…"
sed -i.bak "s/^project_id = .*/project_id = \"${SUPABASE_PROJECT_REF}\"/" supabase/config.toml
rm -f supabase/config.toml.bak

echo "→ Fetching API keys…"
KEYS="$(npx supabase projects api-keys --project-ref "$SUPABASE_PROJECT_REF" -o json 2>/dev/null || true)"
ANON_KEY=""
if [[ -n "$KEYS" ]]; then
  ANON_KEY="$(node -e "
    const keys = JSON.parse(process.argv[1]);
    const anon = keys.find(k => k.name === 'anon' || k.name === 'anon key');
    if (anon) process.stdout.write(anon.api_key || '');
  " "$KEYS" 2>/dev/null || true)"
fi

SUPABASE_URL="https://${SUPABASE_PROJECT_REF}.supabase.co"

if [[ -z "$ANON_KEY" ]]; then
  echo ""
  echo "Could not fetch anon key automatically. Paste it from Dashboard → Settings → API."
  read -r -p "Anon key: " ANON_KEY
fi

cat > .env <<EOF
SUPABASE_PROJECT_ID="${SUPABASE_PROJECT_REF}"
SUPABASE_URL="${SUPABASE_URL}"
SUPABASE_PUBLISHABLE_KEY="${ANON_KEY}"

VITE_SUPABASE_PROJECT_ID="${SUPABASE_PROJECT_REF}"
VITE_SUPABASE_URL="${SUPABASE_URL}"
VITE_SUPABASE_PUBLISHABLE_KEY="${ANON_KEY}"
EOF

echo "→ Wrote .env (gitignored)"

echo ""
echo "Configure Auth redirects in Supabase Dashboard → Authentication → URL Configuration:"
echo "  http://localhost:8080/**"
echo ""
echo "→ Verifying connection…"
node scripts/test-supabase-connection.mjs

echo ""
echo "Fresh start setup complete."
echo "  npm install && npm run dev"
echo "  Sign up at /auth with an email in allowed_emails (default seed: a.dumke@global-tickets.com)"
