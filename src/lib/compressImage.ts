import { signedUrl } from "@/lib/storage";

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

export async function fetchCompressSource(img: CompressibleImage): Promise<CompressSource | null> {
  if (img.original_path) {
    const blob = await fetchBlobFromBucket("originals", img.original_path);
    if (blob) return { blob, from: "originals", path: img.original_path };
  }
  if (img.compressed_path) {
    const blob = await fetchBlobFromBucket("compressed", img.compressed_path);
    if (blob) return { blob, from: "compressed", path: img.compressed_path };
  }
  return null;
}
