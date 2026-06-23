/**
 * Migrate data from Lovable-managed Supabase to standalone Supabase.
 *
 * Requires direct Postgres URLs (Dashboard → Project Settings → Database → Connection string URI).
 * Load from .env.migration (gitignored) or environment:
 *
 *   OLD_DATABASE_URL=postgresql://postgres.[ref]:[password]@...
 *   NEW_DATABASE_URL=postgresql://postgres.[ref]:[password]@...
 *   OLD_SUPABASE_URL=https://....supabase.co
 *   OLD_SUPABASE_SERVICE_ROLE_KEY=...
 *   NEW_SUPABASE_URL=https://....supabase.co
 *   NEW_SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Usage: node scripts/migrate-from-lovable.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
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

loadEnvFile(".env.migration");
loadEnvFile(".env");

const required = [
  "OLD_DATABASE_URL",
  "NEW_DATABASE_URL",
  "OLD_SUPABASE_URL",
  "OLD_SUPABASE_SERVICE_ROLE_KEY",
  "NEW_SUPABASE_URL",
  "NEW_SUPABASE_SERVICE_ROLE_KEY",
];

for (const k of required) {
  if (!process.env[k]) {
    console.error(`Missing ${k}. Copy scripts/env.migration.example → .env.migration and fill in values.`);
    process.exit(1);
  }
}

const PUBLIC_TABLES = [
  "allowed_emails",
  "profiles",
  "user_roles",
  "races",
  "slider_sections",
  "slider_images",
  "comments",
  "comment_mentions",
  "image_audit_log",
];

async function copyTable(oldClient, newClient, table, orderBy = "created_at") {
  const cols = await oldClient.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  const columnNames = cols.rows.map((r) => r.column_name);
  if (columnNames.length === 0) {
    console.warn(`  skip ${table} (not found)`);
    return 0;
  }

  const hasOrder = columnNames.includes(orderBy);
  const sel = await oldClient.query(
    `SELECT * FROM public.${table}${hasOrder ? ` ORDER BY ${orderBy}` : ""}`,
  );
  if (sel.rows.length === 0) {
    console.log(`  ${table}: 0 rows`);
    return 0;
  }

  await newClient.query(`DELETE FROM public.${table}`);
  const placeholders = columnNames.map((_, i) => `$${i + 1}`).join(", ");
  const insert = `INSERT INTO public.${table} (${columnNames.join(", ")}) VALUES (${placeholders})`;

  for (const row of sel.rows) {
    const values = columnNames.map((c) => row[c]);
    await newClient.query(insert, values);
  }
  console.log(`  ${table}: ${sel.rows.length} rows`);
  return sel.rows.length;
}

async function copyAuthUsers(oldClient, newClient) {
  const users = await oldClient.query(`SELECT * FROM auth.users ORDER BY created_at`);
  const identities = await oldClient.query(`SELECT * FROM auth.identities ORDER BY created_at`);

  await newClient.query(`DELETE FROM auth.identities`);
  await newClient.query(`DELETE FROM auth.users`);

  for (const row of users.rows) {
    const cols = Object.keys(row);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    await newClient.query(
      `INSERT INTO auth.users (${cols.join(", ")}) VALUES (${placeholders})`,
      cols.map((c) => row[c]),
    );
  }

  for (const row of identities.rows) {
    const cols = Object.keys(row);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    await newClient.query(
      `INSERT INTO auth.identities (${cols.join(", ")}) VALUES (${placeholders})`,
      cols.map((c) => row[c]),
    );
  }

  console.log(`  auth.users: ${users.rows.length} rows`);
  console.log(`  auth.identities: ${identities.rows.length} rows`);
  return users.rows.length;
}

async function copyOneObject(oldSb, newSb, bucket, path) {
  const { data: blob, error } = await oldSb.storage.from(bucket).download(path);
  if (error) throw error;
  const { error: upErr } = await newSb.storage.from(bucket).upload(path, blob, { upsert: true });
  if (upErr) throw upErr;
}

async function main() {
  console.log("Connecting to databases…");
  const oldDb = new pg.Client({ connectionString: process.env.OLD_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const newDb = new pg.Client({ connectionString: process.env.NEW_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await oldDb.connect();
  await newDb.connect();

  const oldSb = createClient(process.env.OLD_SUPABASE_URL, process.env.OLD_SUPABASE_SERVICE_ROLE_KEY);
  const newSb = createClient(process.env.NEW_SUPABASE_URL, process.env.NEW_SUPABASE_SERVICE_ROLE_KEY);

  try {
    console.log("\n1/3 Auth users (preserves passwords)…");
    await newDb.query(`SET session_replication_role = replica`);
    await copyAuthUsers(oldDb, newDb);

    console.log("\n2/3 Public tables…");
    for (const table of PUBLIC_TABLES) {
      await copyTable(oldDb, newDb, table);
    }
    await newDb.query(`SET session_replication_role = DEFAULT`);

    console.log("\n3/3 Storage files…");
    const paths = await oldDb.query(`
      SELECT original_path, compressed_path FROM public.slider_images
    `);
    const originals = new Set();
    const compressed = new Set();
    for (const row of paths.rows) {
      if (row.original_path) originals.add(row.original_path);
      if (row.compressed_path) compressed.add(row.compressed_path);
    }
    for (const path of originals) {
      await copyOneObject(oldSb, newSb, "originals", path);
    }
    for (const path of compressed) {
      await copyOneObject(oldSb, newSb, "compressed", path);
    }
    console.log(`  storage.originals: ${originals.size} files`);
    console.log(`  storage.compressed: ${compressed.size} files`);

    console.log("\nMigration complete. Run: npm run standalone:verify");
  } finally {
    await oldDb.end();
    await newDb.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
