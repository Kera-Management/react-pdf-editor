/**
 * Mobile friendly view converter: public API (spec section 4.1).
 *
 * `extractPage` is the only async function and the only pdf.js code.
 * `convertDocument` is pure and synchronous: furniture detection, per-page
 * layout, the fidelity check and the ok/fallback decision. It never throws.
 */

import type {
  ConvertDocument,
  ConvertOptions,
  FidelityReason,
  FidelityReport,
  MobileBlock,
  MobileConversionResult,
  MobileDocument,
  SourcePage,
} from "../types";
import { DEFAULT_MAX_PAGES, DEFAULT_MIN_CONFIDENCE } from "./constants";
import { computeConfidence, decide } from "./decision";
import { runChecks } from "./fidelity";
import { detectFurniture } from "./layout/furniture";
import { blockFieldIds, finalizeBlocks } from "./layout/finalize";
import type { PageContext, Segment } from "./layout/model";
import { layoutPage, preparePage } from "./layout/page";
import { buildSegments } from "./layout/segments";
import { normalizeText } from "./normalize";
import { preflight } from "./preflight";

export { extractPage } from "./extract";
export { checkFidelity } from "./fidelity";
export { humanizeFieldName } from "./fields/humanize";

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

function emptyReport(pages: SourcePage[], reasons: FidelityReason[], t0: number): FidelityReport {
  let sourceChars = 0;
  const pageStats = pages.map((p) => {
    const chars = p.items.reduce((s, i) => s + normalizeText(i.str).length, 0);
    sourceChars += chars;
    return {
      pageIndex: p.pageIndex,
      sourceChars: chars,
      matchedChars: 0,
      widgets: p.widgets.filter((w) => !w.hidden).length,
      columns: 0,
      gridRegions: 0,
      usedStructTree: false,
    };
  });
  const widgets = pages.flatMap((p) => p.widgets);
  const expected = widgets.filter((w) => !w.hidden);
  return {
    decision: "fallback",
    confidence: 0,
    text: {
      sourceChars,
      excludedChars: 0,
      matchedChars: 0,
      coverage: sourceChars ? 0 : 1,
      orderViolations: 0,
      alteredRuns: 0,
    },
    widgets: {
      expected: expected.length,
      placed: 0,
      hidden: widgets.length - expected.length,
      missing: expected.map((w) => w.id),
      duplicated: [],
      misplaced: 0,
      weaklyLabelled: 0,
    },
    reasons,
    pages: pageStats,
    durationMs: Math.round(now() - t0),
  };
}

function layoutDocument(pages: SourcePage[]): { document: MobileDocument; contexts: PageContext[] } {
  const prepared = pages.map((p) => {
    const { ctx, flow } = preparePage(p);
    const segments = buildSegments(p.pageIndex, flow, ctx.widgets, p.items);
    return { ctx, segments };
  });
  const furniture = detectFurniture(prepared.map((x) => ({ page: x.ctx.page, segments: x.segments })));
  const blocks: MobileBlock[] = [];
  const fieldBlockIds: Record<string, string> = {};
  prepared.forEach(({ ctx, segments }: { ctx: PageContext; segments: Segment[] }) => {
    const i = ctx.page.pageIndex;
    blocks.push({
      type: "pageBreak",
      id: `mf_page_${i}`,
      origin: null,
      pageNumber: i + 1,
      pageCount: pages.length,
    });
    const pageBlocks = layoutPage(ctx, segments, furniture.get(i) ?? new Set());
    finalizeBlocks(pageBlocks, ctx, `p${i}-b`);
    for (const b of pageBlocks) {
      for (const id of blockFieldIds(b)) fieldBlockIds[id] = b.id;
    }
    blocks.push(...pageBlocks);
  });
  return {
    document: { version: 1, pageCount: pages.length, blocks, fieldBlockIds },
    contexts: prepared.map((x) => x.ctx),
  };
}

/** Harness/debug only: returns the document even when it would fall back. */
export function convertDocumentUnchecked(
  pages: SourcePage[],
  options?: ConvertOptions
): { document: MobileDocument | null; report: FidelityReport } {
  const t0 = now();
  const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;
  const minConfidence = options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const pre = preflight(pages, maxPages);
  if (pre.some((r) => r.severity === "fail")) {
    return { document: null, report: emptyReport(pages, pre, t0) };
  }
  const { document, contexts } = layoutDocument(pages);
  const checks = runChecks(pages, document, maxPages);
  const reasons = checks.report.reasons.slice();
  let overText = 0;
  let fallbackPlaced = 0;
  const pageStats = checks.report.pages.map((ps) => {
    const ctx = contexts.find((c) => c.page.pageIndex === ps.pageIndex);
    if (!ctx) return ps;
    const s = ctx.stats;
    overText += s.overText.size;
    fallbackPlaced += s.fallbackPlaced.size;
    if (s.overText.size) {
      reasons.push({
        code: "widgetOverText",
        severity: "warn",
        pageIndex: ps.pageIndex,
        detail: `${s.overText.size} widget(s) over printed text: ${[...s.overText.values()].slice(0, 4).map((t) => JSON.stringify(t.slice(0, 30))).join(", ")}`,
      });
    }
    for (const f of s.failures) {
      reasons.push({ code: f.code, severity: "fail", pageIndex: ps.pageIndex, detail: f.detail });
    }
    return { ...ps, columns: s.columns, gridRegions: s.gridRegions, usedStructTree: s.usedStructTree };
  });
  const confidence = computeConfidence({
    weakShare: checks.weakShare,
    overTextWidgets: overText,
    fallbackPlaced,
    interleaveWarnPages: checks.interleaveWarnPages,
  });
  const decided = decide(reasons, confidence, minConfidence);
  return {
    document,
    report: {
      ...checks.report,
      pages: pageStats,
      reasons: decided.reasons,
      decision: decided.decision,
      confidence,
      durationMs: Math.round(now() - t0),
    },
  };
}

/** Pure and synchronous: layout + fidelity check + decision. Never throws. */
export const convertDocument: ConvertDocument = (pages, options): MobileConversionResult => {
  const t0 = now();
  try {
    const { document, report } = convertDocumentUnchecked(pages, options);
    if (report.decision === "ok" && document) return { status: "ok", document, report };
    return { status: "fallback", document: null, report: { ...report, decision: "fallback" } };
  } catch (e) {
    let safePages: SourcePage[] = [];
    try {
      safePages = Array.isArray(pages) ? pages.filter((p) => p && Array.isArray(p.items) && Array.isArray(p.widgets)) : [];
    } catch {
      safePages = [];
    }
    const detail = e instanceof Error ? e.message : String(e);
    let report: FidelityReport;
    try {
      report = emptyReport(safePages, [{ code: "conversionError", severity: "fail", detail }], t0);
    } catch {
      report = emptyReport([], [{ code: "conversionError", severity: "fail", detail }], t0);
    }
    return { status: "fallback", document: null, report };
  }
};
