import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import { renderWithChakra } from "./testUtils";

import PDFEditor from "./PDFEditor";

/**
 * Coverage for `initialFieldValues`: a host-supplied map of FIELD NAME ->
 * value, seeded into the editor once a document's field ids are known (see
 * the seed effect in PDFEditor.tsx and `useFieldValues.seed`). The primary
 * use case is a later signer seeing an earlier signer's already-submitted
 * values -- including on fields NOT assigned to them, which already render
 * (just disabled) per the existing gating behaviour this mirrors from
 * PDFEditor.gating.test.tsx.
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
      },
      requiredFields: [],
      signatureFields: [],
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
    getFieldObjects: vi.fn(async () => ({ tenant_name: [TEXT_FIELD] })),
    getData: vi.fn(async () => new Uint8Array()),
    destroy: vi.fn(),
  };
}

describe("PDFEditor initialFieldValues seeding", () => {
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

  it("seeds a value into an unassigned field, which renders readonly (disabled) but visible", async () => {
    const { container } = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        activeParticipantId="outsider"
        unassignedVisibility="readonly"
        initialFieldValues={{ tenant_name: "Earlier Signer" }}
      />
    );

    const input = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_text"]'
      );
      if (!el) throw new Error("field input not yet mounted");
      return el;
    });

    await waitFor(() => {
      expect(input.value).toBe("Earlier Signer");
      expect(input.hasAttribute("disabled")).toBe(true);
    });
  });

  it("seeds a value into an assigned (editable) field", async () => {
    const { container } = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        activeParticipantId="assignee-a"
        initialFieldValues={{ tenant_name: "Earlier Signer" }}
      />
    );

    const input = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_text"]'
      );
      if (!el) throw new Error("field input not yet mounted");
      return el;
    });

    await waitFor(() => {
      expect(input.value).toBe("Earlier Signer");
      expect(input.hasAttribute("disabled")).toBe(false);
    });
  });

  it("typing after the seed, then a prop update with a new value, does not clobber the live edit", async () => {
    const { container, rerender } = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        activeParticipantId="assignee-a"
        initialFieldValues={{ tenant_name: "Seed 1" }}
      />
    );

    const input = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_text"]'
      );
      if (!el) throw new Error("field input not yet mounted");
      return el;
    });
    await waitFor(() => expect(input.value).toBe("Seed 1"));

    fireEvent.change(input, { target: { value: "Typed by user" } });
    expect(input.value).toBe("Typed by user");

    // Same document, no reload -- a fresh object reference for
    // initialFieldValues must not re-seed and stomp the live edit.
    rerender(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        activeParticipantId="assignee-a"
        initialFieldValues={{ tenant_name: "Seed 2" }}
      />
    );

    expect(input.value).toBe("Typed by user");
  });

  it("reseeds when a new document loads", async () => {
    const { container, rerender } = renderWithChakra(
      <PDFEditor
        src="fake://document-a.pdf"
        mode="edit"
        activeParticipantId="assignee-a"
        initialFieldValues={{ tenant_name: "Seed 1" }}
      />
    );

    const input = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_text"]'
      );
      if (!el) throw new Error("field input not yet mounted");
      return el;
    });
    await waitFor(() => expect(input.value).toBe("Seed 1"));

    // A genuinely new `src` supersedes the loaded document (see PDFEditor's
    // lastSrcRef comment) and reloads -- the load-boundary seed effect must
    // fire again against the fresh prop.
    rerender(
      <PDFEditor
        src="fake://document-b.pdf"
        mode="edit"
        activeParticipantId="assignee-a"
        initialFieldValues={{ tenant_name: "Seed 2" }}
      />
    );

    await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_text"]'
      );
      expect(el?.value).toBe("Seed 2");
    });
  });
});
