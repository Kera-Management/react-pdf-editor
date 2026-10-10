import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, Portal } from "@chakra-ui/react";
import { renderWithChakra } from "./testUtils";

import PDFEditor from "./PDFEditor";

/**
 * 4.0.0 canvas rules (spec §4) and the Core audit fixes that touch the
 * canvas: C7 (loading/error states), B7/C4 (fit width), C5 (Ctrl/Cmd zoom),
 * C6 (focus flash), B6 (gated chip), A5 (click-to-add placement) and A6
 * (multi-select). Mounts the real editor against a fake pdf.js document.
 */

const { getDocumentMock, fakeDocRef, pageRenderMock, metadataRef } =
  vi.hoisted(() => ({
    getDocumentMock: vi.fn(),
    fakeDocRef: { current: null as unknown },
    pageRenderMock: vi.fn(),
    metadataRef: {
      current: {
        fieldAssignments: {} as Record<string, string[]>,
        requiredFields: [] as string[],
      },
    },
  }));

vi.mock("pdfjs-dist", () => ({
  AnnotationMode: { ENABLE_FORMS: 2 },
  GlobalWorkerOptions: { workerSrc: "" },
  RenderingCancelledException: class RenderingCancelledException extends Error {},
  version: "5.4.54",
  getDocument: (...args: unknown[]) => getDocumentMock(...args),
}));

// Metadata normally comes from the PDF title; the fake document has no real
// bytes, so each test sets what extraction "finds".
vi.mock("./participantCompletion", async () => {
  const actual = await vi.importActual<
    typeof import("./participantCompletion")
  >("./participantCompletion");
  return {
    ...actual,
    extractEditorMetadata: vi.fn(async () => ({
      version: 3 as const,
      fieldAssignments: metadataRef.current.fieldAssignments,
      requiredFields: metadataRef.current.requiredFields,
      signatureFields: [],
    })),
  };
});

const TEXT_FIELD = {
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

function makeFakePage(pageNumber: number, width = 200, height = 300) {
  return {
    pageNumber,
    destroyed: false,
    getViewport: vi.fn((opts?: { scale?: number }) => ({
      width: width * (opts?.scale ?? 1),
      height: height * (opts?.scale ?? 1),
    })),
    render: pageRenderMock,
  };
}

function makeFakeDoc(
  pages: ReturnType<typeof makeFakePage>[],
  fieldObjects: Record<string, unknown[]> = {}
) {
  return {
    numPages: pages.length,
    getPage: vi.fn(async (i: number) => pages[i - 1]),
    getFieldObjects: vi.fn(async () => fieldObjects),
    getData: vi.fn(async () => new Uint8Array()),
    destroy: vi.fn(),
  };
}

function useDoc(doc: ReturnType<typeof makeFakeDoc>) {
  fakeDocRef.current = doc;
  getDocumentMock.mockReset();
  getDocumentMock.mockImplementation(() => ({
    promise: Promise.resolve(fakeDocRef.current),
  }));
}

/** Rendered CSS width of a page canvas: viewport width at the current zoom. */
function canvasWidth(container: HTMLElement, page = 1): number {
  const canvas = container.querySelector<HTMLCanvasElement>(
    `canvas#page_canvas_${page}`
  );
  return parseFloat(canvas?.style.width ?? "0");
}

async function waitForCanvas(container: HTMLElement, page = 1) {
  await waitFor(() => {
    if (!canvasWidth(container, page)) throw new Error("canvas not sized yet");
  });
}

/** Zoom keys go to the canvas scroller (where focus lands after a click). */
function pressZoomKey(key: string, target?: Element) {
  const scroller =
    document.querySelector('[data-part="document-scroller"]') ??
    document.body;
  fireEvent.keyDown(target ?? scroller, { key, ctrlKey: true });
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
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
  metadataRef.current = { fieldAssignments: {}, requiredFields: [] };
  useDoc(makeFakeDoc([makeFakePage(1)], { tenant_name: [TEXT_FIELD] }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("C7: loading and error states", () => {
  it("loading shows a labelled progress state and a Close that calls onClose", async () => {
    getDocumentMock.mockReset();
    getDocumentMock.mockImplementation(() => ({
      promise: new Promise(() => {}),
    }));
    const onClose = vi.fn();
    renderWithChakra(<PDFEditor src="fake://doc.pdf" onClose={onClose} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading document");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("error offers Try again (re-runs the load) and Close", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const doc = makeFakeDoc([makeFakePage(1)], { tenant_name: [TEXT_FIELD] });
    getDocumentMock.mockReset();
    getDocumentMock
      .mockImplementationOnce(() => ({
        promise: Promise.reject(new Error("Invalid PDF structure")),
      }))
      .mockImplementation(() => ({ promise: Promise.resolve(doc) }));
    const onClose = vi.fn();

    const { container } = renderWithChakra(
      <PDFEditor src="fake://doc.pdf" mode="edit" onClose={onClose} />
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't open this document");
    expect(alert).toHaveTextContent(
      "Try again, or choose a different file."
    );
    expect(alert).toHaveTextContent("Invalid PDF structure");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(
        container.querySelector('input[data-field-id="field_1"]')
      ).not.toBeNull()
    );
    expect(getDocumentMock).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it("without onClose (the /sign page) the error shows Retry only", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getDocumentMock.mockReset();
    getDocumentMock.mockImplementation(() => ({
      promise: Promise.reject(new Error("nope")),
    }));
    renderWithChakra(<PDFEditor src="fake://doc.pdf" />);
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});

describe("B7/C4: fit to width", () => {
  function mockScrollerWidth(width: number) {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(
      width
    );
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(
      width
    );
  }

  it("a narrow container picks the largest step that fits, never 125%", async () => {
    mockScrollerWidth(360);
    // US Letter: 612pt wide. 360 / 612 = 0.59 -> below the smallest step,
    // so the smallest step (67%), not the old `|| 6` fallback (125%).
    useDoc(
      makeFakeDoc([makeFakePage(1, 612, 792)], { tenant_name: [TEXT_FIELD] })
    );
    const { container } = renderWithChakra(
      <PDFEditor src="fake://doc.pdf" mode="edit" />
    );
    await waitFor(() =>
      expect(canvasWidth(container)).toBeCloseTo(612 * 0.67, 1)
    );
  });

  it("rounds down to the step that fits rather than to the closest one", async () => {
    // 290 / 200 = 1.45: closest step is 1.5 (overflows), largest fitting
    // step is 1.25.
    mockScrollerWidth(290);
    const { container } = renderWithChakra(
      <PDFEditor src="fake://doc.pdf" mode="edit" />
    );
    await waitFor(() => expect(canvasWidth(container)).toBe(250));
  });

  it("a manual zoom survives a resize; an un-zoomed view re-fits", async () => {
    mockScrollerWidth(290);
    const { container } = renderWithChakra(
      <PDFEditor src="fake://doc.pdf" mode="edit" />
    );
    await waitFor(() => expect(canvasWidth(container)).toBe(250));

    // Un-zoomed: a resize re-fits (430 / 200 = 2.15 -> 200%).
    mockScrollerWidth(430);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    await waitFor(() => expect(canvasWidth(container)).toBe(400));

    // The user zooms out; a later resize must not undo it.
    pressZoomKey("-");
    await waitFor(() => expect(canvasWidth(container)).toBe(350));
    mockScrollerWidth(290);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(canvasWidth(container)).toBe(350);
  });
});

describe("C5: Ctrl/Cmd zoom shortcuts", () => {
  it("Ctrl+= / Ctrl+- / Ctrl+0 zoom in, out and reset to 100%", async () => {
    const { container } = renderWithChakra(
      <PDFEditor src="fake://doc.pdf" mode="edit" />
    );
    await waitForCanvas(container);
    // jsdom has no layout, so fit-on-open is a no-op: 125% default.
    expect(canvasWidth(container)).toBe(250);

    pressZoomKey("=");
    await waitFor(() => expect(canvasWidth(container)).toBe(300));
    pressZoomKey("-");
    pressZoomKey("-");
    await waitFor(() => expect(canvasWidth(container)).toBeCloseTo(220));
    pressZoomKey("0");
    await waitFor(() => expect(canvasWidth(container)).toBe(200));
  });

  it("leaves browser zoom alone when focus is on <body> and the last click was outside the editor", async () => {
    const { container } = renderWithChakra(
      <div>
        <p data-testid="host-text">Host page</p>
        <PDFEditor src="fake://doc.pdf" mode="edit" />
      </div>
    );
    await waitForCanvas(container);
    fireEvent.pointerDown(screen.getByTestId("host-text"));
    expect(
      fireEvent.keyDown(document.body, { key: "-", ctrlKey: true })
    ).toBe(true); // not prevented: the browser zooms
    expect(canvasWidth(container)).toBe(250);

    // After a click in the editor, <body> focus counts as the editor's.
    fireEvent.pointerDown(
      container.querySelector('[data-part="document-scroller"]')!
    );
    expect(
      fireEvent.keyDown(document.body, { key: "-", ctrlKey: true })
    ).toBe(false);
    await waitFor(() => expect(canvasWidth(container)).toBeCloseTo(220));
  });

  it("one line-mode wheel notch (Firefox: 3 lines) is one zoom step", async () => {
    const { container } = renderWithChakra(
      <PDFEditor src="fake://doc.pdf" mode="edit" />
    );
    await waitForCanvas(container);
    const scroller = container.querySelector(
      '[data-part="document-scroller"]'
    ) as HTMLElement;
    fireEvent.wheel(scroller, { ctrlKey: true, deltaY: -3, deltaMode: 1 });
    await waitFor(() => expect(canvasWidth(container)).toBe(300));
  });

  it("Ctrl+wheel zooms the document and blocks the browser zoom", async () => {
    const { container } = renderWithChakra(
      <PDFEditor src="fake://doc.pdf" mode="edit" />
    );
    await waitForCanvas(container);
    const scroller = container.querySelector(
      '[data-part="document-scroller"]'
    ) as HTMLElement;

    const notPrevented = fireEvent.wheel(scroller, {
      ctrlKey: true,
      deltaY: -100,
    });
    expect(notPrevented).toBe(false);
    await waitFor(() => expect(canvasWidth(container)).toBe(300));

    // A plain wheel just scrolls.
    expect(fireEvent.wheel(scroller, { deltaY: -100 })).toBe(true);
    expect(canvasWidth(container)).toBe(300);
  });

  it("a trackpad pinch (small Ctrl+wheel deltas) zooms one step per threshold, not per event", async () => {
    const { container } = renderWithChakra(
      <PDFEditor src="fake://doc.pdf" mode="edit" />
    );
    await waitForCanvas(container);
    const scroller = container.querySelector(
      '[data-part="document-scroller"]'
    ) as HTMLElement;

    // Four small deltas (-20 total): every one blocks the browser zoom,
    // none steps the document zoom yet.
    for (let i = 0; i < 4; i += 1) {
      expect(fireEvent.wheel(scroller, { ctrlKey: true, deltaY: -5 })).toBe(
        false
      );
    }
    expect(canvasWidth(container)).toBe(250);

    // Crossing the threshold steps exactly once.
    for (let i = 0; i < 6; i += 1) {
      fireEvent.wheel(scroller, { ctrlKey: true, deltaY: -5 });
    }
    await waitFor(() => expect(canvasWidth(container)).toBe(300));
    // Reversing direction starts a fresh gesture: one small delta back does
    // nothing.
    fireEvent.wheel(scroller, { ctrlKey: true, deltaY: 5 });
    expect(canvasWidth(container)).toBe(300);
  });

  it("is ignored while typing in a field", async () => {
    const { container } = renderWithChakra(
      <PDFEditor src="fake://doc.pdf" mode="edit" />
    );
    await waitForCanvas(container);
    const input = container.querySelector(
      'input[data-field-id="field_1"]'
    ) as HTMLInputElement;
    pressZoomKey("=", input);
    pressZoomKey("0", input);
    expect(canvasWidth(container)).toBe(250);
  });
});

describe("C6: guided-navigation flash", () => {
  it("sets data-flash on the target field, then clears it", async () => {
    metadataRef.current = {
      fieldAssignments: { tenant_name: ["p1"] },
      requiredFields: ["tenant_name"],
    };
    const { container } = renderWithChakra(
      <PDFEditor
        src="fake://doc.pdf"
        mode="edit"
        activeParticipantId="p1"
        participants={[{ id: "p1", label: "Jane" }]}
      />
    );
    const input = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_1"]'
      );
      if (!el) throw new Error("not mounted");
      return el;
    });
    // The signer auto-jump focuses the first incomplete required field.
    await waitFor(() => expect(input).toHaveAttribute("data-flash", "true"));
    expect(input.style.boxShadow).toBe("");
    await waitFor(() => expect(input).not.toHaveAttribute("data-flash"), {
      timeout: 3000,
    });
  });
});

describe("B6: visible 'Assigned to' chip on gated fields", () => {
  function chip(container: HTMLElement) {
    return container.querySelector<HTMLElement>(
      '[data-gated-chip="field_1"]'
    );
  }

  it("names the assignee, matching the overlay's label, and moves with zoom", async () => {
    const { container } = renderWithChakra(
      <PDFEditor
        src="fake://doc.pdf"
        mode="edit"
        activeParticipantId="p1"
        participants={[
          { id: "p1", label: "Bob" },
          { id: "p2", label: "Jane Smith" },
        ]}
        fieldAssignments={{ tenant_name: ["p2"] }}
      />
    );
    await waitFor(() => expect(chip(container)).not.toBeNull());
    expect(chip(container)).toHaveTextContent("Assigned to Jane Smith");
    expect(screen.getByText("Assigned to Jane Smith")).toBeVisible();
    const input = container.querySelector('input[data-field-id="field_1"]');
    expect(input).toBeDisabled();
    expect(input).toHaveAccessibleName("Assigned to Jane Smith");

    // rect[0] = 10pt: 12.5px at 125%, 15px at 150%.
    expect(chip(container)!.style.left).toBe("12.5px");
    pressZoomKey("=");
    await waitFor(() => expect(chip(container)!.style.left).toBe("15px"));
  });

  it("re-gates the overlay when assignments change after load, keeping it in step with the chip", async () => {
    const participants = [
      { id: "p1", label: "Bob" },
      { id: "p2", label: "Jane Smith" },
    ];
    const { container, rerender } = renderWithChakra(
      <PDFEditor
        src="fake://doc.pdf"
        mode="edit"
        activeParticipantId="p1"
        participants={participants}
        fieldAssignments={{ tenant_name: ["p1"] }}
      />
    );
    await waitForCanvas(container);
    const input = container.querySelector(
      'input[data-field-id="field_1"]'
    ) as HTMLInputElement;
    expect(chip(container)).toBeNull();
    expect(input).not.toBeDisabled();

    // Assignments arrive (or change) asynchronously: no new `pages`, no zoom.
    rerender(
      <PDFEditor
        src="fake://doc.pdf"
        mode="edit"
        activeParticipantId="p1"
        participants={participants}
        fieldAssignments={{ tenant_name: ["p2"] }}
      />
    );
    await waitFor(() =>
      expect(chip(container)).toHaveTextContent("Assigned to Jane Smith")
    );
    expect(input).toBeDisabled();
    expect(input).toHaveAccessibleName("Assigned to Jane Smith");

    rerender(
      <PDFEditor
        src="fake://doc.pdf"
        mode="edit"
        activeParticipantId="p1"
        participants={participants}
        fieldAssignments={{ tenant_name: ["p1"] }}
      />
    );
    await waitFor(() => expect(chip(container)).toBeNull());
    expect(input).not.toBeDisabled();
    expect(input).not.toHaveAttribute("title");
  });

  it("undoes the gating when it stops applying (participant cleared, or View mode)", async () => {
    const participants = [
      { id: "p1", label: "Bob" },
      { id: "p2", label: "Jane Smith" },
    ];
    const props = {
      src: "fake://doc.pdf",
      participants,
      fieldAssignments: { tenant_name: ["p2"] },
      allowedModes: ["edit", "view"] as ("edit" | "view")[],
    };
    const { container, rerender } = renderWithChakra(
      <PDFEditor {...props} mode="edit" activeParticipantId="p1" />
    );
    await waitFor(() => expect(chip(container)).not.toBeNull());
    const input = container.querySelector(
      'input[data-field-id="field_1"]'
    ) as HTMLInputElement;
    expect(input).toBeDisabled();

    // The host clears the active participant: nothing is gated any more.
    rerender(<PDFEditor {...props} mode="edit" />);
    await waitFor(() => expect(input).not.toBeDisabled());
    expect(input).not.toHaveAttribute("title");
    expect(input).not.toHaveAttribute("aria-label", "Assigned to Jane Smith");

    // Gate again, then leave for View: View keeps its own read-only state.
    rerender(<PDFEditor {...props} mode="edit" activeParticipantId="p1" />);
    await waitFor(() => expect(input).toBeDisabled());
    // `mode` seeds internal state; switching happens in the header menu.
    fireEvent.click(screen.getByRole("button", { name: /fill & sign/i }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /view/i }));
    await waitFor(() => expect(input).not.toHaveAttribute("title"));
    expect(input).toBeDisabled();
  });

  it("falls back to 'another signer' when the assignee isn't in participants", async () => {
    const { container } = renderWithChakra(
      <PDFEditor
        src="fake://doc.pdf"
        mode="edit"
        activeParticipantId="p1"
        fieldAssignments={{ tenant_name: ["p2"] }}
      />
    );
    await waitFor(() =>
      expect(chip(container)).toHaveTextContent("Assigned to another signer")
    );
  });

  it("says 'Not assigned to a signer' for an unmapped field", async () => {
    const { container } = renderWithChakra(
      <PDFEditor
        src="fake://doc.pdf"
        mode="edit"
        activeParticipantId="p1"
        fieldAssignments={{ other_field: ["p1"] }}
      />
    );
    await waitFor(() =>
      expect(chip(container)).toHaveTextContent("Not assigned to a signer")
    );
  });

  it("shows no chip for the signer's own field, or when gated fields are hidden", async () => {
    const { container, unmount } = renderWithChakra(
      <PDFEditor
        src="fake://doc.pdf"
        mode="edit"
        activeParticipantId="p1"
        fieldAssignments={{ tenant_name: ["p1"] }}
      />
    );
    await waitForCanvas(container);
    expect(chip(container)).toBeNull();
    unmount();

    const hidden = renderWithChakra(
      <PDFEditor
        src="fake://doc.pdf"
        mode="edit"
        activeParticipantId="p1"
        unassignedVisibility="hidden"
        fieldAssignments={{ tenant_name: ["p2"] }}
      />
    );
    await waitForCanvas(hidden.container);
    expect(chip(hidden.container)).toBeNull();
  });
});

describe("A5: click-to-add lands on the active page", () => {
  type IOCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;
  let ioCallback: IOCallback | null = null;

  beforeEach(() => {
    ioCallback = null;
    class CapturingIO {
      constructor(cb: IOCallback) {
        ioCallback = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal("IntersectionObserver", CapturingIO);
    useDoc(makeFakeDoc([makeFakePage(1), makeFakePage(2), makeFakePage(3)]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Viewport: 800x600 scroller; page 3's canvas at (300, canvasTop). */
  function mockLayout(container: HTMLElement, canvasTop: number) {
    const original = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        if (this.getAttribute("data-part") === "document-scroller") {
          return new DOMRect(0, 0, 800, 600);
        }
        if (this.id === "page_canvas_3") {
          const el = this as HTMLCanvasElement;
          return new DOMRect(
            300,
            canvasTop,
            parseFloat(el.style.width),
            parseFloat(el.style.height)
          );
        }
        return original.call(this);
      }
    );
    void container;
  }

  async function goToPage3(container: HTMLElement) {
    await waitForCanvas(container, 3);
    const page3 = container.querySelector("#page_div_container_3")!;
    act(() => {
      ioCallback?.([
        { target: page3, isIntersecting: true, intersectionRatio: 0.9 },
      ]);
    });
  }

  function newTextField(container: HTMLElement) {
    return container.querySelector<HTMLElement>(
      '#page_div_container_3 [role="button"][aria-label^="text field"]'
    );
  }

  it.each([
    // [zoom key presses from 125%, scale, expected x, expected y] (PDF pt)
    ["100%", ["0"], 1.0, 42.5, 192],
    ["150%", ["="], 1.5, 100 / 1.5 - 57.5, 200 / 1.5 - 8],
  ])(
    "centres the field in the visible part of page 3 at %s",
    async (_label, keys, scale, x, y) => {
      const { container } = renderWithChakra(
        <PDFEditor src="fake://doc.pdf" mode="build" />
      );
      await goToPage3(container);
      for (const key of keys) pressZoomKey(key);
      await waitFor(() =>
        expect(canvasWidth(container, 3)).toBeCloseTo(200 * scale)
      );
      mockLayout(container, 100);

      fireEvent.click(
        await screen.findByRole("button", { name: /add text field/i })
      );

      const field = await waitFor(() => {
        const el = newTextField(container);
        if (!el) throw new Error("field not added to page 3");
        return el;
      });
      expect(parseFloat(field.style.left) / scale).toBeCloseTo(x, 3);
      expect(parseFloat(field.style.top) / scale).toBeCloseTo(y, 3);
    }
  );

  it("clamps inside the page when the viewport centre is off-page", async () => {
    const { container } = renderWithChakra(
      <PDFEditor src="fake://doc.pdf" mode="build" />
    );
    await goToPage3(container);
    pressZoomKey("0");
    await waitFor(() => expect(canvasWidth(container, 3)).toBe(200));
    // Page 3 sits far above the viewport centre.
    mockLayout(container, -2000);

    fireEvent.click(
      await screen.findByRole("button", { name: /add text field/i })
    );
    const field = await waitFor(() => {
      const el = newTextField(container);
      if (!el) throw new Error("field not added to page 3");
      return el;
    });
    // 300pt page minus the 16pt default height.
    expect(parseFloat(field.style.top)).toBe(284);
    expect(parseFloat(field.style.left)).toBeLessThanOrEqual(200 - 115);
  });
});

describe("A6: multi-select in Prepare", () => {
  beforeEach(() => {
    useDoc(makeFakeDoc([makeFakePage(1)]));
  });

  async function addTwoFields(container: HTMLElement) {
    const add = await screen.findByRole("button", { name: /add text field/i });
    fireEvent.click(add);
    fireEvent.click(add);
    return waitFor(() => {
      const boxes = container.querySelectorAll<HTMLElement>(
        '[role="button"][aria-label^="text field"]'
      );
      if (boxes.length !== 2) throw new Error("fields not added");
      return Array.from(boxes);
    });
  }

  it("shift-click adds and removes fields; batch Required and Delete hit every selected field", async () => {
    const { container } = renderWithChakra(
      <PDFEditor src="fake://doc.pdf" mode="build" />
    );
    const [first, second] = await addTwoFields(container);
    // The last added field is selected on its own.
    expect(second).toHaveAttribute("data-selected", "true");
    expect(first).not.toHaveAttribute("data-selected");

    fireEvent.click(first, { shiftKey: true });
    await screen.findByText("2 selected");
    expect(first).toHaveAttribute("data-selected", "true");
    expect(second).toHaveAttribute("data-selected", "true");
    // Multi-selection: no resize handles anywhere.
    expect(container.querySelectorAll("[data-resize-handle]")).toHaveLength(0);

    // Shift-click again removes it.
    fireEvent.click(first, { shiftKey: true });
    await waitFor(() => expect(first).not.toHaveAttribute("data-selected"));
    expect(screen.queryByText("2 selected")).toBeNull();
    fireEvent.click(first, { shiftKey: true });
    await screen.findByText("2 selected");

    fireEvent.click(screen.getByRole("button", { name: "Required" }));
    await waitFor(() => {
      expect(first).toHaveAccessibleName(/required/);
      expect(second).toHaveAccessibleName(/required/);
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        container.querySelectorAll('[role="button"][aria-label^="text field"]')
      ).toHaveLength(0)
    );
    expect(screen.queryByRole("toolbar", { name: "Field actions" })).toBeNull();
  });

  it("Backspace on a multi-selection deletes every selected field; Cmd+D does nothing", async () => {
    const { container } = renderWithChakra(
      <PDFEditor src="fake://doc.pdf" mode="build" />
    );
    const [first] = await addTwoFields(container);
    fireEvent.click(first, { shiftKey: true });
    await screen.findByText("2 selected");

    // Duplicate is disabled in the toolbar for a multi-selection; the
    // shortcut must agree.
    fireEvent.keyDown(first, { key: "d", metaKey: true });
    expect(
      container.querySelectorAll('[role="button"][aria-label^="text field"]')
    ).toHaveLength(2);

    // The primary (the last shift-clicked field) owns the keyboard.
    fireEvent.keyDown(first, { key: "Backspace" });
    await waitFor(() =>
      expect(
        container.querySelectorAll('[role="button"][aria-label^="text field"]')
      ).toHaveLength(0)
    );
  });

  it("a plain click collapses back to a single selection", async () => {
    const { container } = renderWithChakra(
      <PDFEditor src="fake://doc.pdf" mode="build" />
    );
    const [first, second] = await addTwoFields(container);
    fireEvent.click(first, { shiftKey: true });
    await screen.findByText("2 selected");

    fireEvent.click(second);
    await waitFor(() => expect(first).not.toHaveAttribute("data-selected"));
    expect(second).toHaveAttribute("data-selected", "true");
    expect(container.querySelectorAll("[data-resize-handle]")).toHaveLength(4);
  });

  it("Esc on the canvas clears the selection without closing a host Dialog", async () => {
    const onOpenChange = vi.fn();
    renderWithChakra(
      <Dialog.Root open onOpenChange={onOpenChange}>
        <Portal>
          <Dialog.Positioner>
            <Dialog.Content aria-label="Host editor">
              <PDFEditor src="fake://doc.pdf" mode="build" />
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    );
    const [first] = await addTwoFields(document.body);
    fireEvent.click(first);
    await waitFor(() => expect(first).toHaveAttribute("data-selected", "true"));

    fireEvent.keyDown(first, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(first).not.toHaveAttribute("data-selected"));
    expect(onOpenChange).not.toHaveBeenCalled();

    // With nothing selected, Esc still reaches the host Dialog.
    fireEvent.keyDown(first, { key: "Escape", code: "Escape" });
    await waitFor(() =>
      expect(onOpenChange).toHaveBeenCalledWith(
        expect.objectContaining({ open: false })
      )
    );
  });

  it("Esc after a click outside the editor is left for the host", async () => {
    const { container } = renderWithChakra(
      <div>
        <p data-testid="host-text">Host page</p>
        <PDFEditor src="fake://doc.pdf" mode="build" />
      </div>
    );
    const [first] = await addTwoFields(container);
    fireEvent.click(first);
    await waitFor(() => expect(first).toHaveAttribute("data-selected", "true"));

    fireEvent.pointerDown(screen.getByTestId("host-text"));
    expect(fireEvent.keyDown(document.body, { key: "Escape" })).toBe(true);
    expect(first).toHaveAttribute("data-selected", "true");
  });

  it("Esc on the canvas clears the selection", async () => {
    const { container } = renderWithChakra(
      <PDFEditor src="fake://doc.pdf" mode="build" />
    );
    const [first, second] = await addTwoFields(container);
    fireEvent.click(first, { shiftKey: true });
    await screen.findByText("2 selected");

    fireEvent.keyDown(second, { key: "Escape" });
    await waitFor(() => {
      expect(first).not.toHaveAttribute("data-selected");
      expect(second).not.toHaveAttribute("data-selected");
    });
    expect(screen.queryByRole("toolbar", { name: "Field actions" })).toBeNull();
  });
});

describe("C9: tablet drawers stay apart from the desktop rails", () => {
  const originalWidth = window.innerWidth;
  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalWidth,
    });
    localStorage.clear();
  });

  it("opening the host panel on tablet shows it without saving it open for desktop", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 800,
    });
    // Closed on desktop last time.
    localStorage.setItem(
      "pdf-editor-panel-state",
      JSON.stringify({ hostPanel: { id: "hostPanel", isOpen: false, isCollapsed: false } })
    );
    renderWithChakra(
      <PDFEditor
        src="fake://doc.pdf"
        mode="build"
        sidebarPanel={{ title: "Checklist", content: <div>host body</div> }}
      />
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Checklist" }));
    expect(await screen.findByText("host body")).toBeInTheDocument();

    const stored = JSON.parse(
      localStorage.getItem("pdf-editor-panel-state") ?? "{}"
    );
    expect(stored.hostPanel.isOpen).toBe(false);
  });
});

describe("Mobile Prepare: tap selects, the action bar acts", () => {
  const originalWidth = window.innerWidth;
  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalWidth,
    });
  });

  it("a tap selects without opening the sheet; the docked bar's Edit opens it", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    useDoc(makeFakeDoc([makeFakePage(1)]));
    const user = userEvent.setup();
    const { container } = renderWithChakra(
      <PDFEditor src="fake://doc.pdf" mode="build" />
    );
    await user.click(await screen.findByRole("button", { name: "Add field" }));
    await user.click(await screen.findByRole("button", { name: /^text$/i }));
    const field = await waitFor(() => {
      const el = container.querySelector<HTMLElement>(
        '[role="button"][aria-label^="text field"]'
      );
      if (!el) throw new Error("field not added");
      return el;
    });

    fireEvent.click(field);
    const bar = await screen.findByRole("toolbar", { name: /^Actions for / });
    // No modal sheet: the field stays selected and movable.
    expect(screen.queryByRole("dialog", { name: "Properties" })).toBeNull();
    // The bar takes the Add field pill's place.
    expect(screen.queryByRole("button", { name: "Add field" })).toBeNull();

    await user.click(within(bar).getByRole("button", { name: "Required" }));
    await waitFor(() =>
      expect(
        within(bar).getByRole("button", { name: "Required" })
      ).toHaveAttribute("aria-pressed", "true")
    );

    await user.click(within(bar).getByRole("button", { name: "Edit" }));
    expect(
      await screen.findByRole("dialog", { name: "Properties" })
    ).toBeInTheDocument();
  });
});
