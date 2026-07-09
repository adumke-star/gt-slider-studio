import { supabase } from "@/integrations/supabase/client";
import { downloadFile, signedUrl, uploadFile, removeFile } from "@/lib/storage";

/**
 * Backup & restore, entirely client-side. Two ZIP kinds share one layout:
 *
 * Per race ("race-backup"):
 *   manifest.json
 *   database/race.json        one races row
 *   database/sections.json    slider_sections rows
 *   database/images.json      slider_images rows
 *   database/comments.json    comments rows (restored best-effort)
 *   files/<bucket>/<storage path>
 *
 * Everything ("full-backup"):
 *   manifest.json
 *   database/races.json       all races rows
 *   database/sections.json    all slider_sections rows
 *   database/images.json      all slider_images rows
 *   database/comments.json    all comments (restored best-effort)
 *   database/allowed_emails.json  allowlist (restored best-effort)
 *   files/<bucket>/<storage path>
 *
 * All IDs and storage paths are kept verbatim so a restore is a 1:1
 * re-insert without any remapping.
 */

type Row = Record<string, unknown>;

const BACKUP_VERSION = 1;

type RaceSummary = { id: string; name: string; series: string; race_date: string | null };

export type RaceBackupManifest = {
  version: number;
  kind: "race-backup";
  created_at: string;
  supabase_url: string | null;
  race: RaceSummary;
  counts: {
    sections: number;
    images: number;
    comments: number;
    files_saved: number;
    files_failed: number;
  };
};

export type FullBackupManifest = {
  version: number;
  kind: "full-backup";
  created_at: string;
  supabase_url: string | null;
  races: RaceSummary[];
  counts: {
    races: number;
    sections: number;
    images: number;
    comments: number;
    allowed_emails: number;
    files_saved: number;
    files_failed: number;
  };
};

type SelectResult = Promise<{ data: Row[] | null; error: { message: string } | null }>;

// Loose client view so we can insert/select rows with explicit ids/timestamps
// without fighting the generated generics.
const db = supabase as unknown as {
  from: (table: string) => {
    select: (cols: string) => SelectResult & {
      eq: (col: string, val: string) => SelectResult;
      in: (col: string, vals: string[]) => SelectResult;
      range: (from: number, to: number) => SelectResult;
    };
    insert: (rows: Row | Row[]) => Promise<{ error: { message: string } | null }>;
    delete: () => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

async function fetchAll(table: string): Promise<Row[]> {
  const pageSize = 1000;
  let from = 0;
  const rows: Row[] = [];
  for (;;) {
    const { data, error } = await db.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function contentTypeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    jfif: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
    gif: "image/gif",
  };
  // Buckets only accept raster-image MIME types (see security hardening
  // migration) — application/octet-stream would be rejected on restore, so
  // default unknown extensions to JPEG. Everything the app stores is an image.
  return map[ext] ?? "image/jpeg";
}

function dateStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

export function backupFileName(raceName: string): string {
  const slug = raceName.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "race";
  return `race-backup-${slug}-${dateStamp()}.zip`;
}

export function fullBackupFileName(): string {
  return `full-backup-${dateStamp()}.zip`;
}

type ZipLike = { file: (path: string, content: Blob | string) => unknown };

export type FileFailure = { bucket: string; path: string; error: string };

/** Direct storage download with a signed-URL fetch as fallback, one retry each. */
async function fetchStorageBlob(bucket: "compressed" | "originals", path: string): Promise<Blob> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await downloadFile(bucket, path);
    } catch (e) {
      lastError = e;
    }
    try {
      const url = await signedUrl(bucket, path);
      if (!url) throw new Error("no signed url");
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.blob();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Download every referenced storage file into files/<bucket>/<path> inside the ZIP. */
async function addStorageFilesToZip(
  zip: ZipLike,
  images: Row[],
  onProgress?: (msg: string) => void,
): Promise<{ saved: number; failed: number; failures: FileFailure[] }> {
  const wanted: { bucket: "compressed" | "originals"; path: string }[] = [];
  for (const img of images) {
    if (img.compressed_path) wanted.push({ bucket: "compressed", path: img.compressed_path as string });
    if (img.original_path) wanted.push({ bucket: "originals", path: img.original_path as string });
  }
  let saved = 0;
  const failures: FileFailure[] = [];
  for (const f of wanted) {
    onProgress?.(`File ${saved + failures.length + 1}/${wanted.length}…`);
    try {
      zip.file(`files/${f.bucket}/${f.path}`, await fetchStorageBlob(f.bucket, f.path));
      saved++;
    } catch (e) {
      const error = (e as Error).message ?? String(e);
      console.warn("backup: failed to fetch", f.bucket, f.path, error);
      failures.push({ bucket: f.bucket, path: f.path, error });
    }
  }
  return { saved, failed: failures.length, failures };
}

function raceSummary(race: Row): RaceSummary {
  return {
    id: race.id as string,
    name: race.name as string,
    series: race.series as string,
    race_date: (race.race_date as string | null) ?? null,
  };
}

export async function createRaceBackupZip(
  raceId: string,
  onProgress?: (msg: string) => void,
): Promise<{ blob: Blob; manifest: RaceBackupManifest; failures: FileFailure[] }> {
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
  const { saved, failed, failures } = await addStorageFilesToZip(zip, images, onProgress);

  const manifest: RaceBackupManifest = {
    version: BACKUP_VERSION,
    kind: "race-backup",
    created_at: new Date().toISOString(),
    supabase_url: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? null,
    race: raceSummary(race),
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
  return { blob, manifest, failures };
}

export async function createFullBackupZip(
  onProgress?: (msg: string) => void,
): Promise<{ blob: Blob; manifest: FullBackupManifest; failures: FileFailure[] }> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  onProgress?.("Reading database…");
  const [races, sections, images, comments, allowedEmails] = await Promise.all([
    fetchAll("races"),
    fetchAll("slider_sections"),
    fetchAll("slider_images"),
    fetchAll("comments"),
    fetchAll("allowed_emails").catch(() => [] as Row[]),
  ]);
  if (races.length === 0) throw new Error("No races found — nothing to back up.");

  zip.file("database/races.json", JSON.stringify(races, null, 2));
  zip.file("database/sections.json", JSON.stringify(sections, null, 2));
  zip.file("database/images.json", JSON.stringify(images, null, 2));
  zip.file("database/comments.json", JSON.stringify(comments, null, 2));
  zip.file("database/allowed_emails.json", JSON.stringify(allowedEmails, null, 2));

  const { saved, failed, failures } = await addStorageFilesToZip(zip, images, onProgress);

  const manifest: FullBackupManifest = {
    version: BACKUP_VERSION,
    kind: "full-backup",
    created_at: new Date().toISOString(),
    supabase_url: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? null,
    races: races.map(raceSummary),
    counts: {
      races: races.length,
      sections: sections.length,
      images: images.length,
      comments: comments.length,
      allowed_emails: allowedEmails.length,
      files_saved: saved,
      files_failed: failed,
    },
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  onProgress?.("Packing ZIP…");
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, manifest, failures };
}

export type ArchiveFile = { bucket: "compressed" | "originals"; path: string; getBlob: () => Promise<Blob> };

export type RaceBackupArchive = {
  kind: "race";
  manifest: RaceBackupManifest;
  race: Row;
  sections: Row[];
  images: Row[];
  comments: Row[];
  files: ArchiveFile[];
};

export type FullBackupArchive = {
  kind: "full";
  manifest: FullBackupManifest;
  races: Row[];
  sections: Row[];
  images: Row[];
  comments: Row[];
  allowedEmails: Row[];
  files: ArchiveFile[];
};

export type BackupArchive = RaceBackupArchive | FullBackupArchive;

/** Parse and validate a backup ZIP (per-race or full) without touching the database. */
export async function readBackup(file: File | Blob): Promise<BackupArchive> {
  const { default: JSZip } = await import("jszip");
  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error("Not a valid ZIP file.");
  }

  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) throw new Error("manifest.json missing — not a Slider Studio backup.");
  let manifest: RaceBackupManifest | FullBackupManifest;
  try {
    manifest = JSON.parse(await manifestEntry.async("string"));
  } catch {
    throw new Error("manifest.json is not valid JSON.");
  }
  if (manifest.kind !== "race-backup" && manifest.kind !== "full-backup") {
    throw new Error("This ZIP is not a Slider Studio backup.");
  }
  if (manifest.version > BACKUP_VERSION) {
    throw new Error(`Backup version ${manifest.version} is newer than this app supports.`);
  }

  async function readJson(path: string): Promise<Row[] | Row | null> {
    const entry = zip.file(path);
    if (!entry) return null;
    return JSON.parse(await entry.async("string"));
  }

  const files: ArchiveFile[] = [];
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

  const sections = ((await readJson("database/sections.json")) as Row[] | null) ?? [];
  const images = ((await readJson("database/images.json")) as Row[] | null) ?? [];
  const comments = ((await readJson("database/comments.json")) as Row[] | null) ?? [];

  if (manifest.kind === "race-backup") {
    if (!manifest.race?.id) throw new Error("Backup manifest is missing the race entry.");
    const race = (await readJson("database/race.json")) as Row | null;
    if (!race || !race.id) throw new Error("database/race.json missing or empty.");
    return { kind: "race", manifest, race, sections, images, comments, files };
  }

  const races = ((await readJson("database/races.json")) as Row[] | null) ?? [];
  if (races.length === 0) throw new Error("database/races.json missing or empty.");
  const allowedEmails = ((await readJson("database/allowed_emails.json")) as Row[] | null) ?? [];
  return { kind: "full", manifest, races, sections, images, comments, allowedEmails, files };
}

export async function raceExists(raceId: string): Promise<boolean> {
  const { data } = await db.from("races").select("id").eq("id", raceId);
  return (data ?? []).length > 0;
}

/** Which of the given race ids currently exist in the database. */
export async function existingRaceIds(raceIds: string[]): Promise<Set<string>> {
  if (raceIds.length === 0) return new Set();
  const { data } = await db.from("races").select("id").in("id", raceIds);
  return new Set((data ?? []).map((r) => r.id as string));
}

/** Delete a race: storage files explicitly, DB rows via cascade. */
async function deleteRaceCompletely(raceId: string): Promise<void> {
  const { data: imgs } = await db.from("slider_images").select("original_path, compressed_path").eq("race_id", raceId);
  await Promise.all((imgs ?? []).flatMap((img) => [
    img.original_path ? removeFile("originals", img.original_path as string).catch(() => {}) : Promise.resolve(),
    img.compressed_path ? removeFile("compressed", img.compressed_path as string).catch(() => {}) : Promise.resolve(),
  ]));
  const { error } = await db.from("races").delete().eq("id", raceId);
  if (error) throw new Error(`Could not delete existing race: ${error.message}`);
}

const INSERT_CHUNK = 500;

async function insertChunked(table: string, rows: Row[]): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const { error } = await db.from(table).insert(rows.slice(i, i + INSERT_CHUNK));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

/** Insert rows one by one, tolerating failures (FK to deleted users, duplicates). */
async function insertBestEffort(table: string, rows: Row[]): Promise<{ ok: number; skipped: number }> {
  let ok = 0;
  let skipped = 0;
  for (const row of rows) {
    const { error } = await db.from(table).insert(row);
    if (error) skipped++;
    else ok++;
  }
  return { ok, skipped };
}

async function uploadArchiveFiles(
  files: ArchiveFile[],
  onProgress?: (msg: string) => void,
): Promise<{ uploaded: number; failed: number; failures: FileFailure[] }> {
  let uploaded = 0;
  const failures: FileFailure[] = [];
  for (const f of files) {
    onProgress?.(`Uploading file ${uploaded + failures.length + 1}/${files.length}…`);
    let lastError = "";
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      try {
        const blob = await f.getBlob();
        await uploadFile(f.bucket, f.path, blob, contentTypeForPath(f.path));
        ok = true;
      } catch (e) {
        lastError = (e as Error).message ?? String(e);
      }
    }
    if (ok) {
      uploaded++;
    } else {
      console.warn("restore: upload failed", f.bucket, f.path, lastError);
      failures.push({ bucket: f.bucket, path: f.path, error: lastError });
    }
  }
  return { uploaded, failed: failures.length, failures };
}

export type RestoreResult = {
  sections: number;
  images: number;
  comments_restored: number;
  comments_skipped: number;
  files_uploaded: number;
  files_failed: number;
  file_failures: FileFailure[];
};

/** How many storage files the image rows reference (original + compressed). */
export function expectedFileCount(images: Row[]): number {
  let n = 0;
  for (const img of images) {
    if (img.original_path) n++;
    if (img.compressed_path) n++;
  }
  return n;
}

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
    await deleteRaceCompletely(raceId);
  }

  // Upload files before inserting rows: realtime reloads the dashboard as soon
  // as the rows appear, and previews fetched before the files exist stay blank.
  const files = await uploadArchiveFiles(archive.files, onProgress);

  onProgress?.("Restoring race…");
  {
    const { error } = await db.from("races").insert(archive.race);
    if (error) throw new Error(`races: ${error.message}`);
  }
  if (archive.sections.length > 0) {
    onProgress?.("Restoring sections…");
    await insertChunked("slider_sections", archive.sections);
  }
  if (archive.images.length > 0) {
    onProgress?.("Restoring slots…");
    await insertChunked("slider_images", archive.images);
  }

  // Comments are best-effort: they reference user accounts that may no longer exist.
  const comments = await insertBestEffort("comments", archive.comments);

  return {
    sections: archive.sections.length,
    images: archive.images.length,
    comments_restored: comments.ok,
    comments_skipped: comments.skipped,
    files_uploaded: files.uploaded,
    files_failed: files.failed,
    file_failures: files.failures,
  };
}

export type FullRestoreResult = {
  races_replaced: number;
  races_created: number;
  sections: number;
  images: number;
  comments_restored: number;
  comments_skipped: number;
  allowed_emails_restored: number;
  allowed_emails_skipped: number;
  files_uploaded: number;
  files_failed: number;
  file_failures: FileFailure[];
};

/**
 * Restore every race in a full backup: races that still exist are deleted and
 * replaced, missing ones are recreated. Races that are not in the backup are
 * left untouched.
 */
export async function restoreFullBackup(
  archive: FullBackupArchive,
  onProgress?: (msg: string) => void,
): Promise<FullRestoreResult> {
  const backupIds = archive.races.map((r) => r.id as string);
  const existing = await existingRaceIds(backupIds);

  let deleted = 0;
  for (const id of backupIds) {
    if (!existing.has(id)) continue;
    deleted++;
    onProgress?.(`Deleting existing race ${deleted}/${existing.size}…`);
    await deleteRaceCompletely(id);
  }

  // Upload files before inserting rows: realtime reloads the dashboard as soon
  // as the rows appear, and previews fetched before the files exist stay blank.
  const files = await uploadArchiveFiles(archive.files, onProgress);

  onProgress?.("Restoring races…");
  await insertChunked("races", archive.races);
  if (archive.sections.length > 0) {
    onProgress?.("Restoring sections…");
    await insertChunked("slider_sections", archive.sections);
  }
  if (archive.images.length > 0) {
    onProgress?.("Restoring slots…");
    await insertChunked("slider_images", archive.images);
  }

  onProgress?.("Restoring comments & allowlist…");
  const comments = await insertBestEffort("comments", archive.comments);
  // Allowlist rows that already exist fail on the unique email and are skipped.
  const allowed = await insertBestEffort("allowed_emails", archive.allowedEmails);

  return {
    races_replaced: existing.size,
    races_created: backupIds.length - existing.size,
    sections: archive.sections.length,
    images: archive.images.length,
    comments_restored: comments.ok,
    comments_skipped: comments.skipped,
    allowed_emails_restored: allowed.ok,
    allowed_emails_skipped: allowed.skipped,
    files_uploaded: files.uploaded,
    files_failed: files.failed,
    file_failures: files.failures,
  };
}
