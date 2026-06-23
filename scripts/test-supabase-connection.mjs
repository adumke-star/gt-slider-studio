/**
 * Verify .env points to a standalone Supabase (not Lovable) and REST API responds.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const OLD_LOVABLE_REF = "zjldhczhlyxzvswbxeuq";

function loadEnv() {
  const path = resolve(root, ".env");
  if (!existsSync(path)) {
    console.error("Missing .env — run: bash scripts/fresh-start.sh");
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[t.slice(0, i).trim()] = val;
  }
  return env;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
const ref = env.VITE_SUPABASE_PROJECT_ID || env.SUPABASE_PROJECT_ID;

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env");
  process.exit(1);
}

if (ref === OLD_LOVABLE_REF || url.includes(OLD_LOVABLE_REF)) {
  console.error(`Still pointing at Lovable Supabase (${OLD_LOVABLE_REF}). Run: bash scripts/fresh-start.sh`);
  process.exit(1);
}

if (url.includes("your-project-ref") || key.includes("your-anon-key")) {
  console.error(".env contains placeholders — fill with your new Supabase project values.");
  process.exit(1);
}

const res = await fetch(`${url}/auth/v1/health`, {
  headers: { apikey: key },
});

if (!res.ok) {
  console.error(`Supabase REST check failed: ${res.status} ${res.statusText}`);
  console.error("Ensure db push completed and the anon key is correct.");
  process.exit(1);
}

console.log(`OK — connected to ${url}`);
console.log("Auth API healthy. Run db push if tables are missing.");
