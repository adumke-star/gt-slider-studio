import { supabase } from "@/integrations/supabase/client";
import { signedUrl, uploadFile, removeFile } from "@/lib/storage";

/**
 * Per-race backup & restore, entirely client-side.
 *
 * ZIP layout (all IDs and storage paths are kept verbatim so a restore is a
 * 1:1 re-insert without any remapping):
 *   manifest.json
 *   database/race.json        one races row
 *   database/sections.json    slider_sections rows
 *   database/images.json      slider_images rows
 *   database/comments.json    comments rows (restored best-effort)
 *   files/compressed/<storage path>
 *   files/originals/<storage path>
 */

type Row = Record<string, unknown>;

const BACKUP_VERSION = 1;

export type RaceBackupManifest = {
  version: number;
  kind: "race-backup";
  created_at: string;
  supabase_url: string | null;
  race: { id: string; name: string; series: string; race_date: string | null };
  counts: {
    sections: number;
    images: number;
    comments: number;
    files_saved: number;
    files_failed: number;
  };
};

// Loose client view so we can insert/select rows with explicit ids/timestamps
// without fighting the generated generics.
const db = supabase as unknown as {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => Promise<{ data: Row[] | null; error: { message: string } | null }>;
      in: (col: string, vals: string[]) => Promise<{ data: Row[] | null; error: { message: string } | null }>;
    };
    insert: (rows: Row | Row[]) => Promise<{ error: { message: string } | null }>;
    delete: () => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

function contentTypeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
    gif: "image/gif",
  };
  return map[ext] ?? "application/octet-stream";
}

export function backupFileName(raceName: string): string {
  const slug = raceName.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "race";
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
  return `race-backup-${slug}-${stamp}.zip`;
}

export async function createRaceBackupZip(
  raceId: string,
  onProgress?: (msg: string) => void,
): Promise<{ blob: Blob; manifest: RaceBackupManifest }> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  onProgress?.("Reading race data…");
  const [raceRes, sectionsRes, imagesRes] = await Promise.all([
    db.from("races").select("*").eq("id", raceId),
    db.from("slider_sections").select("*").eq("race_id", raceId),
    db.from("slider_images").select("*").eq("race_id", raceId),
  ]);
  if (raceRes.error) throw new Error(`races: ${raceRes.error.message}`);
  const race = raceRes.data?.[0];
  if (!race) throw new Error("Race not found.");
  if (sectionsRes.error) throw new Error(`slider_sections: ${sectionsRes.error.message}`);
  if (imagesRes.error) throw new Error(`slider_images: ${imagesRes.error.message}`);
  const sections = sectionsRes.data ?? [];
  const images = imagesRes.data ?? [];

  let comments: Row[] = [];
  const imageIds = images.map((i) => i.id as string);
  if (imageIds.length > 0) {
    const commentsRes = await db.from("comments").select("*").in("image_id", imageIds);
    comments = commentsRes.data ?? [];
  }

  zip.file("database/race.json", JSON.stringify(race, null, 2));
  zip.file("database/sections.json", JSON.stringify(sections, null, 2));
  zip.file("database/images.json", JSON.stringify(images, null, 2));
  zip.file("database/comments.json", JSON.stringify(comments, null, 2));

  // Storage files, keeping the original storage paths.
  let saved = 0;
  let failed = 0;
  const wanted: { bucket: "compressed" | "originals"; path: string }[] = [];
  for (const img of images) {
    if (img.compressed_path) wanted.push({ bucket: "compressed", path: img.compressed_path as string });
    if (img.original_path) wanted.push({ bucket: "originals", path: img.original_path as string });
  }
  for (const f of wanted) {
    onProgress?.(`File ${saved + failed + 1}/${wanted.length}…`);
    try {
      const url = await signedUrl(f.bucket, f.path);
      if (!url) throw new Error("no signed url");
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      zip.file(`files/${f.bucket}/${f.path}`, await res.blob());
      saved++;
    } catch (e) {
      console.warn("backup: failed to fetch", f.bucket, f.path, e);
      failed++;
    }
  }

  const manifest: RaceBackupManifest = {
    version: BACKUP_VERSION,
    kind: "race-backup",
    created_at: new Date().toISOString(),
    supabase_url: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? null,
    race: {
      id: race.id as string,
      name: race.name as string,
      series: race.series as string,
      race_date: (race.race_date as string | null) ?? null,
    },
    counts: {
      sections: sections.length,
      images: images.length,
      comments: comments.length,
      files_saved: saved,
      files_failed: failed,
    },
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  onProgress?.("Packing ZIP…");
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, manifest };
}

export type RaceBackupArchive = {
  manifest: RaceBackupManifest;
  race: Row;
  sections: Row[];
  images: Row[];
  comments: Row[];
  /** files/<bucket>/<storage path> → lazily extractable entry */
  files: { bucket: "compressed" | "originals"; path: string; getBlob: () => Promise<Blob> }[];
};

/** Parse and validate a backup ZIP without touching the database. */
export async function readRaceBackup(file: File | Blob): Promise<RaceBackupArchive> {
  const { default: JSZip } = await import("jszip");
  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error("Not a valid ZIP file.");
  }

  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) throw new Error("manifest.json missing — not a Slider Studio backup.");
  let manifest: RaceBackupManifest;
  try {
    manifest = JSON.parse(await manifestEntry.async("string"));
  } catch {
    throw new Error("manifest.json is not valid JSON.");
  }
  if (manifest.kind !== "race-backup" || !manifest.race?.id) {
    throw new Error("This ZIP is not a per-race backup (use a file created via the race backup button).");
  }
  if (manifest.version > BACKUP_VERSION) {
    throw new Error(`Backup version ${manifest.version} is newer than this app supports.`);
  }

  async function readJson(path: string): Promise<Row[] | Row | null> {
    const entry = zip.file(path);
    if (!entry) return null;
    return JSON.parse(await entry.async("string"));
  }

  const race = (await readJson("database/race.json")) as Row | null;
  if (!race || !race.id) throw new Error("database/race.json missing or empty.");
  const sections = ((await readJson("database/sections.json")) as Row[] | null) ?? [];
  const images = ((await readJson("database/images.json")) as Row[] | null) ?? [];
  const comments = ((await readJson("database/comments.json")) as Row[] | null) ?? [];

  const files: RaceBackupArchive["files"] = [];
  zip.forEach((relPath, entry) => {
    if (entry.dir) return;
    const m = relPath.match(/^files\/(compressed|originals)\/(.+)$/);
    if (!m) return;
    files.push({
      bucket: m[1] as "compressed" | "originals",
      path: m[2],
      getBlob: () => entry.async("blob"),
    });
  });

  return { manifest, race, sections, images, comments, files };
}

export async function raceExists(raceId: string): Promise<boolean> {
  const { data } = await db.from("races").select("id").eq("id", raceId);
  return (data ?? []).length > 0;
}

export type RestoreResult = {
  sections: number;
  images: number;
  comments_restored: number;
  comments_skipped: number;
  files_uploaded: number;
  files_failed: number;
};

/**
 * Restore a race from a parsed backup. If `replace` is set and the race still
 * exists, it is deleted first (rows via cascade, storage files explicitly).
 */
export async function restoreRaceBackup(
  archive: RaceBackupArchive,
  opts: { replace: boolean },
  onProgress?: (msg: string) => void,
): Promise<RestoreResult> {
  const raceId = archive.manifest.race.id;

  if (await raceExists(raceId)) {
    if (!opts.replace) throw new Error("Race already exists — confirm replacing it first.");
    onProgress?.("Deleting existing race…");
    const { data: imgs } = await db.from("slider_images").select("original_path, compressed_path").eq("race_id", raceId);
    await Promise.all((imgs ?? []).flatMap((img) => [
      img.original_path ? removeFile("originals", img.original_path as string).catch(() => {}) : Promise.resolve(),
      img.compressed_path ? removeFile("compressed", img.compressed_path as string).catch(() => {}) : Promise.resolve(),
    ]));
    const { error } = await db.from("races").delete().eq("id", raceId);
    if (error) throw new Error(`Could not delete existing race: ${error.message}`);
  }

  onProgress?.("Restoring race…");
  {
    const { error } = await db.from("races").insert(archive.race);
    if (error) throw new Error(`races: ${error.message}`);
  }
  if (archive.sections.length > 0) {
    onProgress?.("Restoring sections…");
    const { error } = await db.from("slider_sections").insert(archive.sections);
    if (error) throw new Error(`slider_sections: ${error.message}`);
  }
  if (archive.images.length > 0) {
    onProgress?.("Restoring slots…");
    const { error } = await db.from("slider_images").insert(archive.images);
    if (error) throw new Error(`slider_images: ${error.message}`);
  }

  // Comments are best-effort: they reference user accounts that may no longer exist.
  let commentsRestored = 0;
  let commentsSkipped = 0;
  for (const comment of archive.comments) {
    const { error } = await db.from("comments").insert(comment);
    if (error) commentsSkipped++;
    else commentsRestored++;
  }

  let uploaded = 0;
  let uploadFailed = 0;
  for (const f of archive.files) {
    onProgress?.(`Uploading file ${uploaded + uploadFailed + 1}/${archive.files.length}…`);
    try {
      const blob = await f.getBlob();
      await uploadFile(f.bucket, f.path, blob, contentTypeForPath(f.path));
      uploaded++;
    } catch (e) {
      console.warn("restore: upload failed", f.bucket, f.path, e);
      uploadFailed++;
    }
  }

  return {
    sections: archive.sections.length,
    images: archive.images.length,
    comments_restored: commentsRestored,
    comments_skipped: commentsSkipped,
    files_uploaded: uploaded,
    files_failed: uploadFailed,
  };
}
