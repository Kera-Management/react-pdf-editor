/**
 * The value the editor holds, internally, for a signature field whose
 * signature is already stamped into the loaded document (the metadata's
 * `signedFields`) and has not been re-signed this session. It is never
 * written into the PDF and never handed to a host: `onSave`'s formFields
 * and `ref.formFields` report such a field as `""`, exactly as before.
 *
 * Lives here, apart from participantCompletion.ts, so lightweight
 * consumers (the mobile field controls) can use it without pulling in
 * pdfjs-dist/pdf-lib.
 */
export const STAMPED_SIGNATURE_VALUE = "__react_pdf_editor_signature_stamped__";

/** True when a signature field's value means "signed": an adopted image,
 * or the stamped-in-the-document marker above. */
export const isSignatureValueSigned = (value?: string | null): boolean =>
  !!value &&
  (value.startsWith("data:image") || value === STAMPED_SIGNATURE_VALUE);

/** The host-facing view of a value: the internal stamped marker is "". */
export const hostFieldValue = (value: string): string =>
  value === STAMPED_SIGNATURE_VALUE ? "" : value;
