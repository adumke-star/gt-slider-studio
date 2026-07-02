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
| **Build command** | `bun run build` or `npm run build` |
| **Deploy command** | `npm run deploy:cf` (not plain `npx wrangler deploy`) |
| **Node.js version** | `22` — add as **Text** variable `NODE_VERSION` = `22` |

Cloudflare’s free plan is enough for testing (100k Worker requests/day, 500 builds/month).

After the first deploy you get a URL like `https://gt-slider-studio.<your-subdomain>.workers.dev`.

**Do not** leave the auto-detected deploy command as `npx wrangler deploy` — it omits `--keep-vars` and can wipe dashboard variables.

## 2. Environment variables

Set these under **Settings → Build → Variables and secrets** (build-time). That is where `VITE_*` must live so `bun run build` / `npm run build` can inline them into the client bundle.

Optionally mirror the same values under **Settings → Variables and Secrets** (worker runtime) for SSR/server code — but **build variables alone are not enough** if you only set worker runtime vars, and **worker runtime vars alone are not enough** for `VITE_*` (they must be present at build time).

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

Also under **Authentication** → **Providers** → **Email**:

- **Enable Email provider** must be on
- For instant sign-up without a confirmation mail (recommended for this app): turn **Confirm email** off, or enable **Auto Confirm** if your Supabase UI offers it

If email confirmation stays on, new users must click the link in their inbox before sign-in works; the app now shows that message instead of freezing on “Creating account…”.

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

From your machine (checks the live JS bundle was built with Supabase env):

```bash
npm run verify:live
```

## 6. Auto-deploy on push (recommended: GitHub Actions)

Cloudflare’s built-in **Workers Builds** Git integration often does not trigger reliably (Deployments may only show manual Wrangler uploads). Use **GitHub Actions** instead — visible under the repo **Actions** tab on every push to `main`.

Workflow file: [`.github/workflows/deploy-cloudflare.yml`](../.github/workflows/deploy-cloudflare.yml)

### One-time setup (GitHub secrets)

GitHub → `adumke-star/gt-slider-studio` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret | Value |
|--------|--------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Create → template **Edit Cloudflare Workers** (or custom: Account / Workers Scripts / Edit) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard URL or Workers overview (32-char hex) |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project ref |

Use the same values as in your local `.env`. The workflow mirrors them to `SUPABASE_*` at build time.

### Avoid double deploys

If Cloudflare **Workers Builds** is still connected to Git, either:

- **Disconnect** Git under Cloudflare → Settings → Build, **or**
- Leave it — but then one push might run two pipelines (wasteful)

GitHub Actions alone is enough.

### Verify it works

1. Push to `main`
2. GitHub → **Actions** → **Deploy Cloudflare Workers** → latest run should be green
3. `npm run verify:live`
4. Hard-refresh the site (`Cmd+Shift+R`)

Manual re-run anytime: Actions → workflow → **Run workflow**.

### Fallback: Cloudflare Workers Builds

If you prefer Cloudflare-native builds instead of GitHub Actions:

| Tab | What it shows |
|-----|----------------|
| **Builds** | Git-triggered build + deploy (commit SHA) |
| **Deployments** | Worker versions live in production |

Checklist: production branch `main`, deploy command `npm run deploy:cf`, **Build → Variables and secrets** filled (not “None”).

If no build starts after push: **Builds → Create deployment**, or reconnect Git under Settings → Build.

### If build succeeds but the site breaks

Almost always: `VITE_*` missing during **build** → bundle contains `Missing Supabase` → run `npm run verify:live` to confirm, then fix secrets / build variables and redeploy.

## Notes

- `vite.config.ts` sets `nitro: true` so Nitro builds a Cloudflare Worker bundle outside the Lovable sandbox.
- Migrations run against Supabase separately: `npx supabase db push` (not on Cloudflare).
- Build artifacts (`.output/`, `.wrangler/`) are gitignored; Cloudflare builds them on each deploy.
