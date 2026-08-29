import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";

import PDFEditor from "./PDFEditor";

/**
 * Regression test for the render bug: field VALUES used to live inside
 * `pages` state, so every keystroke rebuilt `pages`, which gave `renderPages`
 * a fresh identity, which re-fired the canvas-render effect on top of a
 * render that could still be in flight -- pdf.js's "Cannot use the same
 * canvas during multiple render() operations." Field values now live in
 * `useFieldValues`, entirely decoupled from `pages`, so a value change must
 * never reach `page.proxy.render()` again. This mounts the real component
 * against a minimal fake pdf.js document and counts render() calls against
 * the main document canvas specifically (PageThumbnails also legitimately
 * calls `page.proxy.render()` for its own, separate thumbnail canvas, so
 * calls are attributed by which canvas asked for its 2D context).
 */

const { getDocumentMock, fakeDocRef, pageRenderMock } = vi.hoisted(() => ({
  getDocumentMock: vi.fn(),
  fakeDocRef: { current: null as unknown },
  pageRenderMock: vi.fn(),
}));

// A fully synthetic module, not `{ ...actual }` -- pdfjs-dist's real build
// touches browser canvas APIs (DOMMatrix, Path2D, ...) at import time that
// jsdom doesn't provide, which this component's tests have no need for:
// `getDocument` is the only export PDFEditor actually calls at runtime, and
// the rest (AnnotationMode, RenderingCancelledException, GlobalWorkerOptions,
// version) are cheap to stand in for. PDFDocumentProxy/PDFPageProxy/
// RenderTask are imported by PDFEditor.tsx for types only and never
// referenced as values, so they need no mock here.
vi.mock("pdfjs-dist", () => ({
  AnnotationMode: { ENABLE_FORMS: 2 },
  GlobalWorkerOptions: { workerSrc: "" },
  RenderingCancelledException: class RenderingCancelledException extends Error {},
  version: "5.4.54",
  getDocument: (...args: unknown[]) => getDocumentMock(...args),
}));

const MAIN_CANVAS_ID = "page_canvas_1";

const RAW_FIELD = {
  editable: true,
  hidden: false,
  id: "field_1",
  multiline: false,
  name: "tenant_name",
  page: 0,
  password: false,
  rect: [10, 10, 110, 30],
  type: "text" as const,
  value: "",
  defaultValue: "",
};

function makeFakePage() {
  return {
    pageNumber: 1,
    destroyed: false,
    getViewport: vi.fn((opts?: { scale?: number }) => ({
      width: 200 * (opts?.scale ?? 1),
      height: 300 * (opts?.scale ?? 1),
    })),
    render: pageRenderMock,
  };
}

function makeFakeDoc(page: ReturnType<typeof makeFakePage>) {
  return {
    numPages: 1,
    getPage: vi.fn(async () => page),
    getFieldObjects: vi.fn(async () => ({ tenant_name: [RAW_FIELD] })),
    getData: vi.fn(async () => new Uint8Array()),
    destroy: vi.fn(),
  };
}

/** Render() calls attributed to the main document canvas only, filtering
 * out PageThumbnails' legitimate calls against its own thumbnail canvas. */
function mainCanvasRenderCallCount(): number {
  return pageRenderMock.mock.calls.filter((call) => {
    const arg = call[0] as { canvasContext?: { ownerCanvasId?: string } };
    return arg?.canvasContext?.ownerCanvasId === MAIN_CANVAS_ID;
  }).length;
}

describe("PDFEditor render stability (value edits vs. canvas renders)", () => {
  beforeEach(() => {
    // jsdom doesn't implement these; PageThumbnails (an unrelated sibling
    // component this mount also renders) calls both. Stubbed so its
    // legitimate, unrelated work doesn't throw and pollute this test.
    Element.prototype.scrollIntoView = vi.fn();

    // Tag each 2D context by the id of the canvas it came from, so render()
    // calls made against the main page canvas and PageThumbnails' own
    // thumbnail canvas can be told apart without touching PageThumbnails.
    // `scale` is a no-op stand-in for the real CanvasRenderingContext2D
    // method PageThumbnails calls on whatever context it's handed.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      function (this: HTMLCanvasElement) {
        return {
          ownerCanvasId: this.id,
          scale: vi.fn(),
        } as unknown as CanvasRenderingContext2D;
      }
    );

    pageRenderMock.mockReset();
    pageRenderMock.mockImplementation(() => ({
      promise: Promise.resolve(),
      cancel: vi.fn(),
    }));

    const page = makeFakePage();
    fakeDocRef.current = makeFakeDoc(page);
    getDocumentMock.mockReset();
    getDocumentMock.mockImplementation(() => ({
      promise: Promise.resolve(fakeDocRef.current),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("typing in a field does not change `pages` identity or re-invoke the canvas render", async () => {
    const { container } = render(<PDFEditor src="fake://document.pdf" mode="edit" />);

    const input = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_1"]'
      );
      if (!el) throw new Error("field input not yet mounted");
      return el;
    });

    // Initial load renders the document exactly once.
    await waitFor(() => {
      expect(mainCanvasRenderCallCount()).toBe(1);
    });

    fireEvent.change(input, { target: { value: "Jane Doe" } });
    expect(input.value).toBe("Jane Doe");

    fireEvent.change(input, { target: { value: "Jane Doe again" } });
    expect(input.value).toBe("Jane Doe again");

    // Give any (incorrect) re-render effect a chance to fire before
    // asserting -- there is no further async work queued for a correct
    // implementation, so this is just draining microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(mainCanvasRenderCallCount()).toBe(1);
  });
});
