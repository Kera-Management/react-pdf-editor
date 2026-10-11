/**
 * Builds `TextRun`s and inline content from segments. A run holds items of
 * one style (bold, italic, small); the joining space between two runs is put
 * at the start of the second run so no run ends in a space.
 */

import type { InlineField, InlineNode, SourceTextItem, TextRun } from "../../types";
import { SMALL_PRINT_PT } from "../constants";
import { isEmptyBoxGlyph } from "../normalize";
import type { Segment } from "./model";
import { wordSeparator } from "./segments";

/** How a segment joins the text before it. */
export type Join = "line" | "segment";

const HYPHEN_END = /\p{L}[-\u2010]$/u;
const LOWER_START = /^\p{Ll}/u;
const ENDS_WITH_SPACE = /\s$/u;
const STARTS_WITH_SPACE = /^\s/u;

function lineSeparator(prev: SourceTextItem, cur: SourceTextItem): string {
  if (ENDS_WITH_SPACE.test(prev.str) || STARTS_WITH_SPACE.test(cur.str)) return "";
  // A word broken across lines ("inter-" / "national") is joined without a
  // space. The hyphen itself is source text and stays.
  if (HYPHEN_END.test(prev.str) && LOWER_START.test(cur.str)) return "";
  return " ";
}

function styleKey(i: SourceTextItem): string {
  return `${i.bold ? 1 : 0}${i.italic ? 1 : 0}${i.fontSize < SMALL_PRINT_PT ? 1 : 0}`;
}

export class InlineBuilder {
  private nodes: InlineNode[] = [];
  private run: TextRun | null = null;
  private runKey = "";
  private last: SourceTextItem | null = null;

  constructor(private readonly pageIndex: number) {}

  /** True when nothing has been added yet. */
  get empty(): boolean {
    return this.nodes.length === 0 && this.run === null;
  }

  addSegment(seg: Segment, join: Join): void {
    seg.items.forEach((item, i) => {
      let sep = "";
      if (i > 0) sep = wordSeparator(seg.items[i - 1], item, seg.spaceBefore);
      else if (this.last) {
        sep = join === "line" ? lineSeparator(this.last, item) : this.segmentSeparator(item);
      }
      this.addItem(item, sep);
    });
  }

  addSegments(segs: Segment[], firstJoin: Join): void {
    segs.forEach((s, i) => this.addSegment(s, i === 0 ? firstJoin : "segment"));
  }

  addField(field: InlineField): void {
    this.flush();
    this.nodes.push(field);
    this.last = null;
  }

  build(): InlineNode[] {
    this.flush();
    return this.nodes;
  }

  /** Runs only (for headings and labels, which never hold fields). */
  buildRuns(): TextRun[] {
    return this.build().filter((n): n is TextRun => n.kind === "text");
  }

  private segmentSeparator(item: SourceTextItem): string {
    if (!this.last) return "";
    if (ENDS_WITH_SPACE.test(this.last.str) || STARTS_WITH_SPACE.test(item.str)) return "";
    return " ";
  }

  private addItem(item: SourceTextItem, sep: string): void {
    // A printed box glyph is always a run of its own (one item).
    const printedBox = isEmptyBoxGlyph(item);
    const key = printedBox ? "box" : styleKey(item);
    if (!this.run || key !== this.runKey || printedBox) {
      this.flush();
      this.run = {
        kind: "text",
        text: "",
        sources: [],
        pageIndex: this.pageIndex,
        ...(item.bold ? { bold: true } : {}),
        ...(item.italic ? { italic: true } : {}),
        ...(item.fontSize < SMALL_PRINT_PT ? { small: true } : {}),
        ...(printedBox ? { printedBox: true } : {}),
      };
      this.runKey = key;
    }
    this.run.text += sep + item.str;
    this.run.sources.push(item.index);
    this.last = item;
  }

  private flush(): void {
    if (this.run && this.run.sources.length) this.nodes.push(this.run);
    this.run = null;
    this.runKey = "";
  }
}

/** Runs for a list of segments joined as lines (labels, headings). */
export function runsFor(pageIndex: number, segs: Segment[], join: Join = "segment"): TextRun[] {
  const b = new InlineBuilder(pageIndex);
  segs.forEach((s, i) => b.addSegment(s, i === 0 ? "segment" : join));
  return b.buildRuns();
}

/** Runs for loose items in x order (hints under a widget). */
export function runsForItems(pageIndex: number, items: SourceTextItem[]): TextRun[] {
  if (!items.length) return [];
  const b = new InlineBuilder(pageIndex);
  b.addSegment(
    {
      id: -1,
      pageIndex,
      lineId: -1,
      items,
      box: items[0].box,
      fontSize: items[0].fontSize,
      baseline: items[0].baseline,
      text: "",
      bold: false,
      artifact: false,
      spaceBefore: new Set(),
    },
    "segment"
  );
  return b.buildRuns();
}
