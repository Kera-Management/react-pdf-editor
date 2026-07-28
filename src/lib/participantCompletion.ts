import { getDocument } from "pdfjs-dist";
import {
  DocumentInitParameters,
  TypedArray,
} from "pdfjs-dist/types/src/display/api";
import { PDFDocument } from "pdf-lib";

export type PDFEditorSource =
  | string
  | URL
  | TypedArray
  | ArrayBuffer
  | DocumentInitParameters;

export interface PDFEditorMetadata {
  version: 2;
  fieldAssignments: Record<string, string[]>;
  requiredFields: string[];
}

export interface ParticipantCompletion {
  requiredAssignedCount: number;
  completedRequiredCount: number;
  remainingRequiredCount: number;
  remainingRequiredFields: string[];
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
  version: 2,
  fieldAssignments: {},
  requiredFields: [],
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

export const createEditorMetadata = ({
  fieldAssignments,
  requiredFields,
}: {
  fieldAssignments: Record<string, string[]>;
  requiredFields: string[];
}): PDFEditorMetadata => ({
  version: 2,
  fieldAssignments: normalizeFieldAssignments(fieldAssignments),
  requiredFields: normalizeRequiredFields(requiredFields),
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

      return createEditorMetadata({
        fieldAssignments:
          parsed && typeof parsed === "object" ? parsed.fieldAssignments : {},
        requiredFields:
          parsed && typeof parsed === "object" ? parsed.requiredFields : [],
      });
    } catch (error) {
      console.warn("Failed to parse react-pdf-editor metadata:", error);
      return EMPTY_METADATA;
    }
  }

  if (value.startsWith(LEGACY_ASSIGNMENTS_PREFIX)) {
    try {
      const parsed = JSON.parse(value.slice(LEGACY_ASSIGNMENTS_PREFIX.length));
      return createEditorMetadata({
        fieldAssignments: parsed,
        requiredFields: [],
      });
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

/**
 * Participant ids are matched loosely: trimmed and case-folded. The assignee ids
 * baked into a PDF (e.g. a manager uid or an email) and the `activeParticipantId`
 * the host app supplies can drift by whitespace or casing without either side
 * being "wrong", and a strict mismatch silently locks a signer out of their own
 * field. Normalize both sides everywhere ids are compared.
 */
export const normalizeParticipantId = (id?: string | null): string =>
  (id ?? "").trim().toLowerCase();

export const assigneesIncludeParticipant = (
  assignees: string[] | undefined,
  participantId?: string
): boolean => {
  if (!assignees?.length) {
    return false;
  }
  const target = normalizeParticipantId(participantId);
  return assignees.some((assignee) => normalizeParticipantId(assignee) === target);
};

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

  // When no fields are explicitly marked required (e.g. inspection sign-offs,
  // which carry only per-party assignments and no requiredFields), treat the
  // fields assigned to this participant as their required set, so progress
  // reflects the boxes they actually have to sign. Flows that DO declare
  // requiredFields keep their existing semantics untouched.
  if (metadata.requiredFields.length === 0) {
    return Object.keys(metadata.fieldAssignments).filter((fieldName) =>
      assigneesIncludeParticipant(metadata.fieldAssignments[fieldName], participantId)
    );
  }

  // Only explicitly required fields count: assignment controls who may edit
  // a field, not whether it must be completed.
  return metadata.requiredFields.filter((fieldName) => {
    const assignees = metadata.fieldAssignments[fieldName];
    return assignees ? assigneesIncludeParticipant(assignees, participantId) : true;
  });
};

export const calculateParticipantCompletion = ({
  metadata,
  formFields,
  participantId,
}: {
  metadata: PDFEditorMetadata;
  formFields: Record<string, string>;
  participantId?: string;
}): ParticipantCompletion => {
  const requiredAssignedFields = getRequiredAssignedFieldNames({
    metadata,
    participantId,
  });

  const completedRequiredFields = requiredAssignedFields.filter((fieldName) =>
    isFieldComplete(formFields[fieldName])
  );
  const remainingRequiredFields = requiredAssignedFields.filter(
    (fieldName) => !completedRequiredFields.includes(fieldName)
  );

  return {
    requiredAssignedCount: requiredAssignedFields.length,
    completedRequiredCount: completedRequiredFields.length,
    remainingRequiredCount: remainingRequiredFields.length,
    remainingRequiredFields,
    isComplete:
      requiredAssignedFields.length > 0 &&
      remainingRequiredFields.length === 0,
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
