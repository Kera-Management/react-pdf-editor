/**
 * Pure pixel-coverage math for the Draw tab's near-blank rejection. Kept
 * separate from canvas/DOM code so it is directly unit-testable: construct
 * a plain object shaped like `ImageData` and assert against it, no real
 * `<canvas>` backend required.
 */

export interface CoverageImageData {
  /** RGBA bytes, 4 per pixel, alpha last -- same layout as `ImageData.data`. */
  data: ArrayLike<number>;
}

/** Fraction of pixels with any ink (non-zero alpha), 0..1. */
export function computeInkCoverage(imageData: CoverageImageData): number {
  const { data } = imageData;
  const totalPixels = data.length / 4;
  if (totalPixels === 0) return 0;

  let inkPixels = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) inkPixels += 1;
  }
  return inkPixels / totalPixels;
}

/** A stroke or two of real ink clears this by a wide margin; an empty
 * canvas or a single stray pixel does not. */
export const MIN_INK_COVERAGE = 0.002;

export function hasEnoughInk(imageData: CoverageImageData): boolean {
  return computeInkCoverage(imageData) >= MIN_INK_COVERAGE;
}
