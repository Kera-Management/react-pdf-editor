import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { renderWithChakra } from "./testUtils";

import PDFEditor, { type PDFEditorRef } from "./PDFEditor";
import {
  createEditorMetadata,
  extractEditorMetadata,
  getParticipantCompletion,
  serializeEditorMetadata,
} from "./participantCompletion";

/**
 * Save -> reopen -> still signed.
 *
 * A drawn/adopted signature is stamped into the page content as an image;
 * the signature field's AcroForm text value stays empty by design. Before
 * `signedFields`, nothing in the saved PDF said the field was signed, so the
 * moment the editor reloaded the saved bytes (it does on every host save)
 * it asked for the signature again, and a host's headless
 * `getParticipantCompletion` check on the saved file (Kera's "Add lease")
 * reported the signature as the one missing required field. Same for a
 * server-rendered signature field (Ontario Standard Lease's
 * `kera_sig_landlord_1`) and an editor-created one: both are plain pdf-lib
 * text fields named in `signatureFields`.
 *
 * pdf.js is REAL here (legacy build, no worker) so field values are read
 * from the actual saved bytes; only page rendering is faked.
 */

const { getDocumentMock, pageRenderMock } = vi.hoisted(() => ({
  getDocumentMock: vi.fn(),
  pageRenderMock: vi.fn(),
}));

vi.mock("pdfjs-dist", () => ({
  AnnotationMode: { ENABLE_FORMS: 2 },
  GlobalWorkerOptions: { workerSrc: "" },
  RenderingCancelledException: class RenderingCancelledException extends Error {},
  version: "5.4.54",
  getDocument: (...args: unknown[]) => getDocumentMock(...args),
}));

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const MANAGER = "org-admin@kera.test";
const TENANT = "sam.tenant@kera.test";
const PARTICIPANTS = [
  { id: MANAGER, label: "Avery Admin" },
  { id: TENANT, label: "Sam Rivera" },
];

let currentBytes: Uint8Array;

/** A fake pdf.js document whose fields come from real pdf.js parsing. */
async function realDoc(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  const pages: unknown[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const v = (await doc.getPage(i)).getViewport({ scale: 1 });
    pages.push({
      pageNumber: i,
      destroyed: false,
      getViewport: vi.fn((opts?: { scale?: number }) => ({
        width: v.width * (opts?.scale ?? 1),
        height: v.height * (opts?.scale ?? 1),
      })),
      render: pageRenderMock,
    });
  }
  return {
    numPages: doc.numPages,
    getPage: vi.fn(async (n: number) => pages[n - 1]),
    getFieldObjects: () => doc.getFieldObjects(),
    // pdf.js's own buffer comes back from another realm under jsdom, which
    // pdf-lib rejects; hand back a local copy of the same bytes.
    getData: async () => Uint8Array.from(bytes),
    destroy: vi.fn(),
  };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement
  ) {
    return { ownerCanvasId: this.id, scale: vi.fn() } as unknown as CanvasRenderingContext2D;
  });
  pageRenderMock.mockReset();
  pageRenderMock.mockImplementation(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
  getDocumentMock.mockReset();
  getDocumentMock.mockImplementation((src: unknown) => {
    const data =
      src instanceof Uint8Array
        ? src
        : src instanceof ArrayBuffer
          ? new Uint8Array(src)
          : src && typeof src === "object" && "data" in src
            ? (src as { data: Uint8Array }).data
            : currentBytes;
    return { promise: realDoc(new Uint8Array(data)) };
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SIG = "kera_sig_landlord_1";
const DATE = "landlord_date";

/**
 * The shape renderOfficialLeasePdf writes (and a Prepare save writes for an
 * upload): pdf-lib text fields, a /TU display name, v3 metadata naming the
 * signature in signatureFields and both fields required for the manager.
 */
async function buildLeasePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  const sig = form.createTextField(SIG);
  sig.addToPage(page, { x: 50, y: 100, width: 200, height: 24, borderWidth: 0 });
  sig.acroField.dict.set(PDFName.of("TU"), PDFString.of("Signature 1"));
  form.createTextField(DATE).addToPage(page, { x: 300, y: 100, width: 100, height: 24 });
  form.createTextField("tenant_sig").addToPage(page, { x: 50, y: 50, width: 200, height: 24 });
  doc.setTitle(
    serializeEditorMetadata(
      createEditorMetadata({
        fieldAssignments: { [SIG]: [MANAGER], [DATE]: [MANAGER], tenant_sig: [TENANT] },
        requiredFields: [SIG, DATE, "tenant_sig"],
        signatureFields: [SIG, "tenant_sig"],
      })
    )
  );
  return doc.save();
}

const sigButton = (container: HTMLElement, name = SIG) =>
  container.querySelector<HTMLButtonElement>(`button[data-field-name="${name}"]`);

async function mount(bytes: Uint8Array, mode: "edit" | "build" = "edit") {
  currentBytes = bytes;
  const ref = React.createRef<PDFEditorRef>();
  const onSave = vi.fn();
  const onBuildSave = vi.fn();
  const view = renderWithChakra(
    <PDFEditor
      ref={ref}
      src="fake://document.pdf"
      mode={mode}
      allowedModes={["build", "edit", "view"]}
      activeParticipantId={MANAGER}
      participants={PARTICIPANTS}
      savedSignature={TINY_PNG}
      onSave={onSave}
      onBuildSave={onBuildSave}
    />
  );
  await waitFor(
    () => {
      const ready =
        mode === "build"
          ? view.container.querySelector("[data-build-field-id]")
          : sigButton(view.container);
      if (!ready) throw new Error("fields not mounted");
    },
    { timeout: 15000 }
  );
  const save = async () => {
    await act(async () => {
      await ref.current!.save();
    });
  };
  return { ...view, ref, onSave, onBuildSave, save };
}

async function signDateAndSave(bytes: Uint8Array): Promise<Uint8Array> {
  const { container, onSave, save } = await mount(bytes);
  fireEvent.click(sigButton(container)!);
  fireEvent.click(await screen.findByRole("button", { name: /use this signature/i }));
  await waitFor(() => expect(sigButton(container)?.dataset.complete).toBe("true"));
  fireEvent.change(container.querySelector<HTMLInputElement>(`input[name="${DATE}"]`)!, {
    target: { value: "2027/06/01" },
  });
  await save();
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  // The host still receives the adopted image for this save.
  expect(onSave.mock.calls[0][1][SIG]).toMatch(/^data:image\/png/);
  cleanup();
  return onSave.mock.calls[0][0] as Uint8Array;
}

describe("PDFEditor: a stamped signature stays signed after save", () => {
  it("records the stamped field in signedFields; headless completion is complete", async () => {
    const saved = await signDateAndSave(await buildLeasePdf());

    // The field itself still holds no text: the signature is page content.
    const lib = await PDFDocument.load(saved);
    expect(lib.getForm().getTextField(SIG).getText() ?? "").toBe("");
    expect((await extractEditorMetadata(saved)).signedFields).toEqual([SIG]);

    const completion = await getParticipantCompletion(Uint8Array.from(saved), MANAGER);
    expect(completion.remainingRequiredFields).toEqual([]);
    expect(completion.isComplete).toBe(true);
    // Another signer's unsigned signature is untouched.
    const tenant = await getParticipantCompletion(Uint8Array.from(saved), TENANT);
    expect(tenant.remainingRequiredFields).toEqual(["tenant_sig"]);
  }, 60000);

  it("reopening the saved bytes shows the signature as signed, not as a Sign prompt", async () => {
    const saved = await signDateAndSave(await buildLeasePdf());
    const { container, onSave, save } = await mount(saved);

    const button = sigButton(container)!;
    expect(button.dataset.complete).toBe("true");
    expect(button.dataset.stamped).toBe("true");
    expect(button.textContent).not.toMatch(/sign/i);
    // The tenant's signature is still theirs to sign.
    expect(sigButton(container, "tenant_sig")?.dataset.complete).toBe("false");

    // It can't be signed again (a second stamp would land on the first).
    fireEvent.click(button);
    expect(screen.queryByRole("button", { name: /use this signature/i })).toBeNull();

    // Saving again keeps it signed, and the host never sees the editor's
    // internal marker: the value is "" exactly as before.
    await save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][1][SIG]).toBe("");
    const resaved = onSave.mock.calls[0][0] as Uint8Array;
    expect((await extractEditorMetadata(resaved)).signedFields).toEqual([SIG]);
    const completion = await getParticipantCompletion(Uint8Array.from(resaved), MANAGER);
    expect(completion.isComplete).toBe(true);
  }, 60000);

  it("a Prepare save of a signed document keeps the field signed", async () => {
    const saved = await signDateAndSave(await buildLeasePdf());
    const { onBuildSave, save } = await mount(saved, "build");
    await save();
    await waitFor(() => expect(onBuildSave).toHaveBeenCalledTimes(1));
    const prepared = onBuildSave.mock.calls[0][0] as Uint8Array;
    expect((await extractEditorMetadata(prepared)).signedFields).toEqual([SIG]);
    const completion = await getParticipantCompletion(Uint8Array.from(prepared), MANAGER);
    expect(completion.isComplete).toBe(true);
  }, 60000);
});
