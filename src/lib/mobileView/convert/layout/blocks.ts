/**
 * Units -> blocks (spec section 6.4 and the block side of 6.6): paragraphs,
 * headings, lists, standalone fields, grid rows, choices, checkbox grids and
 * radio groups. Block ids and origins are assigned later, per page.
 */

import type {
  ChoiceBlock,
  FieldBlock,
  GroupBlock,
  InlineField,
  ListBlock,
  ListItem,
  MobileBlock,
  RadioGroupBlock,
  RadioOption,
  SourceWidget,
  SyntheticText,
  TextRun,
} from "../../types";
import {
  CHECKBOX_COLUMN_PT,
  CHECKBOX_GRID_MIN_COLUMNS,
  CHECKBOX_GRID_MIN_ROWS,
  HEADING_H1_RATIO,
  HEADING_MAX_CHARS,
  HEADING_SIZE_RATIO,
  LABEL_ABOVE_LINES,
  LABEL_MAX_CHARS,
  LINE_HEIGHT_EM,
  LIST_HANGING_EM,
  LIST_INDENT_EM,
  PARAGRAPH_LEFT_EM,
  PARAGRAPH_LINE_GAP_EM,
  PARAGRAPH_SIZE_RATIO,
  RUN_ON_LINE_GAP_EM,
} from "../constants";
import { humanizeFieldName } from "../fields/humanize";
import type { Cell, ChoiceUnit, Part, TextUnit, Unit } from "../fields/anchor";
import { unionBox, xOverlap } from "../geom";
import { isBoxGlyphItem, normalizeText } from "../normalize";
import type { PageContext, Segment } from "./model";
import { InlineBuilder, runsForItems } from "./runs";
import { makeSegment } from "./segments";
import { structHeadingLevel } from "./struct";

/** List markers (spec 6.4): "1." "(a)" "iv)" and bullets. */
export const LIST_MARKER =
  /^(\(?[0-9]{1,3}[.)]|\(?[a-z]{1,2}\)|\(?[ivx]{1,4}\)|[\u2022\u25AA\u25E6\u2013-])\s/u;
const BULLET = /^[\u2022\u25AA\u25E6\u2013-]$/u;
/** A line ending like this continues its sentence on the next line. */
const RUNS_ON = /[\p{Ll},]$/u;

const segsOf = (parts: Part[]) => parts.flatMap((p) => (p.kind === "seg" ? [p.seg] : []));

export function syntheticLabel(w: SourceWidget): SyntheticText {
  return w.tooltip
    ? { kind: "synthetic", text: w.tooltip, origin: "tooltip" }
    : { kind: "synthetic", text: humanizeFieldName(w.name), origin: "fieldName" };
}

export function inlineField(w: SourceWidget, ctx: PageContext): InlineField {
  const hint = runsForItems(ctx.page.pageIndex, ctx.hints.get(w.id) ?? []);
  return {
    kind: "field",
    fieldId: w.id,
    ariaLabel: syntheticLabel(w),
    ...(hint.length ? { hint } : {}),
  };
}

/** Segments in reading order with line-aware joins. */
function addSegs(b: InlineBuilder, segs: Segment[], firstJoin: "line" | "segment") {
  segs.forEach((s, i) => {
    const join = i === 0 ? firstJoin : segs[i - 1].lineId === s.lineId ? "segment" : "line";
    b.addSegment(s, join);
  });
}

function labelRuns(segs: Segment[], pageIndex: number): TextRun[] {
  const b = new InlineBuilder(pageIndex);
  addSegs(b, segs, "segment");
  return b.buildRuns();
}

function fieldBlock(cell: Cell, ctx: PageContext): FieldBlock {
  const w = cell.widget;
  const hint = runsForItems(ctx.page.pageIndex, ctx.hints.get(w.id) ?? []);
  let label: FieldBlock["label"];
  if (cell.label.length) {
    label = { kind: "source", runs: labelRuns(cell.label, ctx.page.pageIndex) };
  } else {
    label = { kind: "synthetic", text: syntheticLabel(w) };
    ctx.stats.fallbackPlaced.add(w.id);
  }
  return {
    type: "field",
    id: "",
    origin: null,
    fieldId: w.id,
    kind: w.kind,
    label,
    ...(hint.length ? { hint } : {}),
  };
}

function choiceLabel(parts: Part[], ctx: PageContext) {
  const b = new InlineBuilder(ctx.page.pageIndex);
  let prev: Segment | null = null;
  for (const p of parts) {
    if (p.kind === "seg") {
      b.addSegment(p.seg, prev && prev.lineId !== p.seg.lineId ? "line" : "segment");
      prev = p.seg;
    } else {
      b.addField(inlineField(p.widget, ctx));
      prev = null;
    }
  }
  return b.build();
}

function choiceBlock(u: ChoiceUnit, ctx: PageContext): ChoiceBlock {
  return { type: "choice", id: "", origin: null, fieldId: u.widget.id, label: choiceLabel(u.label, ctx) };
}

/* ------------------------------------------------------------------------ */
/* Paragraphs, headings, lists                                               */
/* ------------------------------------------------------------------------ */

interface LineInfo {
  unit: TextUnit;
  box: ReturnType<typeof unionBox>;
  size: number;
  bold: boolean;
  text: string;
  marker: boolean;
  /** Every segment is page furniture kept in the flow. */
  furniture: boolean;
  /** The line starts with a printed box glyph (a checkbox option row). */
  boxStart: boolean;
}

function lineInfo(u: TextUnit): LineInfo {
  const segs = segsOf(u.parts);
  const text = segs.map((s) => s.text).join(" ").trim();
  return {
    unit: u,
    box: unionBox(segs.map((s) => s.box)),
    size: Math.max(...segs.map((s) => s.fontSize)),
    bold: segs.every((s) => s.bold),
    text,
    marker: u.parts[0]?.kind === "seg" && LIST_MARKER.test(text),
    furniture: segs.length > 0 && segs.every((s) => s.furniture),
    boxStart: !!segs[0]?.items[0] && isBoxGlyphItem(segs[0].items[0]),
  };
}

const SENTENCE_END = /[.:;!?)]$/u;
const LOWER_START_TEXT = /^\p{Ll}/u;

function canJoin(para: LineInfo[], next: LineInfo): boolean {
  const last = para[para.length - 1];
  const first = para[0];
  if (next.furniture !== last.furniture) return false;
  // A marker starts a new item unless the sentence clearly runs on
  // ("... upon thirty" / "(30) days' notice").
  if (next.marker && !RUNS_ON.test(last.text)) return false;
  if (Math.abs(next.size - last.size) > PARAGRAPH_SIZE_RATIO * Math.max(next.size, last.size)) return false;
  // A style change starts a new block, unless the sentence plainly runs on
  // into the next line (N5: a bold first line ending "move out of your",
  // then "rental unit by the following termination date:").
  const sentenceRunsOn =
    !SENTENCE_END.test(last.text) &&
    !next.marker &&
    !next.boxStart &&
    LOWER_START_TEXT.test(next.text);
  if (next.bold !== last.bold && !sentenceRunsOn) return false;
  const size = Math.max(next.size, last.size);
  const pitch = next.box.bottom - last.box.bottom;
  const maxPitch = (sentenceRunsOn ? RUN_ON_LINE_GAP_EM : PARAGRAPH_LINE_GAP_EM) * size;
  if (pitch <= 0.3 * size || pitch > maxPitch) return false;
  if (xOverlap(next.box, last.box) <= 0) return false;
  const dl = next.box.left - last.box.left;
  if (Math.abs(dl) <= PARAGRAPH_LEFT_EM * size) return true;
  // Right-aligned or centred lines (sidebar titles).
  if (Math.abs(next.box.right - last.box.right) <= PARAGRAPH_LEFT_EM * size) return true;
  const mid = (b: { left: number; right: number }) => (b.left + b.right) / 2;
  if (Math.abs(mid(next.box) - mid(last.box)) <= PARAGRAPH_LEFT_EM * size) return true;
  // Hanging indent after a list marker.
  if (first.marker && next.box.left >= first.box.left - PARAGRAPH_LEFT_EM * size &&
      next.box.left <= first.box.left + LIST_HANGING_EM * size) return true;
  // First-line indent: the second line starts left of the first.
  if (para.length === 1 && dl < 0 && -dl <= 3 * size) return true;
  return false;
}

/** Split the first segment's items into the printed marker and the rest. */
function splitMarker(info: LineInfo): { marker: Segment | null; rest: Segment | null } {
  const first = info.unit.parts[0];
  if (first?.kind !== "seg") return { marker: null, rest: null };
  const m = LIST_MARKER.exec(info.text);
  if (!m) return { marker: null, rest: null };
  const target = normalizeText(m[1]);
  const seg = first.seg;
  let acc = "";
  for (let k = 0; k < seg.items.length; k++) {
    acc += normalizeText(seg.items[k].str);
    if (acc === target) {
      const markerSeg = makeSegment(seg.id, seg.pageIndex, seg.lineId, seg.items.slice(0, k + 1), seg.spaceBefore);
      const restItems = seg.items.slice(k + 1);
      const rest = restItems.length
        ? makeSegment(seg.id, seg.pageIndex, seg.lineId, restItems, seg.spaceBefore)
        : null;
      return { marker: markerSeg, rest };
    }
    if (!target.startsWith(acc)) break;
  }
  return { marker: null, rest: null };
}

function paragraphNodes(lines: LineInfo[], ctx: PageContext, skipFirstSeg: Segment | null, firstSeg: Segment | null) {
  const b = new InlineBuilder(ctx.page.pageIndex);
  lines.forEach((l, li) => {
    let prevSeg: Segment | null = null;
    l.unit.parts.forEach((p, pi) => {
      if (p.kind === "widget") {
        b.addField(inlineField(p.widget, ctx));
        prevSeg = null;
        return;
      }
      let seg: Segment | null = p.seg;
      if (li === 0 && pi === 0 && skipFirstSeg) seg = firstSeg;
      if (!seg) return;
      const join = b.empty ? "segment" : prevSeg || pi > 0 ? "segment" : "line";
      b.addSegment(seg, li > 0 && pi === 0 ? "line" : join);
      prevSeg = seg;
    });
  });
  return b.build();
}

interface ParaOut {
  block: MobileBlock;
  /** For list grouping. */
  listItem?: { item: ListItem; left: number; size: number; ordered: boolean };
}

function paragraphToBlock(lines: LineInfo[], ctx: PageContext): ParaOut {
  const hasField = lines.some((l) => l.unit.parts.some((p) => p.kind === "widget"));
  if (lines.every((l) => l.furniture) && !hasField) {
    return {
      block: { type: "paragraph", id: "", origin: null, content: paragraphNodes(lines, ctx, null, null), role: "furniture" },
    };
  }
  const allItems = lines.flatMap((l) => segsOf(l.unit.parts).flatMap((s) => s.items.map((i) => i.index)));
  // A heading is a short standalone line (or a title wrapped over at most 3
  // lines) that is bold throughout or clearly larger than body text.
  if (lines.length <= 3 && !hasField) {
    const text = lines.map((l) => l.text).join(" ");
    const size = Math.max(...lines.map((l) => l.size));
    const structLevel = structHeadingLevel(allItems, ctx.structRole);
    const looks =
      /[\p{L}\p{N}]/u.test(text) &&
      text.length <= HEADING_MAX_CHARS &&
      !text.endsWith(",") &&
      !lines[0].marker &&
      (lines.every((l) => l.bold) || size >= HEADING_SIZE_RATIO * ctx.bodySize);
    if (structLevel || looks) {
      const level = structLevel ?? (size >= HEADING_H1_RATIO * ctx.bodySize ? 1 : 2);
      const b = new InlineBuilder(ctx.page.pageIndex);
      lines.forEach((l, i) => addSegs(b, segsOf(l.unit.parts), i === 0 ? "segment" : "line"));
      return { block: { type: "heading", id: "", origin: null, level, content: b.buildRuns() } };
    }
  }
  if (lines[0].marker) {
    const { marker, rest } = splitMarker(lines[0]);
    const content = marker
      ? paragraphNodes(lines, ctx, (lines[0].unit.parts[0] as { seg: Segment }).seg, rest)
      : paragraphNodes(lines, ctx, null, null);
    const markerRuns = marker ? labelRuns([marker], ctx.page.pageIndex) : [];
    const m = LIST_MARKER.exec(lines[0].text);
    const item: ListItem = {
      id: "",
      marker: markerRuns.length === 1 ? markerRuns[0] : null,
      content: markerRuns.length > 1 ? [...markerRuns, ...content] : content,
      children: [],
    };
    return {
      block: { type: "list", id: "", origin: null, ordered: !BULLET.test(m ? m[1] : ""), items: [item] },
      listItem: { item, left: lines[0].box.left, size: lines[0].size, ordered: !BULLET.test(m ? m[1] : "") },
    };
  }
  const content = paragraphNodes(lines, ctx, null, null);
  const runs = content.filter((n): n is TextRun => n.kind === "text");
  const small = runs.length > 0 && runs.every((r) => r.small);
  return { block: { type: "paragraph", id: "", origin: null, content, role: small ? "small" : "body" } };
}

/** Merge consecutive one-item lists into list blocks (max 2 levels). */
function groupLists(outs: ParaOut[]): MobileBlock[] {
  const blocks: MobileBlock[] = [];
  let cur: { block: ListBlock; baseLeft: number; last: ListItem | null } | null = null;
  for (const o of outs) {
    if (!o.listItem) {
      cur = null;
      blocks.push(o.block);
      continue;
    }
    const li = o.listItem;
    if (!cur || cur.block.ordered !== li.ordered) {
      cur = { block: o.block as ListBlock, baseLeft: li.left, last: li.item };
      blocks.push(o.block);
      continue;
    }
    const depth = Math.min(1, Math.max(0, Math.round((li.left - cur.baseLeft) / (LIST_INDENT_EM * li.size))));
    if (depth > 0 && cur.last) cur.last.children.push(li.item);
    else {
      cur.block.items.push(li.item);
      cur.last = li.item;
    }
  }
  return blocks;
}

/* ------------------------------------------------------------------------ */
/* Checkbox grids (rule 7)                                                   */
/* ------------------------------------------------------------------------ */

interface GridPlan {
  header: TextUnit | null;
  columns: { x: number; heading: Segment[]; units: ChoiceUnit[] }[];
}

function planCheckboxGrid(run: ChoiceUnit[], header: Unit | undefined, ctx: PageContext, lh: number): GridPlan | null {
  if (run.some((u) => u.widget.kind !== "checkbox")) return null;
  const lefts = run.map((u) => u.widget.box.left).sort((a, b) => a - b);
  const clusters: { x: number; units: ChoiceUnit[] }[] = [];
  for (const x of lefts) {
    const c = clusters[clusters.length - 1];
    if (c && x - c.x <= CHECKBOX_COLUMN_PT) continue;
    clusters.push({ x, units: [] });
  }
  for (const u of run) {
    const c = clusters.find((k) => Math.abs(u.widget.box.left - k.x) <= CHECKBOX_COLUMN_PT);
    c?.units.push(u);
  }
  const cols = clusters.filter((c) => new Set(c.units.map((u) => u.band)).size >= CHECKBOX_GRID_MIN_ROWS);
  if (cols.length < CHECKBOX_GRID_MIN_COLUMNS) return null;
  const xs = cols.map((c) => c.x).sort((a, b) => a - b);
  const columns = xs.map((x) => ({ x, heading: [] as Segment[], units: [] as ChoiceUnit[] }));
  for (const u of run) {
    let k = -1;
    xs.forEach((x, i) => {
      if (x <= u.widget.box.left + CHECKBOX_COLUMN_PT) k = i;
    });
    if (k < 0) {
      ctx.stats.failures.push({
        code: "unresolvedGrid",
        detail: `checkbox ${u.widget.name} sits left of the grid's first column`,
      });
      return null;
    }
    columns[k].units.push(u);
  }
  let headerUnit: TextUnit | null = null;
  if (header && header.t === "text" && header.parts.every((p) => p.kind === "seg")) {
    const segs = segsOf(header.parts);
    const top = Math.min(...run.map((u) => u.box.top));
    const colOf = (s: Segment) => {
      let k = -1;
      xs.forEach((x, i) => {
        if (x - CHECKBOX_COLUMN_PT <= s.box.left) k = i;
      });
      const nextX = xs[k + 1] ?? Infinity;
      return k >= 0 && s.box.right <= nextX + CHECKBOX_COLUMN_PT ? k : -1;
    };
    const ks = segs.map(colOf);
    if (
      top - header.box.bottom <= LABEL_ABOVE_LINES * lh &&
      ks.every((k) => k >= 0) &&
      segs.every((s) => s.text.length <= LABEL_MAX_CHARS)
    ) {
      headerUnit = header;
      segs.forEach((s, i) => columns[ks[i]].heading.push(s));
    }
  }
  return { header: headerUnit, columns };
}

/* ------------------------------------------------------------------------ */
/* Units -> blocks                                                           */
/* ------------------------------------------------------------------------ */

export function unitsToBlocks(units: Unit[], ctx: PageContext): MobileBlock[] {
  const lh = LINE_HEIGHT_EM * (ctx.bodySize || 10);
  const out: MobileBlock[] = [];
  let paras: ParaOut[] = [];
  let lines: LineInfo[] = [];
  const flushPara = () => {
    if (lines.length) paras.push(paragraphToBlock(lines, ctx));
    lines = [];
  };
  const flushText = () => {
    flushPara();
    if (paras.length) out.push(...groupLists(paras));
    paras = [];
  };

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.t === "text") {
      const info = lineInfo(u);
      if (lines.length && !canJoin(lines, info)) flushPara();
      lines.push(info);
      continue;
    }
    if (u.t === "fields") {
      flushText();
      if (u.cells.length === 1) out.push(fieldBlock(u.cells[0], ctx));
      else {
        ctx.stats.gridRegions++;
        out.push({
          type: "group",
          id: "",
          origin: null,
          layout: "grid",
          heading: null,
          children: u.cells.map((c) => fieldBlock(c, ctx)),
        });
      }
      continue;
    }
    // Choices: collect the run of consecutive choice units.
    let j = i;
    const run: ChoiceUnit[] = [];
    while (j < units.length && units[j].t === "choice") run.push(units[j++] as ChoiceUnit);
    const plan = planCheckboxGrid(run, units[i - 1], ctx, lh);
    if (plan) {
      // The header line was flushed into the current paragraph; take it back.
      if (plan.header && lines.length && lines[lines.length - 1].unit === plan.header) lines.pop();
      flushText();
      ctx.stats.gridRegions++;
      const grid: GroupBlock = {
        type: "group",
        id: "",
        origin: null,
        layout: "checkboxGrid",
        heading: null,
        children: plan.columns.map((c) => ({
          type: "group",
          id: "",
          origin: null,
          layout: "grid",
          heading: c.heading.length ? labelRuns(c.heading, ctx.page.pageIndex) : null,
          children: c.units.map((cu) => choiceBlock(cu, ctx)),
        })),
      };
      out.push(grid);
    } else {
      flushText();
      for (const cu of run) out.push(choiceBlock(cu, ctx));
    }
    i = j - 1;
  }
  flushText();
  return out;
}

/* ------------------------------------------------------------------------ */
/* Radio groups (rule 6)                                                     */
/* ------------------------------------------------------------------------ */

function plainText(b: MobileBlock): TextRun[] | null {
  if (b.type === "paragraph" && b.role === "body" && b.content.every((n) => n.kind === "text")) {
    return b.content as TextRun[];
  }
  if (b.type === "heading") return b.content;
  return null;
}

/** All radio choices sharing a name become one group, placed where the
 * first option is. Applied to each sibling list recursively. */
export function groupRadios(blocks: MobileBlock[], widgetById: Map<string, SourceWidget>): MobileBlock[] {
  const out: MobileBlock[] = [];
  const groups = new Map<string, RadioGroupBlock>();
  for (const b of blocks) {
    if (b.type === "group") {
      out.push({ ...b, children: groupRadios(b.children, widgetById) });
      continue;
    }
    if (b.type === "keyValue") {
      out.push({ ...b, value: groupRadios(b.value, widgetById) });
      continue;
    }
    const w = b.type === "choice" ? widgetById.get(b.fieldId) : undefined;
    if (b.type !== "choice" || !w || w.kind !== "radio") {
      out.push(b);
      continue;
    }
    const option: RadioOption = { fieldId: b.fieldId, label: b.label };
    const existing = groups.get(w.name);
    if (existing) {
      existing.options.push(option);
      continue;
    }
    // Group label: a short text line right before the group, else tooltip.
    let label: RadioGroupBlock["label"] = w.tooltip
      ? { kind: "synthetic", text: { kind: "synthetic", text: w.tooltip, origin: "tooltip" } }
      : null;
    const prev = out[out.length - 1];
    const prevRuns = prev ? plainText(prev) : null;
    if (prev && prevRuns && prevRuns.map((r) => r.text).join("").length <= LABEL_MAX_CHARS) {
      out.pop();
      label = { kind: "source", runs: prevRuns };
    }
    const group: RadioGroupBlock = {
      type: "radioGroup",
      id: "",
      origin: null,
      groupName: w.name,
      label,
      options: [option],
    };
    groups.set(w.name, group);
    out.push(group);
  }
  return out;
}
