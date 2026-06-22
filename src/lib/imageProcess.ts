/**
 * Client-side image transformation using Canvas.
 * Target: 633 x 382, cover fill, configurable focal crop.
 * Iterative quality + resolution tuning to STAY UNDER target size (KB).
 */

import type { FocalPoint } from "@/lib/cropUtils";
import { resolveFocal, SLIDER_OUTPUT_HEIGHT, SLIDER_OUTPUT_WIDTH } from "@/lib/cropUtils";

export type ExportFormat = "jpeg" | "png" | "webp" | "avif";

export interface TransformOptions {
  width?: number;
  height?: number;
  targetKB?: number;
  format: ExportFormat;
  focalPoint?: FocalPoint | null;
}

export interface TransformResult {
  blob: Blob;
  mime: string;
  sizeKB: number;
  width: number;
  height: number;
  /** True if output exceeds the requested target (only possible for PNG). */
  overTarget: boolean;
  /** True if the canvas resolution had to be reduced to honour the limit. */
  downscaled: boolean;
}

const DEFAULT_W = SLIDER_OUTPUT_WIDTH;
const DEFAULT_H = SLIDER_OUTPUT_HEIGHT;

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
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

export function drawCover(
  img: HTMLImageElement,
  w = DEFAULT_W,
  h = DEFAULT_H,
  focal: FocalPoint = { x: 0.5, y: 0.5 },
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
  const dx = dw > w ? focal.x * (w - dw) : (w - dw) / 2;
  const dy = dh > h ? focal.y * (h - dh) : (h - dh) / 2;
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
): Promise<TransformResult> {
  const img = await fileToImage(file);
  const baseW = opts.width ?? DEFAULT_W;
  const baseH = opts.height ?? DEFAULT_H;
  const mime = MIME[opts.format];
  const target = opts.targetKB ?? 0;
  const focal = resolveFocal(opts.focalPoint?.x ?? null, opts.focalPoint?.y ?? null);

  // PNG is lossless: try downscaling only when target is set.
  if (opts.format === "png") {
    let scale = 1;
    let canvas = drawCover(img, baseW, baseH, focal);
    let blob = await canvasToBlob(canvas, mime);
    if (target > 0) {
      while (blob.size / 1024 > target && scale > 0.35) {
        scale *= 0.85;
        canvas = drawCover(img, Math.round(baseW * scale), Math.round(baseH * scale), focal);
        blob = await canvasToBlob(canvas, mime);
      }
    }
    return {
      blob, mime,
      sizeKB: Math.round(blob.size / 1024),
      width: canvas.width, height: canvas.height,
      overTarget: target > 0 && blob.size / 1024 > target,
      downscaled: scale < 1,
    };
  }

  // Lossy formats: search quality first, then downscale if still too big.
  let scale = 1;
  let canvas = drawCover(img, baseW, baseH, focal);
  let q = 0.85;
  let blob = await canvasToBlob(canvas, mime, q);
  let downscaled = false;

  async function fitQualityUnderTarget() {
    if (target <= 0) return;
    let lo = 0.2;
    let hi = 0.95;
    q = 0.85;
    blob = await canvasToBlob(canvas, mime, q);
    // 10 iterations binary search → ~0.001 precision
    for (let i = 0; i < 10; i++) {
      const kb = blob.size / 1024;
      if (kb <= target && target - kb < target * 0.05) break; // close enough under
      if (kb > target) hi = q;
      else lo = q;
      q = (lo + hi) / 2;
      blob = await canvasToBlob(canvas, mime, q);
    }
    // Final pass: if still above, push quality to lo bound.
    if (blob.size / 1024 > target) {
      q = lo;
      blob = await canvasToBlob(canvas, mime, q);
    }
  }

  await fitQualityUnderTarget();

  // Still too big at minimum quality → reduce resolution iteratively.
  while (target > 0 && blob.size / 1024 > target && scale > 0.35) {
    scale *= 0.85;
    downscaled = true;
    canvas = drawCover(img, Math.round(baseW * scale), Math.round(baseH * scale), focal);
    await fitQualityUnderTarget();
  }

  return {
    blob, mime,
    sizeKB: Math.round(blob.size / 1024),
    width: canvas.width, height: canvas.height,
    overTarget: target > 0 && blob.size / 1024 > target,
    downscaled,
  };
}

export function extForFormat(f: ExportFormat): string {
  return f === "jpeg" ? "jpg" : f;
}
