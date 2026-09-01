export type FloatingPlacement = "top" | "bottom";

export interface FloatingPosition {
  x: number;
  y: number;
  placement: FloatingPlacement;
}

/**
 * Width/height are all this needs from the floating element -- callers pass
 * a real `DOMRect` (structurally compatible) or a plain `{ width, height }`
 * measured via `getBoundingClientRect()`.
 */
export interface FloatingElementSize {
  width: number;
  height: number;
}

/**
 * Pure placement math for a floating element (context toolbar, popover, ...)
 * anchored to a target rect. Prefers placing the element above the target,
 * flipping below when there isn't room, then clamps the result inside
 * `containerRect` (or the viewport, when no container is given) so the
 * element never renders off-screen.
 *
 * Extracted from ContextToolbar's positioning effect -- behavior-identical,
 * just decoupled from React/refs so it's unit-testable and reusable (Popover
 * consumes it too).
 */
export function positionFloatingElement(
  targetRect: DOMRect,
  elementRect: FloatingElementSize,
  containerRect: DOMRect | null | undefined,
  gap: number
): FloatingPosition {
  let x = targetRect.left + targetRect.width / 2 - elementRect.width / 2;

  const spaceAbove = containerRect
    ? targetRect.top - containerRect.top
    : targetRect.top;
  const spaceBelow = containerRect
    ? containerRect.bottom - targetRect.bottom
    : window.innerHeight - targetRect.bottom;

  const requiredHeight = elementRect.height + gap;

  let y: number;
  let placement: FloatingPlacement;

  if (spaceAbove >= requiredHeight || spaceAbove > spaceBelow) {
    // Position above.
    y = targetRect.top - requiredHeight;
    placement = "top";
  } else {
    // Position below.
    y = targetRect.bottom + gap;
    placement = "bottom";
  }

  // Constrain to viewport/container.
  const minX = containerRect ? containerRect.left + gap : gap;
  const maxX = containerRect
    ? containerRect.right - elementRect.width - gap
    : window.innerWidth - elementRect.width - gap;
  const minY = containerRect ? containerRect.top + gap : gap;
  const maxY = containerRect
    ? containerRect.bottom - elementRect.height - gap
    : window.innerHeight - elementRect.height - gap;

  x = Math.max(minX, Math.min(maxX, x));
  y = Math.max(minY, Math.min(maxY, y));

  return { x, y, placement };
}
