/**
 * Pure participant-id/assignment-map helpers, deliberately split out of
 * `participantCompletion.ts` into their own dependency-free module.
 * `participantCompletion.ts` imports `pdfjs-dist` at the top level, which
 * reads `DOMMatrix` at module-evaluation time -- fine for the editor itself
 * and for tests that set up that polyfill first (see
 * `participantCompletion.test.ts`), but fatal for a lightweight UI
 * component like `ProgressPanel` rendered under plain jsdom with no such
 * setup. Keeping these functions here lets `ProgressPanel` use the same
 * matching/precedence logic as the rest of the library without dragging
 * pdfjs-dist into its module graph.
 *
 * `participantCompletion.ts` re-exports all three of these, so existing
 * imports from `"./participantCompletion"` are unaffected.
 */

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

/**
 * Resolves the ONE `fieldAssignments` map every "whose field is this" check
 * should use, whether that check is the interactivity gate, the progress
 * counter, or completion math. Before this existed, each of those sites
 * re-derived the same host-vs-embedded fallback by hand, and they drifted:
 * the interactivity gate was changed to prefer the host's `fieldAssignments`
 * prop over the PDF's embedded metadata (a host passing the prop is
 * asserting live source-of-truth data, e.g. a signing request's
 * field->recipient pairs, which can supersede stale or differently-keyed
 * metadata baked into the PDF), but the progress panel's wiring kept
 * preferring embedded metadata -- so a field the gate correctly unlocked
 * could still be reported as someone else's by the counter.
 *
 * The host map wins whenever it is non-empty. Embedded metadata is the
 * fallback for hosts that pass nothing, which is how documents built in
 * this library's own Prepare mode work (they only ever carry embedded
 * metadata).
 */
export const resolveEffectiveFieldAssignments = (
  hostAssignments: Record<string, string[]> | undefined,
  embeddedAssignments: Record<string, string[]>
): Record<string, string[]> =>
  hostAssignments && Object.keys(hostAssignments).length > 0
    ? hostAssignments
    : embeddedAssignments;
