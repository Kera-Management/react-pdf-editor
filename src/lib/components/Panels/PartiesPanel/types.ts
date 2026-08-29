import type { PDFEditorMode } from "../../../PDFEditor";
import type { AssignParticipant } from "./assignResolution";

/**
 * A party's decision. `undefined` (not a member of this union -- see
 * `PartiesInitial.roles`) means UNDECIDED: the host seeded no choice for
 * this party, and that blocks `isComplete` until it's resolved one way or
 * another. `"excluded"` is itself a decision -- the party is deliberately
 * left off -- distinct from never having been decided at all.
 */
export type PartyRole = "signer" | "viewer" | "excluded";

/** Seed data the panel's state is built from, and re-built from whenever `PartiesConfig.seedKey` changes. */
export type PartiesInitial = {
  /** Every party's starting role. A missing/`undefined` value is UNDECIDED. */
  roles: Record<string, PartyRole | undefined>;
  /** Signer ids only, in on-screen order. */
  order: string[];
  /** Signer id -> whether that row signs at the same time as the row above it. */
  groupedWithPrevious: Record<string, boolean>;
};

/**
 * Everything the panel currently has selected, already shaped for a host
 * to turn into whatever request payload it sends. Recomputed on every
 * change and handed up via `PartiesConfig.onSelectionChange`.
 */
export type PartiesSelection = {
  /** Every party with a decided role (signer, viewer, or excluded) -- undecided parties are left out entirely. `step` is 0-based and only present for signers. */
  parties: { id: string; role: PartyRole; step?: number }[];
  /** Whether at least one party is currently a signer. */
  hasSigner: boolean;
  /** `false` while any party is undecided OR no signer exists. */
  isComplete: boolean;
  /** Only present when `PartiesConfig.expiry` is set. `null` means the host explicitly cleared it (no expiry). */
  expiryDays?: number | null;
};

export type PartiesConfig = {
  /** Re-seed roles/order/grouping from `initial` whenever this changes. */
  seedKey: string;
  initial: PartiesInitial;
  onSelectionChange: (selection: PartiesSelection) => void;
  /**
   * Called after every role change with the roles record AFTER the change,
   * so a host can rewire the signer order around it (e.g. a policy that a
   * particular kind of party always signs first) without this library knowing what any of that
   * means. Returning `null`/`undefined`, or omitting this hook entirely,
   * falls back to the library default: a party newly becoming a signer is
   * appended to the end of `order`; a party leaving the signer role is
   * filtered out of `order` and `groupedWithPrevious`. A returned object
   * REPLACES `order` and `groupedWithPrevious` wholesale.
   */
  onRoleChange?: (args: {
    partyId: string;
    previous: PartyRole | undefined;
    next: PartyRole | undefined;
    roles: Record<string, PartyRole | undefined>;
  }) => { order: string[]; groupedWithPrevious: Record<string, boolean> } | null;
  /** Panel heading. Defaults to "Recipients". */
  title?: string;
  /** Editor modes the panel renders in. Defaults to ["build", "edit"] -- NEVER "view" by default. */
  modes?: PDFEditorMode[];
  /** Presence enables the native expiry input, pre-filled with `defaultDays`. */
  expiry?: { defaultDays: number };
};

/**
 * Turns the panel into a "who gets this field" picker: a banner names the
 * field being assigned, and every row in the signer/undecided/viewer
 * sections (plus any excluded party already assigned) grows a checkbox
 * wired to `onToggle`. Omitting this prop entirely (the default) renders
 * byte-identical to the panel with no assign mode at all.
 */
export type PartiesPanelAssignMode = {
  /** The field being assigned to. Not rendered directly -- carried through for host bookkeeping. */
  fieldId: string;
  /** Shown in the banner: "Assigning: {fieldLabel}". */
  fieldLabel: string;
  /** Participant ids currently assigned to this field. */
  assignedIds: string[];
  /** Called when a row's checkbox changes. */
  onToggle: (participantId: string, checked: boolean) => void;
  /**
   * Participants assignable to this field -- typically the roster minus
   * anyone currently excluded. Drives which rows in the signer/undecided/
   * viewer sections show as freshly-checkable.
   */
  participants: AssignParticipant[];
  /**
   * The FULL, unfiltered roster. Used only to resolve a display label for
   * an id already in `assignedIds` that no longer appears in `participants`
   * (e.g. a party was excluded after a field was assigned to them). Falls
   * back to `participants`, then to the raw id, when omitted or when the id
   * isn't found -- see `resolveAssignRows`.
   */
  allParticipants?: AssignParticipant[];
  /** Called when the host wants to leave assign mode (the banner's X). */
  onDeselect: () => void;
};
