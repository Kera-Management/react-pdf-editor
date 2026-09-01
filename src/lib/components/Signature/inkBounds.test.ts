import { describe, expect, it } from "vitest";

import { computeInkBounds } from "./inkBounds";

/** Builds ImageData-like bytes for a w x h image with ink at given (x, y)s. */
const imageWithInk = (
  width: number,
  height: number,
  inked: Array<[number, number]>
) => {
  const data = new Uint8ClampedArray(width * height * 4);
  inked.forEach(([x, y]) => {
    data[(y * width + x) * 4 + 3] = 255;
  });
  return { data };
};

describe("computeInkBounds", () => {
  it("returns the tight box around all inked pixels", () => {
    const image = imageWithInk(20, 10, [
      [3, 2],
      [15, 2],
      [7, 8],
    ]);
    expect(computeInkBounds(image, 20, 10)).toEqual({
      left: 3,
      top: 2,
      right: 15,
      bottom: 8,
    });
  });

  it("returns a 1x1 box for a single inked pixel", () => {
    const image = imageWithInk(20, 10, [[5, 5]]);
    expect(computeInkBounds(image, 20, 10)).toEqual({
      left: 5,
      top: 5,
      right: 5,
      bottom: 5,
    });
  });

  it("returns null for a blank image", () => {
    expect(computeInkBounds(imageWithInk(20, 10, []), 20, 10)).toBeNull();
  });

  it("treats a too-short data buffer (stubbed contexts) as blank", () => {
    expect(
      computeInkBounds({ data: new Uint8ClampedArray(16) }, 480, 180)
    ).toBeNull();
  });
});
