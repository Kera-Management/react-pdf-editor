/**
 * Tour anchors (guided tour spec §5.2). Chrome the tours point at carries
 * `data-pdfe-tour="<anchor>"`; the 4.1 mobile friendly view components are
 * targeted by their existing `data-part` instead of a second attribute.
 */
export type TourAnchor =
  | "mode-menu"
  | "mode-menu-content"
  | "save"
  | "decline"
  | "progress"
  | "field-palette"
  | "add-field"
  | "parties"
  | "canvas"
  | "finish";

export const tourAnchor = (anchor: TourAnchor): string =>
  `[data-pdfe-tour="${anchor}"]`;

export const dataPart = (part: string): string => `[data-part="${part}"]`;

/** Whether an element is on screen: connected, and neither it nor an
 * ancestor is `hidden` or `display: none` (the original pages are kept
 * mounted but hidden under the mobile friendly view, closed menus and
 * drawers keep their content hidden). */
export const isShown = (el: Element | null): el is HTMLElement => {
  if (!(el instanceof HTMLElement) || !el.isConnected) return false;
  if (typeof el.checkVisibility === "function") return el.checkVisibility();
  const view = el.ownerDocument.defaultView;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (node.hidden) return false;
    if (view?.getComputedStyle(node).display === "none") return false;
  }
  return true;
};

/**
 * The first shown element matching `selector`, inside the editor first and
 * then anywhere in the document (drawers and menus portal out of the
 * editor's root).
 */
export const findShown = (
  root: ParentNode | null,
  selector: string
): HTMLElement | null => {
  const scopes: ParentNode[] = root ? [root, document] : [document];
  for (const scope of scopes) {
    const match = Array.from(scope.querySelectorAll(selector)).find(isShown);
    if (match) return match;
  }
  return null;
};

const nextFrame = (fn: () => void): (() => void) => {
  if (typeof requestAnimationFrame === "function") {
    const id = requestAnimationFrame(fn);
    return () => cancelAnimationFrame(id);
  }
  const id = setTimeout(fn, 16);
  return () => clearTimeout(id);
};

/**
 * Calls `onSettled` once the element `find` returns is on screen and has
 * stopped moving (same rect two frames running), so a step that opens
 * something (the mode menu) spotlights it after it has been positioned and
 * its open animation has played. Gives up waiting after `maxFrames` and
 * calls it anyway; the step's target then falls back to what is showing.
 * Returns a cancel.
 */
export const whenSettled = (
  find: () => HTMLElement | null,
  onSettled: () => void,
  maxFrames = 30
): (() => void) => {
  let frames = 0;
  let last: string | null = null;
  let cancel = () => {};
  const tick = () => {
    frames += 1;
    const el = find();
    if (el) {
      const r = el.getBoundingClientRect();
      const rect = `${r.x},${r.y},${r.width},${r.height}`;
      if (rect === last) return onSettled();
      last = rect;
    }
    if (frames >= maxFrames) return onSettled();
    cancel = nextFrame(tick);
  };
  cancel = nextFrame(tick);
  return () => cancel();
};
