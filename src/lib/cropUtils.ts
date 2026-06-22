/** Output dimensions for slider images (PLP/PDP). */
export const SLIDER_OUTPUT_WIDTH = 633;
export const SLIDER_OUTPUT_HEIGHT = 382;
export const SLIDER_ASPECT = SLIDER_OUTPUT_WIDTH / SLIDER_OUTPUT_HEIGHT;

export type FocalPoint = { x: number; y: number };

export type AreaPixels = { x: number; y: number; width: number; height: number };

export function resolveFocal(cropX: number | null | undefined, cropY: number | null | undefined): FocalPoint {
  return { x: cropX ?? 0.5, y: cropY ?? 0.5 };
}

/** CSS object-position from normalized focal point (matches drawCover). */
export function objectPositionFromFocal(focal: FocalPoint): string {
  return `${focal.x * 100}% ${focal.y * 100}%`;
}

/**
 * Focal point from react-easy-crop croppedAreaPixels.
 * Returns the CSS object-position fraction (matches objectPositionFromFocal and drawCover),
 * i.e. how far the crop window is offset within the overflow, not the crop center.
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

/** True when crop differs from default center. */
export function hasCustomCrop(cropX: number | null | undefined, cropY: number | null | undefined): boolean {
  if (cropX == null && cropY == null) return false;
  const f = resolveFocal(cropX, cropY);
  return Math.abs(f.x - 0.5) > 0.001 || Math.abs(f.y - 0.5) > 0.001;
}
