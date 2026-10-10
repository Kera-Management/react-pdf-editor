import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithChakra } from "./testUtils";
import { PDFDocument } from "pdf-lib";

import PDFEditor from "./PDFEditor";
import {
  createEditorMetadata,
  serializeEditorMetadata,
} from "./participantCompletion";
import { stubCanvas } from "./components/Signature/testUtils";

/**
 * Coverage for the Prepare & Sign polish wave, scoped to what PDFEditor.tsx
 * itself owns:
 *  - ALLOWEDMODES GUARDRAIL: default is now [mode], not every mode.
 *  - SIGNER COMPLETION save gate: Save opens a confirm instead of saving
 *    straight away when the active participant still has incomplete
 *    required fields.
 *  - Signature session cache: an adopted signature is offered as a
 *    one-click reuse for the NEXT signature field on the same document,
 *    even when the host never passed `savedSignature`.
 *
 * Friendly-name coverage (FRIENDLY NAMES) lives in
 * PDFEditor.buildModePopover.test.tsx, alongside the rest of the build-mode
 * field-popover suite it already extends.
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

function makeFakePage(width = 300, height = 300) {
  return {
    pageNumber: 1,
    destroyed: false,
    getViewport: vi.fn((opts?: { scale?: number }) => ({
      width: width * (opts?.scale ?? 1),
      height: height * (opts?.scale ?? 1),
    })),
    render: pageRenderMock,
  };
}

function makeFakeDoc(
  page: ReturnType<typeof makeFakePage>,
  fields: Record<string, unknown[]>,
  bytes: Uint8Array
) {
  return {
    numPages: 1,
    getPage: vi.fn(async () => page),
    getFieldObjects: vi.fn(async () => fields),
    getData: vi.fn(async () => bytes),
    destroy: vi.fn(),
  };
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

  getDocumentMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PDFEditor allowedModes default", () => {
  it("defaults to just the initial mode -- no dropdown selector -- when allowedModes is omitted", async () => {
    const page = makeFakePage();
    fakeDocRef.current = makeFakeDoc(page, {}, new Uint8Array());
    getDocumentMock.mockImplementation(() => ({
      promise: Promise.resolve(fakeDocRef.current),
    }));

    const { getByRole, queryByRole } = renderWithChakra(
      <PDFEditor src="fake://document.pdf" mode="build" />
    );

    // Save always renders regardless of mode -- a stable readiness signal.
    await waitFor(() => getByRole("button", { name: "Save" }));

    // Single allowed mode -> no mode switcher at all (4.0.0: the static
    // mode label is gone too; the signer doesn't need a mode name).
    expect(
      queryByRole("button", { name: /prepare/i })
    ).not.toBeInTheDocument();
    expect(queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Prepare")).not.toBeInTheDocument();
  });

  it("still shows the mode selector when the host passes allowedModes explicitly", async () => {
    const page = makeFakePage();
    fakeDocRef.current = makeFakeDoc(page, {}, new Uint8Array());
    getDocumentMock.mockImplementation(() => ({
      promise: Promise.resolve(fakeDocRef.current),
    }));

    const { getByRole } = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        allowedModes={["edit", "build", "view"]}
      />
    );

    // The dropdown mode button renders once >1 mode is allowed.
    await waitFor(() => getByRole("button", { name: /fill & sign/i }));
  });
});

describe("PDFEditor signer completion save gate", () => {
  const FIELD_RECT = { x: 10, y: 200, width: 150, height: 30 };

  async function buildRequiredFieldDocument(): Promise<Uint8Array> {
    const srcDoc = await PDFDocument.create();
    const page = srcDoc.addPage([300, 300]);
    const form = srcDoc.getForm();
    const field = form.createTextField("tenant_name");
    field.addToPage(page, { ...FIELD_RECT, borderWidth: 0 });
    srcDoc.setTitle(
      serializeEditorMetadata(
        createEditorMetadata({
          fieldAssignments: { tenant_name: ["p1"] },
          requiredFields: ["tenant_name"],
        })
      )
    );
    return srcDoc.save();
  }

  function fieldObjects() {
    return {
      tenant_name: [
        {
          editable: true,
          hidden: false,
          id: "field_1",
          multiline: false,
          name: "tenant_name",
          page: 0,
          password: false,
          rect: [
            FIELD_RECT.x,
            FIELD_RECT.y,
            FIELD_RECT.x + FIELD_RECT.width,
            FIELD_RECT.y + FIELD_RECT.height,
          ],
          type: "text" as const,
          value: "",
          defaultValue: "",
        },
      ],
    };
  }

  async function mountWithRequiredField() {
    const bytes = await buildRequiredFieldDocument();
    const page = makeFakePage();
    fakeDocRef.current = makeFakeDoc(page, fieldObjects(), bytes);
    getDocumentMock.mockImplementation(() => ({
      promise: Promise.resolve(fakeDocRef.current),
    }));

    const onSave = vi.fn();
    const utils = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        activeParticipantId="p1"
        participants={[{ id: "p1", label: "Jane" }]}
        onSave={onSave}
      />
    );

    const input = await waitFor(() => {
      const el = utils.container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_1"]'
      );
      if (!el) throw new Error("field input not yet mounted");
      return el;
    });

    return { ...utils, input, onSave };
  }

  it("opens a confirm instead of saving when the required field is still empty", async () => {
    const { getByRole, onSave } = await mountWithRequiredField();

    fireEvent.click(getByRole("button", { name: "Save" }));

    // Confirm dialogs are Chakra Dialogs in a Portal: query the document.
    expect(
      await screen.findByRole("heading", {
        name: "You still have 1 field to complete",
      })
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Keep signing closes the confirm without saving", async () => {
    const { getByRole, queryByRole, onSave } = await mountWithRequiredField();

    fireEvent.click(getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Keep signing" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", {
          name: "You still have 1 field to complete",
        })
      ).not.toBeInTheDocument()
    );
    expect(queryByRole("button", { name: "Keep signing" })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Save anyway proceeds with the save", async () => {
    const { getByRole, onSave } = await mountWithRequiredField();

    fireEvent.click(getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save anyway" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it("saves directly, with no confirm, once the required field is filled in", async () => {
    const { getByRole, queryByRole, input, onSave } =
      await mountWithRequiredField();

    // Typing marks the session dirty, which changes the Save button's
    // aria-label to "Save (unsaved changes)" -- match loosely.
    fireEvent.change(input, { target: { value: "Jane Doe" } });
    fireEvent.click(getByRole("button", { name: /^save/i }));

    expect(
      screen.queryByRole("heading", { name: /still have/i })
    ).not.toBeInTheDocument();
    expect(queryByRole("heading", { name: /still have/i })).toBeNull();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });
});

describe("PDFEditor signature session cache", () => {
  const RECT_1 = { x: 10, y: 200, width: 150, height: 30 };
  const RECT_2 = { x: 10, y: 100, width: 150, height: 30 };

  async function buildTwoSignatureDocument(): Promise<Uint8Array> {
    const srcDoc = await PDFDocument.create();
    const page = srcDoc.addPage([300, 300]);
    const form = srcDoc.getForm();
    const f1 = form.createTextField("sig_field_1");
    f1.addToPage(page, { ...RECT_1, borderWidth: 0 });
    const f2 = form.createTextField("sig_field_2");
    f2.addToPage(page, { ...RECT_2, borderWidth: 0 });
    srcDoc.setTitle(
      serializeEditorMetadata(
        createEditorMetadata({
          fieldAssignments: {},
          requiredFields: [],
          signatureFields: ["sig_field_1", "sig_field_2"],
        })
      )
    );
    return srcDoc.save();
  }

  function fieldObjects() {
    return {
      sig_field_1: [
        {
          editable: true,
          hidden: false,
          id: "field_sig_1",
          multiline: false,
          name: "sig_field_1",
          page: 0,
          password: false,
          rect: [
            RECT_1.x,
            RECT_1.y,
            RECT_1.x + RECT_1.width,
            RECT_1.y + RECT_1.height,
          ],
          type: "text" as const,
          value: "",
          defaultValue: "",
        },
      ],
      sig_field_2: [
        {
          editable: true,
          hidden: false,
          id: "field_sig_2",
          multiline: false,
          name: "sig_field_2",
          page: 0,
          password: false,
          rect: [
            RECT_2.x,
            RECT_2.y,
            RECT_2.x + RECT_2.width,
            RECT_2.y + RECT_2.height,
          ],
          type: "text" as const,
          value: "",
          defaultValue: "",
        },
      ],
    };
  }

  it("offers a just-adopted signature as a one-click reuse for the next signature field, with no savedSignature prop", async () => {
    stubCanvas();

    const bytes = await buildTwoSignatureDocument();
    const page = makeFakePage();
    fakeDocRef.current = makeFakeDoc(page, fieldObjects(), bytes);
    getDocumentMock.mockImplementation(() => ({
      promise: Promise.resolve(fakeDocRef.current),
    }));

    const { container } = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        activeParticipantId="p1"
        participants={[{ id: "p1", label: "Jane Doe" }]}
      />
    );

    const signButton1 = await waitFor(() => {
      const el = container.querySelector<HTMLButtonElement>(
        'button[data-field-id="field_sig_1"]'
      );
      if (!el) throw new Error("first signature field not yet mounted");
      return el;
    });

    // No savedSignature was passed -- the modal opens straight to capture.
    fireEvent.click(signButton1);
    expect(
      screen.queryByRole("button", { name: /use this signature/i })
    ).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("tab", { name: "Type" }));
    const adoptButton = await waitFor(() =>
      screen.getByRole("button", { name: "Adopt" })
    );
    expect(adoptButton).toBeEnabled(); // pre-filled from signerName
    fireEvent.click(adoptButton);

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Add your signature" })
      ).not.toBeInTheDocument()
    );

    const signButton2 = await waitFor(() => {
      const el = container.querySelector<HTMLButtonElement>(
        'button[data-field-id="field_sig_2"]'
      );
      if (!el) throw new Error("second signature field not yet mounted");
      return el;
    });

    // Field #2's modal now offers the just-adopted signature as a saved
    // one-click option, even though the host never passed `savedSignature`.
    fireEvent.click(signButton2);
    expect(
      await screen.findByRole("button", { name: /use this signature/i })
    ).toBeInTheDocument();
    expect(
      screen.getByAltText("Your saved signature")
    ).toBeInTheDocument();
  });
});
