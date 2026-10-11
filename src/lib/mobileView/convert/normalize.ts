/**
 * Text normalization shared by the layout and the fidelity check (spec
 * section 7). Kept tiny on purpose: the fidelity check depends on it, so a
 * bug here can't be hidden by layout code.
 */

const STRIP = /[\p{White_Space}\u00AD\u200B-\u200D\uFEFF]/gu;

/** `N(s)`: NFKC, then remove whitespace, soft hyphens and zero-width
 * characters. Case and punctuation are kept. */
export function normalizeText(s: string): string {
  return s.normalize("NFKC").replace(STRIP, "");
}

/** Glyphs that draw a printed checkbox square (spec section 6.6). The
 * ZapfDingbats squares (`q`, `o`, `n`) are covered by the item's dingbat
 * flag rather than by letter, so a real "o" is never mistaken for a box. */
const UNICODE_BOX_GLYPHS = new Set(["\u2751", "\u2610", "\u25A0", "\u25A1", "\u25A2", "\u25A3"]);

/** True when the item is a printed box glyph: any dingbat-font item, or a
 * single Unicode box character. Whether it may be left out also depends on
 * it sitting under a checkbox or radio widget. */
export function isBoxGlyphItem(item: { str: string; dingbat: boolean }): boolean {
  if (item.dingbat) return true;
  return UNICODE_BOX_GLYPHS.has(normalizeText(item.str));
}

/** Letters that draw an empty square in symbol fonts: ZapfDingbats q, o,
 * p; Wingdings o, q. (The Symbol font's q/o/p are Greek letters.) */
const ZAPF_EMPTY_BOX = /^[qop]$/;
const WINGDINGS_EMPTY_BOX = /^[oq]$/;

/** True when the item is a symbol-font letter that draws one empty
 * checkbox square: the view shows a box, not the letter, when no widget
 * sits over it. Unicode box characters already read as boxes. */
export function isEmptyBoxGlyph(item: { str: string; dingbat: boolean; fontName: string }): boolean {
  if (!item.dingbat) return false;
  const n = normalizeText(item.str);
  if (/zapf|dingbat/i.test(item.fontName)) return ZAPF_EMPTY_BOX.test(n);
  if (/wingding/i.test(item.fontName)) return WINGDINGS_EMPTY_BOX.test(n);
  return false;
}

/** Sorted code points of `N(s)`, for the multiset comparison (check C4). */
export function sortedChars(s: string): string {
  return Array.from(normalizeText(s)).sort().join("");
}

/** Share of the smaller box covered by both (0..1). */
function overlapShare(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
): number {
  const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (ox <= 0 || oy <= 0) return 0;
  const area = (x: typeof a) => Math.max(0, x.right - x.left) * Math.max(0, x.bottom - x.top);
  const min = Math.min(area(a), area(b));
  return min > 0 ? (ox * oy) / min : 0;
}

/**
 * `later` draws the same text again over `first`: fake bold (the same
 * string printed twice, a fraction of a point apart) or a drop shadow. Same
 * string and size, baselines within 0.15em and boxes overlapping by more
 * than 80%. On the page it reads once, so it is shown once. Shared by
 * `extractPage` (which marks it) and the fidelity check (which re-verifies
 * the mark before leaving the item out).
 */
export function isDrawnTwice(
  later: { str: string; fontSize: number; baseline: number; box: { left: number; top: number; right: number; bottom: number } },
  first: { str: string; fontSize: number; baseline: number; box: { left: number; top: number; right: number; bottom: number } }
): boolean {
  if (later.str !== first.str || normalizeText(later.str) === "") return false;
  if (Math.abs(later.fontSize - first.fontSize) > 0.01 * first.fontSize) return false;
  if (Math.abs(later.baseline - first.baseline) > 0.15 * first.fontSize) return false;
  return overlapShare(later.box, first.box) > 0.8;
}
