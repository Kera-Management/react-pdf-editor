/**
 * pdf.js adapter: the only converter code that touches pdf.js output. It
 * reads text content (with marked content) and the struct tree of a page
 * the editor has already rendered, and returns a `SourcePage` in top-left
 * page space. No pdfjs-dist import: `PdfPageLike` is structural.
 */

import type {
  Box,
  ExtractPage,
  PageGraphics,
  PdfPageLike,
  SourceTextItem,
  StructNode,
  StructRole,
} from "../types";
import { isDrawnTwice, normalizeText } from "./normalize";

interface RawTextItem {
  str: string;
  transform: number[];
  width: number;
  fontName: string;
  hasEOL?: boolean;
}

interface RawMarked {
  type: "beginMarkedContent" | "beginMarkedContentProps" | "endMarkedContent";
  tag?: string | null;
  id?: string | null;
}

interface RawStructNode {
  role?: string;
  type?: string;
  id?: string;
  children?: RawStructNode[];
}

const BOLD = /bold|black|heavy|semibold|demi/i;
const ITALIC = /italic|oblique/i;
const DINGBAT = /dingbat|zapf|wingding|symbol/i;
const ROLES = new Set<StructRole>([
  "H1", "H2", "H3", "H4", "H5", "H6", "P", "L", "LI", "Lbl", "LBody",
  "Table", "TR", "TH", "TD", "Form",
]);

function mcidOf(id: string | null | undefined): number | undefined {
  if (!id) return undefined;
  const m = /_mc(\d+)$/.exec(id);
  return m ? Number(m[1]) : undefined;
}

function fontNameOf(
  id: string,
  styles: Record<string, unknown>,
  commonObjs: { has(id: string): boolean; get(id: string): unknown }
): string {
  try {
    if (commonObjs.has(id)) {
      const font = commonObjs.get(id) as { name?: string } | null;
      if (font && typeof font.name === "string" && font.name) return font.name;
    }
  } catch {
    // Not resolved yet: fall back to the generic family.
  }
  const style = styles[id] as { fontFamily?: string } | undefined;
  return style?.fontFamily ?? "";
}

/** Simplify the pdf.js struct tree to `StructNode[]`, keeping only mcids. */
export function simplifyStructTree(root: unknown): StructNode[] | null {
  const r = root as RawStructNode | null;
  if (!r || !Array.isArray(r.children)) return null;
  let any = false;
  const walk = (n: RawStructNode): StructNode => {
    const role = (n.role && ROLES.has(n.role as StructRole) ? n.role : "other") as StructRole;
    const node: StructNode = { role, mcids: [], children: [] };
    for (const c of n.children ?? []) {
      if (c.type === "content") {
        const mc = mcidOf(c.id);
        if (mc !== undefined) {
          node.mcids.push(mc);
          any = true;
        }
      } else if (!c.type) {
        node.children.push(walk(c));
      }
    }
    return node;
  };
  const nodes = r.children.filter((c) => !c.type).map(walk);
  return any ? nodes : null;
}

/**
 * pdf.js `OPS` codes the graphics scan reads. Copied rather than imported
 * (this module stays free of pdfjs-dist); `extract.test.ts` checks them
 * against the installed pdfjs-dist so an upgrade can't drift silently.
 */
export const PDF_OPS = {
  save: 10,
  restore: 11,
  transform: 12,
  setTextRenderingMode: 38,
  showText: 44,
  showSpacedText: 45,
  nextLineShowText: 46,
  nextLineSetSpacingShowText: 47,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  paintImageMaskXObject: 83,
  paintImageXObject: 85,
  paintInlineImageXObject: 86,
  paintSolidColorImageMask: 90,
} as const;

type Matrix = [number, number, number, number, number, number];

/** `m` then `ctm` (PDF's row-vector order: CTM' = m x CTM). */
function concat(m: Matrix, ctm: Matrix): Matrix {
  return [
    m[0] * ctm[0] + m[1] * ctm[2],
    m[0] * ctm[1] + m[1] * ctm[3],
    m[2] * ctm[0] + m[3] * ctm[2],
    m[2] * ctm[1] + m[3] * ctm[3],
    m[4] * ctm[0] + m[5] * ctm[2] + ctm[4],
    m[4] * ctm[1] + m[5] * ctm[3] + ctm[5],
  ];
}

const isMatrix = (v: unknown): v is Matrix =>
  Array.isArray(v) && v.length === 6 && v.every((n) => typeof n === "number" && Number.isFinite(n));

/** Glyph array of a show-text op: pdf.js glyph objects carry `unicode`. */
function visibleGlyphs(arg: unknown): number {
  if (!Array.isArray(arg)) return 0;
  let n = 0;
  for (const g of arg) {
    const u = g && typeof g === "object" ? (g as { unicode?: unknown }).unicode : undefined;
    if (typeof u === "string") n += normalizeText(u).length;
  }
  return n;
}

/**
 * Walks the operator list for painted images (the unit square under the
 * current transform) and for glyphs drawn with an invisible render mode.
 * Returns null when the list can't be read.
 */
export async function scanGraphics(page: PdfPageLike): Promise<PageGraphics | null | undefined> {
  if (typeof page.getOperatorList !== "function") return undefined;
  let list: { fnArray: number[]; argsArray: unknown[] };
  try {
    list = await page.getOperatorList();
  } catch {
    return null;
  }
  if (!list || !Array.isArray(list.fnArray) || !Array.isArray(list.argsArray)) return null;
  const [x0, y0, x1, y1] = page.view;
  const images: Box[] = [];
  let invisibleChars = 0;
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  let mode = 0;
  const stack: { ctm: Matrix; mode: number }[] = [];
  const paintUnitSquare = () => {
    const pts = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const left = Math.max(x0, Math.min(...xs)) - x0;
    const right = Math.min(x1, Math.max(...xs)) - x0;
    const top = y1 - Math.min(y1, Math.max(...ys));
    const bottom = y1 - Math.max(y0, Math.min(...ys));
    if (right > left && bottom > top) images.push({ left, top, right, bottom });
  };
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i] as unknown[] | null;
    switch (fn) {
      case PDF_OPS.save:
        stack.push({ ctm, mode });
        break;
      case PDF_OPS.restore: {
        const s = stack.pop();
        if (s) ({ ctm, mode } = s);
        break;
      }
      case PDF_OPS.transform:
        if (isMatrix(args)) ctm = concat(args, ctm);
        break;
      case PDF_OPS.paintFormXObjectBegin:
        stack.push({ ctm, mode });
        if (args && isMatrix(args[0])) ctm = concat(args[0], ctm);
        break;
      case PDF_OPS.paintFormXObjectEnd: {
        const s = stack.pop();
        if (s) ({ ctm, mode } = s);
        break;
      }
      case PDF_OPS.setTextRenderingMode:
        if (args && typeof args[0] === "number") mode = args[0];
        break;
      case PDF_OPS.showText:
      case PDF_OPS.showSpacedText:
      case PDF_OPS.nextLineShowText:
      case PDF_OPS.nextLineSetSpacingShowText:
        // Modes 3 (neither fill nor stroke) and 7 (clip only) draw nothing.
        if (mode === 3 || mode === 7) invisibleChars += visibleGlyphs(args?.[args.length - 1]);
        break;
      case PDF_OPS.paintImageXObject:
      case PDF_OPS.paintInlineImageXObject:
      case PDF_OPS.paintImageMaskXObject:
      case PDF_OPS.paintSolidColorImageMask:
        paintUnitSquare();
        break;
      default:
        break;
    }
  }
  return { images, invisibleChars };
}

/** Text whose box lies wholly outside the page view is not drawn. */
const offPage = (b: Box, width: number, height: number) =>
  b.right <= 0 || b.left >= width || b.bottom <= 0 || b.top >= height;

export const extractPage: ExtractPage = async (page, pageIndex, widgets) => {
  const [x0, , , y1] = page.view;
  const width = page.view[2] - page.view[0];
  const height = page.view[3] - page.view[1];
  const tc = await page.getTextContent({ includeMarkedContent: true });
  const styles = tc.styles ?? {};
  const items: SourceTextItem[] = [];
  /** Items drawn once so far, by string (for fake bold). */
  const seen = new Map<string, SourceTextItem[]>();
  const stack: { mcid?: number; artifact: boolean }[] = [];
  for (const raw of tc.items) {
    const marked = raw as RawMarked;
    if (marked && typeof marked.type === "string") {
      if (marked.type === "endMarkedContent") stack.pop();
      else {
        const parent = stack[stack.length - 1];
        stack.push({
          mcid: mcidOf(marked.id) ?? parent?.mcid,
          artifact: marked.tag === "Artifact" || !!parent?.artifact,
        });
      }
      continue;
    }
    const it = raw as RawTextItem;
    if (!it || typeof it.str !== "string" || !Array.isArray(it.transform)) continue;
    if (it.str === "") {
      if (it.hasEOL && items.length) items[items.length - 1].hasEOL = true;
      continue;
    }
    const [a, b, c, , e, f] = it.transform;
    const fontSize = Math.hypot(a, b) || 1;
    const left = e - x0;
    const baseline = y1 - f;
    const fontName = fontNameOf(it.fontName, styles, page.commonObjs);
    const mc = stack[stack.length - 1];
    const box = {
      left,
      top: baseline - 0.8 * fontSize,
      right: left + Math.max(0, it.width || 0),
      bottom: baseline + 0.2 * fontSize,
    };
    if (offPage(box, width, height)) continue;
    const index = items.length;
    let duplicateOf: number | undefined;
    for (const prev of seen.get(it.str) ?? []) {
      if (isDrawnTwice({ str: it.str, fontSize, baseline, box }, prev)) {
        duplicateOf = prev.index;
        break;
      }
    }
    items.push({
      index,
      str: it.str,
      box,
      baseline,
      fontSize,
      fontName,
      bold: BOLD.test(fontName),
      italic: ITALIC.test(fontName),
      dingbat: DINGBAT.test(fontName),
      rotated: Math.abs(b) > 0.01 || Math.abs(c) > 0.01,
      hasEOL: !!it.hasEOL,
      ...(mc?.mcid !== undefined ? { mcid: mc.mcid } : {}),
      ...(mc?.artifact ? { artifact: true } : {}),
      ...(duplicateOf !== undefined ? { duplicateOf } : {}),
    });
    if (duplicateOf === undefined) {
      const list = seen.get(it.str);
      if (list) list.push(items[index]);
      else seen.set(it.str, [items[index]]);
    }
  }
  let structure: StructNode[] | null = null;
  try {
    structure = simplifyStructTree(await page.getStructTree());
  } catch {
    structure = null;
  }
  const graphics = await scanGraphics(page);
  return {
    pageIndex,
    width,
    height,
    rotation: page.rotate || 0,
    items,
    widgets,
    structure,
    ...(graphics !== undefined ? { graphics } : {}),
  };
};
