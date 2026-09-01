import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { PDFDocument } from "pdf-lib";

import PDFEditor, { PDFEditorRef } from "./PDFEditor";
import { createEditorMetadata, serializeEditorMetadata } from "./participantCompletion";

/**
 * Regression tests for the `signatureFieldNames` prop: a host-declared
 * supplement to the PDF's own title metadata for documents the metadata
 * can't (or doesn't) identify signature fields on -- inspection reports
 * (no `signatureFields` key) and government notice forms (no editor
 * metadata at all). See PDFEditor.tsx's `getEffectiveSignatureFieldNames`.
 *
 * Mirrors PDFEditor.signatureSave.test.tsx's approach: real pdf-lib builds
 * the source document and inspects the saved output; only pdfjs-dist (the
 * reading side) is mocked.
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

// A well-known minimal valid 1x1 PNG -- avoids driving real canvas drawing
// (jsdom has no 2D canvas backend); the saved-signature one-click "Use this
// signature" path needs no canvas interaction at all.
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

interface FieldSpec {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const FIELD_A: FieldSpec = { name: "field_a", x: 10, y: 200, width: 150, height: 30 };
const FIELD_B: FieldSpec = { name: "field_b", x: 10, y: 100, width: 150, height: 30 };

/**
 * Builds a real, minimal PDF with one plain PDFTextField per entry in
 * `fields`. `metadataSignatureFields` is undefined for "no editor metadata
 * at all" (title left unset, matching a government notice form the host
 * prefilled itself) or an array for "v3 metadata declaring these names"
 * (matching an inspection report or a prior Prepare-mode save).
 */
async function buildSourceDocument(
  fields: FieldSpec[],
  metadataSignatureFields?: string[]
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.create();
  const page = srcDoc.addPage([300, 300]);
  const form = srcDoc.getForm();
  fields.forEach((f) => {
    const field = form.createTextField(f.name);
    field.addToPage(page, { x: f.x, y: f.y, width: f.width, height: f.height, borderWidth: 0 });
  });
  if (metadataSignatureFields !== undefined) {
    srcDoc.setTitle(
      serializeEditorMetadata(
        createEditorMetadata({
          fieldAssignments: {},
          requiredFields: [],
          signatureFields: metadataSignatureFields,
        })
      )
    );
  }
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

function makeFakeDoc(
  page: ReturnType<typeof makeFakePage>,
  bytes: Uint8Array,
  fields: FieldSpec[]
) {
  const fieldObjects = Object.fromEntries(
    fields.map((f) => [
      f.name,
      [
        {
          editable: true,
          hidden: false,
          id: `field_${f.name}`,
          multiline: false,
          name: f.name,
          page: 0,
          password: false,
          rect: [f.x, f.y, f.x + f.width, f.y + f.height],
          type: "text" as const,
          value: "",
          defaultValue: "",
        },
      ],
    ])
  );

  return {
    numPages: 1,
    getPage: vi.fn(async () => page),
    getFieldObjects: vi.fn(async () => fieldObjects),
    getData: vi.fn(async () => bytes),
    destroy: vi.fn(),
  };
}

describe("PDFEditor signatureFieldNames prop", () => {
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

  function mockDocument(bytes: Uint8Array, fields: FieldSpec[]) {
    const page = makeFakePage();
    fakeDocRef.current = makeFakeDoc(page, bytes, fields);
    getDocumentMock.mockImplementation(() => ({
      promise: Promise.resolve(fakeDocRef.current),
    }));
  }

  /** Renders PDFEditor, waits for the document to mount, and returns both
   * the ref (for triggering save) and the container (for querying DOM). */
  async function mountEditor(props: {
    signatureFieldNames?: string[];
    sign?: string[]; // field ids to sign via the "use saved signature" flow
  }) {
    const ref = React.createRef<PDFEditorRef>();
    const onSave = vi.fn();

    const { container, getByRole } = render(
      <PDFEditor
        ref={ref}
        src="fake://document.pdf"
        mode="edit"
        savedSignature={TINY_PNG}
        onSave={onSave}
        signatureFieldNames={props.signatureFieldNames}
      />
    );

    // Wait for at least one field overlay to mount.
    await waitFor(() => {
      if (!container.querySelector("[data-field-id]")) {
        throw new Error("fields not yet mounted");
      }
    });

    for (const fieldId of props.sign ?? []) {
      const signButton = container.querySelector<HTMLButtonElement>(
        `button[data-field-id="${fieldId}"]`
      );
      if (!signButton) throw new Error(`expected signature button for ${fieldId}`);
      fireEvent.click(signButton);
      const useSavedButton = await waitFor(() =>
        getByRole("button", { name: /use this signature/i })
      );
      fireEvent.click(useSavedButton);
    }

    return { ref, container, onSave };
  }

  it("no metadata + prop declares a field: renders a signature control (not a text input), round-trips a drawn signature, and stamps the image on save", async () => {
    const bytes = await buildSourceDocument([FIELD_A], undefined);
    mockDocument(bytes, [FIELD_A]);

    const { container, ref, onSave } = await mountEditor({
      signatureFieldNames: ["field_a"],
      sign: ["field_field_a"],
    });

    // Rendered as the click-to-sign control, not a plain text input.
    expect(
      container.querySelector('button[data-field-id="field_field_a"]')
    ).not.toBeNull();
    expect(
      container.querySelector('input[data-field-id="field_field_a"]')
    ).toBeNull();

    // The adopted signature round-tripped into the button as a preview image.
    expect(
      container.querySelector(
        'button[data-field-id="field_field_a"] img[alt="Your signature"]'
      )
    ).not.toBeNull();

    await act(async () => {
      await ref.current!.save();
    });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const savedBytes = onSave.mock.calls[0][0] as Uint8Array;
    const reloaded = await PDFDocument.load(savedBytes);
    // The signature value is never written into the AcroForm as text --
    // it's stamped as an image instead (see onSaveAs).
    expect(reloaded.getForm().getTextField("field_a").getText() || "").toBe("");

    // A baseline (unsigned) save is strictly smaller: the embedded PNG
    // XObject is real, added weight, not a false positive from field
    // structure alone.
    const baselineBytes = await buildSourceDocument([FIELD_A], undefined);
    mockDocument(baselineBytes, [FIELD_A]);
    const { ref: baselineRef, onSave: baselineOnSave } = await mountEditor({
      signatureFieldNames: ["field_a"],
    });
    await act(async () => {
      await baselineRef.current!.save();
    });
    await waitFor(() => expect(baselineOnSave).toHaveBeenCalledTimes(1));
    const baselineSaved = baselineOnSave.mock.calls[0][0] as Uint8Array;
    expect(savedBytes.length).toBeGreaterThan(baselineSaved.length + 50);
  });

  it("document WITH v3 metadata and no prop is unchanged: the metadata-declared field still renders as a signature control", async () => {
    const bytes = await buildSourceDocument([FIELD_A], ["field_a"]);
    mockDocument(bytes, [FIELD_A]);

    const { container } = await mountEditor({});

    expect(
      container.querySelector('button[data-field-id="field_field_a"]')
    ).not.toBeNull();
    expect(
      container.querySelector('input[data-field-id="field_field_a"]')
    ).toBeNull();
  });

  it("union case: a metadata-declared field and a prop-declared field both render as signature controls", async () => {
    const bytes = await buildSourceDocument([FIELD_A, FIELD_B], ["field_a"]);
    mockDocument(bytes, [FIELD_A, FIELD_B]);

    const { container, ref, onSave } = await mountEditor({
      signatureFieldNames: ["field_b"],
      sign: ["field_field_a", "field_field_b"],
    });

    expect(
      container.querySelector('button[data-field-id="field_field_a"]')
    ).not.toBeNull();
    expect(
      container.querySelector('button[data-field-id="field_field_b"]')
    ).not.toBeNull();
    expect(container.querySelectorAll("input[data-field-id]")).toHaveLength(0);

    await act(async () => {
      await ref.current!.save();
    });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const savedBytes = onSave.mock.calls[0][0] as Uint8Array;
    const reloaded = await PDFDocument.load(savedBytes);
    // Both fields skip the setText() path -- neither carries the data URL
    // as literal AcroForm text.
    expect(reloaded.getForm().getTextField("field_a").getText() || "").toBe("");
    expect(reloaded.getForm().getTextField("field_b").getText() || "").toBe("");
  });
});
