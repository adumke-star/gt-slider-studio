import { supabase } from "@/integrations/supabase/client";

const SIGNED_URL_TTL = 60 * 60 * 6; // 6h

export async function signedUrl(bucket: string, path: string): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL);
  return data?.signedUrl ?? null;
}

/** Download a storage object directly (no signed-URL indirection). Throws on failure. */
export async function downloadFile(bucket: string, path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw new Error(error.message);
  if (!data) throw new Error("empty response");
  return data;
}

export async function uploadFile(bucket: string, path: string, file: Blob, contentType?: string) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType: contentType ?? (file instanceof File ? file.type : "application/octet-stream"),
  });
  if (error) throw error;
}

export async function removeFile(bucket: string, path: string) {
  if (!path) return;
  await supabase.storage.from(bucket).remove([path]);
}
