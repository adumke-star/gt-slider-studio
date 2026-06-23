/**
 * Compare row counts and storage object counts between old and new Supabase.
 * Uses same env vars as migrate-from-lovable.mjs (.env.migration).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

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

const TABLES = [
  "auth.users",
  "public.races",
  "public.slider_sections",
  "public.slider_images",
  "public.comments",
  "public.profiles",
  "public.allowed_emails",
];

async function countTable(client, qualified) {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${qualified}`);
  return rows[0].n;
}

async function countStorageFromDb(client, bucket) {
  const col = bucket === "originals" ? "original_path" : "compressed_path";
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM public.slider_images WHERE ${col} IS NOT NULL`,
  );
  return rows[0].n;
}

async function main() {
  const oldDb = new pg.Client({ connectionString: process.env.OLD_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const newDb = new pg.Client({ connectionString: process.env.NEW_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await oldDb.connect();
  await newDb.connect();

  console.log("Table counts (old → new):");
  let ok = true;
  for (const t of TABLES) {
    const oldN = await countTable(oldDb, t);
    const newN = await countTable(newDb, t);
    const match = oldN === newN ? "OK" : "MISMATCH";
    if (oldN !== newN) ok = false;
    console.log(`  ${t.padEnd(28)} ${String(oldN).padStart(5)} → ${String(newN).padStart(5)}  ${match}`);
  }

  console.log("\nStorage paths referenced in DB:");
  for (const bucket of ["originals", "compressed"]) {
    const oldN = await countStorageFromDb(oldDb, bucket);
    const newN = await countStorageFromDb(newDb, bucket);
    const match = oldN === newN ? "OK" : "MISMATCH";
    if (oldN !== newN) ok = false;
    console.log(`  ${bucket.padEnd(28)} ${String(oldN).padStart(5)} → ${String(newN).padStart(5)}  ${match}`);
  }

  await oldDb.end();
  await newDb.end();

  console.log(ok ? "\nAll counts match." : "\nSome counts differ — review migration output.");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
