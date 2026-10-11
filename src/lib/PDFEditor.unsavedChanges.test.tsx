import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, waitFor, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithChakra } from "./testUtils";

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

/**
 * Switches modes through the header's mode Menu (a Chakra Menu rendered
 * inline): open the trigger, pick the radio item.
 */
async function switchMode(from: RegExp, to: RegExp) {
  await userEvent.click(screen.getByRole("button", { name: from }));
  const menu = await screen.findByRole("menu");
  await userEvent.click(within(menu).getByRole("menuitemradio", { name: to }));
}

/**
 * Gives the fake document real PDF bytes: the Prepare save loads them with
 * pdf-lib, which rejects the harness's default empty Uint8Array. Call after
 * the suite's beforeEach has set up fakeDocRef.
 */
async function giveRealPdfBytes() {
  const srcDoc = await PDFDocument.create();
  srcDoc.addPage([200, 300]);
  const realBytes = await srcDoc.save();
  const doc = fakeDocRef.current as ReturnType<typeof makeFakeDoc>;
  doc.getData = vi.fn(
    async (): Promise<Uint8Array<ArrayBuffer>> =>
      realBytes as Uint8Array<ArrayBuffer>
  );
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
    const { container, getByRole, queryByRole } = renderWithChakra(
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

    // Confirm dialogs are Chakra Dialogs in a Portal: query the document.
    expect(
      await screen.findByRole("heading", { name: "Save your changes?" })
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Save your changes?" })
      ).not.toBeInTheDocument()
    );
    expect(queryByRole("button", { name: "Keep editing" })).toBeNull();
  });

  it("Discard closes without saving", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const { container, getByRole } = renderWithChakra(
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
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("closes immediately, with no prompt, when there are no unsaved changes", async () => {
    const onClose = vi.fn();
    const { container, getByRole } = renderWithChakra(
      <PDFEditor src="fake://document.pdf" mode="edit" onClose={onClose} />
    );

    await waitFor(() => {
      if (!container.querySelector('input[data-field-id="field_1"]')) {
        throw new Error("field input not yet mounted");
      }
    });

    fireEvent.click(getByRole("button", { name: "Close" }));
    expect(
      screen.queryByRole("heading", { name: "Save your changes?" })
    ).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("switching modes never prompts, even while dirty", async () => {
    const onClose = vi.fn();
    const { container } = renderWithChakra(
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
    await switchMode(/fill & sign/i, /prepare/i);

    expect(
      screen.queryByRole("heading", { name: "Save your changes?" })
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
    getByRole: ReturnType<typeof renderWithChakra>["getByRole"]
  ) => {
    const addText = await waitFor(() => getByRole("button", {
      name: /add text field/i,
    }));
    fireEvent.click(addText);
  };

  it("blocks the switch with a dialog while prepared fields are unsaved", async () => {
    const { getByRole, getByText } = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="build"
        allowedModes={["edit", "build"]}
      />
    );

    await addFieldViaPalette(getByRole);

    await switchMode(/prepare/i, /fill & sign/i);

    // The switch did NOT happen; the dialog is up instead.
    expect(
      await screen.findByRole("heading", { name: "Save your fields first?" })
    ).toBeInTheDocument();

    // Stay in Prepare: dialog closes, mode unchanged.
    fireEvent.click(screen.getByRole("button", { name: "Stay in Prepare" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Save your fields first?" })
      ).not.toBeInTheDocument()
    );
    expect(getByRole("button", { name: /prepare/i })).toBeInTheDocument();

    // Try again and continue without saving: mode switches and the
    // persistent in-canvas notice takes over as the reminder.
    await switchMode(/prepare/i, /fill & sign/i);
    fireEvent.click(
      await screen.findByRole("button", { name: "Continue without saving" })
    );
    await waitFor(() =>
      expect(getByRole("button", { name: /fill & sign/i })).toBeInTheDocument()
    );
    expect(
      getByText(/Fields added in Prepare are not saved yet/)
    ).toBeInTheDocument();
  });

  it("switches without any dialog when nothing was changed in Prepare", async () => {
    const { getByRole } = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="build"
        allowedModes={["edit", "build"]}
      />
    );

    // Wait for the document (and its seeded fields) to be ready.
    await waitFor(() => getByRole("button", { name: /add text field/i }));

    await switchMode(/prepare/i, /fill & sign/i);

    expect(
      screen.queryByRole("heading", { name: "Save your fields first?" })
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(getByRole("button", { name: /fill & sign/i })).toBeInTheDocument()
    );
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
    const { getByRole } = renderWithChakra(
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

    await switchMode(/prepare/i, /fill & sign/i);
    fireEvent.click(
      await screen.findByRole("button", { name: "Save and continue" })
    );

    // The regression this pins: a stale first-render onSaveAs closed over
    // pdfDoc === undefined, silently saved NOTHING, and switched anyway.
    await waitFor(() => expect(onBuildSave).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(getByRole("button", { name: /fill & sign/i })).toBeInTheDocument()
    );
  });

  it("keeps the guard open and stays in Prepare when the host's save fails", async () => {
    // Regression: a `finally` dismissed this dialog even when onBuildSave
    // rejected, dropping the signer back into Prepare with unsaved fields
    // and no failure signal (this library has no toast surface).
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

    const onBuildSave = vi.fn(() => Promise.reject(new Error("upload failed")));
    const { getByRole, queryByRole } = renderWithChakra(
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

    await switchMode(/prepare/i, /fill & sign/i);
    fireEvent.click(
      await screen.findByRole("button", { name: "Save and continue" })
    );

    await waitFor(() => expect(onBuildSave).toHaveBeenCalledTimes(1));
    // Dialog survives, mode never switched.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save and continue" })
      ).toBeInTheDocument()
    );
    expect(queryByRole("button", { name: /^fill & sign$/i })).toBeNull();
  });
});

describe("PDFEditor Prepare -> View unsaved-fields guard", () => {
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

  // Fillable overlays carry data-field-id; Prepare's placed fields carry
  // data-build-field-id instead.
  const idsOf = (container: HTMLElement, attr: string) =>
    Array.from(container.querySelectorAll<HTMLElement>(`[${attr}]`)).map(
      (el) => el.getAttribute(attr)
    );

  it("blocks Prepare -> View while prepared fields are unsaved, then lands in View with the notice", async () => {
    const { container, getByRole, getByText } = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="build"
        allowedModes={["build", "edit", "view"]}
      />
    );

    const addText = await waitFor(() =>
      getByRole("button", { name: /add text field/i })
    );
    const before = idsOf(container, "data-build-field-id").length;
    fireEvent.click(addText);
    // The new field is on the page in Prepare.
    await waitFor(() =>
      expect(idsOf(container, "data-build-field-id")).toHaveLength(before + 1)
    );

    await switchMode(/prepare/i, /^view/i);

    // Before the fix this switch went straight to View: the new field was
    // simply missing there, with neither a dialog nor a notice.
    expect(
      await screen.findByRole("heading", { name: "Save your fields first?" })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Continue without saving" })
    );
    // Lands on the mode the user picked (View), not Fill & Sign.
    await waitFor(() =>
      expect(getByRole("button", { name: /^view$/i })).toBeInTheDocument()
    );
    // The unsaved field is still missing in View (fields render from the
    // PDF), but now the in-canvas notice says why.
    await waitFor(() =>
      expect(idsOf(container, "data-field-id")).toEqual(["field_1"])
    );
    expect(
      getByText(/Fields added in Prepare are not saved yet, so they cannot be shown here/)
    ).toBeInTheDocument();
  });

  it("Save and continue saves, then lands in View (the mode picked), not Fill & Sign", async () => {
    await giveRealPdfBytes();
    const onBuildSave = vi.fn();
    const { getByRole, queryByText } = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="build"
        allowedModes={["build", "edit", "view"]}
        onBuildSave={onBuildSave}
      />
    );

    fireEvent.click(
      await waitFor(() => getByRole("button", { name: /add text field/i }))
    );
    await switchMode(/prepare/i, /^view/i);
    fireEvent.click(
      await screen.findByRole("button", { name: "Save and continue" })
    );

    await waitFor(() => expect(onBuildSave).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(getByRole("button", { name: /^view$/i })).toBeInTheDocument()
    );
    // Saved: nothing is pending, so no notice.
    expect(queryByText(/Fields added in Prepare are not saved yet/)).toBeNull();
  });

  it("Fill & Sign keeps the 'filled' wording; View says 'shown'", async () => {
    const { getByRole, getByText } = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="build"
        allowedModes={["build", "edit", "view"]}
      />
    );

    fireEvent.click(
      await waitFor(() => getByRole("button", { name: /add text field/i }))
    );
    await switchMode(/prepare/i, /fill & sign/i);
    fireEvent.click(
      await screen.findByRole("button", { name: "Continue without saving" })
    );
    await waitFor(() =>
      expect(getByRole("button", { name: /fill & sign/i })).toBeInTheDocument()
    );
    expect(
      getByText(/not saved yet, so they cannot be filled here/)
    ).toBeInTheDocument();

    // Fill & Sign -> View is not guarded (only leaving Prepare is); the
    // notice follows along with View's wording.
    await switchMode(/fill & sign/i, /^view/i);
    expect(screen.queryByRole("heading", { name: "Save your fields first?" }))
      .toBeNull();
    await waitFor(() =>
      expect(
        getByText(/not saved yet, so they cannot be shown here/)
      ).toBeInTheDocument()
    );
  });
});

describe("PDFEditor mode-menu unsaved-fields note", () => {
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

  const NOTE = /Your new fields aren't saved yet/;

  const openModeMenu = async (current: RegExp) => {
    await userEvent.click(screen.getByRole("button", { name: current }));
    return screen.findByRole("menu");
  };

  it("is absent while nothing is unsaved", async () => {
    const { getByRole } = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="build"
        allowedModes={["build", "edit", "view"]}
      />
    );
    await waitFor(() => getByRole("button", { name: /add text field/i }));

    const menu = await openModeMenu(/prepare/i);
    expect(within(menu).queryByText(NOTE)).toBeNull();
    expect(
      within(menu).queryByRole("menuitem", { name: /save/i })
    ).toBeNull();
  });

  it("shows while fields are unsaved; its Save runs the Prepare save, keeps the menu open and clears the note", async () => {
    await giveRealPdfBytes();
    const onBuildSave = vi.fn();
    const { getByRole } = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="build"
        allowedModes={["build", "edit", "view"]}
        onBuildSave={onBuildSave}
      />
    );
    fireEvent.click(
      await waitFor(() => getByRole("button", { name: /add text field/i }))
    );

    const menu = await openModeMenu(/prepare/i);
    expect(within(menu).getByText(NOTE)).toBeInTheDocument();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /save/i })
    );

    await waitFor(() => expect(onBuildSave).toHaveBeenCalledTimes(1));
    // Menu still open, note gone, so the user can pick a mode right away.
    await waitFor(() =>
      expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
    );
    const stillOpen = screen.getByRole("menu");
    await userEvent.click(
      within(stillOpen).getByRole("menuitemradio", { name: /^view/i })
    );
    // Saved, so no dialog: straight to View.
    expect(
      screen.queryByRole("heading", { name: "Save your fields first?" })
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(getByRole("button", { name: /^view$/i })).toBeInTheDocument()
    );
  });

  it.each([
    ["Fill & Sign", /fill & sign/i],
    ["View", /^view/i],
  ])(
    "the guard dialog still fires for Prepare -> %s after the note was shown and ignored",
    async (_label, target) => {
      const { getByRole } = renderWithChakra(
        <PDFEditor
          src="fake://document.pdf"
          mode="build"
          allowedModes={["build", "edit", "view"]}
        />
      );
      fireEvent.click(
        await waitFor(() => getByRole("button", { name: /add text field/i }))
      );

      // The note was shown...
      const menu = await openModeMenu(/prepare/i);
      expect(within(menu).getByText(NOTE)).toBeInTheDocument();
      // ...and ignored: the user picks a mode anyway.
      await userEvent.click(
        within(menu).getByRole("menuitemradio", { name: target })
      );
      expect(
        await screen.findByRole("heading", { name: "Save your fields first?" })
      ).toBeInTheDocument();

      // And again on a second attempt: seeing the note (or the dialog)
      // once never switches the guard off.
      fireEvent.click(screen.getByRole("button", { name: "Stay in Prepare" }));
      await waitFor(() =>
        expect(
          screen.queryByRole("heading", { name: "Save your fields first?" })
        ).not.toBeInTheDocument()
      );
      await switchMode(/prepare/i, target);
      expect(
        await screen.findByRole("heading", { name: "Save your fields first?" })
      ).toBeInTheDocument();
    }
  );

  it("is not shown outside Prepare, where the header Save isn't the Prepare save", async () => {
    const { getByRole } = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="build"
        allowedModes={["build", "edit", "view"]}
      />
    );
    fireEvent.click(
      await waitFor(() => getByRole("button", { name: /add text field/i }))
    );
    await switchMode(/prepare/i, /fill & sign/i);
    fireEvent.click(
      await screen.findByRole("button", { name: "Continue without saving" })
    );
    await waitFor(() =>
      expect(getByRole("button", { name: /fill & sign/i })).toBeInTheDocument()
    );

    const menu = await openModeMenu(/fill & sign/i);
    expect(within(menu).queryByText(NOTE)).toBeNull();
  });
});
