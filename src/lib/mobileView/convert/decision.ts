/** Confidence and the ok/fallback decision (spec sections 6.1 and 6.7). */

import type { FidelityReason } from "../types";
import {
  DEFAULT_MIN_CONFIDENCE,
  FALLBACK_PLACED_PENALTY,
  FALLBACK_PLACED_PENALTY_MAX,
  INTERLEAVE_WARN_PENALTY,
  OVER_TEXT_PENALTY,
  OVER_TEXT_PENALTY_MAX,
  WEAK_LABEL_PENALTY,
  WEAK_LABEL_WARN_SHARE,
} from "./constants";

export interface ConfidenceInputs {
  /** Share of placed fields with a field-name or null label (0..1). */
  weakShare: number;
  /** Widgets with non-guide text under them. */
  overTextWidgets: number;
  /** Widgets placed by the fallback rule. */
  fallbackPlaced: number;
  /** Pages with a 2-3 step column alternation. */
  interleaveWarnPages: number;
}

export function computeConfidence(c: ConfidenceInputs): number {
  let confidence = 1;
  if (c.weakShare > WEAK_LABEL_WARN_SHARE) confidence -= WEAK_LABEL_PENALTY * c.weakShare;
  confidence -= Math.min(OVER_TEXT_PENALTY_MAX, OVER_TEXT_PENALTY * c.overTextWidgets);
  confidence -= Math.min(FALLBACK_PLACED_PENALTY_MAX, FALLBACK_PLACED_PENALTY * c.fallbackPlaced);
  confidence -= INTERLEAVE_WARN_PENALTY * c.interleaveWarnPages;
  return Math.min(1, Math.max(0, Math.round(confidence * 1000) / 1000));
}

/** Adds `lowConfidence` when needed and decides. `ok` only when no reason
 * is a fail. */
export function decide(
  reasons: FidelityReason[],
  confidence: number,
  minConfidence: number = DEFAULT_MIN_CONFIDENCE
): { decision: "ok" | "fallback"; reasons: FidelityReason[] } {
  const out = reasons.slice();
  if (confidence < minConfidence) {
    out.push({
      code: "lowConfidence",
      severity: "fail",
      detail: `confidence ${confidence} < ${minConfidence}`,
    });
  }
  const failed = out.some((r) => r.severity === "fail");
  return { decision: failed ? "fallback" : "ok", reasons: out };
}
