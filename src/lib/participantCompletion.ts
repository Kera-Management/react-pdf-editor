import { getDocument } from "pdfjs-dist";
import {
  DocumentInitParameters,
  TypedArray,
} from "pdfjs-dist/types/src/display/api";
import { PDFDocument } from "pdf-lib";
import {
  assigneesIncludeParticipant,
  normalizeParticipantId,
  resolveEffectiveFieldAssignments,
} from "./utils/participantMatching";

// Re-exported for backward compatibility: every existing consumer imports
// these from "./participantCompletion". The implementations live in
// utils/participantMatching.ts instead (see that file's header comment) so
// a lightweight consumer like ProgressPanel can use them without pulling in
// this module's pdfjs-dist/pdf-lib dependency.
export { assigneesIncludeParticipant, normalizeParticipantId, resolveEffectiveFieldAssignments };

export type PDFEditorSource =
  | string
  | URL
  | TypedArray
  | ArrayBuffer
  | DocumentInitParameters;

export interface PDFEditorMetadata {
  version: 2 | 3;
  fieldAssignments: Record<string, string[]>;
  requiredFields: string[];
  /**
   * Field names that are signature fields (as opposed to text/checkbox
   * fields). Introduced in v3; a v2 document parses with `[]`.
   */
  signatureFields: string[];
}

export interface ParticipantCompletion {
  requiredAssignedCount: number;
  completedRequiredCount: number;
  remainingRequiredCount: number;
  remainingRequiredFields: string[];
  /**
   * Required/assigned fields for this participant that were excluded from
   * every count above because they never rendered (see `renderedFieldNames`
   * on `calculateParticipantCompletion`). Always `[]` when the caller
   * doesn't pass `renderedFieldNames` -- nothing is excluded, so there's
   * nothing to report here.
   */
  unrenderableAssignedFields: string[];
  isComplete: boolean;
}

interface PDFFormRawField {
  defaultValue: string | "Off" | "On";
  name: string;
  value: string | "Off" | "On";
}

const LEGACY_ASSIGNMENTS_PREFIX = "REACT_PDF_EDITOR_ASSIGNMENTS:";
const METADATA_PREFIX = "REACT_PDF_EDITOR_METADATA:";

const EMPTY_METADATA: PDFEditorMetadata = {
  version: 3,
  fieldAssignments: {},
  requiredFields: [],
  signatureFields: [],
};

const normalizeFieldAssignments = (
  assignments: unknown
): Record<string, string[]> => {
  if (!assignments || typeof assignments !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(assignments).map(([fieldName, assignees]) => [
      fieldName,
      Array.isArray(assignees)
        ? assignees.filter(
            (assignee): assignee is string =>
              typeof assignee === "string" && assignee.trim().length > 0
          )
        : [],
    ])
  );
};

const normalizeRequiredFields = (requiredFields: unknown): string[] => {
  if (!Array.isArray(requiredFields)) {
    return [];
  }

  return requiredFields.filter(
    (fieldName): fieldName is string =>
      typeof fieldName === "string" && fieldName.trim().length > 0
  );
};

const normalizeSignatureFields = (signatureFields: unknown): string[] => {
  if (!Array.isArray(signatureFields)) {
    return [];
  }

  return signatureFields.filter(
    (fieldName): fieldName is string =>
      typeof fieldName === "string" && fieldName.trim().length > 0
  );
};

export const createEditorMetadata = ({
  fieldAssignments,
  requiredFields,
  signatureFields = [],
}: {
  fieldAssignments: Record<string, string[]>;
  requiredFields: string[];
  signatureFields?: string[];
}): PDFEditorMetadata => ({
  version: 3,
  fieldAssignments: normalizeFieldAssignments(fieldAssignments),
  requiredFields: normalizeRequiredFields(requiredFields),
  signatureFields: normalizeSignatureFields(signatureFields),
});

export const serializeEditorMetadata = (metadata: PDFEditorMetadata): string =>
  `${METADATA_PREFIX}${JSON.stringify(metadata)}`;

export const parseEditorMetadataValue = (
  value?: string | null
): PDFEditorMetadata => {
  if (!value) {
    return EMPTY_METADATA;
  }

  if (value.startsWith(METADATA_PREFIX)) {
    try {
      const parsed = JSON.parse(value.slice(METADATA_PREFIX.length));
      const isObject = parsed && typeof parsed === "object";

      // A v2 document has no `signatureFields` key at all -- it normalizes
      // to `[]` below and its `version` is preserved as-is (2), so a
      // not-yet-touched-by-signatures document stays honestly labelled v2
      // until it is next written (createEditorMetadata always writes v3).
      return {
        version: isObject && parsed.version === 2 ? 2 : 3,
        fieldAssignments: normalizeFieldAssignments(
          isObject ? parsed.fieldAssignments : {}
        ),
        requiredFields: normalizeRequiredFields(
          isObject ? parsed.requiredFields : []
        ),
        signatureFields: normalizeSignatureFields(
          isObject ? parsed.signatureFields : []
        ),
      };
    } catch (error) {
      console.warn("Failed to parse react-pdf-editor metadata:", error);
      return EMPTY_METADATA;
    }
  }

  if (value.startsWith(LEGACY_ASSIGNMENTS_PREFIX)) {
    try {
      const parsed = JSON.parse(value.slice(LEGACY_ASSIGNMENTS_PREFIX.length));
      return {
        version: 2,
        fieldAssignments: normalizeFieldAssignments(parsed),
        requiredFields: [],
        signatureFields: [],
      };
    } catch (error) {
      console.warn("Failed to parse legacy react-pdf-editor metadata:", error);
    }
  }

  return EMPTY_METADATA;
};

export const extractEditorMetadata = async (
  pdfBytes: Uint8Array | ArrayBuffer
): Promise<PDFEditorMetadata> => {
  const libDoc = await PDFDocument.load(pdfBytes);
  return parseEditorMetadataValue(libDoc.getTitle());
};

// pdf.js returns one entry per node of a field's tree: the first entry can be
// a non-terminal parent with no `value`, with the actual widget value on a
// later entry — scan them all instead of trusting entry [0].
const getFieldValue = (fieldEntries?: PDFFormRawField[]) => {
  if (!fieldEntries?.length) {
    return "";
  }

  for (const entry of fieldEntries) {
    if (entry && typeof entry.value === "string" && entry.value !== "") {
      return entry.value;
    }
  }

  for (const entry of fieldEntries) {
    if (
      entry &&
      typeof entry.defaultValue === "string" &&
      entry.defaultValue !== ""
    ) {
      return entry.defaultValue;
    }
  }

  return "";
};

const isFieldComplete = (value?: string) =>
  Boolean(value && value.trim() !== "" && value !== "Off");

export const getRequiredAssignedFieldNames = ({
  metadata,
  participantId,
}: {
  metadata: PDFEditorMetadata;
  participantId?: string;
}) => {
  if (!participantId) {
    return metadata.requiredFields;
  }

  // Same "does a mapping exist AT ALL" rule the edit-mode gate uses (see
  // resolveEffectiveFieldAssignments's doc comment): once ANY field has an
  // assignments entry, a field with NO entry is nobody's-in-particular --
  // NOT everyone's. A completely empty mapping means the host isn't using
  // per-field assignment at all, so nothing here restricts whose work a
  // required field is.
  const hasAssignmentMapping = Object.keys(metadata.fieldAssignments).length > 0;

  // When no fields are explicitly marked required (e.g. inspection sign-offs,
  // which carry only per-party assignments and no requiredFields), treat the
  // fields assigned to this participant as their required set, so progress
  // reflects the boxes they actually have to sign. Flows that DO declare
  // requiredFields keep their existing semantics untouched. (This already
  // only ever considers fields that are KEYS in fieldAssignments, so an
  // unmapped field can never surface here regardless of hasAssignmentMapping.)
  if (metadata.requiredFields.length === 0) {
    return Object.keys(metadata.fieldAssignments).filter((fieldName) =>
      assigneesIncludeParticipant(metadata.fieldAssignments[fieldName], participantId)
    );
  }

  // Explicitly required fields count for this participant only when the
  // field is also theirs to fill. A required field with no fieldAssignments
  // entry is "not yours" once a non-empty mapping exists -- mirroring the
  // edit-mode gate exactly, since a field this participant is locked out of
  // editing must never show up in their own remaining-work count (it would
  // otherwise permanently block them: uneditable, yet still "required").
  // Under a wholly empty mapping, an unmapped required field still belongs
  // to whoever's editing -- unchanged plain fill & sign behavior for hosts
  // that don't use per-field assignment.
  return metadata.requiredFields.filter((fieldName) => {
    const assignees = metadata.fieldAssignments[fieldName];
    if (assignees) {
      return assigneesIncludeParticipant(assignees, participantId);
    }
    return !hasAssignmentMapping;
  });
};

export const calculateParticipantCompletion = ({
  metadata,
  formFields,
  participantId,
  renderedFieldNames,
}: {
  metadata: PDFEditorMetadata;
  formFields: Record<string, string>;
  participantId?: string;
  /**
   * Field names that actually rendered in the editor (survived the
   * editable/hidden/button pre-render filter pdf.js's raw field list goes
   * through before it becomes DOM). A field can be assigned or required in
   * metadata yet fail that filter entirely -- e.g. a server bug left it
   * read-only in the AcroForm -- in which case it never got a DOM node to
   * fill in the first place.
   *
   * SEMANTICS: such a field is EXCLUDED from every count/list above
   * (`requiredAssignedCount`, `remainingRequiredFields`, `isComplete`, ...)
   * rather than counted as perpetually incomplete, and reported separately
   * via `unrenderableAssignedFields` instead. The alternative -- counting it
   * as required-but-incomplete -- would permanently block a signer who has
   * genuinely completed every field they can see, over an anomaly that is
   * not theirs to fix; excluding it unblocks them while
   * `unrenderableAssignedFields` still gives the host a way to surface the
   * anomaly (e.g. a "couldn't be shown, contact the sender" notice).
   *
   * Omitted entirely (undefined): every assigned/required field is treated
   * as renderable, i.e. behavior is unchanged from before this concept
   * existed. This is the case for callers with no rendering context at all,
   * such as the headless `getParticipantCompletion()` read path below.
   */
  renderedFieldNames?: Set<string> | string[];
}): ParticipantCompletion => {
  const requiredAssignedFields = getRequiredAssignedFieldNames({
    metadata,
    participantId,
  });

  const renderedSet = renderedFieldNames
    ? renderedFieldNames instanceof Set
      ? renderedFieldNames
      : new Set(renderedFieldNames)
    : null;

  const renderableFields = renderedSet
    ? requiredAssignedFields.filter((fieldName) => renderedSet.has(fieldName))
    : requiredAssignedFields;
  const unrenderableAssignedFields = renderedSet
    ? requiredAssignedFields.filter((fieldName) => !renderedSet.has(fieldName))
    : [];

  const completedRequiredFields = renderableFields.filter((fieldName) =>
    isFieldComplete(formFields[fieldName])
  );
  const remainingRequiredFields = renderableFields.filter(
    (fieldName) => !completedRequiredFields.includes(fieldName)
  );

  return {
    requiredAssignedCount: renderableFields.length,
    completedRequiredCount: completedRequiredFields.length,
    remainingRequiredCount: remainingRequiredFields.length,
    remainingRequiredFields,
    unrenderableAssignedFields,
    isComplete:
      renderableFields.length > 0 && remainingRequiredFields.length === 0,
  };
};

export const getParticipantCompletion = async (
  src: PDFEditorSource,
  participantId?: string
): Promise<ParticipantCompletion> => {
  const pdfDoc = await getDocument(src).promise;

  try {
    const rawFormFields = (await pdfDoc.getFieldObjects()) as Record<
      string,
      PDFFormRawField[]
    >;
    const pdfBytes = await pdfDoc.getData();
    const metadata = await extractEditorMetadata(pdfBytes);

    const formFields = Object.fromEntries(
      Object.entries(rawFormFields || {}).map(([fieldName, fields]) => [
        fieldName,
        getFieldValue(fields),
      ])
    );

    return calculateParticipantCompletion({
      metadata,
      formFields,
      participantId,
    });
  } finally {
    await pdfDoc.destroy();
  }
};
