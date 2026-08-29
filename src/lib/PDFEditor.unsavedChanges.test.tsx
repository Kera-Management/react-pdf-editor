import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";

import { PDFDocument } from "pdf-lib";

import PDFEditor from "./PDFEditor";

/**
 * Regression coverage for the unsaved-changes guard: today the editor
 * silently discards everything on close with no warning. The library's own
 * close affordance must intercept itself when dirty and show "Save your
 * changes?" (Save / Discard / Keep editing), while mode switches -- which
 * never lose state, since it all lives in one component -- must never
 * prompt.
 */

const { getDocumentMock, fakeDocRef, pageRenderMock } = vi.hoisted(() => ({
  getDocumentMock: vi.fn(),
  fakeDocRef: { current: null as unknown },
  pageRenderMock: vi.fn(),
}));

vi.mock("pdfjs-dist", () => ({
  AnnotationMode: { ENABLE_FORMS: 2 },
  GlobalWorkerOptions: { workerSrc: "" },
  RenderingCancelledException: class RenderingCancelledException extends Error {},
  version: "5.4.54",
  getDocument: (...args: unknown[]) => getDocumentMock(...args),
}));

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

describe("PDFEditor unsaved-changes guard", () => {
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

  it("prompts instead of closing immediately once a value has changed, and Keep editing does not close", async () => {
    const onClose = vi.fn();
    const { container, getByRole, queryByRole } = render(
      <PDFEditor src="fake://document.pdf" mode="edit" onClose={onClose} />
    );

    const input = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_1"]'
      );
      if (!el) throw new Error("field input not yet mounted");
      return el;
    });

    fireEvent.change(input, { target: { value: "Jane Doe" } });

    fireEvent.click(getByRole("button", { name: "Close" }));

    expect(
      getByRole("heading", { name: "Save your changes?" })
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(getByRole("button", { name: "Keep editing" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(
      queryByRole("heading", { name: "Save your changes?" })
    ).not.toBeInTheDocument();
  });

  it("Discard closes without saving", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const { container, getByRole } = render(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        onClose={onClose}
        onSave={onSave}
      />
    );

    const input = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_1"]'
      );
      if (!el) throw new Error("field input not yet mounted");
      return el;
    });
    fireEvent.change(input, { target: { value: "Jane Doe" } });

    fireEvent.click(getByRole("button", { name: "Close" }));
    fireEvent.click(getByRole("button", { name: "Discard" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("closes immediately, with no prompt, when there are no unsaved changes", async () => {
    const onClose = vi.fn();
    const { container, getByRole, queryByRole } = render(
      <PDFEditor src="fake://document.pdf" mode="edit" onClose={onClose} />
    );

    await waitFor(() => {
      if (!container.querySelector('input[data-field-id="field_1"]')) {
        throw new Error("field input not yet mounted");
      }
    });

    fireEvent.click(getByRole("button", { name: "Close" }));
    expect(
      queryByRole("heading", { name: "Save your changes?" })
    ).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("switching modes never prompts, even while dirty", async () => {
    const onClose = vi.fn();
    const { container, getByRole, queryByRole } = render(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        allowedModes={["edit", "build"]}
        onClose={onClose}
      />
    );

    const input = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_1"]'
      );
      if (!el) throw new Error("field input not yet mounted");
      return el;
    });
    fireEvent.change(input, { target: { value: "Jane Doe" } });

    // Mode dropdown -- current label reads "Fill & Sign" (renamed from
    // "Edit"), open it and switch to "Prepare" (renamed from "Build").
    fireEvent.click(getByRole("button", { name: /fill & sign/i }));
    fireEvent.click(getByRole("option", { name: /prepare/i }));

    expect(
      queryByRole("heading", { name: "Save your changes?" })
    ).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("PDFEditor Prepare -> Fill & Sign unsaved-fields guard", () => {
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

  const addFieldViaPalette = async (
    getByRole: ReturnType<typeof render>["getByRole"]
  ) => {
    const addText = await waitFor(() => getByRole("button", {
      name: /add text field/i,
    }));
    fireEvent.click(addText);
  };

  it("blocks the switch with a dialog while prepared fields are unsaved", async () => {
    const { getByRole, queryByRole, getByText } = render(
      <PDFEditor
        src="fake://document.pdf"
        mode="build"
        allowedModes={["edit", "build"]}
      />
    );

    await addFieldViaPalette(getByRole);

    fireEvent.click(getByRole("button", { name: /prepare/i }));
    fireEvent.click(getByRole("option", { name: /fill & sign/i }));

    // The switch did NOT happen; the dialog is up instead.
    expect(
      getByRole("heading", { name: "Save your fields first?" })
    ).toBeInTheDocument();

    // Stay in Prepare: dialog closes, mode unchanged.
    fireEvent.click(getByRole("button", { name: "Stay in Prepare" }));
    expect(
      queryByRole("heading", { name: "Save your fields first?" })
    ).not.toBeInTheDocument();
    expect(getByRole("button", { name: /prepare/i })).toBeInTheDocument();

    // Try again and continue without saving: mode switches and the
    // persistent in-canvas notice takes over as the reminder.
    fireEvent.click(getByRole("button", { name: /prepare/i }));
    fireEvent.click(getByRole("option", { name: /fill & sign/i }));
    fireEvent.click(getByRole("button", { name: "Continue without saving" }));
    expect(getByRole("button", { name: /fill & sign/i })).toBeInTheDocument();
    expect(
      getByText(/Fields added in Prepare are not saved yet/)
    ).toBeInTheDocument();
  });

  it("switches without any dialog when nothing was changed in Prepare", async () => {
    const { getByRole, queryByRole } = render(
      <PDFEditor
        src="fake://document.pdf"
        mode="build"
        allowedModes={["edit", "build"]}
      />
    );

    // Wait for the document (and its seeded fields) to be ready.
    await waitFor(() => getByRole("button", { name: /add text field/i }));

    fireEvent.click(getByRole("button", { name: /prepare/i }));
    fireEvent.click(getByRole("option", { name: /fill & sign/i }));

    expect(
      queryByRole("heading", { name: "Save your fields first?" })
    ).not.toBeInTheDocument();
    expect(getByRole("button", { name: /fill & sign/i })).toBeInTheDocument();
  });
});

describe("PDFEditor Save and continue actually saves", () => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("performs the Prepare save (onBuildSave fires) and then switches to Fill & Sign", async () => {
    // Real PDF bytes: the save path loads them with pdf-lib, which rejects
    // the harness's default empty Uint8Array.
    const srcDoc = await PDFDocument.create();
    srcDoc.addPage([200, 300]);
    const realBytes = await srcDoc.save();

    const page = makeFakePage();
    const doc = makeFakeDoc(page);
    doc.getData = vi.fn(
      async (): Promise<Uint8Array<ArrayBuffer>> =>
        realBytes as Uint8Array<ArrayBuffer>
    );
    fakeDocRef.current = doc;
    getDocumentMock.mockReset();
    getDocumentMock.mockImplementation(() => ({
      promise: Promise.resolve(fakeDocRef.current),
    }));

    const onBuildSave = vi.fn();
    const { getByRole } = render(
      <PDFEditor
        src="fake://document.pdf"
        mode="build"
        allowedModes={["edit", "build"]}
        onBuildSave={onBuildSave}
      />
    );

    const addText = await waitFor(() =>
      getByRole("button", { name: /add text field/i })
    );
    fireEvent.click(addText);

    fireEvent.click(getByRole("button", { name: /prepare/i }));
    fireEvent.click(getByRole("option", { name: /fill & sign/i }));
    fireEvent.click(getByRole("button", { name: "Save and continue" }));

    // The regression this pins: a stale first-render onSaveAs closed over
    // pdfDoc === undefined, silently saved NOTHING, and switched anyway.
    await waitFor(() => expect(onBuildSave).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(getByRole("button", { name: /fill & sign/i })).toBeInTheDocument()
    );
  });
});
