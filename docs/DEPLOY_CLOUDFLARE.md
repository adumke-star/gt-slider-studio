# Deploy to Cloudflare (free tier)

GT Slider Studio is a TanStack Start app built with **Nitro** (`cloudflare-module` preset). The database and file storage stay on **Supabase**; Cloudflare only hosts the web app.

The build outputs to `.output/` (gitignored). Nitro generates `.output/server/wrangler.json` automatically.

## 1. Connect GitHub (recommended)

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create**
2. Choose **Workers** → **Connect to Git**
3. Select `adumke-star/gt-slider-studio`
4. Configure:

| Setting | Value |
|---------|--------|
| **Build command** | `npm run build` |
| **Deploy command** | `npm run deploy:cf` |
| **Node.js version** | `22` (environment variable `NODE_VERSION=22`) |

Cloudflare’s free plan is enough for testing (100k Worker requests/day, 500 builds/month).

After the first deploy you get a URL like `https://adumke-star-gt-slider-studio.<account>.workers.dev`.

## 2. Environment variables

Set these in Cloudflare → **Workers & Pages** → your project → **Settings** → **Variables and Secrets**.

**Production** (and **Preview** if you use branch previews):

| Variable | Value |
|----------|--------|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon key (Supabase → Settings → API) |
| `VITE_SUPABASE_PROJECT_ID` | Project reference ID |
| `SUPABASE_URL` | Same as `VITE_SUPABASE_URL` |
| `SUPABASE_PUBLISHABLE_KEY` | Same as anon key |
| `SUPABASE_PROJECT_ID` | Same as project ref |

`VITE_*` variables must be present at **build time** (Vite inlines them into the client bundle).

Do **not** add `SUPABASE_SERVICE_ROLE_KEY` to Cloudflare (only needed locally for `npm run backup` / `npm run restore`).

## 3. Supabase Auth URLs

Supabase Dashboard → **Authentication** → **URL Configuration**:

- **Site URL:** `https://adumke-star-gt-slider-studio.<account>.workers.dev` (your Workers URL)
- **Redirect URLs:**
  - `https://adumke-star-gt-slider-studio.<account>.workers.dev/**`
  - `http://localhost:8080/**` (local dev)

Add preview URLs later if you enable non-production branch deploys.

## 4. Deploy from your machine (alternative)

```bash
npx wrangler login
npm run deploy
```

`npm run deploy` runs `npm run build` then `wrangler deploy` from `.output/server/`.

Preview the production build locally:

```bash
npm run preview:cf
```

For local Wrangler preview, copy `.env.example` to `.dev.vars` (gitignored) and fill in the same values.

## 5. Smoke test

- Sign in at `/auth`
- Open a race, upload / compress an image
- Admin: allowlist, backup ZIP
- Profile → Change password

## Notes

- `vite.config.ts` sets `nitro: true` so Nitro builds a Cloudflare Worker bundle outside the Lovable sandbox.
- Migrations run against Supabase separately: `npx supabase db push` (not on Cloudflare).
- Build artifacts (`.output/`, `.wrangler/`) are gitignored; Cloudflare builds them on each deploy.
