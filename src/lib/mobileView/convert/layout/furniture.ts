/**
 * Headers and footers (spec section 6.5). Repeated lines in the top or
 * bottom 8% of the page (or marked /Artifact) are furniture. They are kept
 * in place, not moved: headers render right after the page break and
 * footers right before the next one.
 */

import type { SourcePage } from "../../types";
import {
  FURNITURE_EDGE_SHARE,
  FURNITURE_MANY_PAGES,
  FURNITURE_MIN_PAGE_SHARE,
} from "../constants";
import { centreY } from "../geom";
import { normalizeText } from "../normalize";
import type { Segment } from "./model";

/** "Page 1 of 2" and "Page 2 of 2" share the key "Page#of#". */
export function furnitureKey(text: string): string {
  return normalizeText(text).toLowerCase().replace(/\d/g, "#");
}

function isCandidate(seg: Segment, page: SourcePage): boolean {
  if (seg.artifact) return true;
  const cy = centreY(seg.box);
  return cy < page.height * FURNITURE_EDGE_SHARE || cy > page.height * (1 - FURNITURE_EDGE_SHARE);
}

/** Returns, per page index, the ids of segments that are furniture. */
export function detectFurniture(
  pages: { page: SourcePage; segments: Segment[] }[]
): Map<number, Set<number>> {
  const pagesByKey = new Map<string, Set<number>>();
  for (const { page, segments } of pages) {
    for (const s of segments) {
      if (!isCandidate(s, page)) continue;
      const k = furnitureKey(s.text);
      if (!k) continue;
      if (!pagesByKey.has(k)) pagesByKey.set(k, new Set());
      pagesByKey.get(k)!.add(page.pageIndex);
    }
  }
  const total = pages.length;
  const repeated = new Set<string>();
  for (const [k, set] of pagesByKey) {
    if (set.size < 2) continue;
    if (total >= FURNITURE_MANY_PAGES && set.size < total * FURNITURE_MIN_PAGE_SHARE) continue;
    repeated.add(k);
  }
  const out = new Map<number, Set<number>>();
  for (const { page, segments } of pages) {
    const ids = new Set<number>();
    for (const s of segments) {
      if (isCandidate(s, page) && repeated.has(furnitureKey(s.text))) ids.add(s.id);
    }
    out.set(page.pageIndex, ids);
  }
  return out;
}
