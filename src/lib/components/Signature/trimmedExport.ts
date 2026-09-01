import { computeInkBounds } from "./inkBounds";

/**
 * Exports a signature canvas cropped to its ink.
 *
 * Both capture tabs draw into a fixed 480x180 canvas, but the signature
 * itself usually occupies a fraction of it -- exporting the whole canvas
 * bakes large transparent margins into the PNG, so every downstream sizing
 * decision (the field stamp, the in-editor preview, the saved-signature
 * offer) scales the empty canvas rectangle instead of the signature.
 * Trimming to the ink's bounding box makes the PNG's own dimensions
 * describe the signature's true shape.
 */

/** Logical-pixel padding kept around the ink so strokes don't touch the
 * PNG's edges (anti-aliased fringes, and breathing room when stamped). */
const TRIM_PADDING = 6;

/**
 * Returns the cropped PNG data URL, or null when trimming isn't possible
 * (blank canvas, or an environment without real canvas readback -- jsdom
 * test stubs land here). Callers fall back to the untrimmed export.
 */
export function exportTrimmedSignature(
  canvas: HTMLCanvasElement
): string | null {
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof ctx.getImageData !== "function") return null;

  let imageData: { data: ArrayLike<number> };
  try {
    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }

  const bounds = computeInkBounds(imageData, canvas.width, canvas.height);
  if (!bounds) return null;

  // Bounds are in device pixels (the backing store is logical size x DPR).
  const pad = Math.round(TRIM_PADDING * (window.devicePixelRatio || 1));
  const sx = Math.max(0, bounds.left - pad);
  const sy = Math.max(0, bounds.top - pad);
  const sw = Math.min(canvas.width, bounds.right + 1 + pad) - sx;
  const sh = Math.min(canvas.height, bounds.bottom + 1 + pad) - sy;
  if (sw <= 0 || sh <= 0) return null;

  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const outCtx = out.getContext("2d");
  if (!outCtx || typeof outCtx.drawImage !== "function") return null;
  outCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out.toDataURL("image/png");
}
