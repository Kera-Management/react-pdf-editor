/** Box helpers in top-left page space (y down). Shared by layout and the
 * fidelity check; no layout logic lives here. */

import type { Box } from "../types";

export function boxWidth(b: Box): number {
  return Math.max(0, b.right - b.left);
}

export function boxHeight(b: Box): number {
  return Math.max(0, b.bottom - b.top);
}

export function unionBox(boxes: Box[]): Box {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const b of boxes) {
    if (b.left < left) left = b.left;
    if (b.top < top) top = b.top;
    if (b.right > right) right = b.right;
    if (b.bottom > bottom) bottom = b.bottom;
  }
  if (left === Infinity) return { left: 0, top: 0, right: 0, bottom: 0 };
  return { left, top, right, bottom };
}

/** Horizontal overlap in points (negative when apart). */
export function xOverlap(a: Box, b: Box): number {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left);
}

/** Vertical overlap in points (negative when apart). */
export function yOverlap(a: Box, b: Box): number {
  return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
}

/** Share of `inner`'s area inside `outer` (0..1). A zero-area inner box
 * counts as inside when its centre is inside. */
export function insideShare(inner: Box, outer: Box): number {
  const w = boxWidth(inner);
  const h = boxHeight(inner);
  if (w <= 0 || h <= 0) {
    const cx = (inner.left + inner.right) / 2;
    const cy = (inner.top + inner.bottom) / 2;
    return cx >= outer.left && cx <= outer.right && cy >= outer.top && cy <= outer.bottom ? 1 : 0;
  }
  const ox = Math.max(0, xOverlap(inner, outer));
  const oy = Math.max(0, yOverlap(inner, outer));
  return (ox * oy) / (w * h);
}

export function centreX(b: Box): number {
  return (b.left + b.right) / 2;
}

export function centreY(b: Box): number {
  return (b.top + b.bottom) / 2;
}

/** Median of a non-empty list (0 when empty). */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
