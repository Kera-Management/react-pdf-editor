/**
 * Lines, words and segments (spec section 6.2). Items arrive split per glyph
 * or with kerning spaces, so words are rebuilt from x gaps. Characters are
 * never dropped or changed: the only edit is inserting a space.
 */

import type { SourceTextItem, SourceWidget } from "../../types";
import {
  LINE_BASELINE_TOLERANCE_EM,
  SCRIPT_SIZE_RATIO,
  SEGMENT_GAP_EM,
  SEGMENT_GAP_MIN_PT,
  SEGMENT_STYLE_GAP_EM,
  WORD_GAP_EM,
} from "../constants";
import { centreX, unionBox, yOverlap } from "../geom";
import { normalizeText } from "../normalize";
import type { Segment } from "./model";

const ENDS_WITH_SPACE = /\s$/u;
const STARTS_WITH_SPACE = /^\s/u;

/** The separator to put between two items of the same line. */
export function wordSeparator(
  prev: SourceTextItem,
  cur: SourceTextItem,
  spaceBefore?: Set<number>
): string {
  if (ENDS_WITH_SPACE.test(prev.str) || STARTS_WITH_SPACE.test(cur.str)) return "";
  if (spaceBefore?.has(cur.index)) return " ";
  const gap = cur.box.left - prev.box.right;
  const em = Math.min(prev.fontSize, cur.fontSize) || 1;
  return gap > WORD_GAP_EM * em ? " " : "";
}

/** Join items of one line in the given order, inserting word spaces. */
export function joinItems(items: SourceTextItem[], spaceBefore?: Set<number>): string {
  let out = "";
  for (let i = 0; i < items.length; i++) {
    if (i > 0) out += wordSeparator(items[i - 1], items[i], spaceBefore);
    out += items[i].str;
  }
  return out;
}

/** Stable x order inside a line. */
export function byLeft(a: SourceTextItem, b: SourceTextItem): number {
  return a.box.left - b.box.left || a.index - b.index;
}

interface LineAcc {
  /** Baseline of the first item (lines are created in baseline order). */
  baseline: number;
  size: number;
  items: SourceTextItem[];
  top: number;
  bottom: number;
}

/**
 * Group items into lines: baselines within 0.35 x the smaller size and boxes
 * overlapping vertically. Returns lines top to bottom, items in x order.
 */
export function groupLines(items: SourceTextItem[]): SourceTextItem[][] {
  const sorted = items
    .filter((i) => normalizeText(i.str) !== "")
    .sort((a, b) => a.baseline - b.baseline || byLeft(a, b));
  const lines: LineAcc[] = [];
  for (const it of sorted) {
    let best: LineAcc | null = null;
    let bestDist = Infinity;
    // Lines are created in baseline order, so only recent ones can match.
    for (let k = lines.length - 1; k >= 0; k--) {
      const l = lines[k];
      if (it.baseline - l.baseline > 4 * Math.max(l.size, it.fontSize)) break;
      if (Math.min(l.bottom, it.box.bottom) - Math.max(l.top, it.box.top) <= 0) continue;
      // Nearest item already on the line (not only the first one), so a
      // line mixing sizes doesn't split on a 2pt baseline wobble.
      for (const o of l.items) {
        const tol = LINE_BASELINE_TOLERANCE_EM * Math.min(o.fontSize, it.fontSize);
        const dist = Math.abs(it.baseline - o.baseline);
        if (dist <= tol && dist < bestDist) {
          best = l;
          bestDist = dist;
        }
      }
    }
    if (best) {
      best.items.push(it);
      best.top = Math.min(best.top, it.box.top);
      best.bottom = Math.max(best.bottom, it.box.bottom);
    } else {
      lines.push({
        baseline: it.baseline,
        size: it.fontSize,
        items: [it],
        top: it.box.top,
        bottom: it.box.bottom,
      });
    }
  }
  mergeScripts(lines);
  return lines.filter((l) => l.items.length).map((l) => l.items.sort(byLeft));
}

/** A superscript or subscript ("3rd", "10th") is a small line that sits
 * inside a bigger line's box; it joins that line in x order. */
function mergeScripts(lines: LineAcc[]): void {
  for (const s of lines) {
    if (!s.items.length) continue;
    const size = Math.max(...s.items.map((i) => i.fontSize));
    const mid = (s.top + s.bottom) / 2;
    const left = Math.min(...s.items.map((i) => i.box.left));
    const right = Math.max(...s.items.map((i) => i.box.right));
    let best: LineAcc | null = null;
    for (const m of lines) {
      if (m === s || !m.items.length || m.size < SCRIPT_SIZE_RATIO * size) continue;
      if (mid < m.top || mid > m.bottom) continue;
      const mLeft = Math.min(...m.items.map((i) => i.box.left));
      const mRight = Math.max(...m.items.map((i) => i.box.right));
      if (right < mLeft || left > mRight) continue;
      if (!best || Math.abs((m.top + m.bottom) / 2 - mid) < Math.abs((best.top + best.bottom) / 2 - mid)) best = m;
    }
    if (best) {
      best.items.push(...s.items);
      s.items = [];
    }
  }
}

/** True when a widget sits in the gap between two items of a line. */
function widgetInGap(prev: SourceTextItem, cur: SourceTextItem, widgets: SourceWidget[]): boolean {
  if (cur.box.left <= prev.box.right) return false;
  const line = unionBox([prev.box, cur.box]);
  return widgets.some((w) => {
    const cx = centreX(w.box);
    return cx >= prev.box.right && cx <= cur.box.left && yOverlap(w.box, line) > 0;
  });
}

/**
 * Build segments for one page. `items` are the flow items (printed boxes
 * and guides under widgets already removed); `widgets` split segments.
 */
export function buildSegments(
  pageIndex: number,
  items: SourceTextItem[],
  widgets: SourceWidget[],
  /** All page items, in stream order, for whitespace-only space hints. */
  pageItems: SourceTextItem[] = items
): Segment[] {
  const segments: Segment[] = [];
  const spaceBefore = spaceHints(pageItems);
  const lines = groupLines(items);
  lines.forEach((line, lineId) => {
    let cur: SourceTextItem[] = [];
    const flush = () => {
      if (cur.length) segments.push(makeSegment(segments.length, pageIndex, lineId, cur, spaceBefore));
      cur = [];
    };
    for (const it of line) {
      const prev = cur[cur.length - 1];
      if (prev) {
        const gap = it.box.left - prev.box.right;
        const em = Math.min(prev.fontSize, it.fontSize);
        const styleBreak = prev.bold !== it.bold && gap > SEGMENT_STYLE_GAP_EM * em;
        if (gap > Math.max(SEGMENT_GAP_EM * em, SEGMENT_GAP_MIN_PT) || styleBreak || widgetInGap(prev, it, widgets)) {
          flush();
        }
      }
      cur.push(it);
    }
    flush();
  });
  return segments;
}

/**
 * pdf.js sometimes emits a word space as its own whitespace-only item, with
 * a tiny width. Those items carry no source characters and never take part
 * in geometry; they only mark that the next item on the line starts a word.
 */
export function spaceHints(items: SourceTextItem[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i + 1 < items.length; i++) {
    const it = items[i];
    if (it.str === "" || normalizeText(it.str) !== "") continue;
    const next = items[i + 1];
    if (normalizeText(next.str) === "") continue;
    if (Math.abs(next.baseline - it.baseline) > LINE_BASELINE_TOLERANCE_EM * next.fontSize) continue;
    if (next.box.left < it.box.left - 0.5) continue;
    out.add(next.index);
  }
  return out;
}

export function makeSegment(
  id: number,
  pageIndex: number,
  lineId: number,
  items: SourceTextItem[],
  spaceBefore: Set<number> = new Set()
): Segment {
  return {
    id,
    pageIndex,
    lineId,
    items,
    box: unionBox(items.map((i) => i.box)),
    fontSize: Math.max(...items.map((i) => i.fontSize)),
    baseline: items[0].baseline,
    text: joinItems(items, spaceBefore),
    bold: items.every((i) => i.bold),
    artifact: items.every((i) => !!i.artifact),
    spaceBefore,
  };
}
