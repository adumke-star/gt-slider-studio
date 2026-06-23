# Optional: Remove Lovable dependencies

Do this **after** standalone Supabase and deployment are stable. Not required for day-to-day use.

## What can stay for now

- `@lovable.dev/vite-tanstack-config` in `vite.config.ts` — build works without Lovable Cloud
- `@lovable.dev/cloud-auth-js` — unused; auth uses Supabase directly
- `src/lib/lovable-error-reporting.ts` — only reports to Lovable when embedded in their editor

## Phase 4b checklist (when ready)

1. Replace `vite.config.ts` with standard TanStack Start + Vite plugins (mirror what `@lovable.dev/vite-tanstack-config` provides — see its comment block in the current config).
2. Remove from `package.json`:
   - `@lovable.dev/cloud-auth-js`
   - `@lovable.dev/vite-tanstack-config`
3. Delete or replace:
   - `src/integrations/lovable/index.ts`
   - `src/lib/lovable-error-reporting.ts` (use `console.error` / Sentry instead)
   - `.lovable/` directory
4. Remove Lovable section from `AGENTS.md` (already done in this repo).
5. Deploy to your own host (Vercel, Cloudflare, etc.) with env vars from `.env.example`.

## Deployment env vars

Set in your host:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` (SSR if needed)

Do **not** connect this repo to Lovable after going standalone.
