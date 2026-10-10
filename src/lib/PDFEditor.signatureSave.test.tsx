import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { renderWithChakra } from "./testUtils";
import { PDFDocument } from "pdf-lib";

import PDFEditor, { PDFEditorRef } from "./PDFEditor";
import { createEditorMetadata, serializeEditorMetadata } from "./participantCompletion";

/**
 * End-to-end regression test for the signature save path: metadata v3
 * round-trips through a real document (build -> title metadata -> reload),
 * and adopting a signature stamps its PNG onto the page via pdf-lib
 * embedPng/drawImage rather than writing the data URL into the underlying
 * AcroForm text field (which would silently bake a multi-kilobyte base64
 * string in as literal, visible form text).
 *
 * Real pdf-lib is used to build the source document and to inspect the
 * saved output -- only pdfjs-dist (the *reading* side PDFEditor renders
 * from) is mocked, matching PDFEditor.render.test.tsx's precedent.
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

// A well-known minimal valid 1x1 PNG, used as the "adopted" signature so
// the test never has to drive real canvas drawing (jsdom has no 2D canvas
// backend). The saved-signature one-click "Use this signature" path in
// SignatureAdoptionModal needs no canvas interaction at all.
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const FIELD_RECT = { x: 10, y: 200, width: 150, height: 30 };

/** Builds a real, minimal one-field PDF with v3 metadata already declaring
 * "sig_field" as a signature field -- mirroring what a build-mode save
 * produces, so the load path is a genuine round trip. */
async function buildSourceDocument(): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.create();
  const page = srcDoc.addPage([300, 300]);
  const form = srcDoc.getForm();
  const field = form.createTextField("sig_field");
  field.addToPage(page, { ...FIELD_RECT, borderWidth: 0 });
  srcDoc.setTitle(
    serializeEditorMetadata(
      createEditorMetadata({
        fieldAssignments: {},
        requiredFields: [],
        signatureFields: ["sig_field"],
      })
    )
  );
  return srcDoc.save();
}

function makeFakePage() {
  return {
    pageNumber: 1,
    destroyed: false,
    getViewport: vi.fn((opts?: { scale?: number }) => ({
      width: 300 * (opts?.scale ?? 1),
      height: 300 * (opts?.scale ?? 1),
    })),
    render: pageRenderMock,
  };
}

function makeFakeDoc(page: ReturnType<typeof makeFakePage>, bytes: Uint8Array) {
  return {
    numPages: 1,
    getPage: vi.fn(async () => page),
    getFieldObjects: vi.fn(async () => ({
      sig_field: [
        {
          editable: true,
          hidden: false,
          id: "field_sig",
          multiline: false,
          name: "sig_field",
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
    })),
    getData: vi.fn(async () => bytes),
    destroy: vi.fn(),
  };
}

describe("PDFEditor signature save (metadata v3 round trip + PNG stamping)", () => {
  let sourceBytes: Uint8Array;

  beforeEach(async () => {
    sourceBytes = await buildSourceDocument();

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
    fakeDocRef.current = makeFakeDoc(page, sourceBytes);
    getDocumentMock.mockReset();
    getDocumentMock.mockImplementation(() => ({
      promise: Promise.resolve(fakeDocRef.current),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function mountAndSave(sign: boolean): Promise<Uint8Array> {
    const ref = React.createRef<PDFEditorRef>();
    const onSave = vi.fn();

    const { container, getByRole } = renderWithChakra(
      <PDFEditor
        ref={ref}
        src="fake://document.pdf"
        mode="edit"
        savedSignature={sign ? TINY_PNG : undefined}
        onSave={onSave}
      />
    );

    const signButton = await waitFor(() => {
      const el = container.querySelector<HTMLButtonElement>(
        'button[data-field-id="field_sig"]'
      );
      if (!el) throw new Error("signature field not yet mounted");
      return el;
    });

    if (sign) {
      fireEvent.click(signButton);
      const useSavedButton = await waitFor(() =>
        getByRole("button", { name: /use this signature/i })
      );
      fireEvent.click(useSavedButton);
    }

    await act(async () => {
      await ref.current!.save();
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    return onSave.mock.calls[0][0] as Uint8Array;
  }

  it("stamps the adopted PNG onto the page and never writes the data URL as form text", async () => {
    const signedBytes = await mountAndSave(true);
    const baselineBytes = await mountAndSave(false);

    // Signature fields are skipped entirely by the setText() loops -- the
    // underlying AcroForm text field must come back empty, never holding
    // the (multi-kilobyte) data URL as literal visible form text.
    const reloaded = await PDFDocument.load(signedBytes);
    const reloadedField = reloaded.getForm().getTextField("sig_field");
    expect(reloadedField.getText() || "").toBe("");

    // The image was actually embedded and drawn -- a real, if indirect,
    // signal since introspecting the content stream/XObject table directly
    // is unnecessarily brittle for a regression test.
    expect(signedBytes.length).toBeGreaterThan(baselineBytes.length + 50);
  });
});
