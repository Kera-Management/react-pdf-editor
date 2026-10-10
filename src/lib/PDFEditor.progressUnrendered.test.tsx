import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import { renderWithChakra } from "./testUtils";

import PDFEditor from "./PDFEditor";

/**
 * Regression coverage for the production bug this fix targets: a signer
 * opened a PDF where one of their assigned fields was locked read-only in
 * the AcroForm (a server bug), so the editor's pre-render filter
 * (rawField.editable/hidden) dropped it before it ever became DOM -- yet
 * ProgressPanel still reported it as "remaining" because its counter and
 * the interactivity gate resolved `fieldAssignments` differently (gate:
 * host prop wins; counter: embedded metadata won). This proves both are
 * unified and that an unrenderable field never blocks Finish.
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

// Embedded metadata deliberately conflicts with the host's `fieldAssignments`
// prop below (assigns tenant_name to a DIFFERENT id) -- proving the host
// prop wins is exactly what the resolver unification in this fix is for.
vi.mock("./participantCompletion", async () => {
  const actual = await vi.importActual<
    typeof import("./participantCompletion")
  >("./participantCompletion");
  return {
    ...actual,
    extractEditorMetadata: vi.fn(async () => ({
      version: 3 as const,
      fieldAssignments: {
        tenant_name: ["someone-else"],
        tenant_signature: ["someone-else"],
      },
      requiredFields: [],
      signatureFields: [],
    })),
  };
});

const TENANT_NAME_FIELD = {
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

// Locked read-only in the AcroForm (the server bug this fix accounts for):
// editable is false, so this never survives the pre-render filter at all.
const LOCKED_SIGNATURE_FIELD = {
  editable: false,
  hidden: false,
  id: "field_locked",
  multiline: false,
  name: "tenant_signature",
  page: 0,
  password: false,
  rect: [10, 50, 160, 80],
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
    getFieldObjects: vi.fn(async () => ({
      tenant_name: [TENANT_NAME_FIELD],
      tenant_signature: [LOCKED_SIGNATURE_FIELD],
    })),
    getData: vi.fn(async () => new Uint8Array()),
    destroy: vi.fn(),
  };
}

describe("PDFEditor: assigned-but-unrendered field never blocks a signer", () => {
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

  it("excludes the locked field from the count, warns about it, and unblocks Finish once the visible field is done", async () => {
    const { container } = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        activeParticipantId="assignee-a"
        fieldAssignments={{
          tenant_name: ["assignee-a"],
          tenant_signature: ["assignee-a"],
        }}
      />
    );

    // The locked field never gets a DOM node at all -- the pre-render
    // filter dropped it before rendering.
    await waitFor(() => {
      expect(
        container.querySelector('[data-field-id="field_text"]')
      ).not.toBeNull();
    });
    expect(
      container.querySelector('[data-field-id="field_locked"]')
    ).toBeNull();

    // The counter agrees with the gate: only the one renderable field
    // counts, so filling it alone completes progress.
    await waitFor(() => {
      expect(container.textContent).toContain("0 of 1");
    });

    // The anomaly is surfaced, not silently dropped.
    expect(container.textContent).toContain("couldn't be shown");

    const textInput = container.querySelector<HTMLInputElement>(
      'input[data-field-id="field_text"]'
    )!;
    fireEvent.change(textInput, { target: { value: "Bruce Wayne" } });

    // Completing the one RENDERED field is enough to unlock Finish, despite
    // the still-unrenderable tenant_signature.
    await waitFor(() => {
      expect(container.textContent).toContain("1 of 1");
      expect(
        container.querySelector("button[aria-label], button")
      ).not.toBeNull();
    });
    await waitFor(() => {
      expect(container.textContent).toContain("Finish and save");
    });
    // Still visible: the signer isn't left to wonder what happened to it.
    expect(container.textContent).toContain("couldn't be shown");
  });
});
