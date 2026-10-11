/**
 * Field anchoring (spec section 6.6). Turns the elements of one leaf region
 * into "units" in reading order: text lines (possibly with inline fields),
 * rows of standalone fields with their labels, and checkbox/radio choices.
 * Labels are always source segments moved by at most one line, so text
 * order is preserved; the fidelity check verifies it.
 */

import type { Box, SourceWidget } from "../../types";
import {
  BAND_TOLERANCE_PT,
  BAND_TOLERANCE_SHARE,
  CHOICE_LABEL_GAP_EM,
  CHOICE_LABEL_NEAR_EM,
  HEADING_SIZE_RATIO,
  INLINE_TEXT_EM,
  LABEL_ABOVE_LINES,
  LABEL_BELOW_LINES,
  LABEL_MAX_CHARS,
  LINE_HEIGHT_EM,
  PARAGRAPH_LINE_GAP_EM,
  TALL_WIDGET_LINES,
  UNDER_WIDGET_SHARE,
} from "../constants";
import { boxHeight, boxWidth, centreY, insideShare, median, unionBox, xOverlap } from "../geom";
import type { Element, PageContext, Segment } from "../layout/model";

export type Part = { kind: "seg"; seg: Segment } | { kind: "widget"; widget: SourceWidget };

export interface Cell {
  widget: SourceWidget;
  /** Source label segments in reading order (empty when none was found). */
  label: Segment[];
}

interface UnitBase {
  box: Box;
  /** Band (line) the unit came from, in the leaf. */
  band: number;
}

/** A line of text. May hold inline (fill-in-the-blank) fields. */
export interface TextUnit extends UnitBase {
  t: "text";
  parts: Part[];
}

/** One or more standalone fields side by side, each with its label. */
export interface FieldsUnit extends UnitBase {
  t: "fields";
  cells: Cell[];
}

/** A checkbox or radio with its label (which may hold a text field). */
export interface ChoiceUnit extends UnitBase {
  t: "choice";
  widget: SourceWidget;
  label: Part[];
  /** Label cell geometry, for wrapped label lines. */
  labelLeft: number;
  cellRight: number;
  lastBottom: number;
  /** Right edge of the label's first line. */
  firstLineRight: number;
  labelSide: "left" | "right";
}

export type Unit = TextUnit | FieldsUnit | ChoiceUnit;

const isChoice = (w: SourceWidget) => w.kind === "checkbox" || w.kind === "radio";
const partBox = (p: Part): Box => (p.kind === "seg" ? p.seg.box : p.widget.box);
const partsText = (parts: Part[]) =>
  parts.map((p) => (p.kind === "seg" ? p.seg.text : "")).join(" ").trim();
const segsOf = (parts: Part[]) =>
  parts.flatMap((p) => (p.kind === "seg" ? [p.seg] : []));
/** Only words count as text under a widget or as a label; printed blanks,
 * dots and stray punctuation do not. */
const HAS_WORD = /[\p{L}\p{N}]/u;

interface Band {
  segs: Segment[];
  widgets: SourceWidget[];
  box: Box;
  size: number;
}

function textBox(parts: Part[]): Box {
  const segs = segsOf(parts);
  return unionBox((segs.length ? segs.map((s) => s.box) : parts.map(partBox)));
}

/** Leaf region -> units, in reading order. */
export function leafUnits(elems: Element[], ctx: PageContext): Unit[] {
  const segs = elems.flatMap((e) => (e.kind === "seg" ? [e.seg] : []));
  const widgets = elems.flatMap((e) => (e.kind === "widget" ? [e.widget] : []));
  const em = median(segs.map((s) => s.fontSize)) || ctx.bodySize || 10;
  const lh = LINE_HEIGHT_EM * em;

  // Bands are the text lines of the region (segments grouped by line id).
  const byLine = new Map<number, Segment[]>();
  for (const s of segs) {
    if (!byLine.has(s.lineId)) byLine.set(s.lineId, []);
    byLine.get(s.lineId)!.push(s);
  }
  const bands: Band[] = [...byLine.values()].map((ss) => ({
    segs: ss.sort((a, b) => a.box.left - b.box.left),
    widgets: [],
    box: unionBox(ss.map((s) => s.box)),
    size: Math.max(...ss.map((s) => s.fontSize)),
  }));
  const textBands = bands.slice();

  // Each widget joins the band its anchor falls in (centre, or first line
  // for tall widgets), else starts a widget-only band.
  const sortedW = widgets.slice().sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
  for (const w of sortedW) {
    const h = boxHeight(w.box);
    const tall = h > TALL_WIDGET_LINES * lh;
    const anchor = tall ? w.box.top + 0.5 * lh : centreY(w.box);
    const tol = BAND_TOLERANCE_SHARE * (tall ? lh : h) + BAND_TOLERANCE_PT;
    let best: Band | null = null;
    let bestDist = Infinity;
    for (const b of bands) {
      if (anchor < b.box.top - tol || anchor > b.box.bottom + tol) continue;
      // One widget per x position in a band: stacked boxes get their own.
      if (b.widgets.some((o) => xOverlap(o.box, w.box) > 0.5 * Math.min(boxWidth(o.box), boxWidth(w.box)))) continue;
      const d = Math.abs(centreY(b.box) - anchor);
      if (d < bestDist) {
        best = b;
        bestDist = d;
      }
    }
    if (best) {
      best.widgets.push(w);
      if (!textBands.includes(best)) best.box = unionBox([best.box, w.box]);
    } else {
      bands.push({ segs: [], widgets: [w], box: w.box, size: em });
    }
  }
  bands.sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);

  const units: Unit[] = [];
  bands.forEach((b, i) => units.push(...processBand(b, i, ctx, em)));
  attachChoiceContinuations(units, em);
  resolveFieldLabels(units, ctx, lh);
  return units;
}

/** Sort a band's parts by x. Text under a widget goes just before it. */
function bandParts(band: Band, ctx: PageContext): Part[] {
  const keyed: { key: number; part: Part }[] = [];
  for (const w of band.widgets) keyed.push({ key: w.box.left, part: { kind: "widget", widget: w } });
  for (const s of band.segs) {
    const under = band.widgets.find((w) => insideShare(s.box, w.box) >= UNDER_WIDGET_SHARE);
    if (under) {
      if (HAS_WORD.test(s.text)) ctx.stats.overText.set(under.id, s.text);
      keyed.push({ key: under.box.left - 0.001, part: { kind: "seg", seg: s } });
    } else {
      keyed.push({ key: s.box.left, part: { kind: "seg", seg: s } });
    }
  }
  return keyed.sort((a, b) => a.key - b.key).map((k) => k.part);
}

function processBand(band: Band, bandIndex: number, ctx: PageContext, em: number): Unit[] {
  const parts = bandParts(band, ctx);
  const size = band.segs.length ? band.size : em;
  if (!band.widgets.some(isChoice)) return plainUnits(parts, bandIndex, size);

  // Label side: right unless most boxes have text close on the left only.
  const near = CHOICE_LABEL_NEAR_EM * size;
  let rightVotes = 0;
  let leftVotes = 0;
  parts.forEach((p, k) => {
    if (p.kind !== "widget" || !isChoice(p.widget)) return;
    const prev = parts[k - 1];
    const next = parts[k + 1];
    const r = next?.kind === "seg" && next.seg.box.left - p.widget.box.right <= near;
    const l = prev?.kind === "seg" && p.widget.box.left - prev.seg.box.right <= near;
    if (r) rightVotes++;
    else if (l) leftVotes++;
  });
  const side: "left" | "right" = leftVotes > rightVotes ? "left" : "right";
  const maxGap = CHOICE_LABEL_GAP_EM * size;
  const choiceIdx = parts
    .map((p, k) => (p.kind === "widget" && isChoice(p.widget) ? k : -1))
    .filter((k) => k >= 0);
  const units: Unit[] = [];

  const choiceUnit = (w: SourceWidget, label: Part[], cellRight: number): ChoiceUnit => {
    const lb = label.length ? unionBox(label.map(partBox)) : null;
    return {
      t: "choice",
      band: bandIndex,
      widget: w,
      label,
      box: unionBox([w.box, ...(lb ? [lb] : [])]),
      labelLeft: side === "right" ? (lb ? lb.left : w.box.right) : lb ? lb.left : w.box.left,
      cellRight,
      lastBottom: lb ? lb.bottom : w.box.bottom,
      firstLineRight: lb ? lb.right : w.box.right,
      labelSide: side,
    };
  };

  if (side === "right") {
    units.push(...plainUnits(parts.slice(0, choiceIdx[0]), bandIndex, size));
    choiceIdx.forEach((k, n) => {
      const w = (parts[k] as { widget: SourceWidget }).widget;
      const end = n + 1 < choiceIdx.length ? choiceIdx[n + 1] : parts.length;
      const tail = parts.slice(k + 1, end);
      // The label runs until a wide gap or a signature field.
      let cut = 0;
      let prevRight = w.box.right;
      while (cut < tail.length) {
        const p = tail[cut];
        const b = partBox(p);
        if (b.left - prevRight > maxGap) break;
        if (p.kind === "widget" && p.widget.kind === "signature") break;
        prevRight = Math.max(prevRight, b.right);
        cut++;
      }
      const nextLeft =
        n + 1 < choiceIdx.length ? (parts[choiceIdx[n + 1]] as { widget: SourceWidget }).widget.box.left : Infinity;
      units.push(choiceUnit(w, tail.slice(0, cut), nextLeft));
      units.push(...plainUnits(tail.slice(cut), bandIndex, size));
    });
  } else {
    let start = 0;
    choiceIdx.forEach((k) => {
      const w = (parts[k] as { widget: SourceWidget }).widget;
      const head = parts.slice(start, k);
      // The label is the run of parts right before the box, up to a wide gap.
      let cut = head.length;
      let prevLeft = w.box.left;
      while (cut > 0) {
        const p = head[cut - 1];
        const b = partBox(p);
        if (prevLeft - b.right > maxGap) break;
        if (p.kind === "widget" && p.widget.kind === "signature") break;
        prevLeft = Math.min(prevLeft, b.left);
        cut--;
      }
      units.push(...plainUnits(head.slice(0, cut), bandIndex, size));
      units.push(choiceUnit(w, head.slice(cut), w.box.left));
      start = k + 1;
    });
    units.push(...plainUnits(parts.slice(start), bandIndex, size));
  }
  return units;
}

/** Units for parts with no checkbox/radio (spec rules 2, 3 and 4). */
function plainUnits(parts: Part[], band: number, size: number): Unit[] {
  if (!parts.length) return [];
  const text = (ps: Part[]): Unit[] => (ps.length ? [{ t: "text", band, parts: ps, box: textBox(ps) }] : []);
  const fields = (cells: Cell[]): FieldsUnit => ({
    t: "fields",
    band,
    cells,
    box: unionBox(cells.flatMap((c) => [c.widget.box, ...c.label.map((s) => s.box)])),
  });
  const widgetIdx = parts
    .map((p, k) => (p.kind === "widget" ? k : -1))
    .filter((k) => k >= 0);
  if (!widgetIdx.length) return text(parts);

  const near = INLINE_TEXT_EM * size;
  const closeLeft = (k: number) => {
    const p = parts[k - 1];
    const w = (parts[k] as { widget: SourceWidget }).widget;
    return p?.kind === "seg" && w.box.left - p.seg.box.right <= near;
  };
  const closeRight = (k: number) => {
    const p = parts[k + 1];
    const w = (parts[k] as { widget: SourceWidget }).widget;
    return p?.kind === "seg" && p.seg.box.left - w.box.right <= near;
  };
  const isLabel = (ps: Part[]) => {
    const t = partsText(ps);
    return HAS_WORD.test(t) && (t.length <= LABEL_MAX_CHARS || t.endsWith(":"));
  };

  if (widgetIdx.length === 1) {
    const k = widgetIdx[0];
    const w = (parts[k] as { widget: SourceWidget }).widget;
    const L = parts.slice(0, k);
    const R = parts.slice(k + 1);
    if (w.kind === "signature") {
      if (L.length && isLabel(L)) return [fields([{ widget: w, label: segsOf(L) }]), ...text(R)];
      return [...text(L), fields([{ widget: w, label: [] }]), ...text(R)];
    }
    if (closeLeft(k) && closeRight(k)) return text(parts);
    if (L.length) {
      if (isLabel(L)) return [fields([{ widget: w, label: segsOf(L) }]), ...text(R)];
      // Punctuation only ("$", a bullet): keep it as text, label from elsewhere.
      if (!HAS_WORD.test(partsText(L))) return [...text(L), fields([{ widget: w, label: [] }]), ...text(R)];
      return [...text(parts.slice(0, k + 1)), ...text(R)];
    }
    if (R.length && closeRight(k)) {
      // A blank that hangs mostly under the line it joined ("... at
      // (financial institution/branch)" over a wide box) completes that
      // line, so it follows the text rather than leading it.
      if (centreY(w.box) > textBox(R).bottom) return text([...R, parts[k]]);
      return text(parts);
    }
    return [fields([{ widget: w, label: [] }]), ...text(R)];
  }

  // Several fields on one line: a sentence with blanks when every field
  // sits between close text and no label ends with ":", else a grid row.
  const sentence = widgetIdx.every((k) => {
    const w = (parts[k] as { widget: SourceWidget }).widget;
    const prev = parts[k - 1];
    const colon = prev?.kind === "seg" && prev.seg.text.trim().endsWith(":");
    return w.kind !== "signature" && closeLeft(k) && closeRight(k) && !colon;
  });
  if (sentence) return text(parts);

  const units: Unit[] = [];
  let cells: Cell[] = [];
  const flushCells = () => {
    if (cells.length) units.push(fields(cells));
    cells = [];
  };
  let start = 0;
  widgetIdx.forEach((k, n) => {
    const w = (parts[k] as { widget: SourceWidget }).widget;
    const label = parts.slice(start, k);
    if (label.length && !HAS_WORD.test(partsText(label))) {
      // Punctuation between fields ("[a] / [b]", "$ [c]") stays as text.
      flushCells();
      units.push(...text(label));
      cells.push({ widget: w, label: [] });
    } else if (n === 0 && label.length && !isLabel(label)) {
      units.push(...text(label));
      cells.push({ widget: w, label: [] });
    } else {
      // Two fields with nothing between them ("[a] [b]") just sit side by side.
      cells.push({ widget: w, label: segsOf(label) });
    }
    start = k + 1;
  });
  flushCells();
  units.push(...text(parts.slice(start)));
  return units;
}

/** Wrapped label lines under a checkbox label (rule 5). */
function attachChoiceContinuations(units: Unit[], em: number): void {
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.t !== "choice" || u.labelSide !== "right") continue;
    // The choices of this band, so a wrapped line can go to the right cell.
    let j = i;
    const row: ChoiceUnit[] = [];
    while (j < units.length && units[j].band === u.band) {
      const v = units[j];
      if (v.t === "choice") row.push(v);
      j++;
    }
    // Only plain text lines directly after the band can continue labels.
    while (j < units.length) {
      const next = units[j];
      if (next.t !== "text" || next.parts.some((p) => p.kind === "widget")) break;
      const segs = segsOf(next.parts);
      // A wrapped line starts under the label (possibly with a hanging
      // indent, "Reason 2: You or ..." / "the rental unit ...").
      const targets = segs.map((s) =>
        row.find(
          (c) =>
            c.label.length > 0 &&
            s.box.left >= c.labelLeft - em &&
            s.box.left < c.firstLineRight &&
            s.box.right <= c.cellRight + 0.5 * em &&
            s.box.top - c.lastBottom <= (PARAGRAPH_LINE_GAP_EM - 1) * s.fontSize
        )
      );
      if (targets.some((t) => !t)) break;
      segs.forEach((s, n) => {
        const c = targets[n]!;
        c.label.push({ kind: "seg", seg: s });
        c.lastBottom = Math.max(c.lastBottom, s.box.bottom);
        c.box = unionBox([c.box, s.box]);
      });
      units.splice(j, 1);
    }
    i = j - 1;
  }
}

/** Labels above or below standalone fields (rules 3 and 4). */
function resolveFieldLabels(units: Unit[], ctx: PageContext, lh: number): void {
  const plainLine = (u: Unit | undefined): u is TextUnit =>
    !!u && u.t === "text" && u.parts.every((p) => p.kind === "seg");
  const headingLike = (s: Segment) => s.bold && s.fontSize >= HEADING_SIZE_RATIO * ctx.bodySize;

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.t !== "fields") continue;

    // Above: up to two lines, each segment over an unlabelled widget or over
    // an existing label (stacked labels such as "Street number and / name").
    for (let pass = 0; pass < 2; pass++) {
      const prev = units[i - 1];
      if (!plainLine(prev)) break;
      if (u.box.top - prev.box.bottom > LABEL_ABOVE_LINES * lh) break;
      const segs = segsOf(prev.parts);
      if (segs.some((s) => s.text.length > LABEL_MAX_CHARS || headingLike(s) || !HAS_WORD.test(s.text))) break;
      const em = lh / LINE_HEIGHT_EM;
      const target = segs.map((s) => {
        let best: Cell | null = null;
        let bestOverlap = 0;
        for (const c of u.cells) {
          let ref: Box;
          let fits: boolean;
          if (c.label.length) {
            // Stacked label: the segment sits in the label's column.
            ref = unionBox(c.label.map((x) => x.box));
            fits = s.box.left >= ref.left - 1.5 * em && s.box.right <= Math.max(ref.right, c.widget.box.left) + 1.5 * em;
          } else {
            // Label above: the segment starts over the widget.
            ref = c.widget.box;
            fits = s.box.left >= ref.left - 1.5 * em && s.box.left < ref.right;
          }
          const o = xOverlap(s.box, ref);
          if (fits && o > bestOverlap) {
            best = c;
            bestOverlap = o;
          }
        }
        return best;
      });
      if (target.some((t) => !t)) break;
      segs.forEach((s, n) => target[n]!.label.unshift(s));
      for (const c of u.cells) c.label.sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
      u.box = unionBox([u.box, prev.box]);
      units.splice(i - 1, 1);
      i--;
    }

    // Below: only on signature lines ("Signature of landlord" printed under
    // the line), and only for cells still without a label.
    const signatureRow = u.cells.some((c) => c.widget.kind === "signature");
    const unlabelled = signatureRow ? u.cells.filter((c) => !c.label.length) : [];
    const next = units[i + 1];
    if (unlabelled.length && plainLine(next) && next.box.top - u.box.bottom <= LABEL_BELOW_LINES * lh) {
      const segs = segsOf(next.parts);
      const target = segs.map((s) => {
        let best: Cell | null = null;
        let bestOverlap = 0;
        for (const c of unlabelled) {
          const o = xOverlap(s.box, c.widget.box);
          if (o > bestOverlap) {
            best = c;
            bestOverlap = o;
          }
        }
        return best;
      });
      if (segs.every((s) => s.text.length <= LABEL_MAX_CHARS && HAS_WORD.test(s.text)) && target.every(Boolean)) {
        segs.forEach((s, n) => target[n]!.label.push(s));
        u.box = unionBox([u.box, next.box]);
        units.splice(i + 1, 1);
      }
    }
  }
}
