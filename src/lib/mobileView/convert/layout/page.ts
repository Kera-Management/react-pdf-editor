/**
 * Per-page layout: printed boxes and guides under widgets, furniture,
 * regions, units and blocks. Pure and synchronous.
 */

import type {
  KeyValueBlock,
  MobileBlock,
  ParagraphBlock,
  SourcePage,
  SourceTextItem,
  TextRun,
} from "../../types";
import { KEY_VALUE_LEVEL_EM, UNDER_WIDGET_SHARE } from "../constants";

/** A left block closer than this (x body size) to the one above, and not
 * level with any right block, continues that label. */
const LABEL_GROUP_GAP_EM = 0.5;
import { leafUnits } from "../fields/anchor";
import { centreY, insideShare, unionBox } from "../geom";
import { isBoxGlyphItem, normalizeText } from "../normalize";
import { groupRadios, unitsToBlocks } from "./blocks";
import { blockBoxes } from "./finalize";
import type { Element, PageContext, Segment } from "./model";
import { newStats } from "./model";
import { InlineBuilder } from "./runs";
import { structInfo } from "./struct";
import { cutRegion, type Region } from "./xycut";

/** Printed date guides under comb/text fields ("dd/mm/yyyy", "/", "YYYY"). */
const GUIDE = /^[/\-.:dDmMyYjJaAhH]{1,12}$/u;

/** Builds the page context and returns the items that flow as text. */
export function preparePage(page: SourcePage): { ctx: PageContext; flow: SourceTextItem[] } {
  const widgets = page.widgets.filter((w) => !w.hidden);
  const boxes = widgets.filter((w) => w.kind === "checkbox" || w.kind === "radio");
  const textWidgets = widgets.filter((w) => w.kind === "text" || w.kind === "multiline" || w.kind === "select");
  const hints = new Map<string, SourceTextItem[]>();
  const hintOwner = new Map<number, string>();
  const flow: SourceTextItem[] = [];
  const sizes: { size: number; n: number }[] = [];
  for (const it of page.items) {
    const n = normalizeText(it.str);
    if (!n) continue;
    // Fake bold: the same text drawn again over itself reads once.
    if (it.duplicateOf !== undefined) continue;
    if (isBoxGlyphItem(it) && boxes.some((w) => insideShare(it.box, w.box) >= UNDER_WIDGET_SHARE)) continue;
    const owner = textWidgets.find((w) => insideShare(it.box, w.box) >= UNDER_WIDGET_SHARE);
    if (owner && GUIDE.test(n)) {
      if (!hints.has(owner.id)) hints.set(owner.id, []);
      hints.get(owner.id)!.push(it);
      hintOwner.set(it.index, owner.id);
      continue;
    }
    flow.push(it);
    sizes.push({ size: it.fontSize, n: n.length });
  }
  for (const list of hints.values()) list.sort((a, b) => a.box.left - b.box.left || a.index - b.index);
  const struct = structInfo(page);
  const stats = newStats();
  stats.usedStructTree = !!struct;
  return {
    ctx: {
      page,
      widgets,
      widgetById: new Map(widgets.map((w) => [w.id, w])),
      itemByIndex: new Map(page.items.map((i) => [i.index, i])),
      hintOwner,
      hints,
      bodySize: weightedMedian(sizes) || 10,
      structRole: struct?.role ?? null,
      structRank: struct?.rank ?? null,
      stats,
    },
    flow,
  };
}

function weightedMedian(values: { size: number; n: number }[]): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a.size - b.size);
  const total = sorted.reduce((s, v) => s + v.n, 0);
  let acc = 0;
  for (const v of sorted) {
    acc += v.n;
    if (acc >= total / 2) return v.size;
  }
  return sorted[sorted.length - 1].size;
}

function furnitureBlocks(segs: Segment[], pageIndex: number): ParagraphBlock[] {
  const byLine = new Map<number, Segment[]>();
  for (const s of segs) {
    if (!byLine.has(s.lineId)) byLine.set(s.lineId, []);
    byLine.get(s.lineId)!.push(s);
  }
  return [...byLine.values()]
    .map((line) => line.sort((a, b) => a.box.left - b.box.left))
    .sort((a, b) => a[0].box.top - b[0].box.top)
    .map((line) => {
      const b = new InlineBuilder(pageIndex);
      b.addSegments(line, "segment");
      return { type: "paragraph", id: "", origin: null, content: b.build(), role: "furniture" };
    });
}

function minRank(elems: Element[], ctx: PageContext): number | null {
  if (!ctx.structRank) return null;
  let best: number | null = null;
  for (const e of elems) {
    if (e.kind !== "seg") continue;
    for (const it of e.seg.items) {
      const r = ctx.structRank.get(it.index);
      if (r !== undefined && (best === null || r < best)) best = r;
    }
  }
  return best;
}

function regionElems(r: Region): Element[] {
  if (r.kind === "leaf") return r.elems;
  if (r.kind === "stack") return r.children.flatMap(regionElems);
  return [...regionElems(r.left), ...regionElems(r.right)];
}

/** Font family of an item, without the subset tag or the style suffix
 * ("RAJWDP+Verdana-Bold" -> "verdana"). Empty when unknown. */
function familyOf(item: SourceTextItem | undefined): string {
  if (!item) return "";
  return item.fontName
    .replace(/^[A-Z]{6}\+/, "")
    .replace(/[-,].*$/, "")
    .replace(/(MT|PS)$/, "")
    .toLowerCase();
}

/** Family of a text block's first (`end` false) or last source item. */
function blockFamily(b: MobileBlock, ctx: PageContext, end: boolean): string {
  const runs = textRunsOf(b);
  if (!runs?.length) return "";
  const run = end ? runs[runs.length - 1] : runs[0];
  const index = end ? run.sources[run.sources.length - 1] : run.sources[0];
  return familyOf(ctx.itemByIndex.get(index));
}

function textRunsOf(b: MobileBlock): TextRun[] | null {
  if (b.type === "heading") return b.content;
  if (b.type === "paragraph" && b.content.every((n) => n.kind === "text")) return b.content as TextRun[];
  return null;
}

/**
 * Label/body tables (N4 "What you need to know", N1 "Your New Rent"): a
 * narrow left column of text labels. Each label becomes a key/value block
 * holding the right-hand blocks from its top down to the next label. Right
 * blocks above the first label come first. Returns null when a label is not
 * plain text.
 */
function pairLabels(
  L: MobileBlock[],
  R: MobileBlock[],
  ctx: PageContext,
  /** Every label must start level with a right-hand block (tables). */
  strict = false
): MobileBlock[] | null {
  if (!L.length) return null;
  const tol = KEY_VALUE_LEVEL_EM * ctx.bodySize;
  const boxOf = (b: MobileBlock) => {
    const bx = blockBoxes(b, ctx);
    return bx.length ? unionBox(bx) : null;
  };
  const lBoxes = L.map(boxOf);
  const rBoxes = R.map(boxOf);
  if (lBoxes.some((b) => !b) || rBoxes.some((b) => !b)) return null;
  if (L.some((b) => !textRunsOf(b))) return null;
  // Adjacent left blocks (a label wrapped over lines in two styles) form
  // one label.
  const rTops = rBoxes.map((b) => b!.top);
  const groups: { blocks: MobileBlock[]; top: number; bottom: number }[] = [];
  L.forEach((b, i) => {
    const box = lBoxes[i]!;
    const g = groups[groups.length - 1];
    const level = rTops.some((r) => Math.abs(r - box.top) <= tol);
    // A label in another typeface is a new label, not a wrapped line (N8:
    // the bold "Signature" heading over a "First Name" field caption).
    const prevFamily = g ? blockFamily(g.blocks[g.blocks.length - 1], ctx, true) : "";
    const family = blockFamily(b, ctx, false);
    const sameFace = !prevFamily || !family || prevFamily === family;
    if (g && !level && sameFace && box.top - g.bottom <= LABEL_GROUP_GAP_EM * ctx.bodySize) {
      g.blocks.push(b);
      g.bottom = Math.max(g.bottom, box.bottom);
    } else groups.push({ blocks: [b], top: box.top, bottom: box.bottom });
  });
  // Labels and values must each run top to bottom for pairing to hold.
  for (let i = 1; i < groups.length; i++) if (groups[i].top < groups[i - 1].top) return null;
  for (let i = 1; i < rTops.length; i++) if (rTops[i] < rTops[i - 1] - tol) return null;
  if (strict && !groups.every((g) => rTops.some((r) => Math.abs(r - g.top) <= tol))) return null;
  const out: MobileBlock[] = R.filter((_, k) => rTops[k] < groups[0].top - tol);
  groups.forEach((g, i) => {
    const from = g.top - tol;
    const to = i + 1 < groups.length ? groups[i + 1].top - tol : Infinity;
    const value = R.filter((_, k) => rTops[k] >= from && rTops[k] < to);
    if (!value.length) {
      out.push(...g.blocks);
      return;
    }
    // Join the label's blocks with a space (whitespace is not source text).
    const label = g.blocks.flatMap((b, n) =>
      textRunsOf(b)!.map((r, k) => (n > 0 && k === 0 ? { ...r, text: ` ${r.text}` } : r))
    );
    const kv: KeyValueBlock = { type: "keyValue", id: "", origin: null, label, value };
    out.push(kv);
  });
  return out;
}

function regionToBlocks(r: Region, ctx: PageContext): MobileBlock[] {
  if (r.kind === "leaf") return unitsToBlocks(leafUnits(r.elems, ctx), ctx);
  if (r.kind === "stack") return r.children.flatMap((c) => regionToBlocks(c, ctx));
  const L = regionToBlocks(r.left, ctx);
  const R = regionToBlocks(r.right, ctx);
  // A label column is never read on its own, tagged or not: the reader
  // needs each label next to what it labels.
  if (r.labelColumn) return pairLabels(L, R, ctx) ?? regionToBlocks(r.plain, ctx);
  // Prose columns on a tagged page: the struct tree decides which comes first.
  const lr = minRank(regionElems(r.left), ctx);
  const rr = minRank(regionElems(r.right), ctx);
  if (lr !== null && rr !== null) return rr < lr ? [...R, ...L] : [...L, ...R];
  // Prose on both sides: a table when every left block starts level with a
  // right block, else two columns read one after the other.
  const table = pairLabels(L, R, ctx, true);
  if (table) return table;
  return [...L, ...R];
}

/** Lays out one page (without its page break). */
export function layoutPage(ctx: PageContext, segments: Segment[], furniture: Set<number>): MobileBlock[] {
  const H = ctx.page.height;
  const header: Segment[] = [];
  const footer: Segment[] = [];
  const elems: Element[] = [];
  // Furniture moves to the top (headers) or bottom (footers) of the page
  // only when nothing else sits above (or below) it; otherwise it stays in
  // the flow so the reading order is unchanged.
  const body = segments.filter((s) => !furniture.has(s.id));
  const others = [...body.map((s) => s.box), ...ctx.widgets.map((w) => w.box)].map(centreY);
  for (const s of segments) {
    if (!furniture.has(s.id)) continue;
    const isHeader = centreY(s.box) < H / 2;
    if (isHeader && !others.some((cy) => cy < s.box.top)) header.push(s);
    else if (!isHeader && !others.some((cy) => cy > s.box.bottom)) footer.push(s);
    else body.push({ ...s, furniture: true });
  }
  for (const s of body) elems.push({ kind: "seg", seg: s, box: s.box });
  for (const w of ctx.widgets) elems.push({ kind: "widget", widget: w, box: w.box });
  const cut = { columns: 1 };
  const flow = elems.length ? regionToBlocks(cutRegion(elems, ctx.bodySize, cut), ctx) : [];
  ctx.stats.columns = cut.columns;
  const blocks = [
    ...furnitureBlocks(header, ctx.page.pageIndex),
    ...flow,
    ...furnitureBlocks(footer, ctx.page.pageIndex),
  ];
  return groupRadios(blocks, ctx.widgetById);
}

