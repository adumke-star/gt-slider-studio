# GT Slider Studio (Standalone)

This repository is **independent** from [slider-hero-craft](https://github.com/adumke-star/slider-hero-craft), which remains connected to Lovable.

## Two-repo setup

| Repository | Purpose |
|------------|---------|
| `slider-hero-craft` | Lovable + managed Supabase (unchanged, backup) |
| `gt-slider-studio` | Standalone development + own Supabase |

Work only in **this** folder for standalone changes. Never change the remote on the Lovable repo.

## Quick start

1. **GitHub** — create empty repo `gt-slider-studio`, then:
   ```bash
   bash scripts/push-github.sh adumke-star/gt-slider-studio
   ```

2. **Supabase** — create a new project in your org, then:
   ```bash
   export SUPABASE_PROJECT_REF=your-new-ref
   bash scripts/setup-supabase.sh
   ```

3. **Env** — copy `.env.example` → `.env` and paste URL + anon key from the new project.

4. **Migrate data** from Lovable Supabase:
   ```bash
   cp scripts/env.migration.example .env.migration
   # fill OLD_/NEW_ database URLs and service role keys
   npm run standalone:migrate
   npm run standalone:verify
   ```

5. **Run locally**:
   ```bash
   npm install
   npm run dev
   ```

6. **Auth redirects** (Supabase Dashboard → Authentication → URL Configuration):
   - `http://localhost:8080/**`
   - your production URL after deploy

## Smoke tests after migration

- [ ] Login with existing user
- [ ] Overview shows all races
- [ ] Upload image to a slot
- [ ] Crop + save preview
- [ ] Compress (under target KB)
- [ ] Export (ZIP + individual)
- [ ] Delete race (confirmation + storage cleanup)

## Optional: remove Lovable build deps (later)

See [docs/LOVABLE_REMOVAL.md](docs/LOVABLE_REMOVAL.md). The app runs fine with Lovable npm packages as long as `.env` points to your Supabase.
