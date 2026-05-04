import test from "node:test";
import assert from "node:assert/strict";

import { PDFDocument } from "pdf-lib";

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
};

Promise.withResolvers ??= () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

const {
  createEditorMetadata,
  getParticipantCompletion,
  serializeEditorMetadata,
} = await import("../dist/index.js");

const { GlobalWorkerOptions } = await import("pdfjs-dist/build/pdf.mjs");

GlobalWorkerOptions.workerSrc = new URL(
  "../node_modules/pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).href;

const createLeasePdf = async ({
  title,
  landlordName = "Jordan Stone",
  tenantName = "",
  landlordChecked = true,
  tenantChecked = false,
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

const clonePdfBytes = (pdfBytes) => Uint8Array.from(pdfBytes);

test("reads metadata and computes participant completion per assignee", async () => {
  const pdfBytes = await createLeasePdf({
    title: serializeEditorMetadata(
      createEditorMetadata({
        fieldAssignments: {
          tenant_name: ["tenant1"],
          tenant_ack: ["tenant1"],
        },
        requiredFields: ["tenant_name", "tenant_ack"],
      })
    ),
  });

  const landlordCompletion = await getParticipantCompletion(
    clonePdfBytes(pdfBytes),
    "landlord"
  );
  const tenantCompletion = await getParticipantCompletion(
    clonePdfBytes(pdfBytes),
    "tenant1"
  );

  assert.deepEqual(landlordCompletion, {
    requiredAssignedCount: 0,
    completedRequiredCount: 0,
    remainingRequiredCount: 0,
    remainingRequiredFields: [],
    isComplete: false,
  });
  assert.deepEqual(tenantCompletion, {
    requiredAssignedCount: 2,
    completedRequiredCount: 0,
    remainingRequiredCount: 2,
    remainingRequiredFields: ["tenant_name", "tenant_ack"],
    isComplete: false,
  });
});

test("keeps legacy assignment-only metadata compatible", async () => {
  const pdfBytes = await createLeasePdf({
    title: `REACT_PDF_EDITOR_ASSIGNMENTS:${JSON.stringify({
      tenant_name: ["tenant1"],
    })}`,
  });

  const tenantCompletion = await getParticipantCompletion(pdfBytes, "tenant1");

  assert.deepEqual(tenantCompletion, {
    requiredAssignedCount: 0,
    completedRequiredCount: 0,
    remainingRequiredCount: 0,
    remainingRequiredFields: [],
    isComplete: false,
  });
});

test("treats unchecked checkboxes and empty strings as incomplete", async () => {
  const pdfBytes = await createLeasePdf({
    title: serializeEditorMetadata(
      createEditorMetadata({
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

  const tenantCompletion = await getParticipantCompletion(pdfBytes, "tenant1");

  assert.deepEqual(tenantCompletion, {
    requiredAssignedCount: 2,
    completedRequiredCount: 0,
    remainingRequiredCount: 2,
    remainingRequiredFields: ["tenant_name", "tenant_ack"],
    isComplete: false,
  });
});
