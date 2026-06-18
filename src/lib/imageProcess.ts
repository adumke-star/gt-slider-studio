/**
 * Client-side image transformation using Canvas.
 * Target: 633 x 382, cover fill, center crop.
 * Iterative quality tuning to hit target size (KB).
 *
 * NOTE: This module is intentionally self-contained so it can be swapped
 * for a Node/Sharp implementation later without touching UI code.
 */

export type ExportFormat = "jpeg" | "png" | "webp" | "avif";

export interface TransformOptions {
  width?: number;
  height?: number;
  targetKB?: number;
  format: ExportFormat;
}

const DEFAULT_W = 633;
const DEFAULT_H = 382;

export async function fileToImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  } finally {
    // keep URL until image consumed by drawImage caller; revoke later
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

export function drawCover(
  img: HTMLImageElement,
  w = DEFAULT_W,
  h = DEFAULT_H,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, dx, dy, dw, dh);
  return canvas;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      type,
      quality,
    ),
  );
}

const MIME: Record<ExportFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

export async function transformImage(
  file: Blob,
  opts: TransformOptions,
): Promise<{ blob: Blob; mime: string; sizeKB: number }> {
  const img = await fileToImage(file);
  const canvas = drawCover(img, opts.width ?? DEFAULT_W, opts.height ?? DEFAULT_H);
  const mime = MIME[opts.format];

  // PNG is lossless: one pass
  if (opts.format === "png") {
    const blob = await canvasToBlob(canvas, mime);
    return { blob, mime, sizeKB: Math.round(blob.size / 1024) };
  }

  // Iterative quality search to hit targetKB (or use 0.82 default)
  const target = opts.targetKB ?? 0;
  let q = 0.85;
  let blob = await canvasToBlob(canvas, mime, q);

  if (target > 0) {
    let lo = 0.3;
    let hi = 0.95;
    for (let i = 0; i < 8; i++) {
      const kb = blob.size / 1024;
      if (Math.abs(kb - target) < target * 0.08) break;
      if (kb > target) hi = q;
      else lo = q;
      q = (lo + hi) / 2;
      blob = await canvasToBlob(canvas, mime, q);
    }
  }

  return { blob, mime, sizeKB: Math.round(blob.size / 1024) };
}

export function extForFormat(f: ExportFormat): string {
  return f === "jpeg" ? "jpg" : f;
}
