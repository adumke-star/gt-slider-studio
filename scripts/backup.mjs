/**
 * Local backup for GT Slider Studio.
 *
 * Writes a timestamped folder under backups/ containing:
 *   - database/<table>.json   (all public tables, one JSON array per table)
 *   - files/<series>/<race>/<section>/<image-name>.<ext>  (compressed images, readable layout)
 *   - manifest.json           (summary + readable-path -> storage-path mapping)
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (gitignored).
 * The service-role key is needed because the storage buckets are private.
 *
 * Usage: npm run backup
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
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

if (!SUPABASE_URL) {
  console.error("Missing SUPABASE_URL in .env — run: bash scripts/fresh-start.sh");
  process.exit(1);
}

if (!SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.");
  console.error("");
  console.error("The storage buckets are private, so a service-role key is required to read them.");
  console.error("Get it from: Supabase Dashboard → Project Settings → API → 'service_role' secret.");
  console.error("Then add this line to your .env (which is gitignored):");
  console.error("  SUPABASE_SERVICE_ROLE_KEY=\"<your-service-role-key>\"");
  process.exit(1);
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

// Replace characters that are illegal/awkward in file paths; keep spaces for readability.
function sanitize(name, fallback) {
  const cleaned = String(name ?? "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "")
    .trim();
  return cleaned || fallback;
}

function extFromFormat(format) {
  if (!format) return "webp";
  return format === "jpeg" ? "jpg" : format;
}

function timestampFolder() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

async function fetchAll(supabase, table) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = timestampFolder();
  const outDir = join(root, "backups", stamp);
  const dbDir = join(outDir, "database");
  const filesDir = join(outDir, "files");
  mkdirSync(dbDir, { recursive: true });
  mkdirSync(filesDir, { recursive: true });

  console.log(`Backup → backups/${stamp}\n`);

  // 1) Database tables → JSON
  console.log("1/3 Database tables…");
  const tableData = {};
  for (const table of PUBLIC_TABLES) {
    try {
      const rows = await fetchAll(supabase, table);
      tableData[table] = rows;
      writeFileSync(join(dbDir, `${table}.json`), JSON.stringify(rows, null, 2));
      console.log(`  ${table}: ${rows.length} rows`);
    } catch (e) {
      tableData[table] = [];
      console.warn(`  ${table}: skipped (${e.message})`);
    }
  }

  // 2) Build readable lookup maps
  const races = new Map((tableData.races ?? []).map((r) => [r.id, r]));
  const sections = new Map((tableData.slider_sections ?? []).map((s) => [s.id, s]));
  const images = (tableData.slider_images ?? []).filter((i) => i.compressed_path);

  // 3) Download compressed images into readable folders
  console.log("\n2/3 Compressed images…");
  const usedPerDir = new Map();
  const uniqueName = (dirKey, name) => {
    const seen = usedPerDir.get(dirKey) ?? new Map();
    const c = seen.get(name) ?? 0;
    seen.set(name, c + 1);
    usedPerDir.set(dirKey, seen);
    if (c === 0) return name;
    const dot = name.lastIndexOf(".");
    return dot < 0 ? `${name}-${c}` : `${name.slice(0, dot)}-${c}${name.slice(dot)}`;
  };

  const mapping = [];
  let saved = 0;
  let failed = 0;

  for (const img of images) {
    const race = races.get(img.race_id);
    const section = img.section_id ? sections.get(img.section_id) : null;

    const seriesFolder = sanitize(race?.series, "unknown-series").toUpperCase();
    const raceFolder = sanitize(race?.name, img.race_id.slice(0, 8));
    const sectionFolder = sanitize(section?.name, (img.area || "misc").toUpperCase());

    const ext = extFromFormat(img.format);
    const baseName = sanitize(
      img.title,
      `${img.area || "img"}-${String(img.position ?? 0).padStart(2, "0")}`,
    );
    const dirKey = join(seriesFolder, raceFolder, sectionFolder);
    const fileName = uniqueName(dirKey, `${baseName}.${ext}`);

    const targetDir = join(filesDir, seriesFolder, raceFolder, sectionFolder);
    const targetPath = join(targetDir, fileName);

    try {
      const { data: blob, error } = await supabase.storage.from("compressed").download(img.compressed_path);
      if (error) throw error;
      mkdirSync(targetDir, { recursive: true });
      const buffer = Buffer.from(await blob.arrayBuffer());
      writeFileSync(targetPath, buffer);
      mapping.push({
        readable: join("files", seriesFolder, raceFolder, sectionFolder, fileName),
        storage: `compressed/${img.compressed_path}`,
        image_id: img.id,
      });
      saved++;
      if (saved % 10 === 0) console.log(`  …${saved} images`);
    } catch (e) {
      failed++;
      console.warn(`  failed: ${img.compressed_path} (${e.message ?? e})`);
    }
  }
  console.log(`  saved ${saved} images${failed ? `, ${failed} failed` : ""}`);

  // 4) Manifest
  console.log("\n3/3 Manifest…");
  const manifest = {
    created_at: new Date().toISOString(),
    supabase_url: SUPABASE_URL,
    counts: {
      races: (tableData.races ?? []).length,
      sections: (tableData.slider_sections ?? []).length,
      images_total: (tableData.slider_images ?? []).length,
      images_with_compressed: images.length,
      images_saved: saved,
      images_failed: failed,
    },
    tables: Object.fromEntries(PUBLIC_TABLES.map((t) => [t, (tableData[t] ?? []).length])),
    files: mapping,
  };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`  manifest.json written`);

  console.log(`\nDone. Backup at backups/${stamp}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
