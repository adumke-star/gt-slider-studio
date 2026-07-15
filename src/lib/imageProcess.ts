/**
 * Client-side image transformation using Canvas.
 * Target: 633 x 382, cover fill, configurable focal crop.
 * Iterative quality + resolution tuning to STAY UNDER target size (KB).
 */

import type { CropAreaPercentages, FocalPoint } from "@/lib/cropUtils";
import {
  croppedAreaPixelsFromPercentages,
  drawExtractedCrop,
  resolveFocal,
  SLIDER_OUTPUT_HEIGHT,
  SLIDER_OUTPUT_WIDTH,
} from "@/lib/cropUtils";
import { encodeCanvasMozJpeg } from "@/lib/mozjpegEncode";

export type ExportFormat = "jpeg" | "png" | "webp" | "avif";

/** JPEG encode path used for the final output blob. */
export type JpegEncoder = "mozjpeg" | "canvas";

export interface TransformOptions {
  width?: number;
  height?: number;
  targetKB?: number;
  format: ExportFormat;
  cropArea?: CropAreaPercentages | null;
  focalPoint?: FocalPoint | null;
  /** Unsharp-mask strength (0 = off, ~0.2 = mild). Applied at final resolution before encode. */
  sharpen?: number;
  /**
   * Encode at this quality first; targetKB is only a hard ceiling (no resolution downscale).
   * Used for lightbox export. Compress keeps the legacy KB-fit mode when omitted.
   */
  qualityFirst?: number;
  /** Lowest quality step when trimming to fit targetKB in quality-first mode. */
  minQuality?: number;
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
  /** Set when format is jpeg — MozJPEG WASM or browser canvas fallback. */
  jpegEncoder?: JpegEncoder;
}

const DEFAULT_W = SLIDER_OUTPUT_WIDTH;
const DEFAULT_H = SLIDER_OUTPUT_HEIGHT;

// Decimal kB to match the size shown by the macOS Finder (1 KB = 1000 bytes).
const BYTES_PER_KB = 1000;

/** Quality-first encode defaults (slider 633 + lightbox 960). */
export const ENCODE_QUALITY = 0.92;
export const ENCODE_MIN_QUALITY = 0.75;
export const ENCODE_SHARPEN_AMOUNT = 0.22;

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

async function encodeCanvas(
  canvas: HTMLCanvasElement,
  format: ExportFormat,
  quality = 0.85,
): Promise<{ blob: Blob; jpegEncoder?: JpegEncoder }> {
  if (format === "jpeg") {
    try {
      const blob = await encodeCanvasMozJpeg(canvas, quality);
      return { blob, jpegEncoder: "mozjpeg" };
    } catch (e) {
      console.warn("MozJPEG encode failed, falling back to canvas:", e);
      const blob = await canvasToBlob(canvas, MIME.jpeg, quality);
      return { blob, jpegEncoder: "canvas" };
    }
  }
  const blob = await canvasToBlob(canvas, MIME[format], quality);
  return { blob };
}

const MIME: Record<ExportFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

function renderBaseCanvas(
  img: HTMLImageElement,
  baseW: number,
  baseH: number,
  cropArea: CropAreaPercentages | null | undefined,
  focal: FocalPoint,
): HTMLCanvasElement {
  if (cropArea) {
    const pixels = croppedAreaPixelsFromPercentages(
      cropArea,
      img.naturalWidth,
      img.naturalHeight,
    );
    return drawExtractedCrop(img, pixels, baseW, baseH);
  }
  return drawCover(img, baseW, baseH, focal);
}

/** Mild unsharp mask — compensates for downscale/JPEG softness. amount ~0.15–0.3. */
export function applyUnsharpMask(
  canvas: HTMLCanvasElement,
  amount: number,
  radiusPx = 1,
): void {
  if (amount <= 0) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width: w, height: h } = canvas;
  const original = ctx.getImageData(0, 0, w, h);

  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = w;
  blurCanvas.height = h;
  const bctx = blurCanvas.getContext("2d");
  if (!bctx) return;

  bctx.filter = `blur(${radiusPx}px)`;
  bctx.drawImage(canvas, 0, 0);
  bctx.filter = "none";

  const blurred = bctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const a = Math.min(1, Math.max(0, amount));

  for (let i = 0; i < original.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const o = original.data[i + c];
      const b = blurred.data[i + c];
      out.data[i + c] = Math.min(255, Math.max(0, Math.round(o + a * (o - b))));
    }
    out.data[i + 3] = original.data[i + 3];
  }
  ctx.putImageData(out, 0, 0);
}

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
  const cropArea = opts.cropArea ?? null;

  // PNG is lossless: try downscaling only when target is set.
  if (opts.format === "png") {
    let scale = 1;
    let canvas = renderBaseCanvas(img, baseW, baseH, cropArea, focal);
    let blob = await canvasToBlob(canvas, mime);
    if (target > 0) {
      while (blob.size / BYTES_PER_KB > target && scale > 0.2) {
        scale *= 0.85;
        canvas = renderBaseCanvas(
          img,
          Math.round(baseW * scale),
          Math.round(baseH * scale),
          cropArea,
          focal,
        );
        blob = await canvasToBlob(canvas, mime);
      }
    }
    return {
      blob, mime,
      sizeKB: Math.round(blob.size / BYTES_PER_KB),
      width: canvas.width, height: canvas.height,
      overTarget: target > 0 && blob.size / BYTES_PER_KB > target,
      downscaled: scale < 1,
    };
  }

  // Quality-first: fixed resolution, encode at qualityFirst, KB is only a ceiling.
  if (opts.qualityFirst != null && opts.qualityFirst > 0) {
    const canvas = renderBaseCanvas(img, baseW, baseH, cropArea, focal);
    if (opts.sharpen && opts.sharpen > 0) {
      applyUnsharpMask(canvas, opts.sharpen);
    }
    const minQ = opts.minQuality ?? 0.75;
    let q = Math.min(1, opts.qualityFirst);
    let jpegEncoder: JpegEncoder | undefined;
    let encoded = await encodeCanvas(canvas, opts.format, q);
    let blob = encoded.blob;
    if (opts.format === "jpeg") jpegEncoder = encoded.jpegEncoder;

    if (target > 0) {
      while (blob.size / BYTES_PER_KB > target && q > minQ + 0.001) {
        q = Math.max(minQ, Math.round((q - 0.05) * 100) / 100);
        encoded = await encodeCanvas(canvas, opts.format, q);
        blob = encoded.blob;
        if (opts.format === "jpeg") jpegEncoder = encoded.jpegEncoder;
      }
    }

    return {
      blob, mime,
      sizeKB: Math.round(blob.size / BYTES_PER_KB),
      width: canvas.width, height: canvas.height,
      overTarget: target > 0 && blob.size / BYTES_PER_KB > target,
      downscaled: false,
      jpegEncoder,
    };
  }

  // Lossy formats (legacy): search quality to fit KB, then downscale if still too big.
  let scale = 1;
  let canvas = renderBaseCanvas(img, baseW, baseH, cropArea, focal);
  let q = 0.85;
  let jpegEncoder: JpegEncoder | undefined;
  let encoded = await encodeCanvas(canvas, opts.format, q);
  let blob = encoded.blob;
  if (opts.format === "jpeg") jpegEncoder = encoded.jpegEncoder;
  let downscaled = false;

  async function fitQualityUnderTarget() {
    if (target <= 0) return;
    let lo = 0.2;
    let hi = 0.95;
    q = 0.85;
    encoded = await encodeCanvas(canvas, opts.format, q);
    blob = encoded.blob;
    if (opts.format === "jpeg") jpegEncoder = encoded.jpegEncoder;
    for (let i = 0; i < 10; i++) {
      const kb = blob.size / BYTES_PER_KB;
      if (kb <= target && target - kb < target * 0.05) break;
      if (kb > target) hi = q;
      else lo = q;
      q = (lo + hi) / 2;
      encoded = await encodeCanvas(canvas, opts.format, q);
      blob = encoded.blob;
      if (opts.format === "jpeg") jpegEncoder = encoded.jpegEncoder;
    }
    if (blob.size / BYTES_PER_KB > target) {
      q = lo;
      encoded = await encodeCanvas(canvas, opts.format, q);
      blob = encoded.blob;
      if (opts.format === "jpeg") jpegEncoder = encoded.jpegEncoder;
    }
  }

  await fitQualityUnderTarget();

  while (target > 0 && blob.size / BYTES_PER_KB > target && scale > 0.2) {
    scale *= 0.85;
    downscaled = true;
    canvas = renderBaseCanvas(
      img,
      Math.round(baseW * scale),
      Math.round(baseH * scale),
      cropArea,
      focal,
    );
    await fitQualityUnderTarget();
  }

  if (opts.sharpen && opts.sharpen > 0) {
    applyUnsharpMask(canvas, opts.sharpen);
    if (target > 0) {
      await fitQualityUnderTarget();
    } else {
      encoded = await encodeCanvas(canvas, opts.format, q);
      blob = encoded.blob;
      if (opts.format === "jpeg") jpegEncoder = encoded.jpegEncoder;
    }
  }

  return {
    blob, mime,
    sizeKB: Math.round(blob.size / BYTES_PER_KB),
    width: canvas.width, height: canvas.height,
    overTarget: target > 0 && blob.size / BYTES_PER_KB > target,
    downscaled,
    jpegEncoder,
  };
}

export function extForFormat(f: ExportFormat): string {
  return f === "jpeg" ? "jpg" : f;
}
