import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import PDFEditor from "./PDFEditor";

/**
 * Regression coverage for v2.10.1: a field with NO entry in the resolved
 * assignments mapping used to default to "allow" unconditionally -- fine
 * for a host that doesn't use per-field assignment at all, but a trap once
 * ANY mapping exists: a lease with 120 AcroForm fields and only 6 explicit
 * assignments let any signer fill the other 114, fields the server's
 * write-allowlist was always going to reject anyway. The fix: absence of
 * an entry means "not yours" once the mapping is non-empty, and stays
 * "unrestricted" only when the mapping is empty altogether.
 */

const { getDocumentMock, fakeDocRef, pageRenderMock, metadataRef } = vi.hoisted(() => ({
  getDocumentMock: vi.fn(),
  fakeDocRef: { current: null as unknown },
  pageRenderMock: vi.fn(),
  // Mutable so each test controls the EMBEDDED fallback independently of
  // whatever `fieldAssignments` host prop it passes in.
  metadataRef: {
    current: {
      version: 3 as const,
      fieldAssignments: {} as Record<string, string[]>,
      requiredFields: [] as string[],
      signatureFields: [] as string[],
    },
  },
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
    extractEditorMetadata: vi.fn(async () => metadataRef.current),
  };
});

const MAPPED_TO_ME_FIELD = {
  editable: true,
  hidden: false,
  id: "field_mapped_me",
  multiline: false,
  name: "mapped_to_me",
  page: 0,
  password: false,
  rect: [10, 10, 110, 30],
  type: "text" as const,
  value: "",
  defaultValue: "",
};

const MAPPED_TO_OTHER_FIELD = {
  editable: true,
  hidden: false,
  id: "field_mapped_other",
  multiline: false,
  name: "mapped_to_other",
  page: 0,
  password: false,
  rect: [10, 50, 110, 70],
  type: "text" as const,
  value: "",
  defaultValue: "",
};

// Never appears as a key in either the host's fieldAssignments prop or the
// embedded metadata -- this is the ~114-unmapped-fields case from the bug
// report, scaled down to one field.
const UNMAPPED_FIELD = {
  editable: true,
  hidden: false,
  id: "field_unmapped",
  multiline: false,
  name: "unmapped_field",
  page: 0,
  password: false,
  rect: [10, 90, 110, 110],
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
      mapped_to_me: [MAPPED_TO_ME_FIELD],
      mapped_to_other: [MAPPED_TO_OTHER_FIELD],
      unmapped_field: [UNMAPPED_FIELD],
    })),
    getData: vi.fn(async () => new Uint8Array()),
    destroy: vi.fn(),
  };
}

describe("PDFEditor: unmapped-field gate matrix", () => {
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

    // Default: no embedded fallback. Each test overrides if it needs the
    // resolved mapping to come from metadata instead of the host prop.
    metadataRef.current = {
      version: 3,
      fieldAssignments: {},
      requiredFields: [],
      signatureFields: [],
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const nonEmptyAssignments = {
    mapped_to_me: ["assignee-a"],
    mapped_to_other: ["assignee-b"],
  };

  it("(a) a field mapped to the active participant is editable", async () => {
    const { container } = render(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        activeParticipantId="assignee-a"
        fieldAssignments={nonEmptyAssignments}
      />
    );

    const input = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_mapped_me"]'
      );
      if (!el) throw new Error("not yet mounted");
      return el;
    });
    expect(input.disabled).toBe(false);
    expect(input.getAttribute("title")).toBeNull();
  });

  it("(b) a field mapped to someone else is locked with an assignee label", async () => {
    const { container } = render(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        activeParticipantId="assignee-a"
        participants={[{ id: "assignee-b", label: "Jane Landlord" }]}
        fieldAssignments={nonEmptyAssignments}
      />
    );

    const input = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_mapped_other"]'
      );
      if (!el) throw new Error("not yet mounted");
      return el;
    });
    await waitFor(() => {
      expect(input.disabled).toBe(true);
      expect(input.getAttribute("title")).toBe("Assigned to Jane Landlord");
    });
  });

  it("(c) an unmapped field is locked as 'Not assigned to a signer' once a non-empty mapping exists", async () => {
    const { container } = render(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        activeParticipantId="assignee-a"
        fieldAssignments={nonEmptyAssignments}
      />
    );

    const input = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_unmapped"]'
      );
      if (!el) throw new Error("not yet mounted");
      return el;
    });
    await waitFor(() => {
      expect(input.disabled).toBe(true);
      expect(input.getAttribute("title")).toBe("Not assigned to a signer");
    });
  });

  it("(d) with a wholly empty mapping, an unmapped field stays editable (plain fill & sign unaffected)", async () => {
    // No fieldAssignments prop AND empty embedded metadata (the beforeEach
    // default) -- the resolved mapping is empty altogether.
    const { container } = render(
      <PDFEditor src="fake://document.pdf" mode="edit" activeParticipantId="anyone" />
    );

    const input = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_unmapped"]'
      );
      if (!el) throw new Error("not yet mounted");
      return el;
    });
    expect(input.disabled).toBe(false);
    expect(input.getAttribute("title")).toBeNull();
  });

  it("(e) unmappedVisibility='hidden' hides rather than disables the unmapped field", async () => {
    const { container } = render(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        activeParticipantId="assignee-a"
        unassignedVisibility="hidden"
        fieldAssignments={nonEmptyAssignments}
      />
    );

    const input = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_unmapped"]'
      );
      if (!el) throw new Error("not yet mounted");
      return el;
    });
    await waitFor(() => {
      expect(input.style.display).toBe("none");
    });
  });

  it("resolves the mapping from embedded metadata when the host passes no fieldAssignments prop", async () => {
    metadataRef.current = {
      version: 3,
      fieldAssignments: nonEmptyAssignments,
      requiredFields: [],
      signatureFields: [],
    };

    const { container } = render(
      <PDFEditor src="fake://document.pdf" mode="edit" activeParticipantId="assignee-a" />
    );

    const unmapped = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>(
        'input[data-field-id="field_unmapped"]'
      );
      if (!el) throw new Error("not yet mounted");
      return el;
    });
    await waitFor(() => {
      expect(unmapped.disabled).toBe(true);
      expect(unmapped.getAttribute("title")).toBe("Not assigned to a signer");
    });

    const mine = container.querySelector<HTMLInputElement>(
      'input[data-field-id="field_mapped_me"]'
    )!;
    expect(mine.disabled).toBe(false);
  });
});
