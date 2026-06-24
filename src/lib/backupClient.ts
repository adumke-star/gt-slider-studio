import { supabase } from "@/integrations/supabase/client";
import { signedUrl } from "@/lib/storage";

/**
 * Client-side backup (admin only). Mirrors scripts/backup.mjs but runs in the browser
 * using the signed-in admin's session — no service-role key needed.
 *
 * Produces a single ZIP:
 *   database/<table>.json
 *   files/<series>/<race>/<section>/<image-name>.<ext>   (compressed images)
 *   manifest.json
 */

type Row = Record<string, unknown>;

const TABLES = [
  "allowed_emails",
  "profiles",
  "user_roles",
  "races",
  "slider_sections",
  "slider_images",
  "comments",
  "comment_mentions",
  "image_audit_log",
] as const;

// Loose view of the client so we can query tables by dynamic name without fighting generics.
const db = supabase as unknown as {
  from: (table: string) => {
    select: (cols: string) => {
      range: (
        from: number,
        to: number,
      ) => Promise<{ data: Row[] | null; error: { message: string } | null }>;
    };
  };
};

function sanitize(name: unknown, fallback: string): string {
  const cleaned = String(name ?? "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/^\.+/, "")
    .replace(/\.+$/, "")
    .trim();
  return cleaned || fallback;
}

function extFromFormat(format: unknown): string {
  if (!format) return "webp";
  return format === "jpeg" ? "jpg" : String(format);
}

async function fetchAll(table: string): Promise<Row[]> {
  const pageSize = 1000;
  let from = 0;
  const rows: Row[] = [];
  for (;;) {
    const { data, error } = await db.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = data ?? [];
    if (batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export type BackupResult = {
  blob: Blob;
  counts: {
    races: number;
    sections: number;
    images_with_compressed: number;
    images_saved: number;
    images_failed: number;
  };
};

export async function createBackupZip(onProgress?: (msg: string) => void): Promise<BackupResult> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  // 1) Database tables → JSON
  const tableData: Record<string, Row[]> = {};
  for (const table of TABLES) {
    onProgress?.(`Reading ${table}…`);
    try {
      const rows = await fetchAll(table);
      tableData[table] = rows;
      zip.file(`database/${table}.json`, JSON.stringify(rows, null, 2));
    } catch {
      tableData[table] = [];
      zip.file(`database/${table}.json`, "[]");
    }
  }

  // 2) Lookups
  const races = new Map((tableData.races ?? []).map((r) => [r.id as string, r]));
  const sections = new Map((tableData.slider_sections ?? []).map((s) => [s.id as string, s]));
  const images = (tableData.slider_images ?? []).filter((i) => i.compressed_path);

  // 3) Compressed images → readable folders
  const usedPerDir = new Map<string, Map<string, number>>();
  const uniqueName = (dirKey: string, name: string): string => {
    const seen = usedPerDir.get(dirKey) ?? new Map<string, number>();
    const c = seen.get(name) ?? 0;
    seen.set(name, c + 1);
    usedPerDir.set(dirKey, seen);
    if (c === 0) return name;
    const dot = name.lastIndexOf(".");
    return dot < 0 ? `${name}-${c}` : `${name.slice(0, dot)}-${c}${name.slice(dot)}`;
  };

  const mapping: { readable: string; storage: string; image_id: string }[] = [];
  let saved = 0;
  let failed = 0;

  for (const img of images) {
    const race = races.get(img.race_id as string);
    const section = img.section_id ? sections.get(img.section_id as string) : null;

    const seriesFolder = sanitize(race?.series, "unknown-series").toUpperCase();
    const raceFolder = sanitize(race?.name, String(img.race_id).slice(0, 8));
    const sectionFolder = sanitize(section?.name, String(img.area ?? "misc").toUpperCase());

    const ext = extFromFormat(img.format);
    const baseName = sanitize(
      img.title,
      `${img.area ?? "img"}-${String(img.position ?? 0).padStart(2, "0")}`,
    );
    const dirKey = `${seriesFolder}/${raceFolder}/${sectionFolder}`;
    const fileName = uniqueName(dirKey, `${baseName}.${ext}`);

    onProgress?.(`Image ${saved + failed + 1}/${images.length}…`);
    try {
      const url = await signedUrl("compressed", img.compressed_path as string);
      if (!url) throw new Error("no signed url");
      const blob = await (await fetch(url)).blob();
      zip.file(`files/${dirKey}/${fileName}`, blob);
      mapping.push({
        readable: `files/${dirKey}/${fileName}`,
        storage: `compressed/${img.compressed_path as string}`,
        image_id: img.id as string,
      });
      saved++;
    } catch {
      failed++;
    }
  }

  // 4) Manifest
  const manifest = {
    created_at: new Date().toISOString(),
    supabase_url: import.meta.env.VITE_SUPABASE_URL ?? null,
    source: "admin-ui",
    counts: {
      races: (tableData.races ?? []).length,
      sections: (tableData.slider_sections ?? []).length,
      images_total: (tableData.slider_images ?? []).length,
      images_with_compressed: images.length,
      images_saved: saved,
      images_failed: failed,
    },
    tables: Object.fromEntries(TABLES.map((t) => [t, (tableData[t] ?? []).length])),
    files: mapping,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  onProgress?.("Packing ZIP…");
  const blob = await zip.generateAsync({ type: "blob" });

  return {
    blob,
    counts: {
      races: manifest.counts.races,
      sections: manifest.counts.sections,
      images_with_compressed: images.length,
      images_saved: saved,
      images_failed: failed,
    },
  };
}
