import {
  assigneesIncludeParticipant,
  normalizeParticipantId,
} from "./participantMatching";

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
 *
 * The editor holds it only for a field whose stamp counts for the signer
 * at the keyboard (see `stampedFieldNamesFor`), and completion math never
 * trusts it on its own: it checks the signer in `signedFields`.
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

/**
 * One signature stamped into a document's page content by an editor save:
 * WHICH field, WHO stamped it (the `activeParticipantId` at the time, as the
 * host supplied it; `""` when there was none) and, optionally, when.
 *
 * The signer is part of the record because a stamp is someone's signature,
 * not a property of the box: a field reassigned to another participant
 * (outside the editor, by a host passing different `fieldAssignments`) must
 * read as unsigned for its new assignee, never as already done for them.
 */
export interface PDFEditorSignedField {
  field: string;
  participantId: string;
  /** ISO 8601 time of the save that stamped it. */
  at?: string;
}

/**
 * Normalizes a `signedFields` value read from metadata (or passed in by a
 * caller) into records, dropping anything malformed and keeping one record
 * per field (the last one wins: a later stamp supersedes an earlier one).
 *
 * Back-compat: 4.3.0 pre-releases wrote `signedFields` as bare field names,
 * with no signer. A bare name is credited to the field's assignee in
 * `fieldAssignments` (the document's own, as it stood when it was saved)
 * ONLY when the field has exactly one assignee. With none or several, who
 * signed can't be known, and the entry is dropped: the field reads as
 * unsigned, which asks again rather than crediting the wrong person.
 */
export const normalizeSignedFields = (
  raw: unknown,
  fieldAssignments: Record<string, string[] | undefined> = {}
): PDFEditorSignedField[] => {
  if (!Array.isArray(raw)) return [];
  const byField = new Map<string, PDFEditorSignedField>();
  raw.forEach((entry) => {
    if (typeof entry === "string") {
      const field = entry;
      const assignees = (fieldAssignments[field] ?? []).filter(
        (id) => typeof id === "string" && id.trim()
      );
      if (field.trim() && assignees.length === 1) {
        byField.delete(field);
        byField.set(field, { field, participantId: assignees[0] });
      }
      return;
    }
    if (!entry || typeof entry !== "object") return;
    const { field, participantId, at } = entry as Record<string, unknown>;
    if (typeof field !== "string" || !field.trim()) return;
    if (typeof participantId !== "string") return;
    byField.delete(field);
    byField.set(field, {
      field,
      participantId,
      ...(typeof at === "string" && at ? { at } : {}),
    });
  });
  return Array.from(byField.values());
};

const sameParticipant = (a?: string | null, b?: string | null) =>
  normalizeParticipantId(a) === normalizeParticipantId(b);

/**
 * Whether a record still stands: its signer is still assigned to the field.
 * A field with no assignees at all (no mapping, or not in it) has no one
 * else it could belong to, so a record on it stands.
 */
const recordStands = (
  record: PDFEditorSignedField,
  fieldAssignments: Record<string, string[] | undefined>
): boolean => {
  const assignees = fieldAssignments[record.field];
  if (!assignees?.length) return true;
  return assigneesIncludeParticipant(assignees, record.participantId);
};

/**
 * Whether `fieldName` is signed by a stamp, for `participantId`:
 *
 * - with a participant: a record exists whose signer IS that participant
 *   and who is still assigned to the field. Someone else's stamp never
 *   counts as theirs.
 * - without one (a host asking about the document as a whole): a record
 *   exists whose signer is still assigned to the field.
 */
export const isSignatureRecordedFor = ({
  signedFields,
  fieldAssignments,
  fieldName,
  participantId,
}: {
  signedFields: readonly PDFEditorSignedField[] | undefined;
  fieldAssignments: Record<string, string[] | undefined>;
  fieldName: string;
  participantId?: string;
}): boolean =>
  (signedFields ?? []).some(
    (record) =>
      record.field === fieldName &&
      recordStands(record, fieldAssignments) &&
      (!participantId ||
        sameParticipant(record.participantId, participantId))
  );

/** The record that currently stands for `fieldName`, if any (whoever signed). */
export const standingSignatureRecord = (
  signedFields: readonly PDFEditorSignedField[] | undefined,
  fieldAssignments: Record<string, string[] | undefined>,
  fieldName: string
): PDFEditorSignedField | undefined =>
  (signedFields ?? []).find(
    (record) =>
      record.field === fieldName && recordStands(record, fieldAssignments)
  );

/**
 * The field NAMES the editor shows as already stamped (and won't let be
 * signed again) for `viewerId`, the signer at the keyboard:
 *
 * - a field the viewer is assigned to: only when the viewer's OWN stamp
 *   stands. Someone else's stamp on a field now theirs (reassigned) leaves
 *   it unsigned, so they can sign it.
 * - any other field (another signer's, locked for the viewer anyway): when
 *   any stamp on it stands, so it displays as signed.
 *
 * With no viewer (View mode, or no `activeParticipantId`), a field shows as
 * stamped when any stamp on it stands.
 */
export const stampedFieldNamesFor = ({
  signedFields,
  fieldAssignments,
  viewerId,
}: {
  signedFields: readonly PDFEditorSignedField[] | undefined;
  fieldAssignments: Record<string, string[] | undefined>;
  viewerId?: string;
}): Set<string> => {
  const names = new Set<string>();
  const hasMapping = Object.keys(fieldAssignments).length > 0;
  (signedFields ?? []).forEach((record) => {
    const name = record.field;
    if (names.has(name)) return;
    if (!viewerId) {
      if (recordStands(record, fieldAssignments)) names.add(name);
      return;
    }
    const assignees = fieldAssignments[name];
    const viewerAssigned = assignees?.length
      ? assigneesIncludeParticipant(assignees, viewerId)
      : !hasMapping;
    const shows = viewerAssigned
      ? isSignatureRecordedFor({
          signedFields,
          fieldAssignments,
          fieldName: name,
          participantId: viewerId,
        })
      : !!standingSignatureRecord(signedFields, fieldAssignments, name);
    if (shows) names.add(name);
  });
  return names;
};
