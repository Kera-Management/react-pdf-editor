import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithChakra } from "./testUtils";

import PDFEditor from "./PDFEditor";

/**
 * Coverage for `saveLabel`: HeaderBar's Save button used to hardcode "Save"
 * in both its visible label and aria-label. A host that wants "Submit
 * signature" for guest/in-app signing (Prepare mode keeps the "Save"
 * default) now drives that via this prop.
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

describe("PDFEditor saveLabel", () => {
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

  it("defaults to 'Save' when no saveLabel is given", async () => {
    const { getByRole } = renderWithChakra(
      <PDFEditor src="fake://document.pdf" mode="edit" />
    );

    const button = await waitFor(() => getByRole("button", { name: "Save" }));
    expect(button).toBeInTheDocument();
  });

  it("renders a custom saveLabel in the button text and aria-label", async () => {
    const { getByRole } = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        saveLabel="Submit signature"
      />
    );

    const button = await waitFor(() =>
      getByRole("button", { name: "Submit signature" })
    );
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Submit signature");
  });
});
