# Deploy to Cloudflare (free tier)

GT Slider Studio is a TanStack Start app built with **Nitro** (`cloudflare-module` preset). The database and file storage stay on **Supabase**; Cloudflare only hosts the web app.

The build outputs to `.output/` (gitignored). Nitro generates `.output/server/wrangler.json` automatically.

## 0. Register workers.dev (required once)

Before the first deploy, your Cloudflare account needs a **workers.dev subdomain**. Without it, CI fails at deploy with:

> You can either deploy your worker to one or more routes … or register a workers.dev subdomain

The `/workers/onboarding` URL from older Wrangler errors often 404s. Use the dashboard instead:

1. Open [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages)
2. On the overview page, find **Your subdomain** (right sidebar or top area)
3. Click **Change** (or **Set up** if none exists yet) and pick a subdomain, e.g. `global-tickets`
4. Save, then **Retry deployment** in Workers Builds

Alternative direct link (if your account supports it):  
[Workers subdomain settings](https://dash.cloudflare.com/?to=/:account/workers/subdomain)

Your app URL will be: `https://gt-slider-studio.<your-subdomain>.workers.dev`

**If CI keeps failing** (Wrangler cannot register the subdomain in non-interactive mode), run once locally:

```bash
npx wrangler login
npm run deploy
```

Wrangler will ask interactively for your `workers.dev` subdomain. After that, **Retry deployment** in Workers Builds.

This is a one-time account setup. The build itself can already succeed before this step.

## 1. Connect GitHub (recommended)

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create**
2. Choose **Workers** → **Connect to Git**
3. Select `adumke-star/gt-slider-studio`
4. Configure:

| Setting | Value |
|---------|--------|
| **Build command** | `npm run build` |
| **Deploy command** | `npm run deploy:cf` |
| **Node.js version** | `22` — add as **Text** variable `NODE_VERSION` = `22` |

Cloudflare’s free plan is enough for testing (100k Worker requests/day, 500 builds/month).

After the first deploy you get a URL like `https://gt-slider-studio.<your-subdomain>.workers.dev`.

Cloudflare may auto-detect `bun run build` and `npx wrangler deploy` — that is fine. Our scripts (`npm run build`, `npm run deploy:cf`) do the same.

## 2. Environment variables

Set these in Cloudflare → **Workers & Pages** → your project → **Settings** → **Variables and Secrets**.

**Production** (and **Preview** if you use branch previews):

Cloudflare asks for type **Text**, **Secret**, or **JSON** when adding each entry.

| Variable | Type | Value |
|----------|------|--------|
| `VITE_SUPABASE_URL` | **Text** | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | **Text** | Anon key (Supabase → Settings → API) |
| `VITE_SUPABASE_PROJECT_ID` | **Text** | Project reference ID |
| `SUPABASE_URL` | **Text** | Same as `VITE_SUPABASE_URL` |
| `SUPABASE_PUBLISHABLE_KEY` | **Text** | Same as anon key |
| `SUPABASE_PROJECT_ID` | **Text** | Same as project ref |

Use **Text** for all of the above — not **Secret** or **JSON**. `VITE_*` values must be available at **build time**; Cloudflare **Secrets** are only injected at **runtime** (too late for `npm run build`). The anon key is public in the browser bundle anyway.

**Important:** `wrangler deploy` **deletes** dashboard variables unless you pass `--keep-vars`. Our `npm run deploy:cf` script includes `--keep-vars` so dashboard entries survive local deploys. After adding variables in the dashboard, trigger a **new CI build** (or `npm run deploy` locally) so `VITE_*` are baked into the bundle.

Paste values **without extra spaces or line breaks** — a bad `VITE_SUPABASE_PROJECT_ID` (e.g. tab/newline before the ref) breaks the app.

`VITE_*` variables must be present at **build time** (Vite inlines them into the client bundle). After adding or changing them, trigger a **new deploy**.

Do **not** add `SUPABASE_SERVICE_ROLE_KEY` to Cloudflare (only needed locally for `npm run backup` / `npm run restore`). If you ever added it, use type **Secret** — never Text or JSON.

## 3. Supabase Auth URLs

Supabase Dashboard → **Authentication** → **URL Configuration**:

- **Site URL:** `https://gt-slider-studio.<your-subdomain>.workers.dev` (your Workers URL)
- **Redirect URLs:**
  - `https://gt-slider-studio.<your-subdomain>.workers.dev/**`
  - `http://localhost:8080/**` (local dev)

Add preview URLs later if you enable non-production branch deploys.

## 4. Deploy from your machine (alternative)

```bash
npx wrangler login
npm run deploy
```

`npm run deploy` runs `npm run build` then `wrangler deploy` from the project root (Nitro writes `.wrangler/deploy/config.json` to point at `.output/server/wrangler.json`).

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
