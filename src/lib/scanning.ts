/** Geometry and read-confirmation helpers for the barcode scanner. Pure, so they can be unit tested. */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The on-screen aiming frame, as fractions of the viewport. Rendered from this so CSS and decoding agree. */
export const RETICLE: Rect = { x: 0.1, y: 0.3, width: 0.8, height: 0.4 };

/** Extra margin decoded around the reticle so a slightly misaligned barcode still reads. */
const RETICLE_PADDING = 0.12;

/**
 * Map the reticle (in viewport fractions) to a source rectangle in video pixels,
 * accounting for `object-fit: cover` scaling and cropping. Clamped to the video frame.
 */
export function reticleToVideoRect(
  videoWidth: number,
  videoHeight: number,
  viewWidth: number,
  viewHeight: number,
  reticle: Rect = RETICLE,
  padding = RETICLE_PADDING,
): Rect {
  const scale = Math.max(viewWidth / videoWidth, viewHeight / videoHeight);
  const offsetX = (viewWidth - videoWidth * scale) / 2;
  const offsetY = (viewHeight - videoHeight * scale) / 2;

  const padX = reticle.width * padding;
  const padY = reticle.height * padding;
  const left = (reticle.x - padX) * viewWidth;
  const top = (reticle.y - padY) * viewHeight;
  const right = (reticle.x + reticle.width + padX) * viewWidth;
  const bottom = (reticle.y + reticle.height + padY) * viewHeight;

  const x0 = clamp((left - offsetX) / scale, 0, videoWidth);
  const y0 = clamp((top - offsetY) / scale, 0, videoHeight);
  const x1 = clamp((right - offsetX) / scale, 0, videoWidth);
  const y1 = clamp((bottom - offsetY) / scale, 0, videoHeight);

  return {
    x: Math.round(x0),
    y: Math.round(y0),
    width: Math.round(x1 - x0),
    height: Math.round(y1 - y0),
  };
}

/** Output size for a crop, scaled down so the longest side is at most `maxSide`. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const ratio = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

/**
 * Accepts a code only after it has been read `required` times in a row, each within `windowMs`
 * of the previous read. Filters out the occasional misread from a blurry frame without adding
 * noticeable delay.
 */
export function createReadConfirmer(windowMs = 1000) {
  let last: string | null = null;
  let count = 0;
  let lastAt = 0;

  return {
    /** Feed one read; returns the code once it is confirmed, otherwise null. */
    push(code: string, now: number, required: number): string | null {
      if (code === last && now - lastAt <= windowMs) {
        count += 1;
      } else {
        last = code;
        count = 1;
      }
      lastAt = now;
      return count >= required ? code : null;
    },
    reset() {
      last = null;
      count = 0;
      lastAt = 0;
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
