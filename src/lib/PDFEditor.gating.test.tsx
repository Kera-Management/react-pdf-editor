import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import PDFEditor from "./PDFEditor";

/**
 * Regression test for the click-to-sign gating fix. The DOM gating loop in
 * `renderPages` used to select `"input, select, textarea"` -- a signature
 * field's click-to-sign control is a `<button>`, so it silently bypassed
 * `activeParticipantId`/`unassignedVisibility` gating entirely, letting an
 * unassigned participant sign a field they were never given. The selector
 * was broadened to `"[data-field-id]"`, which every overlay element
 * (including the signature button) carries. This proves a signature field
 * is now gated identically to an ordinary text input: hidden when the
 * active participant isn't assigned to it, visible when they are.
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

// Signature fields are plain PDFTextFields on disk (see PDFEditor.tsx's
// onSaveAs) -- the only record that "sig_field" is a signature, not
// ordinary text, is extracted metadata. Real bytes/PDFDocument.load aren't
// needed to prove the gating fix, so extractEditorMetadata is stubbed
// directly; every other export stays real.
vi.mock("./participantCompletion", async () => {
  const actual = await vi.importActual<
    typeof import("./participantCompletion")
  >("./participantCompletion");
  return {
    ...actual,
    extractEditorMetadata: vi.fn(async () => ({
      version: 3 as const,
      fieldAssignments: {
        tenant_name: ["assignee-a"],
        sig_field: ["assignee-a"],
      },
      requiredFields: [],
      signatureFields: ["sig_field"],
    })),
  };
});

const TEXT_FIELD = {
  editable: true,
  hidden: false,
  id: "field_text",
  multiline: false,
  name: "tenant_name",
  page: 0,
  password: false,
  rect: [10, 10, 110, 30],
  type: "text" as const,
  value: "",
  defaultValue: "",
};

const SIGNATURE_FIELD = {
  editable: true,
  hidden: false,
  id: "field_sig",
  multiline: false,
  name: "sig_field",
  page: 0,
  password: false,
  rect: [10, 50, 160, 80],
  type: "text" as const,
  value: "",
  defaultValue: "",
};

// An Acrobat ACTION button (Reset Form style): editable per pdf.js, but
// not fillable content -- must never render as a field.
const PUSHBUTTON_FIELD = {
  editable: true,
  hidden: false,
  id: "field_reset",
  multiline: false,
  name: "Reset Form",
  page: 0,
  password: false,
  rect: [10, 90, 110, 110],
  type: "button" as const,
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
    getFieldObjects: vi.fn(async () => ({
      tenant_name: [TEXT_FIELD],
      sig_field: [SIGNATURE_FIELD],
      "Reset Form": [PUSHBUTTON_FIELD],
    })),
    getData: vi.fn(async () => new Uint8Array()),
    destroy: vi.fn(),
  };
}

describe("PDFEditor click-to-sign gating parity", () => {
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

  it("hides both the text input and the signature button for an unassigned participant", async () => {
    const { container } = render(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        activeParticipantId="outsider"
        unassignedVisibility="hidden"
      />
    );

    const textInput = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_text"]'
      );
      if (!el) throw new Error("text field not yet mounted");
      return el;
    });
    const signatureButton = await waitFor(() => {
      const el = container.querySelector<HTMLButtonElement>(
        'button[data-field-id="field_sig"]'
      );
      if (!el) throw new Error("signature field not yet mounted");
      return el;
    });

    await waitFor(() => {
      expect(textInput.style.display).toBe("none");
      expect(signatureButton.style.display).toBe("none");
    });
  });

  it("shows both the text input and the signature button for the assigned participant", async () => {
    const { container } = render(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        activeParticipantId="assignee-a"
        unassignedVisibility="hidden"
      />
    );

    const textInput = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_text"]'
      );
      if (!el) throw new Error("text field not yet mounted");
      return el;
    });
    const signatureButton = await waitFor(() => {
      const el = container.querySelector<HTMLButtonElement>(
        'button[data-field-id="field_sig"]'
      );
      if (!el) throw new Error("signature field not yet mounted");
      return el;
    });

    await waitFor(() => {
      expect(textInput.style.display).not.toBe("none");
      expect(signatureButton.style.display).not.toBe("none");
    });
  });

  it("never renders an Acrobat action pushbutton as a fillable field", async () => {
    render(
      <PDFEditor src="fake://document.pdf" mode="edit" activeParticipantId="anyone" />
    );
    await waitFor(() => {
      expect(
        document.querySelector('input[data-field-id="field_text"]')
      ).not.toBeNull();
    });
    // The Reset Form pushbutton must not exist in ANY rendered form: its
    // value leaking into a submission got rejected by the signing backend
    // as a field not assigned to the recipient.
    expect(document.querySelector('[name="Reset Form"]')).toBeNull();
    expect(
      document.querySelector('[data-field-id="field_reset"]')
    ).toBeNull();
  });

  it("signature buttons carry data-field-name so guided navigation can find them", async () => {
    render(
      <PDFEditor src="fake://document.pdf" mode="edit" activeParticipantId="anyone" />
    );
    await waitFor(() => {
      expect(
        document.querySelector('button[data-field-name="sig_field"]')
      ).not.toBeNull();
    });
  });
});
