/**
 * Tagged pages (spec section 6.3). When marked content covers at least 90%
 * of a page's non-artifact characters, the struct tree gives each item a
 * reading rank and a role (headings). Geometry still builds lines and
 * fields; the rank decides the order of side-by-side regions.
 */

import type { SourcePage, StructNode } from "../../types";
import { normalizeText } from "../normalize";

export const STRUCT_COVERAGE = 0.9;

export interface StructInfo {
  rank: Map<number, number>;
  role: Map<number, string>;
}

export function structInfo(page: SourcePage): StructInfo | null {
  if (!page.structure || !page.structure.length) return null;
  let total = 0;
  let tagged = 0;
  for (const it of page.items) {
    if (it.artifact) continue;
    const n = normalizeText(it.str).length;
    total += n;
    if (it.mcid !== undefined) tagged += n;
  }
  if (total === 0 || tagged < total * STRUCT_COVERAGE) return null;

  const mcRank = new Map<number, number>();
  const mcRole = new Map<number, string>();
  let next = 0;
  const walk = (node: StructNode, inherited: string) => {
    const role = node.role !== "other" ? node.role : inherited;
    for (const mc of node.mcids) {
      if (!mcRank.has(mc)) {
        mcRank.set(mc, next++);
        mcRole.set(mc, role);
      }
    }
    for (const c of node.children) walk(c, role);
  };
  for (const n of page.structure) walk(n, "other");
  if (!mcRank.size) return null;

  const rank = new Map<number, number>();
  const role = new Map<number, string>();
  for (const it of page.items) {
    if (it.mcid === undefined || !mcRank.has(it.mcid)) continue;
    rank.set(it.index, mcRank.get(it.mcid)!);
    role.set(it.index, mcRole.get(it.mcid)!);
  }
  return { rank, role };
}

/** Heading level for a set of items when all of them are tagged H1-H6. */
export function structHeadingLevel(
  itemIndexes: number[],
  role: Map<number, string> | null
): 1 | 2 | 3 | null {
  if (!role || !itemIndexes.length) return null;
  let level: number | null = null;
  for (const i of itemIndexes) {
    const r = role.get(i);
    const m = r ? /^H([1-6])$/.exec(r) : null;
    if (!m) return null;
    const l = Number(m[1]);
    level = level === null ? l : Math.min(level, l);
  }
  if (level === null) return null;
  return level === 1 ? 1 : level === 2 ? 2 : 3;
}
