/**
 * MozJPEG encode via @jsquash/jpeg WASM.
 * Uses a direct module.encode call so JPEG bytes are sliced correctly
 * (the package's encode() returns the full WASM heap ArrayBuffer).
 */

import mozjpeg_enc from "@jsquash/jpeg/codec/enc/mozjpeg_enc.js";
import { defaultOptions } from "@jsquash/jpeg/meta.js";
import { initEmscriptenModule } from "@jsquash/jpeg/utils.js";

type MozModule = {
  encode: (
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options: Record<string, unknown>,
  ) => Uint8Array;
};

let modulePromise: Promise<MozModule> | null = null;

function getMozModule(): Promise<MozModule> {
  if (!modulePromise) {
    modulePromise = initEmscriptenModule(mozjpeg_enc) as Promise<MozModule>;
  }
  return modulePromise;
}

export async function encodeCanvasMozJpeg(
  canvas: HTMLCanvasElement,
  quality01: number,
): Promise<Blob> {
  if (typeof window === "undefined") {
    throw new Error("MozJPEG is browser-only");
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const quality = Math.min(100, Math.max(1, Math.round(quality01 * 100)));
  const mod = await getMozModule();
  const resultView = mod.encode(
    imageData.data,
    imageData.width,
    imageData.height,
    { ...defaultOptions, quality },
  );
  const bytes = resultView.slice();
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("MozJPEG produced invalid JPEG data");
  }
  return new Blob([bytes], { type: "image/jpeg" });
}
