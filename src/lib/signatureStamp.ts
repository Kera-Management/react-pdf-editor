/**
 * Where a signature image lands relative to its field rect when stamped
 * into the saved PDF (PDF-space coordinates, origin bottom-left).
 *
 * A signature field drawn on a form's signature LINE is often only
 * ~20-30pt tall; fitting the image strictly inside squashes it to a
 * postage stamp. Like ink on paper, the signature may rise ABOVE a short
 * field (into the whitespace over the line) while staying within the
 * field's width: centered vertically when it fits, sitting ON the field's
 * bottom edge (the signature line) when it overflows upward.
 */

export interface StampRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Minimum height (PDF points) a stamped signature may occupy, regardless
 * of how short its field is. Half an inch: legible handwriting height on a
 * standard signature line. Was 48; on dense forms (Nova Scotia lease) the
 * extra rise above a ~20pt line field crossed into the PARAGRAPH TEXT
 * above it, and black ink over black bold text reads as missing strokes.
 */
export const MIN_SIGNATURE_STAMP_HEIGHT = 36;

export const signatureStampGeometry = (
  rect: StampRect,
  scaleToFit: (width: number, height: number) => {
    width: number;
    height: number;
  }
): StampRect => {
  const allowedHeight = Math.max(rect.height, MIN_SIGNATURE_STAMP_HEIGHT);
  const { width, height } = scaleToFit(rect.width, allowedHeight);
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + Math.max(0, (rect.height - height) / 2),
    width,
    height,
  };
};
