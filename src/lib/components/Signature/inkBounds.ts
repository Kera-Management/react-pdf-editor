/**
 * Pure ink-bounding-box math for the trimmed signature export. Kept
 * separate from canvas/DOM code so it is directly unit-testable, same as
 * pixelCoverage.ts: construct a plain object shaped like `ImageData` and
 * assert against it, no real `<canvas>` backend required.
 */

export interface BoundsImageData {
  /** RGBA bytes, 4 per pixel, alpha last -- same layout as `ImageData.data`. */
  data: ArrayLike<number>;
}

export interface InkBounds {
  /** Inclusive pixel indices of the outermost inked pixels. */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The tightest rectangle containing every pixel with any ink (non-zero
 * alpha), or null for a blank image. Row-major scan over the alpha
 * channel; out-of-range reads (a data buffer shorter than width*height,
 * as stubbed test contexts produce) simply read as blank.
 */
export function computeInkBounds(
  imageData: BoundsImageData,
  width: number,
  height: number
): InkBounds | null {
  const { data } = imageData;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  if (right === -1) {
    return null;
  }
  return { left, top, right, bottom };
}
