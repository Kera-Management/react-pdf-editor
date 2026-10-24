import { describe, expect, it } from "vitest";
import { PDFDocument, PDFHexString, PDFName, PDFString } from "pdf-lib";
import {
  extractFieldDisplayNames,
  readDocumentFieldDisplayNames,
  readFieldDisplayName,
  writeFieldDisplayName,
} from "./fieldDisplayNames";

async function makeDoc() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const form = doc.getForm();
  const named = form.createTextField("landlord_name");
  named.addToPage(page, { x: 10, y: 10, width: 100, height: 20 });
  const plain = form.createTextField("plain");
  plain.addToPage(page, { x: 10, y: 40, width: 100, height: 20 });
  const blank = form.createCheckBox("blank_tu");
  blank.addToPage(page, { x: 10, y: 70, width: 12, height: 12 });
  return { doc, form, named, plain, blank };
}

describe("field display names (/TU)", () => {
  it("reads a literal or hex /TU, trimmed, and ignores empty ones", async () => {
    const { named, plain, blank } = await makeDoc();
    named.acroField.dict.set(
      PDFName.of("TU"),
      PDFString.of("  Landlord's legal name  ")
    );
    blank.acroField.dict.set(PDFName.of("TU"), PDFString.of("   "));
    expect(readFieldDisplayName(named)).toBe("Landlord's legal name");
    expect(readFieldDisplayName(plain)).toBeUndefined();
    expect(readFieldDisplayName(blank)).toBeUndefined();

    named.acroField.dict.set(
      PDFName.of("TU"),
      PDFHexString.fromText("Nom du locateur é")
    );
    expect(readFieldDisplayName(named)).toBe("Nom du locateur é");
  });

  it("writes /TU and reads every field's display name back by name", async () => {
    const { doc, named, plain } = await makeDoc();
    writeFieldDisplayName(named, "Landlord's legal name");
    writeFieldDisplayName(plain, "   "); // no-op
    expect(readDocumentFieldDisplayNames(doc)).toEqual({
      landlord_name: "Landlord's legal name",
    });

    const reloaded = await extractFieldDisplayNames(await doc.save());
    expect(reloaded).toEqual({ landlord_name: "Landlord's legal name" });
  });

  it("yields no display names for bytes it can't read", async () => {
    expect(await extractFieldDisplayNames(new Uint8Array([1, 2, 3]))).toEqual(
      {}
    );
  });
});
