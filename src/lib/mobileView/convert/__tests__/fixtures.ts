/**
 * Synthetic converter fixtures (spec section 11.1). Coordinates are top-left
 * page space in points. Glyphs are 0.5em wide; words sit 0.3em apart, which
 * is just over the 0.25em word-gap threshold.
 */

import type {
  Box,
  InlineNode,
  MobileBlock,
  MobileDocument,
  SourcePage,
  SourceTextItem,
  SourceWidget,
  StructNode,
  TextRun,
} from "../../types";

export type ItemSpec = Omit<SourceTextItem, "index">;

export interface ItemOpts {
  width?: number;
  bold?: boolean;
  italic?: boolean;
  dingbat?: boolean;
  rotated?: boolean;
  fontName?: string;
  mcid?: number;
  artifact?: boolean;
  hasEOL?: boolean;
}

export const GLYPH_EM = 0.5;
export const WORD_GAP = 0.3;

export function makeItem(str: string, left: number, baseline: number, size = 10, opts: ItemOpts = {}): ItemSpec {
  const width = opts.width ?? str.length * GLYPH_EM * size;
  return {
    str,
    box: { left, top: baseline - 0.8 * size, right: left + width, bottom: baseline + 0.2 * size },
    baseline,
    fontSize: size,
    fontName: opts.fontName ?? (opts.bold ? "Helvetica-Bold" : opts.dingbat ? "ZapfDingbats" : "Helvetica"),
    bold: !!opts.bold,
    italic: !!opts.italic,
    dingbat: !!opts.dingbat,
    rotated: !!opts.rotated,
    hasEOL: !!opts.hasEOL,
    ...(opts.mcid !== undefined ? { mcid: opts.mcid } : {}),
    ...(opts.artifact ? { artifact: true } : {}),
  };
}

/** One item per word, 0.3em apart. */
export function words(text: string, left: number, baseline: number, size = 10, opts: ItemOpts = {}): ItemSpec[] {
  const out: ItemSpec[] = [];
  let x = left;
  for (const w of text.split(" ").filter(Boolean)) {
    const it = makeItem(w, x, baseline, size, opts);
    out.push(it);
    x = it.box.right + WORD_GAP * size;
  }
  return out;
}

/** One item per glyph (no spaces): "Total" -> "T","o","t","a","l". */
export function glyphs(text: string, left: number, baseline: number, size = 10, opts: ItemOpts = {}): ItemSpec[] {
  const out: ItemSpec[] = [];
  let x = left;
  for (const ch of Array.from(text)) {
    if (ch === " ") {
      x += WORD_GAP * size;
      continue;
    }
    const it = makeItem(ch, x, baseline, size, opts);
    out.push(it);
    x = it.box.right;
  }
  return out;
}

/** Right edge of a list of items. */
export const rightOf = (items: ItemSpec[]) => Math.max(...items.map((i) => i.box.right));

/** A paragraph of lines, `pitch` apart (baseline to baseline). */
export function paragraph(lines: string[], left: number, firstBaseline: number, size = 10, pitch = 12, opts: ItemOpts = {}): ItemSpec[] {
  return lines.flatMap((l, i) => words(l, left, firstBaseline + i * pitch, size, opts));
}

export function makeWidget(
  id: string,
  kind: SourceWidget["kind"],
  box: Box,
  opts: Partial<SourceWidget> = {}
): SourceWidget {
  return { id, name: opts.name ?? id, kind, box, hidden: false, ...opts };
}

export function box(left: number, top: number, width: number, height: number): Box {
  return { left, top, right: left + width, bottom: top + height };
}

export function makePage(
  items: ItemSpec[],
  widgets: SourceWidget[] = [],
  opts: { pageIndex?: number; width?: number; height?: number; rotation?: number; structure?: StructNode[] | null } = {}
): SourcePage {
  return {
    pageIndex: opts.pageIndex ?? 0,
    width: opts.width ?? 612,
    height: opts.height ?? 792,
    rotation: opts.rotation ?? 0,
    items: items.map((it, index) => ({ ...it, index })),
    widgets,
    structure: opts.structure ?? null,
  };
}

/* Output helpers ----------------------------------------------------------- */

/** Every run in render order (as the fidelity check projects it). */
export function allRuns(doc: MobileDocument): TextRun[] {
  const out: TextRun[] = [];
  const inline = (nodes: InlineNode[]) => {
    for (const n of nodes) {
      if (n.kind === "text") out.push(n);
      else out.push(...(n.hint ?? []));
    }
  };
  const block = (b: MobileBlock) => {
    switch (b.type) {
      case "heading":
        out.push(...b.content);
        break;
      case "paragraph":
        inline(b.content);
        break;
      case "list": {
        const item = (it: (typeof b.items)[number]) => {
          if (it.marker) out.push(it.marker);
          inline(it.content);
          it.children.forEach(item);
        };
        b.items.forEach(item);
        break;
      }
      case "field":
        if (b.label?.kind === "source") out.push(...b.label.runs);
        out.push(...(b.hint ?? []));
        break;
      case "choice":
        inline(b.label);
        break;
      case "radioGroup":
        if (b.label?.kind === "source") out.push(...b.label.runs);
        b.options.forEach((o) => inline(o.label));
        break;
      case "keyValue":
        out.push(...b.label);
        b.value.forEach(block);
        break;
      case "group":
        out.push(...(b.heading ?? []));
        b.children.forEach(block);
        break;
      default:
        break;
    }
  };
  doc.blocks.forEach(block);
  return out;
}

/** The document's text in reading order, whitespace collapsed. */
export function flowText(doc: MobileDocument): string {
  return allRuns(doc)
    .map((r) => r.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Blocks without page breaks, flattened one level for assertions. */
export function bodyBlocks(doc: MobileDocument): MobileBlock[] {
  return doc.blocks.filter((b) => b.type !== "pageBreak");
}

/** Text of a list of inline nodes; fields render as [id]. */
export function inlineText(nodes: InlineNode[]): string {
  return nodes
    .map((n) => (n.kind === "text" ? n.text : `[${n.fieldId}]`))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
