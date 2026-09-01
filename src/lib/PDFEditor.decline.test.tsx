import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";

import PDFEditor from "./PDFEditor";

/**
 * Coverage for `onDecline`/`declineLabel`: a signer's way out of signing.
 * The header renders a quiet secondary button (edit mode only, only when a
 * handler is provided) that opens a built-in confirm; confirming awaits the
 * handler's promise with the Decline button busy, then closes either way.
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

describe("PDFEditor decline to sign", () => {
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

  it("renders no decline button when onDecline is not provided", async () => {
    const { queryByRole, getByRole } = render(
      <PDFEditor src="fake://document.pdf" mode="edit" />
    );

    // Wait for the document to finish loading before asserting absence.
    // `allowedModes` isn't passed here, so with only "edit" allowed the
    // header renders a plain mode badge (no button) -- the Save button is
    // a stable readiness signal that doesn't depend on the mode selector.
    await waitFor(() => getByRole("button", { name: "Save" }));

    expect(
      queryByRole("button", { name: "I can't sign this" })
    ).not.toBeInTheDocument();
  });

  it("confirming decline calls the handler exactly once and closes the dialog", async () => {
    const onDecline = vi.fn().mockResolvedValue(undefined);
    const { getByRole, queryByRole } = render(
      <PDFEditor src="fake://document.pdf" mode="edit" onDecline={onDecline} />
    );

    const declineButton = await waitFor(() =>
      getByRole("button", { name: "I can't sign this" })
    );
    fireEvent.click(declineButton);

    expect(
      getByRole("heading", { name: "Decline to sign?" })
    ).toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: "Decline" }));

    await waitFor(() => expect(onDecline).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        queryByRole("heading", { name: "Decline to sign?" })
      ).not.toBeInTheDocument()
    );

    // A second confirm cycle must not call it again on its own.
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it("cancel closes the dialog without calling the handler", async () => {
    const onDecline = vi.fn().mockResolvedValue(undefined);
    const { getByRole, queryByRole } = render(
      <PDFEditor src="fake://document.pdf" mode="edit" onDecline={onDecline} />
    );

    const declineButton = await waitFor(() =>
      getByRole("button", { name: "I can't sign this" })
    );
    fireEvent.click(declineButton);
    fireEvent.click(getByRole("button", { name: "Cancel" }));

    expect(
      queryByRole("heading", { name: "Decline to sign?" })
    ).not.toBeInTheDocument();
    expect(onDecline).not.toHaveBeenCalled();
  });

  it("renders a custom declineLabel", async () => {
    const { getByRole } = render(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        onDecline={vi.fn()}
        declineLabel="Not my document"
      />
    );

    await waitFor(() =>
      expect(
        getByRole("button", { name: "Not my document" })
      ).toBeInTheDocument()
    );
  });

  it("closes the dialog even when the handler rejects", async () => {
    const onDecline = vi.fn().mockRejectedValue(new Error("network error"));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { getByRole, queryByRole } = render(
      <PDFEditor src="fake://document.pdf" mode="edit" onDecline={onDecline} />
    );

    const declineButton = await waitFor(() =>
      getByRole("button", { name: "I can't sign this" })
    );
    fireEvent.click(declineButton);
    fireEvent.click(getByRole("button", { name: "Decline" }));

    await waitFor(() => expect(onDecline).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        queryByRole("heading", { name: "Decline to sign?" })
      ).not.toBeInTheDocument()
    );
    consoleErrorSpy.mockRestore();
  });
});

describe("PDFEditor decline button visibility", () => {
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

  it("hides the decline button outside edit mode, even with a handler", async () => {
    const { queryByRole, getByRole } = render(
      <PDFEditor
        src="fake://document.pdf"
        mode="view"
        allowedModes={["view", "edit"]}
        onDecline={vi.fn()}
      />
    );

    await waitFor(() => getByRole("button", { name: /view/i }));

    expect(
      queryByRole("button", { name: "I can't sign this" })
    ).not.toBeInTheDocument();
  });
});
