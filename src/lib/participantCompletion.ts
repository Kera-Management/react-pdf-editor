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

const getFieldValue = (field?: PDFFormRawField) => {
  if (!field) {
    return "";
  }

  return field.value || field.defaultValue || "";
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

  return metadata.requiredFields.filter((fieldName) => {
    const assignees = metadata.fieldAssignments[fieldName];
    return assignees ? assignees.includes(participantId) : true;
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
        getFieldValue(fields?.[0]),
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
