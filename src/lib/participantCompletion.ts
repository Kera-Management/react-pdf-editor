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
import {
  choiceGroupForField,
  isChoiceGroupComplete,
  normalizeChoiceGroups,
  type PDFEditorChoiceGroup,
} from "./utils/choiceGroups";

// Re-exported for backward compatibility: every existing consumer imports
// these from "./participantCompletion". The implementations live in
// utils/participantMatching.ts instead (see that file's header comment) so
// a lightweight consumer like ProgressPanel can use them without pulling in
// this module's pdfjs-dist/pdf-lib dependency.
export { assigneesIncludeParticipant, normalizeParticipantId, resolveEffectiveFieldAssignments };
export {
  choiceGroupForField,
  choiceGroupLabel,
  choiceGroupsFromMetadata,
  isChoiceGroupComplete,
  isChoiceValueChecked,
  isFieldOrChoiceGroupComplete,
  normalizeChoiceGroups,
  pruneChoiceGroups,
} from "./utils/choiceGroups";
export type { PDFEditorChoiceGroup } from "./utils/choiceGroups";

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
  /**
   * Checkbox fields that answer one question together (e.g. a yes/no
   * pair). Additive and optional within v3: absent (every document written
   * before it, and every document that declares none) means no groups, and
   * readers that predate it simply ignore the key. See
   * utils/choiceGroups.ts for the rule.
   */
  choiceGroups?: PDFEditorChoiceGroup[];
  /**
   * Signature fields whose adopted signature has been stamped into this
   * document's page content by an editor save. A stamped signature is an
   * IMAGE drawn on the page; the field's own AcroForm text value stays
   * empty by design (see PDFEditor's save path), so without this record a
   * signed field reads as unsigned the moment the saved bytes are reopened
   * or checked with `getParticipantCompletion`. Additive and optional
   * within v3, like `choiceGroups`: absent means nothing is recorded as
   * stamped, and older readers ignore the key.
   */
  signedFields?: string[];
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
  /**
   * Ids of the participant's required choice groups still unanswered (no
   * member checked, or more than one). Each such group is ALSO one entry
   * of `remainingRequiredFields`, under its first member's name. Present
   * only when the document declares choice groups.
   */
  remainingChoiceGroups?: string[];
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
  choiceGroups,
  signedFields,
}: {
  fieldAssignments: Record<string, string[]>;
  requiredFields: string[];
  signatureFields?: string[];
  choiceGroups?: PDFEditorChoiceGroup[];
  signedFields?: string[];
}): PDFEditorMetadata => {
  const groups = normalizeChoiceGroups(choiceGroups);
  const normalizedSignatureFields = normalizeSignatureFields(signatureFields);
  // Only signature fields can be stamped; a name that is no longer one (a
  // field deleted or retyped in Prepare) drops out.
  const signed = Array.from(
    new Set(normalizeSignatureFields(signedFields))
  ).filter((name) => normalizedSignatureFields.includes(name));
  return {
    version: 3,
    fieldAssignments: normalizeFieldAssignments(fieldAssignments),
    requiredFields: normalizeRequiredFields(requiredFields),
    signatureFields: normalizedSignatureFields,
    // Only written when there is something to say, so a document without
    // groups (or stamped signatures) serializes exactly as before.
    ...(groups.length > 0 ? { choiceGroups: groups } : {}),
    ...(signed.length > 0 ? { signedFields: signed } : {}),
  };
};

/**
 * Records `stampedFieldNames` as signed in an editor-metadata Title, keeping
 * every other key of the existing JSON exactly as it was (including keys
 * this version doesn't know). Returns `null` when `title` is not editor
 * metadata: a document the editor didn't prepare (a government form, a
 * host-labelled notice) keeps its own Title untouched.
 */
export const withSignedFieldsInTitle = (
  title: string | undefined | null,
  stampedFieldNames: Iterable<string>
): string | null => {
  if (!title || !title.startsWith(METADATA_PREFIX)) return null;
  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(title.slice(METADATA_PREFIX.length));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    parsed = value as Record<string, unknown>;
  } catch {
    return null;
  }
  const signatureFields = normalizeSignatureFields(parsed.signatureFields);
  const signed = new Set(normalizeSignatureFields(parsed.signedFields));
  for (const name of stampedFieldNames) {
    if (signatureFields.includes(name)) signed.add(name);
  }
  const next = { ...parsed };
  if (signed.size > 0) next.signedFields = Array.from(signed);
  else delete next.signedFields;
  return `${METADATA_PREFIX}${JSON.stringify(next)}`;
};

// Top-level metadata keys this version writes itself. Anything else in a
// document's editor metadata belongs to someone else (a host or server
// stamp) and is carried over verbatim by serializeEditorMetadata.
const KNOWN_METADATA_KEYS = new Set([
  "version",
  "fieldAssignments",
  "requiredFields",
  "signatureFields",
  "choiceGroups",
  "signedFields",
]);

/**
 * Serializes editor metadata for a PDF Title. Pass the document's previous
 * Title as `previousTitle` to keep every top-level key of its editor
 * metadata that this version doesn't know (e.g. a host's own stamp),
 * verbatim, after the known keys. Known keys always come from `metadata`:
 * one the new metadata leaves out (say `choiceGroups`) is not carried over.
 * A previous Title that isn't editor metadata contributes nothing.
 */
export const serializeEditorMetadata = (
  metadata: PDFEditorMetadata,
  previousTitle?: string | null
): string => {
  const extras: Record<string, unknown> = {};
  if (previousTitle && previousTitle.startsWith(METADATA_PREFIX)) {
    try {
      const parsed = JSON.parse(previousTitle.slice(METADATA_PREFIX.length));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          if (!KNOWN_METADATA_KEYS.has(key)) extras[key] = value;
        }
      }
    } catch {
      // Unreadable previous metadata: nothing to keep.
    }
  }
  return `${METADATA_PREFIX}${JSON.stringify({ ...metadata, ...extras })}`;
};

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
      const choiceGroups = normalizeChoiceGroups(
        isObject ? parsed.choiceGroups : undefined
      );
      const signatureFields = normalizeSignatureFields(
        isObject ? parsed.signatureFields : []
      );
      const signedFields = normalizeSignatureFields(
        isObject ? parsed.signedFields : []
      ).filter((name) => signatureFields.includes(name));
      return {
        version: isObject && parsed.version === 2 ? 2 : 3,
        fieldAssignments: normalizeFieldAssignments(
          isObject ? parsed.fieldAssignments : {}
        ),
        requiredFields: normalizeRequiredFields(
          isObject ? parsed.requiredFields : []
        ),
        signatureFields,
        ...(choiceGroups.length > 0 ? { choiceGroups } : {}),
        ...(signedFields.length > 0 ? { signedFields } : {}),
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

const getRequiredAssignedFieldNamesWithoutGroups = ({
  metadata,
  participantId,
}: {
  metadata: PDFEditorMetadata;
  participantId?: string;
}): string[] => {
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

/**
 * The participant's required work as a list of field NAMES. A choice group
 * (see utils/choiceGroups.ts) is ONE entry, under the name of its first
 * member that is this participant's; its members never appear on their own.
 * Check entries with `isFieldOrChoiceGroupComplete`.
 *
 * Which groups count: every `required` group, plus any group a member of
 * which is listed in `requiredFields` (members are never required alone,
 * and a yes/no pair whose boxes were each required could never be
 * finished). A group counts for a participant under the same assignment
 * rule as a required field: any member of it is theirs.
 *
 * The "nothing declared required -> every assigned field is" fallback
 * applies only when the document declares neither required fields nor a
 * required group; under it, a group whose members are assigned is one
 * entry too. Without choice groups this is exactly the previous behavior.
 */
export const getRequiredAssignedFieldNames = ({
  metadata,
  participantId,
}: {
  metadata: PDFEditorMetadata;
  participantId?: string;
}): string[] => {
  const groups = normalizeChoiceGroups(metadata.choiceGroups);
  if (groups.length === 0) {
    return getRequiredAssignedFieldNamesWithoutGroups({ metadata, participantId });
  }

  const hasAssignmentMapping = Object.keys(metadata.fieldAssignments).length > 0;
  const isTheirs = (fieldName: string) => {
    if (!participantId) return true;
    const assignees = metadata.fieldAssignments[fieldName];
    if (assignees) return assigneesIncludeParticipant(assignees, participantId);
    return !hasAssignmentMapping;
  };
  const groupOf = (fieldName: string) => choiceGroupForField(groups, fieldName);

  const individual = metadata.requiredFields.filter((name) => !groupOf(name));
  const requiredGroups = groups.filter(
    (group) =>
      group.required ||
      group.fields.some((name) => metadata.requiredFields.includes(name))
  );

  // Fallback: nothing declared required, so every assigned field is.
  if (
    participantId &&
    individual.length === 0 &&
    requiredGroups.length === 0
  ) {
    const names: string[] = [];
    const emitted = new Set<string>();
    Object.keys(metadata.fieldAssignments)
      .filter((name) =>
        assigneesIncludeParticipant(metadata.fieldAssignments[name], participantId)
      )
      .forEach((name) => {
        const group = groupOf(name);
        if (!group) {
          names.push(name);
        } else if (!emitted.has(group.id)) {
          emitted.add(group.id);
          names.push(name);
        }
      });
    return names;
  }

  const names = individual.filter(isTheirs);
  requiredGroups.forEach((group) => {
    const representative = group.fields.find(isTheirs);
    if (representative) names.push(representative);
  });
  return names;
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

  const groups = normalizeChoiceGroups(metadata.choiceGroups);
  // A signature already stamped into the document is signed whatever
  // `formFields` says: its AcroForm value is empty by design.
  const stamped = new Set(metadata.signedFields ?? []);
  const isEntryComplete = (fieldName: string) => {
    if (stamped.has(fieldName)) return true;
    const group = groups.length ? choiceGroupForField(groups, fieldName) : undefined;
    return group
      ? isChoiceGroupComplete(formFields, group)
      : isFieldComplete(formFields[fieldName]);
  };
  const completedRequiredFields = renderableFields.filter(isEntryComplete);
  const remainingRequiredFields = renderableFields.filter(
    (fieldName) => !completedRequiredFields.includes(fieldName)
  );

  return {
    requiredAssignedCount: renderableFields.length,
    completedRequiredCount: completedRequiredFields.length,
    remainingRequiredCount: remainingRequiredFields.length,
    remainingRequiredFields,
    unrenderableAssignedFields,
    // Only for documents with choice groups, so every other result is
    // exactly what it was before groups existed.
    ...(groups.length > 0
      ? {
          remainingChoiceGroups: remainingRequiredFields
            .map((fieldName) => choiceGroupForField(groups, fieldName)?.id)
            .filter((id): id is string => !!id),
        }
      : {}),
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
