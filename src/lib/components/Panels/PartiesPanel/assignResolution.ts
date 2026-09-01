/**
 * Canonical "assign to" row resolution -- extracted from PropertiesPanel's
 * Assign-to fieldset so any other host embedding an assign control (e.g.
 * PartiesPanel's selection-aware assign mode) gets identical semantics
 * instead of a re-derived copy.
 */

export interface AssignParticipant {
  id: string;
  label: string;
  /** Optional display tag, e.g. a role or relationship. Carried through to the row untouched. */
  role?: string;
}

export interface AssignRow {
  id: string;
  label: string;
  role?: string;
  /**
   * `true` when this id is assigned but has fallen out of the ASSIGNABLE
   * list (e.g. the party was excluded, or otherwise removed, after being
   * assigned). The row still renders so the assignment stays visible.
   */
  excluded: boolean;
}

/**
 * Resolves the rows an assign-to UI should render for a field.
 *
 * Every participant in the ASSIGNABLE list (`participants`) gets a row with
 * `excluded: false`. Any id already in `assignedIds` that is NOT in that
 * list still gets a row -- flagged `excluded: true` -- so the assignment
 * stays visible instead of silently disappearing. That stale row's label is
 * resolved from `allParticipants` (the FULL, unfiltered roster) when given,
 * falling back to `participants` when `allParticipants` is omitted, and
 * finally to the raw id when the id isn't found in either list (matching
 * PropertiesPanel's `?? id` fallback exactly).
 */
export function resolveAssignRows(
  assignedIds: string[],
  participants: AssignParticipant[],
  allParticipants?: AssignParticipant[]
): AssignRow[] {
  const labelSource = allParticipants ?? participants;
  const staleAssignedRows: AssignRow[] = assignedIds
    .filter((id) => !participants.some((p) => p.id === id))
    .map((id) => ({
      id,
      label: labelSource.find((p) => p.id === id)?.label ?? id,
      role: undefined,
      excluded: true,
    }));

  return [
    ...participants.map((p) => ({
      id: p.id,
      label: p.label,
      role: p.role,
      excluded: false,
    })),
    ...staleAssignedRows,
  ];
}
