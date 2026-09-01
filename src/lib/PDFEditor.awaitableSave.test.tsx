import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { PDFDocument } from "pdf-lib";

import PDFEditor, { PDFEditorRef } from "./PDFEditor";

/**
 * Awaitable onSave contract (v2.10.2): a host returning a promise keeps the
 * header's "Saving" state up (spinner, disabled save button) until the
 * host's OWN persistence settles -- previously the spinner stopped the
 * moment bytes were handed over, so a multi-second upload+API save looked
 * like nothing was happening. A rejected host promise must clear the
 * spinner (never a stuck "Saving") while leaving the save unconsummated.
 *
 * Same mock shape as PDFEditor.signatureSave.test.tsx: real pdf-lib for the
 * source bytes, mocked pdfjs-dist for the render side.
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

const FIELD_RECT = { x: 10, y: 200, width: 150, height: 30 };

async function buildSourceDocument(): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.create();
  const page = srcDoc.addPage([300, 300]);
  const form = srcDoc.getForm();
  const field = form.createTextField("plain_field");
  field.addToPage(page, { ...FIELD_RECT, borderWidth: 0 });
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
      plain_field: [
        {
          editable: true,
          hidden: false,
          id: "field_plain",
          multiline: false,
          name: "plain_field",
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

describe("PDFEditor awaitable onSave", () => {
  beforeEach(async () => {
    const sourceBytes = await buildSourceDocument();

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

  async function mountEditor(onSave: (bytes: Uint8Array) => void | Promise<void>) {
    const ref = React.createRef<PDFEditorRef>();
    const utils = render(
      <PDFEditor
        ref={ref}
        src="fake://document.pdf"
        mode="edit"
        onSave={onSave}
      />
    );
    await waitFor(() => {
      const el = utils.container.querySelector('[data-field-id="field_plain"]');
      if (!el) throw new Error("field not yet mounted");
    });
    return { ref, ...utils };
  }

  it("keeps the Saving state up until a pending host promise resolves", async () => {
    let resolveHostSave!: () => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveHostSave = resolve;
        })
    );
    const { ref, getByText, queryByText } = await mountEditor(onSave);

    let savePromise!: Promise<void>;
    act(() => {
      savePromise = ref.current!.save();
    });

    // Host promise is pending: the header must say so.
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(getByText("Saving")).toBeTruthy();
    });

    await act(async () => {
      resolveHostSave();
      await savePromise;
    });

    await waitFor(() => {
      expect(queryByText("Saving")).toBeNull();
    });
  });

  it("clears the Saving state when the host promise rejects", async () => {
    let rejectHostSave!: (err: Error) => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectHostSave = reject;
        })
    );
    const { ref, getByText, queryByText } = await mountEditor(onSave);

    let savePromise!: Promise<void>;
    act(() => {
      savePromise = ref.current!.save().catch(() => {
        // The rejection propagates to the caller (the host initiated the
        // save and owns surfacing the failure); the editor's only job is
        // not to strand the spinner.
      }) as Promise<void>;
    });

    await waitFor(() => {
      expect(getByText("Saving")).toBeTruthy();
    });

    await act(async () => {
      rejectHostSave(new Error("upload failed"));
      await savePromise;
    });

    await waitFor(() => {
      expect(queryByText("Saving")).toBeNull();
    });
  });

  it("void-returning onSave behaves exactly as before", async () => {
    const onSave = vi.fn();
    const { ref, queryByText } = await mountEditor(onSave);

    await act(async () => {
      await ref.current!.save();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(queryByText("Saving")).toBeNull();
  });
});
