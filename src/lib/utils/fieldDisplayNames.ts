import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  type PDFField,
} from "pdf-lib";

/**
 * A PDF field's display name: its AcroForm alternate (user) name, /TU.
 * Hosts write a short, human label there (e.g. "Landlord's legal name")
 * while the field's ID -- its full name, /T -- stays whatever the form
 * needs. The editor shows the display name to people wherever one exists;
 * the ID keeps doing every machine job (assignments, values, saving, data
 * attributes).
 */
const TU = PDFName.of("TU");

/** The field's /TU, trimmed; undefined when absent, empty or unreadable. */
export const readFieldDisplayName = (field: PDFField): string | undefined => {
  try {
    const raw = field.acroField.dict.lookup(TU);
    if (raw instanceof PDFString || raw instanceof PDFHexString) {
      const text = raw.decodeText().trim();
      return text || undefined;
    }
  } catch {
    // A malformed /TU is treated as no display name.
  }
  return undefined;
};

/** Writes `displayName` into the field's /TU (no-op for an empty value). */
export const writeFieldDisplayName = (
  field: PDFField,
  displayName: string | undefined
): void => {
  const text = displayName?.trim();
  if (!text) return;
  field.acroField.dict.set(TU, PDFHexString.fromText(text));
};

/** Display names keyed by field name, for every field of `doc` with a /TU. */
export const readDocumentFieldDisplayNames = (
  doc: PDFDocument
): Record<string, string> => {
  const names: Record<string, string> = {};
  let fields: PDFField[] = [];
  try {
    fields = doc.getForm().getFields();
  } catch {
    return names;
  }
  fields.forEach((field) => {
    const displayName = readFieldDisplayName(field);
    if (displayName) names[field.getName()] = displayName;
  });
  return names;
};

/**
 * Display names keyed by field name, read from the document's bytes. Any
 * failure (not a PDF, no AcroForm) yields an empty map: the editor then
 * labels fields exactly as it did before display names existed.
 */
export const extractFieldDisplayNames = async (
  pdfBytes: Uint8Array | ArrayBuffer
): Promise<Record<string, string>> => {
  try {
    const doc = await PDFDocument.load(pdfBytes);
    return readDocumentFieldDisplayNames(doc);
  } catch {
    return {};
  }
};
