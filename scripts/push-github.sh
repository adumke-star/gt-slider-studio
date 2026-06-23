#!/usr/bin/env bash
# Push gt-slider-studio to a new GitHub repo without touching slider-hero-craft (Lovable).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REPO="${1:-adumke-star/gt-slider-studio}"
REMOTE_URL="https://github.com/${REPO}.git"

if git remote get-url origin &>/dev/null; then
  echo "origin already set: $(git remote get-url origin)"
else
  git remote add origin "$REMOTE_URL"
fi

echo "Pushing main to ${REMOTE_URL}…"
echo "If the repo does not exist yet, create an empty repo on GitHub first:"
echo "  https://github.com/new  → name: gt-slider-studio, no README"
echo ""
git push -u origin main

echo "Done. This repo is independent from slider-hero-craft / Lovable."
