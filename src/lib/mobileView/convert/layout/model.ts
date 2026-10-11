/** Internal layout types. Not part of the public model (`../../types.ts`). */

import type { Box, SourcePage, SourceTextItem, SourceWidget } from "../../types";

/**
 * A run of items on one line with no wide gap and no widget between them.
 * The unit of text order: its items are always emitted together, in x order.
 */
export interface Segment {
  /** Unique within the page. */
  id: number;
  pageIndex: number;
  /** Id of the page-level line the segment belongs to. */
  lineId: number;
  /** In x order. Never empty. */
  items: SourceTextItem[];
  box: Box;
  /** Largest item font size. */
  fontSize: number;
  baseline: number;
  /** Display text (items joined with word spaces). */
  text: string;
  /** Every item is bold. */
  bold: boolean;
  /** Every item sits in an /Artifact sequence. */
  artifact: boolean;
  /** A repeated header/footer line kept in the flow (it could not move to
   * the top or bottom of the page without changing the order). */
  furniture?: boolean;
  /** Indexes of items that follow a whitespace-only item on the page (a
   * space pdf.js emitted separately). Shared by all segments of a page. */
  spaceBefore: Set<number>;
}

/** An element of a page region: a text segment or a widget. */
export type Element =
  | { kind: "seg"; seg: Segment; box: Box }
  | { kind: "widget"; widget: SourceWidget; box: Box };

/** Page-level facts every layout step needs. */
export interface PageContext {
  page: SourcePage;
  /** Non-hidden widgets on the page. */
  widgets: SourceWidget[];
  widgetById: Map<string, SourceWidget>;
  /** Item by `SourceTextItem.index`. */
  itemByIndex: Map<number, SourceTextItem>;
  /** Item index -> widget id, for printed guides under text widgets. */
  hintOwner: Map<number, string>;
  /** Widget id -> guide items under it, in x order. */
  hints: Map<string, SourceTextItem[]>;
  /** Median body font size of the page (character weighted). */
  bodySize: number;
  /** Item index -> struct role, when the page's struct tree is used. */
  structRole: Map<number, string> | null;
  /** Item index -> struct reading rank, when the struct tree is used. */
  structRank: Map<number, number> | null;
  /** Layout signals collected while converting the page. */
  stats: PageStats;
}

export interface PageStats {
  columns: number;
  gridRegions: number;
  usedStructTree: boolean;
  /** Widget id -> non-guide text found under it. */
  overText: Map<string, string>;
  /** Widget ids placed by the fallback rule (no source label anywhere). */
  fallbackPlaced: Set<string>;
  /** Fail reasons found by the layout (unresolved grids). */
  failures: { code: "unresolvedGrid"; detail: string }[];
}

export function newStats(): PageStats {
  return {
    columns: 1,
    gridRegions: 0,
    usedStructTree: false,
    overText: new Map(),
    fallbackPlaced: new Set(),
    failures: [],
  };
}
