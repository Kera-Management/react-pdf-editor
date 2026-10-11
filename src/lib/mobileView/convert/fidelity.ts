/**
 * Legal text fidelity check (spec section 7).
 *
 * Deliberately independent of the layout: this module must not import
 * `./layout/**` or `./fields/**`. It rebuilds the few things it needs (its
 * own segments, the exclusion rule) so a layout bug can't hide itself.
 */

import type {
  CheckFidelity,
  FidelityReason,
  FidelityReport,
  InlineNode,
  MobileBlock,
  MobileDocument,
  PageFidelity,
  SourcePage,
  SourceTextItem,
  TextRun,
} from "../types";
import {
  CHECK_ABOVE_LINES,
  CHECK_BAND_OVERLAP_SHARE,
  CHECK_BASELINE_EM,
  CHECK_INTERLEAVE_FAIL_STEPS,
  CHECK_INTERLEAVE_MIN_WIDTH_SHARE,
  CHECK_INTERLEAVE_WARN_STEPS,
  CHECK_FUSED_GAP_EM,
  CHECK_FUSED_MIN_LINES,
  CHECK_LABEL_MAX_EM,
  CHECK_NEXT_LINE_EM,
  CHECK_SEGMENT_GAP_EM,
  CHECK_STYLE_GAP_EM,
  CHECK_WIDGET_BELOW_LABEL_LINES,
  DEFAULT_MAX_PAGES,
  DEFAULT_MIN_CONFIDENCE,
  LINE_HEIGHT_EM,
  SCRIPT_SIZE_RATIO,
  UNDER_WIDGET_SHARE,
  WEAK_LABEL_WARN_SHARE,
} from "./constants";
import { computeConfidence, decide } from "./decision";
import { boxHeight, boxWidth, insideShare, unionBox, xOverlap, yOverlap } from "./geom";
import { isBoxGlyphItem, isDrawnTwice, normalizeText, sortedChars } from "./normalize";
import { preflight } from "./preflight";
import type { Box } from "../types";

/* ------------------------------------------------------------------------ */
/* Output projection                                                         */
/* ------------------------------------------------------------------------ */

interface ProjectedField {
  id: string;
  /** Top-level block id. */
  top: string;
  /** Runs emitted before this field (its place in the flow). */
  runsBefore: number;
  /** Source text the field is attached to: its label, or for a field
   * inside a sentence the text right before and after it. The widget must
   * sit near at least one group (C10). Empty when it has none. */
  anchors: TextRun[][];
}

interface Projection {
  runs: TextRun[];
  /** Fields in output order. */
  fields: ProjectedField[];
  /** Placed fields whose only label is a field name or nothing. */
  weak: number;
  topIds: Set<string>;
}

function project(doc: MobileDocument): Projection {
  const p: Projection = { runs: [], fields: [], weak: 0, topIds: new Set() };
  const runs = (rs: TextRun[] | null | undefined) => {
    if (rs) for (const r of rs) if (r && r.kind === "text") p.runs.push(r);
  };
  const hasText = (nodes: InlineNode[]) => nodes.some((n) => n.kind === "text");
  const textOf = (nodes: InlineNode[]) => nodes.filter((n): n is TextRun => !!n && n.kind === "text");
  const field = (id: string, top: string, anchors: TextRun[][]) => {
    p.fields.push({ id, top, runsBefore: p.runs.length, anchors: anchors.filter((a) => a.length > 0) });
  };
  const inline = (nodes: InlineNode[], top: string) => {
    nodes.forEach((n, i) => {
      if (n.kind === "text") p.runs.push(n);
      else if (n.kind === "field") {
        const near = [nodes[i - 1], nodes[i + 1]].filter((m): m is TextRun => !!m && m.kind === "text");
        field(n.fieldId, top, near.map((m) => [m]));
        runs(n.hint);
      }
    });
  };
  const block = (b: MobileBlock, top: string) => {
    switch (b.type) {
      case "heading":
        runs(b.content);
        break;
      case "paragraph":
        inline(b.content, top);
        break;
      case "list": {
        const item = (it: (typeof b.items)[number]) => {
          if (it.marker) runs([it.marker]);
          inline(it.content, top);
          it.children.forEach(item);
        };
        b.items.forEach(item);
        break;
      }
      case "field":
        if (b.label?.kind === "source") runs(b.label.runs);
        if (!b.label || (b.label.kind === "synthetic" && b.label.text.origin === "fieldName")) p.weak++;
        field(b.fieldId, top, [b.label?.kind === "source" ? b.label.runs.filter((r) => r && r.kind === "text") : []]);
        runs(b.hint);
        break;
      case "choice":
        field(b.fieldId, top, [textOf(b.label)]);
        if (!hasText(b.label)) p.weak++;
        inline(b.label, top);
        break;
      case "radioGroup":
        if (b.label?.kind === "source") runs(b.label.runs);
        for (const o of b.options) {
          field(o.fieldId, top, [textOf(o.label)]);
          if (!hasText(o.label)) p.weak++;
          inline(o.label, top);
        }
        break;
      case "keyValue":
        runs(b.label);
        b.value.forEach((v) => block(v, top));
        break;
      case "group":
        runs(b.heading);
        b.children.forEach((c) => block(c, top));
        break;
      case "pageBreak":
      case "imagePlaceholder":
        break;
    }
  };
  for (const b of doc.blocks) {
    p.topIds.add(b.id);
    block(b, b.id);
  }
  return p;
}

/* ------------------------------------------------------------------------ */
/* Checker segments (independent of layout/segments.ts)                      */
/* ------------------------------------------------------------------------ */

interface CheckSegment {
  pageIndex: number;
  /** In x order. */
  items: SourceTextItem[];
  box: Box;
  size: number;
}

/** Same page, baselines within 0.3 x the smaller size, x gap <= 1em, and no
 * widget centred in the gap. Finer than or equal to the layout's segments. */
function checkerSegments(page: SourcePage, items: SourceTextItem[]): CheckSegment[] {
  const widgets = page.widgets.filter((w) => !w.hidden);
  const sorted = items
    .slice()
    .sort((a, b) => a.baseline - b.baseline || a.box.left - b.box.left || a.index - b.index);
  // Group by baseline first (anchored on the first item of the group).
  const rows: SourceTextItem[][] = [];
  for (const it of sorted) {
    let target: SourceTextItem[] | null = null;
    for (let k = rows.length - 1; k >= 0 && k >= rows.length - 8; k--) {
      const a = rows[k][0];
      const tol = CHECK_BASELINE_EM * Math.min(a.fontSize, it.fontSize);
      if (Math.abs(a.baseline - it.baseline) <= tol) {
        target = rows[k];
        break;
      }
    }
    if (target) target.push(it);
    else rows.push([it]);
  }
  const out: CheckSegment[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.box.left - b.box.left || a.index - b.index);
    let cur: SourceTextItem[] = [];
    const flush = () => {
      if (cur.length) {
        out.push({
          pageIndex: page.pageIndex,
          items: cur,
          box: unionBox(cur.map((i) => i.box)),
          size: Math.max(...cur.map((i) => i.fontSize)),
        });
      }
      cur = [];
    };
    for (const it of row) {
      const prev = cur[cur.length - 1];
      if (prev) {
        const gap = it.box.left - prev.box.right;
        const em = Math.min(prev.fontSize, it.fontSize);
        const widgetBetween =
          gap > 0 &&
          widgets.some((w) => {
            const cx = (w.box.left + w.box.right) / 2;
            return cx >= prev.box.right && cx <= it.box.left && yOverlap(w.box, unionBox([prev.box, it.box])) > 0;
          });
        const styleBreak = prev.bold !== it.bold && gap > CHECK_STYLE_GAP_EM * em;
        if (gap > CHECK_SEGMENT_GAP_EM * em || styleBreak || widgetBetween) flush();
      }
      cur.push(it);
    }
    flush();
  }
  return out;
}

/** A smaller item whose centre is inside the segment's box. */
function isScriptOf(item: SourceTextItem, seg: CheckSegment): boolean {
  const minSize = Math.min(...seg.items.map((i) => i.fontSize));
  if (item.fontSize * SCRIPT_SIZE_RATIO > minSize) return false;
  const cx = (item.box.left + item.box.right) / 2;
  const cy = (item.box.top + item.box.bottom) / 2;
  return cx >= seg.box.left && cx <= seg.box.right && cy >= seg.box.top && cy <= seg.box.bottom;
}

const WORDY = /\p{L}{2,}/u;
/** A line ending like this continues its sentence. */
const RUNS_ON = /[\p{L}\p{N},]$/u;
const STARTS_LOWER = /^\p{Ll}/u;

/**
 * Two columns printed less than 1em apart fuse into single lines, so the
 * segment and flow checks can't see them. Their signature is a wide word gap
 * (over 0.6em) at the same x on 3 or more consecutive lines. Returns a sample
 * when found.
 */
function fusedColumns(segs: CheckSegment[]): string | null {
  type GapAt = { left: number; right: number; text: string };
  const rows: { baseline: number; size: number; gaps: GapAt[] }[] = [];
  for (const seg of segs) {
    const gaps: GapAt[] = [];
    for (let i = 1; i < seg.items.length; i++) {
      const a = seg.items[i - 1];
      const b = seg.items[i];
      const gap = b.box.left - a.box.right;
      // A bullet or number and its text ("\u2022  you live ...") is not a column.
      if (!WORDY.test(a.str) || !WORDY.test(b.str)) continue;
      if (gap > CHECK_FUSED_GAP_EM * Math.min(a.fontSize, b.fontSize)) {
        gaps.push({ left: a.box.right, right: b.box.left, text: `${a.str}|${b.str}` });
      }
    }
    if (gaps.length) rows.push({ baseline: seg.items[0].baseline, size: seg.size, gaps });
  }
  rows.sort((a, b) => a.baseline - b.baseline);
  for (let i = 0; i < rows.length; i++) {
    for (const g of rows[i].gaps) {
      let run = 1;
      let cur = g;
      let last = rows[i];
      for (let j = i + 1; j < rows.length && run < CHECK_FUSED_MIN_LINES; j++) {
        if (rows[j].baseline - last.baseline > CHECK_NEXT_LINE_EM * last.size) break;
        if (rows[j].baseline - last.baseline < 0.5 * last.size) continue;
        const next = rows[j].gaps.find((h) => Math.min(h.right, cur.right) - Math.max(h.left, cur.left) > 0);
        if (!next) break;
        run++;
        cur = next;
        last = rows[j];
      }
      if (run >= CHECK_FUSED_MIN_LINES) return g.text.slice(0, 40);
    }
  }
  return null;
}

/* ------------------------------------------------------------------------ */
/* The check                                                                 */
/* ------------------------------------------------------------------------ */

export interface CheckResult {
  report: Omit<FidelityReport, "decision" | "confidence" | "durationMs">;
  /** Penalty inputs owned by the check. */
  weakShare: number;
  interleaveWarnPages: number;
}

const key = (page: number, index: number) => `${page}:${index}`;

/** Runs checks C1-C9 (plus preflight). Reasons exclude `lowConfidence`. */
export function runChecks(pages: SourcePage[], doc: MobileDocument, maxPages = Infinity): CheckResult {
  const reasons: FidelityReason[] = [];
  const add = (code: FidelityReason["code"], severity: "fail" | "warn", detail: string, pageIndex?: number) => {
    reasons.push({ code, severity, detail, ...(pageIndex !== undefined ? { pageIndex } : {}) });
  };
  reasons.push(...preflight(pages, maxPages));

  const pageByIndex = new Map(pages.map((p) => [p.pageIndex, p]));
  const itemMaps = new Map(pages.map((p) => [p.pageIndex, new Map(p.items.map((i) => [i.index, i]))]));
  const proj = project(doc);

  /* C1 unaltered, C2 exactly once ---------------------------------------- */
  let alteredRuns = 0;
  const refCount = new Map<string, number>();
  const matchedKeys = new Set<string>();
  /** Flat order of referenced visible items (fields are transparent). */
  const flow: { page: number; item: SourceTextItem }[] = [];
  /** Flow length before each run (and after the last): places fields. */
  const flowAtRun: number[] = [];
  for (const r of proj.runs) {
    flowAtRun.push(flow.length);
    const items = itemMaps.get(r.pageIndex);
    const srcItems = items ? r.sources.map((i) => items.get(i)) : [];
    const valid = r.sources.length > 0 && srcItems.every(Boolean);
    const unaltered =
      valid && normalizeText(r.text) === normalizeText(srcItems.map((i) => (i as SourceTextItem).str).join(""));
    if (!unaltered) {
      alteredRuns++;
      add("textAltered", "fail", `run "${r.text.slice(0, 40)}" does not match its sources`, r.pageIndex);
    }
    if (!valid) continue;
    for (const it of srcItems as SourceTextItem[]) {
      const k = key(r.pageIndex, it.index);
      refCount.set(k, (refCount.get(k) ?? 0) + 1);
      if (unaltered) matchedKeys.add(k);
      if (normalizeText(it.str) !== "") flow.push({ page: r.pageIndex, item: it });
    }
  }
  flowAtRun.push(flow.length);
  for (const [k, n] of refCount) {
    if (n > 1) add("textDuplicated", "fail", `item ${k} referenced ${n} times`, Number(k.split(":")[0]));
  }
  /** A fake-bold copy, re-verified here rather than trusted. */
  const drawnTwice = (p: SourcePage, it: SourceTextItem) => {
    if (it.duplicateOf === undefined) return false;
    const first = itemMaps.get(p.pageIndex)?.get(it.duplicateOf);
    return !!first && first.index !== it.index && first.duplicateOf === undefined && isDrawnTwice(it, first);
  };

  /* C3 complete (with the exclusion rule), C4 multiset -------------------- */
  let sourceChars = 0;
  let excludedChars = 0;
  let matchedChars = 0;
  const pageStats: PageFidelity[] = [];
  const keptByPage = new Map<number, SourceTextItem[]>();
  let sourceSorted = "";
  for (const p of pages) {
    const boxes = p.widgets.filter((w) => !w.hidden && (w.kind === "checkbox" || w.kind === "radio"));
    const kept: SourceTextItem[] = [];
    let pSource = 0;
    let pMatched = 0;
    const missing: string[] = [];
    for (const it of p.items) {
      const n = normalizeText(it.str).length;
      if (n === 0) continue;
      sourceChars += n;
      pSource += n;
      const k = key(p.pageIndex, it.index);
      if (refCount.has(k) && drawnTwice(p, it)) {
        add("textDuplicated", "fail", `"${it.str.slice(0, 30)}" is drawn twice on the page but shown twice`, p.pageIndex);
      }
      if (refCount.has(k)) {
        kept.push(it);
        if (matchedKeys.has(k)) {
          matchedChars += n;
          pMatched += n;
        }
        continue;
      }
      const excludable =
        drawnTwice(p, it) ||
        (isBoxGlyphItem(it) && boxes.some((w) => insideShare(it.box, w.box) >= UNDER_WIDGET_SHARE));
      if (excludable) excludedChars += n;
      else {
        kept.push(it);
        missing.push(it.str);
      }
    }
    if (missing.length) {
      add(
        "textMissing",
        "fail",
        `${missing.length} item(s) missing, e.g. "${missing.slice(0, 3).join(" | ").slice(0, 80)}"`,
        p.pageIndex
      );
    }
    keptByPage.set(p.pageIndex, kept);
    sourceSorted += kept.map((i) => i.str).join("");
    pageStats.push({
      pageIndex: p.pageIndex,
      sourceChars: pSource,
      matchedChars: pMatched,
      widgets: p.widgets.filter((w) => !w.hidden).length,
      columns: 0,
      gridRegions: 0,
      usedStructTree: false,
    });
  }
  const textFails = reasons.some((r) =>
    ["textAltered", "textDuplicated", "textMissing"].includes(r.code)
  );
  if (!textFails && sortedChars(proj.runs.map((r) => r.text).join("")) !== sortedChars(sourceSorted)) {
    add("textAltered", "fail", "output characters differ from source characters");
  }

  /* C5 segment order, C6 flow order, C7 interleave ------------------------ */
  const pos = new Map<string, number>();
  flow.forEach((f, i) => {
    const k = key(f.page, f.item.index);
    if (!pos.has(k)) pos.set(k, i);
  });
  let orderViolations = 0;
  const placedSegs: { seg: CheckSegment; first: number }[] = [];
  for (const p of pages) {
    for (const seg of checkerSegments(p, keptByPage.get(p.pageIndex) ?? [])) {
      const ps = seg.items.map((i) => pos.get(key(p.pageIndex, i.index)));
      if (ps.some((x) => x === undefined)) continue; // already textMissing
      const nums = ps as number[];
      let ok = true;
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] === nums[i - 1] + 1) continue;
        if (nums[i] < nums[i - 1]) {
          ok = false;
          continue;
        }
        // Only a superscript or subscript sitting inside this line may come
        // between two of its items.
        for (let q = nums[i - 1] + 1; q < nums[i]; q++) {
          const f = flow[q];
          if (f.page !== p.pageIndex || !isScriptOf(f.item, seg)) ok = false;
        }
      }
      if (!ok) {
        orderViolations++;
        add("orderViolation", "fail", `line "${seg.items.map((i) => i.str).join("").slice(0, 40)}" is scrambled`, p.pageIndex);
      }
      placedSegs.push({ seg, first: Math.min(...nums) });
    }
  }
  placedSegs.sort((a, b) => a.first - b.first);

  /* C6 flow order and C10 widget placement --------------------------------
   * A progress frontier per page: everything read so far on the page. A
   * later segment may not sit above anything read before it in the same x
   * band, whatever came just before it (a page code, a right-aligned page
   * number or a "$" in between resets nothing), and inside a horizontal
   * band text is read left to right. Placed fields walk the same flow at
   * their widget boxes. */
  const sizeOf = (pageIndex: number) => {
    const sizes = (keptByPage.get(pageIndex) ?? []).map((i) => i.fontSize);
    return sizes.length ? sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)] : 10;
  };
  const bodySize = new Map(pages.map((p) => [p.pageIndex, sizeOf(p.pageIndex)]));
  const widgetById = new Map<string, { pageIndex: number; box: Box }>();
  for (const p of pages) for (const w of p.widgets) if (!w.hidden) widgetById.set(w.id, { pageIndex: p.pageIndex, box: w.box });
  type Step = { pos: number; pageIndex: number; box: Box; size: number; text: string; widget: boolean };
  const steps: Step[] = placedSegs.map(({ seg, first }) => ({
    pos: first,
    pageIndex: seg.pageIndex,
    box: seg.box,
    size: seg.size,
    text: seg.items.map((x) => x.str).join(""),
    widget: false,
  }));
  for (const f of proj.fields) {
    const w = widgetById.get(f.id);
    if (!w) continue; // widgetMissing/widgetDuplicated report it
    steps.push({
      // Before the first run that follows it.
      pos: (flowAtRun[f.runsBefore] ?? flow.length) - 0.5,
      pageIndex: w.pageIndex,
      box: w.box,
      size: bodySize.get(w.pageIndex) ?? 10,
      text: `[${f.id}]`,
      widget: true,
    });
  }
  steps.sort((a, b) => a.pos - b.pos);
  const readOnPage = new Map<number, Step[]>();
  let lastPage = -1;
  let misplaced = 0;
  for (const B of steps) {
    const fail = (detail: string) => {
      if (B.widget) {
        misplaced++;
        add("widgetMisplaced", "fail", detail, B.pageIndex);
      } else {
        orderViolations++;
        add("orderViolation", "fail", detail, B.pageIndex);
      }
    };
    if (B.pageIndex < lastPage) {
      fail(`page ${B.pageIndex + 1} ${B.widget ? "field" : "text"} "${B.text.slice(0, 30)}" after page ${lastPage + 1}`);
      continue;
    }
    lastPage = B.pageIndex;
    const read = readOnPage.get(B.pageIndex) ?? [];
    readOnPage.set(B.pageIndex, read);
    // A field may sit up to a line above a label printed under it
    // (signature lines), so its bottom is what must not jump back.
    const edge = B.widget ? B.box.bottom : B.box.top;
    const slack = B.widget ? CHECK_ABOVE_LINES + CHECK_WIDGET_BELOW_LABEL_LINES : CHECK_ABOVE_LINES;
    // Same x band: overlapping by more than a sliver of the narrower box
    // (a long label in one grid column may end just under the next one).
    const sameBand = (S: Step) =>
      xOverlap(S.box, B.box) > Math.max(0.5, CHECK_BAND_OVERLAP_SHARE * Math.min(boxWidth(S.box), boxWidth(B.box)));
    const above = read.find((S) => sameBand(S) && edge < S.box.top - slack * LINE_HEIGHT_EM * S.size);
    // Left to right inside a horizontal band, for prose-wide text (columns),
    // not for short labels and page codes printed beside each other.
    const minW = (pageByIndex.get(B.pageIndex)?.width ?? 0) * CHECK_INTERLEAVE_MIN_WIDTH_SHARE;
    const rightFirst =
      !B.widget &&
      boxWidth(B.box) >= minW &&
      read.find((S) => {
        if (S.widget || boxWidth(S.box) < minW || S.box.left < B.box.right - 0.5) return false;
        const h = Math.min(boxHeight(S.box), boxHeight(B.box));
        return yOverlap(S.box, B.box) > 0.5 * h;
      });
    if (above) fail(`"${B.text.slice(0, 30)}" jumps back above "${above.text.slice(0, 30)}"`);
    else if (rightFirst) fail(`"${B.text.slice(0, 30)}" read after "${rightFirst.text.slice(0, 30)}" to its right`);
    read.push(B);
  }

  // C10: a field sits near the source text it is attached to.
  for (const f of proj.fields) {
    const w = widgetById.get(f.id);
    if (!w || f.anchors.length === 0) continue;
    const gaps = f.anchors.map((runs) => {
      const its = runs.flatMap((r) => r.sources.map((i) => itemMaps.get(r.pageIndex)?.get(i)).filter(Boolean)) as SourceTextItem[];
      if (!its.length || runs.some((r) => r.pageIndex !== w.pageIndex)) return Infinity;
      const b = unionBox(its.map((i) => i.box));
      const dx = Math.max(0, b.left - w.box.right, w.box.left - b.right);
      const dy = Math.max(0, b.top - w.box.bottom, w.box.top - b.bottom);
      return Math.hypot(dx, dy) / Math.max(...its.map((i) => i.fontSize));
    });
    const gap = Math.min(...gaps);
    if (gap > CHECK_LABEL_MAX_EM) {
      misplaced++;
      const label = f.anchors[0].map((r) => r.text).join("").slice(0, 30);
      add(
        "widgetMisplaced",
        "fail",
        Number.isFinite(gap)
          ? `field ${f.id} is ${gap.toFixed(1)}em from its label "${label}"`
          : `field ${f.id} is on another page than its label "${label}"`,
        w.pageIndex
      );
    }
  }

  const interleaveWarn = new Map<number, string>();
  const interleaveFail = new Map<number, string>();
  let alt = 0;
  for (let i = 1; i < placedSegs.length; i++) {
    const A = placedSegs[i - 1].seg;
    const B = placedSegs[i].seg;
    // C7: alternating between two non-overlapping wide x ranges.
    const page = pageByIndex.get(A.pageIndex);
    const minW = (page?.width ?? 0) * CHECK_INTERLEAVE_MIN_WIDTH_SHARE;
    const wide = (s: CheckSegment) => s.box.right - s.box.left >= minW;
    const switching =
      B.pageIndex === A.pageIndex && wide(A) && wide(B) && xOverlap(A.box, B.box) <= 0;
    // Interleaved prose returns to the very next line of the same column.
    const C = i >= 2 ? placedSegs[i - 2].seg : null;
    const continues =
      !!C &&
      alt > 0 &&
      xOverlap(C.box, B.box) > 0 &&
      B.box.top > C.box.top &&
      B.box.top - C.box.top <= CHECK_NEXT_LINE_EM * C.size;
    alt = switching ? (continues ? alt + 1 : 1) : 0;
    if (alt >= CHECK_INTERLEAVE_WARN_STEPS) {
      const sample = placedSegs
        .slice(Math.max(0, i - alt), i + 1)
        .map((x) => x.seg.items.map((it) => it.str).join("").slice(0, 20))
        .join(" / ");
      if (alt > CHECK_INTERLEAVE_FAIL_STEPS) interleaveFail.set(A.pageIndex, sample);
      else if (!interleaveWarn.has(A.pageIndex)) interleaveWarn.set(A.pageIndex, sample);
    }
  }
  // C7b: a sentence split by text from another column. The flow returns to
  // the next line of a column after reading something beside it, and the
  // sentence runs on across that break.
  for (let i = 2; i < placedSegs.length; i++) {
    const B = placedSegs[i].seg;
    let C: CheckSegment | null = null;
    let wordsBetween = false;
    for (let k = i - 1; k >= Math.max(0, i - 12); k--) {
      const S = placedSegs[k].seg;
      if (S.pageIndex !== B.pageIndex) break;
      if (xOverlap(S.box, B.box) > 0) {
        C = S;
        break;
      }
      // Bullets, numbers and superscripts in between don't count.
      if (S.size * SCRIPT_SIZE_RATIO > B.size && WORDY.test(S.items.map((it) => it.str).join(""))) {
        wordsBetween = true;
      }
    }
    if (!C || !wordsBetween || B.size * SCRIPT_SIZE_RATIO <= C.size) continue;
    const dy = B.box.top - C.box.top;
    if (dy <= 0 || dy > CHECK_NEXT_LINE_EM * C.size) continue;
    const cText = C.items.map((it) => it.str).join("").trim();
    const bText = B.items.map((it) => it.str).join("").trim();
    if (RUNS_ON.test(cText) && STARTS_LOWER.test(bText)) {
      interleaveFail.set(B.pageIndex, `sentence split by another column: "${cText.slice(-25)}" ... "${bText.slice(0, 25)}"`);
    }
  }
  for (const p of pages) {
    const fused = fusedColumns(checkerSegments(p, keptByPage.get(p.pageIndex) ?? []));
    if (fused) interleaveFail.set(p.pageIndex, `columns printed less than 1em apart: ${fused}`);
  }
  for (const [pg, sample] of interleaveFail) {
    add("columnInterleave", "fail", `output alternates between side-by-side columns: ${sample}`, pg);
    interleaveWarn.delete(pg);
  }
  for (const [pg, sample] of interleaveWarn) {
    add("columnInterleave", "warn", `output alternates between columns 2-3 times: ${sample}`, pg);
  }

  /* C8 widgets, C9 field index ------------------------------------------- */
  const expected = new Map<string, number>();
  const hidden = new Set<string>();
  for (const p of pages) {
    for (const w of p.widgets) {
      if (w.hidden) hidden.add(w.id);
      else expected.set(w.id, p.pageIndex);
    }
  }
  const placedCount = new Map<string, number>();
  for (const f of proj.fields) placedCount.set(f.id, (placedCount.get(f.id) ?? 0) + 1);
  const missingW = [...expected.keys()].filter((id) => !placedCount.has(id));
  const duplicated = [...placedCount.entries()]
    .filter(([id, n]) => n > 1 || hidden.has(id) || !expected.has(id))
    .map(([id]) => id);
  if (missingW.length) add("widgetMissing", "fail", `${missingW.length} widget(s) not placed: ${missingW.slice(0, 5).join(", ")}`);
  if (duplicated.length) {
    add("widgetDuplicated", "fail", `${duplicated.length} widget(s) placed twice, hidden or unknown: ${duplicated.slice(0, 5).join(", ")}`);
  }
  const fieldTop = new Map(proj.fields.map((f) => [f.id, f.top]));
  const indexIds = Object.keys(doc.fieldBlockIds ?? {});
  const badIndex =
    indexIds.length !== fieldTop.size ||
    indexIds.some((id) => !fieldTop.has(id) || doc.fieldBlockIds[id] !== fieldTop.get(id) || !proj.topIds.has(doc.fieldBlockIds[id]));
  if (badIndex) add("widgetMissing", "fail", "fieldBlockIds does not match the placed fields");

  const placed = [...placedCount.keys()].filter((id) => expected.has(id)).length;
  const weakShare = placed ? proj.weak / placed : 0;
  if (weakShare > WEAK_LABEL_WARN_SHARE) {
    add("weakLabels", "warn", `${proj.weak} of ${placed} fields have no source or tooltip label`);
  }

  const denom = sourceChars - excludedChars;
  return {
    report: {
      text: {
        sourceChars,
        excludedChars,
        matchedChars,
        coverage: denom > 0 ? Math.round((matchedChars / denom) * 10000) / 10000 : 1,
        orderViolations,
        alteredRuns,
      },
      widgets: {
        misplaced,
        expected: expected.size,
        placed,
        hidden: hidden.size,
        missing: missingW,
        duplicated,
        weaklyLabelled: proj.weak,
      },
      reasons: dedupe(reasons),
      pages: pageStats,
    },
    weakShare,
    interleaveWarnPages: interleaveWarn.size,
  };
}

/** One reason per (code, page, severity), keeping the first detail. */
function dedupe(reasons: FidelityReason[]): FidelityReason[] {
  const seen = new Set<string>();
  return reasons.filter((r) => {
    const k = `${r.code}|${r.severity}|${r.pageIndex ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Pure fidelity check of a finished document. */
export const checkFidelity: CheckFidelity = (pages, document, options) => {
  const t0 = now();
  const res = runChecks(pages, document, options?.maxPages ?? DEFAULT_MAX_PAGES);
  const confidence = computeConfidence({
    weakShare: res.weakShare,
    overTextWidgets: 0,
    fallbackPlaced: 0,
    interleaveWarnPages: res.interleaveWarnPages,
  });
  const { decision, reasons } = decide(res.report.reasons, confidence, options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE);
  return { ...res.report, reasons, decision, confidence, durationMs: Math.round(now() - t0) };
};
