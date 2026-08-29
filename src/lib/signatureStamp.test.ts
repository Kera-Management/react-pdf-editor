import { describe, expect, it } from "vitest";

import {
  MIN_SIGNATURE_STAMP_HEIGHT,
  signatureStampGeometry,
} from "./signatureStamp";

/** A 2:1 signature image (e.g. a 400x200 SignaturePad canvas). */
const scaleToFit2to1 = (width: number, height: number) => {
  const scale = Math.min(width / 2, height / 1);
  return { width: scale * 2, height: scale };
};

describe("signatureStampGeometry", () => {
  it("rises above a short signature-line field instead of shrinking into it", () => {
    // A typical on-the-line field: wide and only 24pt tall.
    const rect = { x: 100, y: 500, width: 200, height: 24 };
    const box = signatureStampGeometry(rect, scaleToFit2to1);

    // Height-bound by the minimum, not the 24pt field: 48 tall, 96 wide.
    expect(box.height).toBe(MIN_SIGNATURE_STAMP_HEIGHT);
    expect(box.width).toBe(MIN_SIGNATURE_STAMP_HEIGHT * 2);
    // Sitting ON the field's bottom edge (the line), centered horizontally.
    expect(box.y).toBe(rect.y);
    expect(box.x).toBe(rect.x + (rect.width - box.width) / 2);
  });

  it("stays centered inside a field tall enough to hold it", () => {
    const rect = { x: 100, y: 500, width: 200, height: 120 };
    const box = signatureStampGeometry(rect, scaleToFit2to1);

    // Width-bound: 200 wide, 100 tall -- fits, so it centers vertically.
    expect(box.width).toBe(200);
    expect(box.height).toBe(100);
    expect(box.y).toBe(rect.y + (rect.height - box.height) / 2);
  });

  it("never draws wider than the field", () => {
    const rect = { x: 0, y: 0, width: 60, height: 20 };
    const box = signatureStampGeometry(rect, scaleToFit2to1);
    expect(box.width).toBeLessThanOrEqual(rect.width);
  });
});
