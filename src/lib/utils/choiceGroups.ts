/**
 * REQUIRED CHOICE GROUPS. Some forms express one question as several
 * separate checkbox fields (Ontario 2229E Section 3: "Notices by email ·
 * yes" / "· no"). A choice group ties those fields together:
 *
 * - its members are mutually exclusive in Fill & Sign (checking one
 *   unchecks the others);
 * - a `required` group is ONE required item, complete when exactly one
 *   member is checked (none, or more than one, is incomplete);
 * - members are never required individually.
 *
 * Stored in the editor's PDF Title metadata (`choiceGroups`, see
 * participantCompletion.ts). Pure and dependency-free so hosts, servers and
 * lightweight components (ProgressPanel) can share the exact same rule.
 */
export interface PDFEditorChoiceGroup {
  /** Stable id, unique within the document. */
  id: string;
  /** Member field NAMES (as in `fieldAssignments`), in question order. */
  fields: string[];
  /** One answer is required. */
  required: boolean;
  /** What the group is called to a person (e.g. "Notices by email"). */
  label?: string;
  /** Help text shown alongside the group. */
  help?: string;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * Validates whatever a document's metadata holds. Drops anything malformed:
 * a group with no id, a duplicate id, fewer than two distinct members. A
 * field belongs to at most one group (the first that lists it).
 */
export const normalizeChoiceGroups = (raw: unknown): PDFEditorChoiceGroup[] => {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set<string>();
  const claimed = new Set<string>();
  const groups: PDFEditorChoiceGroup[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Record<string, unknown>;
    if (!isNonEmptyString(candidate.id) || seenIds.has(candidate.id)) continue;
    if (!Array.isArray(candidate.fields)) continue;
    const fields: string[] = [];
    for (const name of candidate.fields) {
      if (!isNonEmptyString(name) || claimed.has(name) || fields.includes(name))
        continue;
      fields.push(name);
    }
    if (fields.length < 2) continue;
    seenIds.add(candidate.id);
    fields.forEach((name) => claimed.add(name));
    groups.push({
      id: candidate.id,
      fields,
      required: candidate.required === true,
      ...(isNonEmptyString(candidate.label) ? { label: candidate.label } : {}),
      ...(isNonEmptyString(candidate.help) ? { help: candidate.help } : {}),
    });
  }
  return groups;
};

const METADATA_PREFIX = "REACT_PDF_EDITOR_METADATA:";

/**
 * The choice groups a document declares. Accepts parsed metadata (anything
 * with a `choiceGroups` key, e.g. `extractEditorMetadata()`'s result) or the
 * raw PDF Title string. Absent or unreadable: `[]`.
 */
export const choiceGroupsFromMetadata = (
  metadata: { choiceGroups?: unknown } | string | null | undefined
): PDFEditorChoiceGroup[] => {
  if (!metadata) return [];
  if (typeof metadata === "string") {
    if (!metadata.startsWith(METADATA_PREFIX)) return [];
    try {
      const parsed = JSON.parse(metadata.slice(METADATA_PREFIX.length));
      return normalizeChoiceGroups(parsed?.choiceGroups);
    } catch {
      return [];
    }
  }
  return normalizeChoiceGroups(metadata.choiceGroups);
};

/** A checkbox value that counts as checked: non-empty and not "Off". */
export const isChoiceValueChecked = (value?: string | null): boolean =>
  !!value && value.trim() !== "" && value !== "Off";

/**
 * THE completion rule: exactly one member checked. `values` is keyed by
 * field name (checkbox export value, or "Off"/"" when unchecked).
 */
export const isChoiceGroupComplete = (
  values: Record<string, string | undefined>,
  group: Pick<PDFEditorChoiceGroup, "fields">
): boolean =>
  group.fields.filter((name) => isChoiceValueChecked(values[name])).length ===
  1;

/** The group a field name belongs to, if any. */
export const choiceGroupForField = (
  groups: readonly PDFEditorChoiceGroup[] | undefined,
  fieldName: string
): PDFEditorChoiceGroup | undefined =>
  groups?.find((group) => group.fields.includes(fieldName));

/**
 * The group's name for a person: its `label`, else its members' display
 * names joined with " / ".
 */
export const choiceGroupLabel = (
  group: PDFEditorChoiceGroup,
  labelForField: (name: string) => string = (name) => name
): string =>
  group.label?.trim() || group.fields.map(labelForField).join(" / ");

/**
 * Keeps groups in step with the fields that still exist: renamed members
 * follow `renames` (old name -> new name), missing members drop out, and a
 * group left with fewer than two members is dropped.
 */
export const pruneChoiceGroups = (
  groups: readonly PDFEditorChoiceGroup[] | undefined,
  existingFieldNames: Iterable<string>,
  renames?: ReadonlyMap<string, string>
): PDFEditorChoiceGroup[] => {
  const existing = new Set(existingFieldNames);
  return normalizeChoiceGroups(
    (groups ?? []).map((group) => ({
      ...group,
      fields: group.fields
        .map((name) => renames?.get(name) ?? name)
        .filter((name) => existing.has(name)),
    }))
  );
};

/**
 * Completion of one entry of a required/assigned NAME list in which a
 * choice group is represented by one of its members (see
 * `getRequiredAssignedFieldNames`): a member's completion is its group's;
 * any other field is complete when non-empty and not "Off".
 */
export const isFieldOrChoiceGroupComplete = (
  fieldName: string,
  values: Record<string, string | undefined>,
  groups: readonly PDFEditorChoiceGroup[] | undefined
): boolean => {
  const group = choiceGroupForField(groups, fieldName);
  return group
    ? isChoiceGroupComplete(values, group)
    : isChoiceValueChecked(values[fieldName]);
};
