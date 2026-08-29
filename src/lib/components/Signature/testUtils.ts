import { vi } from "vitest";
import { act } from "@testing-library/react";

/**
 * jsdom does not implement a real 2D canvas backend, so every test that
 * mounts DrawSignatureCanvas or TypeSignature needs `getContext` stubbed
 * with a controllable fake -- same approach as PDFEditor.render.test.tsx's
 * `getContext` spy for pdf.js canvases. Drawing calls (`stroke`,
 * `fillText`, ...) are no-ops; `getImageData` and `measureText` are the
 * ones tests actually assert against or need to control.
 */
export function createFakeCanvasContext() {
  return {
    lineCap: "",
    lineJoin: "",
    lineWidth: 1,
    strokeStyle: "",
    fillStyle: "",
    textBaseline: "",
    textAlign: "",
    font: "",
    scale: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 50 })),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(400) })),
  };
}

/** Inferred from the factory itself rather than hand-duplicated, so the
 * type can never drift out of sync with what `createFakeCanvasContext`
 * actually returns. */
export type FakeCanvasContext = ReturnType<typeof createFakeCanvasContext>;

export const BLANK_IMAGE_DATA = { data: new Uint8ClampedArray(400) };

export function inkedImageData(totalPixels = 100, inkPixels = 50) {
  const data = new Uint8ClampedArray(totalPixels * 4);
  for (let i = 0; i < inkPixels; i += 1) {
    data[i * 4 + 3] = 255;
  }
  return { data };
}

/** Stubs `HTMLCanvasElement.prototype.getContext`/`toDataURL`/
 * `getBoundingClientRect` for the duration of a test file. Returns the
 * fake context so individual tests can control `getImageData`/
 * `measureText` return values. */
export function stubCanvas(dataUrl = "data:image/png;base64,MOCK") {
  const ctx = createFakeCanvasContext();

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ctx as unknown as CanvasRenderingContext2D
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(dataUrl);
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue(
    {
      left: 0,
      top: 0,
      width: 480,
      height: 180,
      right: 480,
      bottom: 180,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect
  );

  return { ctx, dataUrl };
}

/**
 * jsdom has no `PointerEvent` constructor (same gap useDragReorder.test.ts
 * documents for the document-level listeners), so gestures are dispatched
 * as plain bubbling `Event`s with the pointer fields assigned directly --
 * React's synthetic pointer event just forwards whatever is on the native
 * event, so this reaches a React `onPointerDown` handler the same way a
 * real pointerdown would.
 */
export function dispatchPointerEvent(
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  overrides: Partial<{
    pointerId: number;
    clientX: number;
    clientY: number;
    button: number;
  }> = {}
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1, clientX: 0, clientY: 0, button: 0, ...overrides });
  target.dispatchEvent(event);
}

/** A minimal down/move/up gesture against a canvas returned by
 * `screen.getByRole("img", { name: /signature drawing area/i })`. */
export function drawAGesture(canvas: Element): void {
  act(() => {
    dispatchPointerEvent(canvas, "pointerdown", { clientX: 10, clientY: 10 });
  });
  act(() => {
    dispatchPointerEvent(document, "pointermove", { clientX: 60, clientY: 60 });
  });
  act(() => {
    dispatchPointerEvent(document, "pointerup", { clientX: 60, clientY: 60 });
  });
}
