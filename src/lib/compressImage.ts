import { signedUrl, uploadFile, removeFile } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";

export type CompressibleImage = {
  original_path: string | null;
  compressed_path: string | null;
};

export type CompressSource = {
  blob: Blob;
  from: "originals" | "compressed";
  path: string;
};

export function isCompressEligible(img: CompressibleImage): boolean {
  return Boolean(img.original_path || img.compressed_path);
}

async function fetchBlobFromBucket(bucket: "originals" | "compressed", path: string): Promise<Blob | null> {
  const url = await signedUrl(bucket, path);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/** Load the originals master when the slot has one (never falls back to compressed). */
export async function fetchOriginalSource(img: CompressibleImage): Promise<CompressSource | null> {
  if (!img.original_path) return null;
  const blob = await fetchBlobFromBucket("originals", img.original_path);
  if (!blob) return null;
  return { blob, from: "originals", path: img.original_path };
}

/**
 * Source for compress: always originals when original_path is set (re-compress
 * re-renders from the master). Falls back to compressed only when no master exists.
 */
export async function fetchCompressSource(img: CompressibleImage): Promise<CompressSource | null> {
  if (img.original_path) {
    return fetchOriginalSource(img);
  }
  if (img.compressed_path) {
    const blob = await fetchBlobFromBucket("compressed", img.compressed_path);
    if (blob) return { blob, from: "compressed", path: img.compressed_path };
  }
  return null;
}

export type PassthroughImage = CompressibleImage & {
  id: string;
  race_id: string;
  section_id: string | null;
  area: string;
  status: string;
};

export type PassthroughResult =
  | { outcome: "ok"; path: string; format: string }
  | { outcome: "already-final" }
  | { outcome: "missing" }
  | { outcome: "unsupported"; mime: string }
  | { outcome: "failed"; message: string };

const FORMAT_BY_MIME: Record<string, { format: string; ext: string }> = {
  "image/jpeg": { format: "jpeg", ext: "jpg" },
  "image/png": { format: "png", ext: "png" },
  "image/webp": { format: "webp", ext: "webp" },
  "image/avif": { format: "avif", ext: "avif" },
};

const FORMAT_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

/**
 * Take an already-compressed upload as the final export asset:
 * copies the original blob 1:1 into the compressed bucket (no re-encoding)
 * and keeps the working copy in originals for later re-compression.
 */
export async function acceptWithoutCompression(img: PassthroughImage): Promise<PassthroughResult> {
  if (!img.original_path) {
    return img.compressed_path ? { outcome: "already-final" } : { outcome: "missing" };
  }

  const blob = await fetchBlobFromBucket("originals", img.original_path);
  if (!blob) return { outcome: "missing" };

  // Prefer the blob MIME; fall back to the file extension of the stored path.
  const extOfPath = img.original_path.split(".").pop()?.toLowerCase() ?? "";
  const mime = FORMAT_BY_MIME[blob.type] ? blob.type : (FORMAT_BY_EXT[extOfPath] ?? blob.type);
  const known = FORMAT_BY_MIME[mime];
  if (!known) return { outcome: "unsupported", mime: blob.type || extOfPath || "unknown" };

  const folder = img.section_id ?? img.area;
  const outPath = `${img.race_id}/${folder}/${img.id}.${known.ext}`;
  const prevCompressedPath = img.compressed_path;

  try {
    await uploadFile("compressed", outPath, blob, mime);
  } catch (e) {
    return { outcome: "failed", message: e instanceof Error ? e.message : "Upload failed" };
  }

  const { error } = await supabase.from("slider_images").update({
    compressed_path: outPath,
    compressed_size_kb: Math.round(blob.size / 1000),
    format: known.format,
    status: img.status === "live" ? "live" : "image_done",
  }).eq("id", img.id);

  if (error) {
    try {
      await removeFile("compressed", outPath);
    } catch (e) {
      console.warn("failed to roll back passthrough upload", outPath, e);
    }
    return { outcome: "failed", message: error.message };
  }

  if (prevCompressedPath && prevCompressedPath !== outPath) {
    try {
      await removeFile("compressed", prevCompressedPath);
    } catch (e) {
      console.warn("failed to delete previous compressed file", prevCompressedPath, e);
    }
  }

  return { outcome: "ok", path: outPath, format: known.format };
}
