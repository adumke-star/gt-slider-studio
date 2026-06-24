/**
 * Restore GT Slider Studio from a local backup (counterpart to scripts/backup.mjs).
 *
 * Restores, in foreign-key-safe order:
 *   - allowed_emails (invited_by nulled, so team can sign up again and regain roles via trigger)
 *   - races -> slider_sections -> slider_images
 *   - all compressed images back into the `compressed` storage bucket (paths from manifest.json)
 *
 * Intentionally skipped: comments, comment_mentions, image_audit_log, profiles, user_roles
 * (they reference auth.users, which won't exist on a fresh project).
 *
 * Safety: dry-run by default. Pass --confirm to actually write (upsert by id).
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (or the environment).
 *
 * Usage:
 *   node scripts/restore.mjs                       # dry-run, latest backup
 *   node scripts/restore.mjs --confirm             # apply, latest backup
 *   node scripts/restore.mjs backups/2026-... --confirm
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, isAbsolute } from "node:path";
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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const folderArg = args.find((a) => !a.startsWith("--"));

// Only writing (--confirm) needs Supabase credentials; a dry-run reads local files only.
if (confirm) {
  if (!SUPABASE_URL) {
    console.error("Missing SUPABASE_URL in .env — run: bash scripts/fresh-start.sh");
    process.exit(1);
  }
  if (!SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env (or environment).");
    console.error("Get it from: Supabase Dashboard → Project Settings → API → 'service_role' secret.");
    console.error("Then either add it to .env or run:");
    console.error('  SUPABASE_SERVICE_ROLE_KEY="<key>" npm run restore -- --confirm');
    process.exit(1);
  }
}

function latestBackupDir() {
  const base = join(root, "backups");
  if (!existsSync(base)) return null;
  const dirs = readdirSync(base)
    .map((name) => join(base, name))
    .filter((p) => statSync(p).isDirectory())
    .sort();
  return dirs.length ? dirs[dirs.length - 1] : null;
}

const backupDir = folderArg
  ? (isAbsolute(folderArg) ? folderArg : resolve(root, folderArg))
  : latestBackupDir();

if (!backupDir || !existsSync(backupDir)) {
  console.error("No backup folder found. Run `npm run backup` first or pass a folder path.");
  process.exit(1);
}

const dbDir = join(backupDir, "database");
const manifestPath = join(backupDir, "manifest.json");
if (!existsSync(dbDir) || !existsSync(manifestPath)) {
  console.error(`Invalid backup at ${backupDir} (missing database/ or manifest.json).`);
  process.exit(1);
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function upsertTable(supabase, table, rows) {
  let written = 0;
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`${table}: ${error.message}`);
    written += batch.length;
  }
  return written;
}

async function main() {
  const allowedEmails = readJson(join(dbDir, "allowed_emails.json"), []).map((r) => ({
    ...r,
    invited_by: null,
  }));
  const races = readJson(join(dbDir, "races.json"), []);
  const sections = readJson(join(dbDir, "slider_sections.json"), []);
  const images = readJson(join(dbDir, "slider_images.json"), []);
  const manifest = readJson(manifestPath, { files: [] });
  const files = manifest.files ?? [];

  console.log(`Restore source: ${backupDir}`);
  console.log(`Target:         ${SUPABASE_URL ?? "(set SUPABASE_URL before --confirm)"}`);
  if (manifest.supabase_url && manifest.supabase_url !== SUPABASE_URL) {
    console.log(`\n  NOTE: backup came from ${manifest.supabase_url}`);
    console.log(`        you are restoring into a DIFFERENT project.`);
  }

  console.log(`\nWould restore:`);
  console.log(`  allowed_emails:  ${allowedEmails.length}`);
  console.log(`  races:           ${races.length}`);
  console.log(`  slider_sections: ${sections.length}`);
  console.log(`  slider_images:   ${images.length}`);
  console.log(`  images (upload): ${files.length}`);

  if (!confirm) {
    console.log(`\nDry run — nothing written. Re-run with --confirm to apply:`);
    console.log(`  npm run restore -- --confirm`);
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`\n1/2 Database (FK-safe order)…`);
  if (allowedEmails.length) console.log(`  allowed_emails: ${await upsertTable(supabase, "allowed_emails", allowedEmails)}`);
  if (races.length) console.log(`  races: ${await upsertTable(supabase, "races", races)}`);
  if (sections.length) console.log(`  slider_sections: ${await upsertTable(supabase, "slider_sections", sections)}`);
  if (images.length) console.log(`  slider_images: ${await upsertTable(supabase, "slider_images", images)}`);

  console.log(`\n2/2 Compressed images…`);
  let uploaded = 0;
  let failed = 0;
  for (const entry of files) {
    const localPath = join(backupDir, entry.readable);
    const storagePath = entry.storage.replace(/^compressed\//, "");
    try {
      if (!existsSync(localPath)) throw new Error("local file missing");
      const buffer = readFileSync(localPath);
      const { error } = await supabase.storage.from("compressed").upload(storagePath, buffer, {
        upsert: true,
        contentType: storagePath.endsWith(".jpg") || storagePath.endsWith(".jpeg")
          ? "image/jpeg"
          : storagePath.endsWith(".png")
            ? "image/png"
            : "image/webp",
      });
      if (error) throw error;
      uploaded++;
      if (uploaded % 10 === 0) console.log(`  …${uploaded} uploaded`);
    } catch (e) {
      failed++;
      console.warn(`  failed: ${storagePath} (${e.message ?? e})`);
    }
  }
  console.log(`  uploaded ${uploaded} images${failed ? `, ${failed} failed` : ""}`);

  console.log(`\nRestore complete.`);
  console.log(`Team members sign in again at /auth; roles are restored from allowed_emails.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
