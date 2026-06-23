/** Output dimensions for slider images (PLP/PDP). */
export const SLIDER_OUTPUT_WIDTH = 633;
export const SLIDER_OUTPUT_HEIGHT = 382;
export const SLIDER_ASPECT = SLIDER_OUTPUT_WIDTH / SLIDER_OUTPUT_HEIGHT;

export type FocalPoint = { x: number; y: number };

export type AreaPixels = { x: number; y: number; width: number; height: number };

/** react-easy-crop croppedArea in percent of media dimensions (0–100). */
export type CropAreaPercentages = { x: number; y: number; width: number; height: number };

export function resolveFocal(cropX: number | null | undefined, cropY: number | null | undefined): FocalPoint {
  return { x: cropX ?? 0.5, y: cropY ?? 0.5 };
}

/** CSS object-position from normalized focal point (matches drawCover). */
export function objectPositionFromFocal(focal: FocalPoint): string {
  return `${focal.x * 100}% ${focal.y * 100}%`;
}

export function parseCropArea(raw: unknown): CropAreaPercentages | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.x !== "number" ||
    typeof o.y !== "number" ||
    typeof o.width !== "number" ||
    typeof o.height !== "number"
  ) {
    return null;
  }
  return { x: o.x, y: o.y, width: o.width, height: o.height };
}

export function croppedAreaPixelsFromPercentages(
  area: CropAreaPercentages,
  mediaWidth: number,
  mediaHeight: number,
): AreaPixels {
  return {
    x: Math.round((area.x / 100) * mediaWidth),
    y: Math.round((area.y / 100) * mediaHeight),
    width: Math.round((area.width / 100) * mediaWidth),
    height: Math.round((area.height / 100) * mediaHeight),
  };
}

/**
 * Focal point from react-easy-crop croppedAreaPixels (legacy fallback).
 */
export function focalFromCroppedAreaPixels(
  area: AreaPixels,
  mediaWidth: number,
  mediaHeight: number,
): FocalPoint {
  const denomX = mediaWidth - area.width;
  const denomY = mediaHeight - area.height;
  return {
    x: denomX > 0 ? clamp01(area.x / denomX) : 0.5,
    y: denomY > 0 ? clamp01(area.y / denomY) : 0.5,
  };
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/** True when crop_area differs from a full-frame default. */
export function hasCustomCropArea(area: CropAreaPercentages | null | undefined): boolean {
  if (!area) return false;
  return (
    Math.abs(area.x) > 0.05 ||
    Math.abs(area.y) > 0.05 ||
    area.width < 99.95 ||
    area.height < 99.95
  );
}

/** True when crop differs from default center (legacy crop_x/crop_y). */
export function hasCustomCrop(cropX: number | null | undefined, cropY: number | null | undefined): boolean {
  if (cropX == null && cropY == null) return false;
  const f = resolveFocal(cropX, cropY);
  return Math.abs(f.x - 0.5) > 0.001 || Math.abs(f.y - 0.5) > 0.001;
}

/** Extract cropped region and scale to output dimensions (matches cropper + compress). */
export function drawExtractedCrop(
  img: HTMLImageElement,
  area: AreaPixels,
  outW = SLIDER_OUTPUT_WIDTH,
  outH = SLIDER_OUTPUT_HEIGHT,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, outW, outH);
  return canvas;
}

export async function renderCroppedPreviewUrl(
  imageUrl: string,
  cropArea: CropAreaPercentages,
): Promise<string | null> {
  try {
    const img = await loadImage(imageUrl);
    const pixels = croppedAreaPixelsFromPercentages(
      cropArea,
      img.naturalWidth,
      img.naturalHeight,
    );
    const canvas = drawExtractedCrop(img, pixels);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
