# GT Slider Studio (Standalone)

This repository is **independent** from [slider-hero-craft](https://github.com/adumke-star/slider-hero-craft), which remains connected to Lovable.

## Two-repo setup

| Repository | Purpose |
|------------|---------|
| `slider-hero-craft` | Lovable + managed Supabase (unchanged, backup) |
| `gt-slider-studio` | Standalone development + **your own** Supabase |

Work only in **this** folder for standalone changes. Never change the remote on the Lovable repo.

## Fresh start (no data migration)

No Lovable Service-Role-Key needed. The app uses only **URL + Anon-Key** from your new Supabase project.

### 1. Create Supabase project

In your Supabase org: create a new empty project. Note the **Reference ID**.

### 2. One-command setup

```bash
cd "/Users/a.dumke/Documents/Dev/GT Slider-Studio/gt-slider-studio"
npx supabase login
export SUPABASE_PROJECT_REF=your-new-ref
bash scripts/fresh-start.sh
```

This runs `db push` (schema + storage buckets), writes `.env`, and verifies the connection.

### 3. Auth configuration

Supabase Dashboard → **Authentication** → URL Configuration:

- `http://localhost:8080/**`
- your production URL once deployed (see [DEPLOY_CLOUDFLARE.md](DEPLOY_CLOUDFLARE.md))

### 4. Run locally

```bash
npm install
npm run dev
```

Open `/auth` → **Sign up** with an email in `allowed_emails`. After `db push`, the seed includes `a.dumke@global-tickets.com` as admin. Add more team emails via [`scripts/seed-team-emails.sql`](scripts/seed-team-emails.sql) in the SQL Editor.

**Note:** Users and passwords from Lovable do not carry over — everyone creates a new account.

### 5. Verify

```bash
npm run standalone:smoke          # typecheck + env check
node scripts/test-supabase-connection.mjs

# optional auth test:
FRESH_TEST_EMAIL=you@global-tickets.com FRESH_TEST_PASSWORD=yourpassword node scripts/test-auth-setup.mjs
```

## Manual smoke tests (empty DB)

- [ ] Sign up / login
- [ ] Create a race
- [ ] Upload image → crop → compress → export
- [ ] Delete race

## Optional: migrate data from Lovable later

Only if you need old races/images. Requires privileged access to the Lovable Supabase (not available via Lovable UI). Scripts remain in `scripts/migrate-from-lovable.mjs` but are **not** part of the fresh-start path.

## Optional: remove Lovable build deps (later)

See [docs/LOVABLE_REMOVAL.md](LOVABLE_REMOVAL.md).
