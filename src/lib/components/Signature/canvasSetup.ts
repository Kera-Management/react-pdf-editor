import { SIGNATURE_CANVAS_HEIGHT, SIGNATURE_CANVAS_WIDTH } from "./constants";

/**
 * Sizes a signature canvas's backing store for the device pixel ratio, so
 * strokes and typed text stay crisp on high-density screens. DPR handling
 * copied from PageThumbnails.tsx's `renderThumbnail` (backing-store size =
 * logical size * devicePixelRatio, CSS size stays at the logical size, then
 * the context is scaled so drawing coordinates can stay in logical units).
 */
export function sizeSignatureCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
): void {
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = SIGNATURE_CANVAS_WIDTH * pixelRatio;
  canvas.height = SIGNATURE_CANVAS_HEIGHT * pixelRatio;
  canvas.style.width = `${SIGNATURE_CANVAS_WIDTH}px`;
  canvas.style.height = `${SIGNATURE_CANVAS_HEIGHT}px`;
  ctx.scale(pixelRatio, pixelRatio);
}
