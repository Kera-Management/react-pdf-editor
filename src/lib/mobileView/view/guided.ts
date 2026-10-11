/**
 * Guided Next/Previous for the mobile friendly view (spec §8.4). Pure: the
 * editor supplies the field names the active participant must complete
 * (the same required/assigned set progress counts), and these helpers only
 * decide order and the next stop.
 */

/**
 * Orders `names` by where each first appears in the reflowed document.
 * Names the document never places keep their relative order at the end.
 */
export const orderNamesByDocument = (
  names: string[],
  fieldIdsInOrder: string[],
  nameById: (fieldId: string) => string | undefined
): string[] => {
  const firstIndex = new Map<string, number>();
  fieldIdsInOrder.forEach((id, index) => {
    const name = nameById(id);
    if (name !== undefined && !firstIndex.has(name)) {
      firstIndex.set(name, index);
    }
  });
  const unique = Array.from(new Set(names));
  return unique
    .map((name, index) => ({
      name,
      key: firstIndex.get(name) ?? fieldIdsInOrder.length + index,
    }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.name);
};

/**
 * Where the signer is, as a position in `order`: a name in the list (its
 * index), or a number. A whole number is that entry; a fraction (from
 * {@link guidedAnchor}) sits between two entries, e.g. 1.5 is an optional
 * field between the second and third required ones. Null: nowhere yet.
 */
export type GuidedAt = string | number | null;

const toIndex = (order: string[], at: GuidedAt): number | null => {
  if (at === null) return null;
  if (typeof at === "number") return at;
  const index = order.indexOf(at);
  return index >= 0 ? index : null;
};

/**
 * The signer's place in `order`. On a required field it is that field's
 * index. On any other field (an optional one) it is the gap between the
 * required fields placed before and after it in the document, so Next and
 * Previous carry on from there instead of restarting at the top.
 */
export const guidedAnchor = (
  order: string[],
  currentFieldId: string | null,
  fieldIdsInOrder: string[],
  nameById: (fieldId: string) => string | undefined,
  /** Precomputed {@link documentPositions} for `fieldIdsInOrder`, so a
   * caller that renders often doesn't rebuild them each time. */
  positions: DocumentPositions = documentPositions(fieldIdsInOrder, nameById)
): number | null => {
  if (!currentFieldId) return null;
  const name = nameById(currentFieldId);
  if (name !== undefined) {
    const index = order.indexOf(name);
    if (index >= 0) return index;
  }
  const at = positions.indexById.get(currentFieldId);
  if (at === undefined) return null;
  const before = order.filter(
    (n) => (positions.firstIndexByName.get(n) ?? Number.POSITIVE_INFINITY) < at
  ).length;
  return before - 0.5;
};

export interface DocumentPositions {
  /** Each field id's index in the reading order. */
  indexById: Map<string, number>;
  /** Where each name first appears in the reading order. */
  firstIndexByName: Map<string, number>;
}

/** Reading-order lookups for {@link guidedAnchor}. */
export const documentPositions = (
  fieldIdsInOrder: string[],
  nameById: (fieldId: string) => string | undefined
): DocumentPositions => {
  const indexById = new Map<string, number>();
  const firstIndexByName = new Map<string, number>();
  fieldIdsInOrder.forEach((id, index) => {
    indexById.set(id, index);
    const name = nameById(id);
    if (name !== undefined && !firstIndexByName.has(name)) {
      firstIndexByName.set(name, index);
    }
  });
  return { indexById, firstIndexByName };
};

/**
 * The next incomplete name after `at` in `order`, wrapping round to the
 * start; null when every name is complete. With no position (or a name
 * outside the list) it is the first incomplete name.
 */
export const nextIncompleteName = (
  order: string[],
  at: GuidedAt,
  isComplete: (name: string) => boolean
): string | null => {
  if (order.length === 0) return null;
  const index = toIndex(order, at);
  const start = index === null ? 0 : Math.floor(index) + 1;
  for (let step = 0; step < order.length; step++) {
    const name = order[(start + step) % order.length];
    if (!isComplete(name)) return name;
  }
  return null;
};

/** The name before `at` in `order` (complete or not), or null at the start
 * or with no position. */
export const previousName = (order: string[], at: GuidedAt): string | null => {
  const index = toIndex(order, at);
  if (index === null) return null;
  const previous = Math.ceil(index) - 1;
  return previous >= 0 ? order[previous] : null;
};

/** 1-based position shown as "Field {i} of {total}": the current field when
 * it is in the list, else the stop Next would go to, so the counter never
 * moves backwards on the first tap. With every name complete it is the
 * last one. */
export const guidedPosition = (
  order: string[],
  at: GuidedAt,
  isComplete: (name: string) => boolean
): number => {
  if (order.length === 0) return 0;
  const index = toIndex(order, at);
  if (index !== null && Number.isInteger(index)) return index + 1;
  const next = nextIncompleteName(order, index, isComplete);
  return next ? order.indexOf(next) + 1 : order.length;
};
