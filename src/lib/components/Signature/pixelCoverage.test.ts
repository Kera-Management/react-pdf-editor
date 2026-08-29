import { describe, expect, it } from "vitest";
import {
  computeInkCoverage,
  hasEnoughInk,
  MIN_INK_COVERAGE,
} from "./pixelCoverage";

/** Builds RGBA data for a canvas-sized buffer, `inkPixels` of which have a
 * non-zero alpha byte and the rest fully transparent. */
function makeImageData(totalPixels: number, inkPixels: number) {
  const data = new Uint8ClampedArray(totalPixels * 4);
  for (let i = 0; i < inkPixels; i += 1) {
    data[i * 4 + 3] = 255; // alpha
  }
  return { data };
}

describe("computeInkCoverage", () => {
  it("returns 0 for a fully blank canvas", () => {
    expect(computeInkCoverage(makeImageData(1000, 0))).toBe(0);
  });

  it("returns 1 for a fully inked canvas", () => {
    expect(computeInkCoverage(makeImageData(1000, 1000))).toBe(1);
  });

  it("returns the exact fraction of inked pixels", () => {
    expect(computeInkCoverage(makeImageData(1000, 50))).toBeCloseTo(0.05);
  });

  it("treats a zero-length buffer as 0 coverage rather than dividing by zero", () => {
    expect(computeInkCoverage({ data: [] })).toBe(0);
  });
});

describe("hasEnoughInk / MIN_INK_COVERAGE", () => {
  it("rejects a blank canvas", () => {
    expect(hasEnoughInk(makeImageData(100_000, 0))).toBe(false);
  });

  it("rejects coverage just under the threshold", () => {
    const inkPixels = Math.ceil(100_000 * MIN_INK_COVERAGE) - 1;
    expect(hasEnoughInk(makeImageData(100_000, inkPixels))).toBe(false);
  });

  it("accepts coverage at or above the threshold", () => {
    const inkPixels = Math.ceil(100_000 * MIN_INK_COVERAGE);
    expect(hasEnoughInk(makeImageData(100_000, inkPixels))).toBe(true);
  });

  it("accepts a generously inked canvas", () => {
    expect(hasEnoughInk(makeImageData(100_000, 5000))).toBe(true);
  });
});
