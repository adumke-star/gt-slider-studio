/**
 * Optional auth smoke test. Set FRESH_TEST_EMAIL + FRESH_TEST_PASSWORD in env or .env.
 * Uses signUp (new account) or signIn if already registered.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvFile(name) {
  const path = resolve(root, name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(".env");

const email = process.env.FRESH_TEST_EMAIL;
const password = process.env.FRESH_TEST_PASSWORD;
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!email || !password) {
  console.log("Skip auth test — set FRESH_TEST_EMAIL and FRESH_TEST_PASSWORD to run sign-up/sign-in check.");
  console.log("Default allowed admin seed: a.dumke@global-tickets.com (must exist in allowed_emails after db push).");
  process.exit(0);
}

if (!url || !key) {
  console.error("Missing Supabase URL/key in .env");
  process.exit(1);
}

const supabase = createClient(url, key);

let { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error?.message?.includes("Invalid login credentials")) {
  ({ data, error } = await supabase.auth.signUp({ email, password }));
}

if (error) {
  console.error("Auth test failed:", error.message);
  if (error.message.includes("nicht freigeschaltet") || error.message.includes("42501")) {
    console.error("Email not in allowed_emails — add it in Supabase SQL Editor.");
  }
  process.exit(1);
}

if (!data.user) {
  console.error("Auth test failed: no user returned (check email confirmation settings).");
  process.exit(1);
}

console.log(`OK — authenticated as ${data.user.email}`);

const { count, error: raceErr } = await supabase.from("races").select("*", { count: "exact", head: true });
if (raceErr) {
  console.error("Races query failed:", raceErr.message);
  process.exit(1);
}

console.log(`OK — races table accessible (count: ${count ?? 0}, fresh start expects 0)`);
await supabase.auth.signOut();
