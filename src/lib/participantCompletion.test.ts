// @vitest-environment node
//
// Ported from the dead `test/participantCompletion.test.mjs`. That file
// reimplemented pdfjs/pdf-lib worker bootstrapping by hand outside the
// vitest suite, was never wired into `yarn test`, and had drifted: 2 of
// its 6 subtests asserted behaviour this module no longer has (the
// "no explicit requiredFields" fallback below postdates them). This file
// imports the real module and keeps the ported cases' *intent* --
// wrong assertions are corrected to match the module's actual,
// intentional behaviour rather than carried over verbatim.
//
// `@vitest-environment node` (not the suite's default jsdom): pdfjs-dist's
// worker handshake round-trips a PDF `ArrayBuffer` through a structured
// clone under the hood, and under jsdom that clone came back corrupted
// (`getData()` producing a non-buffer). Plain Node has no such issue --
// this module is pure PDF/Node logic with no DOM dependency anyway.
import { beforeAll, describe, expect, it } from "vitest";

// pdf.js's canvas backend reads `DOMMatrix` at module-evaluation time (even
// for headless field-object/metadata reads that never touch a canvas), and
// plain Node has no such global. Minimal stand-in, same shape used by the
// dead .mjs this file replaces.
globalThis.DOMMatrix ??= class DOMMatrix {
  multiplySelf() {
    return this;
  }
  preMultiplySelf() {
    return this;
  }
  translateSelf() {
    return this;
  }
  scaleSelf() {
    return this;
  }
  rotateSelf() {
    return this;
  }
  invertSelf() {
    return this;
  }
} as unknown as typeof DOMMatrix;

// pdf.js's worker message handler expects `Promise.withResolvers`, added to
// the lib types in ES2024; this project's tsconfig targets ES2020, so the
// method is declared here rather than widening the shared lib target.
declare global {
  interface PromiseConstructor {
    withResolvers?<T>(): {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  }
}

Promise.withResolvers ??= function withResolvers<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// Imported dynamically, after the polyfills above are in place: a static
// top-level `import` would be hoisted ahead of them, and pdfjs-dist's
// DOMMatrix check runs at import time.
let participantCompletion: typeof import("./participantCompletion");
let PDFDocument: typeof import("pdf-lib").PDFDocument;

beforeAll(async () => {
  participantCompletion = await import("./participantCompletion");
  ({ PDFDocument } = await import("pdf-lib"));
});

const createLeasePdf = async ({
  title,
  landlordName = "Jordan Stone",
  tenantName = "",
  landlordChecked = true,
  tenantChecked = false,
}: {
  title: string;
  landlordName?: string;
  tenantName?: string;
  landlordChecked?: boolean;
  tenantChecked?: boolean;
}) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  const form = pdfDoc.getForm();

  const landlordField = form.createTextField("landlord_name");
  landlordField.addToPage(page, { x: 40, y: 700, width: 180, height: 24 });
  landlordField.setText(landlordName);

  const tenantField = form.createTextField("tenant_name");
  tenantField.addToPage(page, { x: 40, y: 650, width: 180, height: 24 });
  tenantField.setText(tenantName);

  const landlordCheckbox = form.createCheckBox("landlord_ack");
  landlordCheckbox.addToPage(page, { x: 40, y: 620, width: 16, height: 16 });
  if (landlordChecked) {
    landlordCheckbox.check();
  } else {
    landlordCheckbox.uncheck();
  }

  const tenantCheckbox = form.createCheckBox("tenant_ack");
  tenantCheckbox.addToPage(page, { x: 40, y: 600, width: 16, height: 16 });
  if (tenantChecked) {
    tenantCheckbox.check();
  } else {
    tenantCheckbox.uncheck();
  }

  pdfDoc.setTitle(title);
  return pdfDoc.save();
};

// Each read transfers the underlying `ArrayBuffer` across pdf.js's fake
// worker port, detaching it -- reusing the same bytes across two reads
// (e.g. one per participant) throws "Unable to deserialize cloned data" on
// the second. The dead .mjs already worked around this; ported as-is.
const clonePdfBytes = (pdfBytes: Uint8Array) => Uint8Array.from(pdfBytes);

describe("metadata v2/v3 parsing", () => {
  it("creates v3 metadata with signatureFields, defaulting to []", () => {
    const metadata = participantCompletion.createEditorMetadata({
      fieldAssignments: { tenant_name: ["tenant1"] },
      requiredFields: ["tenant_name"],
    });

    expect(metadata).toEqual({
      version: 3,
      fieldAssignments: { tenant_name: ["tenant1"] },
      requiredFields: ["tenant_name"],
      signatureFields: [],
    });
  });

  it("round-trips signatureFields through serialize/parse", () => {
    const metadata = participantCompletion.createEditorMetadata({
      fieldAssignments: { signature: ["tenant1"] },
      requiredFields: ["signature"],
      signatureFields: ["signature"],
    });

    const parsed = participantCompletion.parseEditorMetadataValue(
      participantCompletion.serializeEditorMetadata(metadata)
    );

    expect(parsed).toEqual(metadata);
  });

  it("parses a v2 payload (no signatureFields key) with signatureFields defaulting to [], version preserved", () => {
    const v2Payload = `REACT_PDF_EDITOR_METADATA:${JSON.stringify({
      version: 2,
      fieldAssignments: { tenant_name: ["tenant1"] },
      requiredFields: ["tenant_name"],
    })}`;

    expect(participantCompletion.parseEditorMetadataValue(v2Payload)).toEqual({
      version: 2,
      fieldAssignments: { tenant_name: ["tenant1"] },
      requiredFields: ["tenant_name"],
      signatureFields: [],
    });
  });

  it("parses the legacy assignments-only prefix with signatureFields: [] and version 2", () => {
    const legacyPayload = `REACT_PDF_EDITOR_ASSIGNMENTS:${JSON.stringify({
      tenant_name: ["tenant1"],
    })}`;

    expect(participantCompletion.parseEditorMetadataValue(legacyPayload)).toEqual({
      version: 2,
      fieldAssignments: { tenant_name: ["tenant1"] },
      requiredFields: [],
      signatureFields: [],
    });
  });

  it("falls back to empty v3 metadata for missing or unparsable input", () => {
    const empty = {
      version: 3,
      fieldAssignments: {},
      requiredFields: [],
      signatureFields: [],
    };

    expect(participantCompletion.parseEditorMetadataValue(undefined)).toEqual(empty);
    expect(participantCompletion.parseEditorMetadataValue("garbage")).toEqual(empty);
    expect(
      participantCompletion.parseEditorMetadataValue("REACT_PDF_EDITOR_METADATA:{not json")
    ).toEqual(empty);
  });
});

describe("getParticipantCompletion (ported from the dead .mjs)", () => {
  it("reads metadata and computes participant completion per assignee", async () => {
    const pdfBytes = await createLeasePdf({
      title: participantCompletion.serializeEditorMetadata(
        participantCompletion.createEditorMetadata({
          fieldAssignments: {
            tenant_name: ["tenant1"],
            tenant_ack: ["tenant1"],
          },
          requiredFields: ["tenant_name", "tenant_ack"],
        })
      ),
    });

    const landlordCompletion = await participantCompletion.getParticipantCompletion(
      clonePdfBytes(pdfBytes),
      "landlord"
    );
    const tenantCompletion = await participantCompletion.getParticipantCompletion(
      clonePdfBytes(pdfBytes),
      "tenant1"
    );

    expect(landlordCompletion).toEqual({
      requiredAssignedCount: 0,
      completedRequiredCount: 0,
      remainingRequiredCount: 0,
      remainingRequiredFields: [],
      isComplete: false,
    });
    expect(tenantCompletion).toEqual({
      requiredAssignedCount: 2,
      completedRequiredCount: 0,
      remainingRequiredCount: 2,
      remainingRequiredFields: ["tenant_name", "tenant_ack"],
      isComplete: false,
    });
  });

  it("keeps legacy assignment-only metadata compatible", async () => {
    const pdfBytes = await createLeasePdf({
      title: `REACT_PDF_EDITOR_ASSIGNMENTS:${JSON.stringify({
        tenant_name: ["tenant1"],
      })}`,
    });

    const tenantCompletion = await participantCompletion.getParticipantCompletion(
      pdfBytes,
      "tenant1"
    );

    // Legacy metadata carries no requiredFields, which puts it on the same
    // "nothing explicitly required" path as a v3 inspection sign-off
    // (below): the assigned field becomes the participant's required set,
    // so it is correctly reported as outstanding rather than silently
    // invisible. (The dead .mjs asserted this field never counted as
    // required at all -- true before that fallback existed, not since.)
    expect(tenantCompletion).toEqual({
      requiredAssignedCount: 1,
      completedRequiredCount: 0,
      remainingRequiredCount: 1,
      remainingRequiredFields: ["tenant_name"],
      isComplete: false,
    });
  });

  it("does not require an assigned field that requiredFields does not list", async () => {
    // Assignment controls who may edit a field, not whether it must be
    // completed: when requiredFields is explicitly declared (so this is
    // NOT the "nothing declared" fallback case above), an assigned-but-
    // unlisted field must not be counted. (The dead .mjs asserted this via
    // the fallback case, where the intent no longer holds -- ported here
    // against a shape where it still does.)
    const pdfBytes = await createLeasePdf({
      title: participantCompletion.serializeEditorMetadata(
        participantCompletion.createEditorMetadata({
          fieldAssignments: {
            tenant_name: ["tenant1"],
            tenant_ack: ["tenant1"],
          },
          requiredFields: ["tenant_ack"],
        })
      ),
    });

    const tenantCompletion = await participantCompletion.getParticipantCompletion(
      pdfBytes,
      "tenant1"
    );

    expect(tenantCompletion.requiredAssignedCount).toBe(1);
    expect(tenantCompletion.remainingRequiredFields).toEqual(["tenant_ack"]);
  });

  it("treats assigned fields as required when nothing is explicitly required (inspection sign-off shape)", async () => {
    const pdfBytes = await createLeasePdf({
      title: participantCompletion.serializeEditorMetadata(
        participantCompletion.createEditorMetadata({
          fieldAssignments: { tenant_name: ["tenant1"] },
          requiredFields: [],
        })
      ),
    });

    const tenantCompletion = await participantCompletion.getParticipantCompletion(
      pdfBytes,
      "tenant1"
    );

    expect(tenantCompletion.requiredAssignedCount).toBe(1);
    expect(tenantCompletion.remainingRequiredCount).toBe(1);
  });

  it("counts a filled required field as complete (multi-entry field tree)", async () => {
    // pdf.js returns a valueless parent entry first for these fields; the
    // value lives on a later entry and must still be found.
    const pdfBytes = await createLeasePdf({
      title: participantCompletion.serializeEditorMetadata(
        participantCompletion.createEditorMetadata({
          fieldAssignments: { tenant_name: ["tenant1"] },
          requiredFields: ["tenant_name"],
        })
      ),
      tenantName: "Bruce Wayne",
    });

    const tenantCompletion = await participantCompletion.getParticipantCompletion(
      pdfBytes,
      "tenant1"
    );

    expect(tenantCompletion).toEqual({
      requiredAssignedCount: 1,
      completedRequiredCount: 1,
      remainingRequiredCount: 0,
      remainingRequiredFields: [],
      isComplete: true,
    });
  });

  it("does not double-count fields both required and assigned", async () => {
    const pdfBytes = await createLeasePdf({
      title: participantCompletion.serializeEditorMetadata(
        participantCompletion.createEditorMetadata({
          fieldAssignments: { tenant_name: ["tenant1"] },
          requiredFields: ["tenant_name"],
        })
      ),
    });

    const tenantCompletion = await participantCompletion.getParticipantCompletion(
      pdfBytes,
      "tenant1"
    );

    expect(tenantCompletion.requiredAssignedCount).toBe(1);
    expect(tenantCompletion.remainingRequiredCount).toBe(1);
  });

  it("treats unchecked checkboxes and empty strings as incomplete", async () => {
    const pdfBytes = await createLeasePdf({
      title: participantCompletion.serializeEditorMetadata(
        participantCompletion.createEditorMetadata({
          fieldAssignments: {
            tenant_name: ["tenant1"],
            tenant_ack: ["tenant1"],
          },
          requiredFields: ["tenant_name", "tenant_ack"],
        })
      ),
      tenantName: "",
      tenantChecked: false,
    });

    const tenantCompletion = await participantCompletion.getParticipantCompletion(
      pdfBytes,
      "tenant1"
    );

    expect(tenantCompletion).toEqual({
      requiredAssignedCount: 2,
      completedRequiredCount: 0,
      remainingRequiredCount: 2,
      remainingRequiredFields: ["tenant_name", "tenant_ack"],
      isComplete: false,
    });
  });
});
