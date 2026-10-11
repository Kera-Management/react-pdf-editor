/**
 * Tour anchors (guided tour spec §5.2). Chrome the tours point at carries
 * `data-pdfe-tour="<anchor>"`; the 4.1 mobile friendly view components are
 * targeted by their existing `data-part` instead of a second attribute.
 */
export type TourAnchor =
  | "mode-menu"
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
