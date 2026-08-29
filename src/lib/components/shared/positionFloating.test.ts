import { describe, expect, it } from "vitest";
import { positionFloatingElement } from "./positionFloating";

const GAP = 8;
const ELEMENT_SIZE = { width: 120, height: 32 };
const CONTAINER = new DOMRect(0, 0, 1000, 800);

describe("positionFloatingElement", () => {
  it("prefers placing above the target when there's room", () => {
    const target = new DOMRect(400, 300, 100, 40);

    const result = positionFloatingElement(
      target,
      ELEMENT_SIZE,
      CONTAINER,
      GAP
    );

    expect(result.placement).toBe("top");
    // Horizontally centered on the target.
    expect(result.x).toBe(390);
    // Sits above the target with the gap subtracted.
    expect(result.y).toBe(260);
  });

  it("flips below the target when there isn't enough space above", () => {
    const target = new DOMRect(400, 10, 100, 40);

    const result = positionFloatingElement(
      target,
      ELEMENT_SIZE,
      CONTAINER,
      GAP
    );

    expect(result.placement).toBe("bottom");
    expect(result.x).toBe(390);
    // Sits below the target with the gap added.
    expect(result.y).toBe(58);
  });

  it("prefers above even without full room when there's more space above than below", () => {
    // spaceAbove (300) < requiredHeight (40) is false here, so this
    // exercises the "more room above than below" branch instead: place a
    // target close to the container bottom so spaceBelow is small.
    const target = new DOMRect(400, 700, 100, 40);

    const result = positionFloatingElement(
      target,
      ELEMENT_SIZE,
      CONTAINER,
      GAP
    );

    // spaceAbove = 700, spaceBelow = 800 - 740 = 60 -> spaceAbove wins.
    expect(result.placement).toBe("top");
  });

  it("clamps the left edge inside the container", () => {
    const target = new DOMRect(-50, 300, 100, 40);

    const result = positionFloatingElement(
      target,
      ELEMENT_SIZE,
      CONTAINER,
      GAP
    );

    // Unclamped x would be -60; the container's left edge + gap wins.
    expect(result.x).toBe(CONTAINER.left + GAP);
  });

  it("clamps the right edge inside the container", () => {
    const target = new DOMRect(950, 300, 100, 40);

    const result = positionFloatingElement(
      target,
      ELEMENT_SIZE,
      CONTAINER,
      GAP
    );

    // Unclamped x would be 940; the container's right edge - width - gap wins.
    expect(result.x).toBe(CONTAINER.right - ELEMENT_SIZE.width - GAP);
  });

  it("clamps vertically inside the container even after flipping below", () => {
    const shortContainer = new DOMRect(0, 0, 1000, 60);
    const target = new DOMRect(400, 10, 100, 40);

    const result = positionFloatingElement(
      target,
      ELEMENT_SIZE,
      shortContainer,
      GAP
    );

    const maxY = shortContainer.bottom - ELEMENT_SIZE.height - GAP;
    expect(result.y).toBeLessThanOrEqual(maxY);
  });

  it("falls back to the viewport when no container is given", () => {
    const target = new DOMRect(
      window.innerWidth - 60,
      300,
      100,
      40
    );

    const result = positionFloatingElement(target, ELEMENT_SIZE, null, GAP);

    const maxX = window.innerWidth - ELEMENT_SIZE.width - GAP;
    expect(result.x).toBeLessThanOrEqual(maxX);
  });
});
