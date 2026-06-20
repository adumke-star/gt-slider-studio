// Browser-side image downscaling before upload.
// Keeps aspect ratio, exports as JPEG. Skips small files and non-images.

export async function resizeImageFile(
  file: File,
  maxDimension = 2000,
  quality = 0.92,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // GIF/SVG/etc — leave untouched
  if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) return file;

  const bitmap = await loadBitmap(file);
  const { width, height } = bitmap;
  const longest = Math.max(width, height);

  // Already small enough — skip
  if (longest <= maxDimension) {
    bitmap.close?.();
    return file;
  }

  const scale = maxDimension / longest;
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) return file;

  // If the resize somehow grew the file, keep original
  if (blob.size >= file.size) return file;

  const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
}

async function loadBitmap(file: File): Promise<{ width: number; height: number; close?: () => void } & CanvasImageSource> {
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(file);
    return bmp as unknown as ImageBitmap & { close?: () => void };
  }
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = url;
  });
  return Object.assign(img, {
    width: img.naturalWidth,
    height: img.naturalHeight,
    close: () => URL.revokeObjectURL(url),
  });
}
