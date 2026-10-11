/**
 * Regions and reading order for untagged pages (spec section 6.3): a
 * recursive XY-cut over segment and widget boxes.
 *
 * 1. Look for runs of rows sharing a gutter (a whitespace band at least
 *    1.2em wide with text on both sides in at least 3 rows). A run is split
 *    into a left and a right column, read column-major, and each column is
 *    cut again. This handles a full-width heading sitting right on top of
 *    two columns, and sidebars spanning several paragraphs.
 * 2. Rows outside any run are cut horizontally at vertical gaps wider than
 *    1.2 line heights; the bands are leaves, read top to bottom.
 */

import {
  CHECKBOX_GRID_MIN_ROWS,
  GUTTER_MIN_EM,
  GUTTER_MIN_ROWS,
  HORIZONTAL_CUT_LINES,
  KEY_VALUE_MAX_LABEL_SHARE,
  LINE_HEIGHT_EM,
} from "../constants";
import { median } from "../geom";
import type { Element } from "./model";

/** Rows on the left of a gutter stay in its run only within this many lines. */
const TRAILING_GAP_LINES = 3;
/** Prose columns: at least this many lines, at least half of them filling
 * 70% of the column, and at least 15em wide. */
const PROSE_MIN_LINES = 3;
const PROSE_FULL_LINE_SHARE = 0.7;
const PROSE_FULL_LINES_SHARE = 0.5;
/** Prose columns are at least this wide (x font size). */
const PROSE_MIN_WIDTH_EM = 15;
/** One-sided rows a run may open with before its gutter appears. */
const LEAD_ROWS = 2;
/** Two-sided lines needed for a weak (label column) gutter. */
const WEAK_GUTTER_ROWS = 2;

export type Region =
  | { kind: "leaf"; elems: Element[] }
  | { kind: "stack"; children: Region[] }
  | {
      kind: "columns";
      left: Region;
      right: Region;
      gutter: number;
      /** The left side is a narrow column of text labels (a sidebar). It
       * is never read column-major: labels pair with the content level with
       * them (key/value), or the run is read as plain rows. */
      labelColumn: boolean;
      plain: Region;
    };

function emOf(elems: Element[], fallback: number): number {
  const sizes = elems.flatMap((e) => (e.kind === "seg" ? [e.seg.fontSize] : []));
  return median(sizes) || fallback;
}

/** Split elements wherever nothing spans a vertical gap wider than `minGap`. */
function bandsByGap(elems: Element[], minGap: number, shrink: number): Element[][] {
  const sorted = elems.slice().sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
  const bands: Element[][] = [];
  let cur: Element[] = [];
  let bottom = -Infinity;
  for (const e of sorted) {
    const h = e.box.bottom - e.box.top;
    const top = e.box.top + h * shrink;
    if (cur.length && top - bottom > minGap) {
      bands.push(cur);
      cur = [];
      bottom = -Infinity;
    }
    cur.push(e);
    bottom = Math.max(bottom, e.box.bottom - h * shrink);
  }
  if (cur.length) bands.push(cur);
  return bands;
}

/** Bullets and list markers ("\u2022", "1.", "(a)") do not make a line two-sided:
 * the gap between a marker and its text is not a column gutter. */
const WORDY = /\p{L}{2,}|\p{N}{4,}/u;

interface Gap {
  left: number;
  right: number;
}

/** Interior whitespace gaps of the union of the rows' x ranges. */
function gapsOf(rows: Element[][], minWidth: number): Gap[] {
  // List markers may sit in a gutter (a sidebar title right next to "1.").
  const spans = rows
    .flat()
    .filter((e) => e.kind !== "seg" || WORDY.test(e.seg.text))
    .map((e) => [e.box.left, e.box.right] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const gaps: Gap[] = [];
  let end = -Infinity;
  for (const [l, r] of spans) {
    if (end !== -Infinity && l - end >= minWidth) gaps.push({ left: end, right: l });
    end = Math.max(end, r);
  }
  return gaps;
}

/** Text lines with segments on both sides of the gap (counted per row as
 * the smaller of the two sides' line counts, so a tall widget that merges
 * several lines into one row does not hide them). */
function twoSidedRows(rows: Element[][], g: Gap): number {
  let n = 0;
  for (const row of rows) {
    const left = new Set<number>();
    const right = new Set<number>();
    for (const e of row) {
      if (e.kind !== "seg" || !WORDY.test(e.seg.text)) continue;
      if (e.box.right <= g.left) left.add(e.seg.lineId);
      else if (e.box.left >= g.right) right.add(e.seg.lineId);
    }
    n += Math.min(left.size, right.size);
  }
  return n;
}

export interface CutStats {
  columns: number;
}

export function cutRegion(elems: Element[], bodySize: number, stats: CutStats): Region {
  if (elems.length <= 1) return { kind: "leaf", elems };
  const em = emOf(elems, bodySize);

  // Gutter runs first, over rows at any vertical gap, so a column or a
  // sidebar that spans several paragraphs is found before horizontal cuts
  // chop it into bands too short to prove a gutter.
  const rows = bandsByGap(elems, 0, 0.2);
  const out: Region[] = [];
  let plain: Element[] = [];
  const flushPlain = () => {
    if (plain.length) out.push(cutBands(plain, bodySize));
    plain = [];
  };
  const minWidth = GUTTER_MIN_EM * em;
  let i = 0;
  while (i < rows.length) {
    let bestJ = -1;
    let bestGap: Gap | null = null;
    let bestWeak = false;
    let anchor: Gap | null = null;
    for (let j = i; j < rows.length; j++) {
      const run = rows.slice(i, j + 1);
      // Once a gutter is found the run keeps to it: a row that only leaves
      // some other, narrower gap open ends the run.
      const gaps = gapsOf(run, minWidth).filter(
        (g) =>
          !anchor ||
          Math.min(g.right, anchor.right) - Math.max(g.left, anchor.left) >= 0.5 * (anchor.right - anchor.left)
      );
      if (!gaps.length) {
        // A run may open with a few one-sided rows (a sidebar title that
        // starts a line above the text); otherwise no gap means no run.
        if (anchor || j - i >= LEAD_ROWS) break;
        continue;
      }
      let pick: Gap | null = null;
      let pickRows = 0;
      let pickWeak = false;
      for (const g of gaps) {
        const n = twoSidedRows(run, g);
        const strong = n >= GUTTER_MIN_ROWS;
        const weak = !strong && n >= WEAK_GUTTER_ROWS && narrowLabelColumn(run, g, true);
        if (!strong && !weak) continue;
        if (!pick || (pickWeak && strong) || (pickWeak === !strong && (n > pickRows || (n === pickRows && g.right - g.left > pick.right - pick.left)))) {
          pick = g;
          pickRows = n;
          pickWeak = !strong;
        }
      }
      if (pick && (!bestGap || !pickWeak || bestWeak)) {
        bestJ = j;
        bestGap = pick;
        bestWeak = pickWeak;
        anchor = anchor ?? pick;
      }
    }
    if (bestGap && bestJ >= i) {
      const g = bestGap;
      const [first, last] = trimRun(rows, i, bestJ, g, LINE_HEIGHT_EM * em);
      if (isChoiceGrid(rows.slice(first, last + 1), g, LINE_HEIGHT_EM * em)) {
        // Checkbox columns on both sides of the gap form one grid (rule 7);
        // keep them together so the grid is rebuilt as a whole.
        for (let k = i; k <= last; k++) plain.push(...rows[k]);
        i = last + 1;
        continue;
      }
      for (let k = i; k < first; k++) plain.push(...rows[k]);
      flushPlain();
      const run = rows.slice(first, last + 1).flat();
      const left = run.filter((e) => e.box.right <= g.left + 0.01);
      const right = run.filter((e) => e.box.right > g.left + 0.01);
      stats.columns++;
      out.push({
        kind: "columns",
        left: cutRegion(left, bodySize, stats),
        right: cutRegion(right, bodySize, stats),
        gutter: (g.left + g.right) / 2,
        labelColumn: bestWeak || narrowLabelColumn(rows.slice(first, last + 1), g) || !isProse(left),
        plain: cutBands(run, bodySize),
      });
      i = last + 1;
    } else {
      plain.push(...rows[i]);
      i++;
    }
  }
  flushPlain();
  return out.length === 1 ? out[0] : { kind: "stack", children: out };
}

/**
 * Column-major reading is only right for prose: a column of at least 3
 * lines, most of which fill the column. A column of short labels ("The
 * current rent is:") must stay level with what it labels.
 */
function isProse(elems: Element[]): boolean {
  // Per line, the longest segment: a table row is several short segments.
  const lines = new Map<number, number>();
  let left = Infinity;
  let right = -Infinity;
  for (const e of elems) {
    if (e.kind !== "seg") continue;
    left = Math.min(left, e.box.left);
    right = Math.max(right, e.box.right);
    lines.set(e.seg.lineId, Math.max(lines.get(e.seg.lineId) ?? 0, e.box.right - e.box.left));
  }
  if (lines.size < PROSE_MIN_LINES) return false;
  const sizes = elems.flatMap((e) => (e.kind === "seg" ? [e.seg.fontSize] : []));
  if (right - left < PROSE_MIN_WIDTH_EM * median(sizes)) return false;
  const widths = [...lines.values()];
  const full = widths.filter((w) => w >= PROSE_FULL_LINE_SHARE * (right - left)).length;
  return full >= PROSE_FULL_LINES_SHARE * widths.length;
}

/** A narrow column of text only (no widgets) left of the gap; with
 * `titles`, also bold throughout (sidebar titles, not sentence words). */
function narrowLabelColumn(rows: Element[][], g: Gap, titles = false): boolean {
  const all = rows.flat();
  const left = all.filter((e) => e.box.right <= g.left);
  if (!left.length || left.some((e) => e.kind !== "seg")) return false;
  if (titles && left.some((e) => e.kind === "seg" && !e.seg.bold)) return false;
  const minL = Math.min(...all.map((e) => e.box.left));
  const maxR = Math.max(...all.map((e) => e.box.right));
  const lw = Math.max(...left.map((e) => e.box.right)) - Math.min(...left.map((e) => e.box.left));
  return lw < KEY_VALUE_MAX_LABEL_SHARE * (maxR - minL);
}

const isChoiceWidget = (e: Element) =>
  e.kind === "widget" && (e.widget.kind === "checkbox" || e.widget.kind === "radio");

/** Both sides hold a column of checkboxes and some of them share rows. */
function isChoiceGrid(rows: Element[][], g: Gap, lh: number): boolean {
  const all = rows.flat().filter(isChoiceWidget);
  const left = all.filter((e) => e.box.right <= g.left + 0.01);
  const right = all.filter((e) => e.box.left >= g.right - 0.01);
  if (left.length < CHECKBOX_GRID_MIN_ROWS || right.length < CHECKBOX_GRID_MIN_ROWS) return false;
  const mid = (e: Element) => (e.box.top + e.box.bottom) / 2;
  const aligned = left.filter((l) => right.some((r) => Math.abs(mid(l) - mid(r)) <= 0.5 * lh)).length;
  return aligned >= 2;
}

const hasLeft = (row: Element[], g: Gap) => row.some((e) => e.box.right <= g.left + 0.01);
const isTwoSided = (row: Element[], g: Gap) => twoSidedRows([row], g) > 0;
const xOverlapRows = (a: Element[], b: Element[]) =>
  a.some((e) => b.some((f) => e.kind === "seg" && f.kind === "seg" && Math.min(e.box.right, f.box.right) - Math.max(e.box.left, f.box.left) > 0));
const rowTop = (row: Element[]) => Math.min(...row.map((e) => e.box.top));
const rowBottom = (row: Element[]) => Math.max(...row.map((e) => e.box.bottom));

/**
 * Trims a gutter run to its two-sided core plus rows that clearly continue
 * it. Rows on the left of the gutter only (a page footer, a note under a
 * sidebar) stay in the run only when they follow closely, so they are not
 * read before the right column by mistake.
 */
function trimRun(rows: Element[][], i: number, j: number, g: Gap, lh: number): [number, number] {
  let first = i;
  while (first < j && !isTwoSided(rows[first], g)) first++;
  // Leading rows join when they touch the core (a column heading), unless
  // a row is the wrapped end of the line above it.
  while (first > i && rowTop(rows[first]) - rowBottom(rows[first - 1]) <= TRAILING_GAP_LINES * lh) {
    const lead = rows[first - 1];
    const above = rows[first - 2];
    if (above && rowTop(lead) - rowBottom(above) <= 0.5 * lh && xOverlapRows(lead, above)) break;
    first--;
  }
  let last = first;
  for (let k = first; k <= j; k++) if (isTwoSided(rows[k], g)) last = k;
  // Measure from the last row with something left of the gutter.
  let leftBottom = rowBottom(rows[last]);
  while (last < j) {
    const next = rows[last + 1];
    if (hasLeft(next, g)) {
      if (rowTop(next) - leftBottom > TRAILING_GAP_LINES * lh) break;
      leftBottom = rowBottom(next);
    }
    last++;
  }
  return [first, last];
}

/** Rows with no gutter: horizontal cuts at wide vertical gaps, then leaves. */
function cutBands(elems: Element[], bodySize: number): Region {
  const lh = LINE_HEIGHT_EM * emOf(elems, bodySize);
  const bands = bandsByGap(elems, HORIZONTAL_CUT_LINES * lh, 0);
  if (bands.length === 1) return { kind: "leaf", elems };
  return { kind: "stack", children: bands.map((b): Region => ({ kind: "leaf", elems: b })) };
}
