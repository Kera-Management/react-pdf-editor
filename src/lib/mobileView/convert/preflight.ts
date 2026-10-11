/** Fail-fast checks that run before any layout (spec section 6.1). */

import type { Box, FidelityReason, SourcePage } from "../types";
import {
  DEFAULT_MAX_PAGES,
  MAX_IMAGE_PAGE_SHARE,
  MAX_ROTATED_SHARE,
  MIN_DOCUMENT_CHARS,
  MIN_PAGE_CHARS,
} from "./constants";
import { xOverlap, yOverlap } from "./geom";
import { normalizeText } from "./normalize";

export function preflight(pages: SourcePage[], maxPages: number = DEFAULT_MAX_PAGES): FidelityReason[] {
  const reasons: FidelityReason[] = [];
  if (pages.length > maxPages) {
    reasons.push({
      code: "tooManyPages",
      severity: "fail",
      detail: `${pages.length} pages > ${maxPages}`,
    });
    return reasons;
  }
  let total = 0;
  let rotated = 0;
  // Reported only when the document has text elsewhere (else noTextLayer).
  const sparse: FidelityReason[] = [];
  for (const p of pages) {
    if (p.rotation % 360 !== 0) {
      reasons.push({
        code: "rotatedText",
        severity: "fail",
        pageIndex: p.pageIndex,
        detail: `page rotation ${p.rotation}`,
      });
    }
    let pageChars = 0;
    for (const it of p.items) {
      // A fake-bold copy is drawn over its original: count the text once.
      if (it.duplicateOf !== undefined) continue;
      const n = normalizeText(it.str).length;
      pageChars += n;
      if (it.rotated) rotated += n;
    }
    total += pageChars;
    if (pageChars < MIN_PAGE_CHARS) {
      sparse.push({
        code: "pageWithoutText",
        severity: "fail",
        pageIndex: p.pageIndex,
        detail: `${pageChars} characters on the page`,
      });
    }
    reasons.push(...graphicsReasons(p));
  }
  if (total < MIN_DOCUMENT_CHARS) {
    reasons.push({ code: "noTextLayer", severity: "fail", detail: `${total} characters` });
    return reasons;
  }
  reasons.push(...sparse);
  if (rotated > total * MAX_ROTATED_SHARE) {
    reasons.push({
      code: "rotatedText",
      severity: "fail",
      detail: `${rotated} of ${total} characters rotated`,
    });
  }
  return reasons;
}

/** Images and invisible text (spec section 6.1): content the text layer
 * does not show as the original does. */
function graphicsReasons(p: SourcePage): FidelityReason[] {
  const g = p.graphics;
  if (g === undefined) return [];
  const at = { pageIndex: p.pageIndex, severity: "fail" as const };
  if (g === null) return [{ ...at, code: "imageContent", detail: "operator list unavailable" }];
  const out: FidelityReason[] = [];
  if (g.invisibleChars > 0) {
    out.push({ ...at, code: "hiddenText", detail: `${g.invisibleChars} invisible characters (OCR layer?)` });
  }
  const pageArea = Math.max(1, p.width * p.height);
  const area = (b: Box) => Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
  const share = g.images.reduce((s, b) => s + area(b), 0) / pageArea;
  const overText = g.images.find((b) =>
    p.items.some((it) => normalizeText(it.str) !== "" && xOverlap(b, it.box) > 0 && yOverlap(b, it.box) > 0)
  );
  if (share >= MAX_IMAGE_PAGE_SHARE) {
    out.push({ ...at, code: "imageContent", detail: `images cover ${Math.round(share * 100)}% of the page` });
  } else if (overText) {
    out.push({ ...at, code: "imageContent", detail: "an image overlaps text" });
  }
  return out;
}
