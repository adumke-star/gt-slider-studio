/** Lazy MozJPEG encode (WASM) — used for JPG output instead of canvas.toBlob. */

export async function encodeCanvasMozJpeg(
  canvas: HTMLCanvasElement,
  quality01: number,
): Promise<Blob> {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const { encode } = await import("@jsquash/jpeg");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const quality = Math.min(100, Math.max(1, Math.round(quality01 * 100)));
  const buffer = await encode(imageData, { quality });
  return new Blob([buffer], { type: "image/jpeg" });
}
