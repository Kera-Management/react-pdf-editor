import { useEffect, useMemo, useRef, useState } from "react";

import { PartiesConfig, PartiesSelection, PartyRole } from "./types";

/** Moves the item at `from` to occupy `to`'s slot, shifting the rest. No dnd dependency. */
const arrayMove = <T>(arr: T[], from: number, to: number): T[] => {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

/** Steps from position + "grouped with the row before me" flags, in one pass. */
const deriveSteps = (
  orderIds: string[],
  groupedWithPrevious: Record<string, boolean>
): number[] => {
  const steps: number[] = [];
  orderIds.forEach((id, i) => {
    if (i === 0) {
      steps.push(0);
      return;
    }
    steps.push(groupedWithPrevious[id] ? steps[i - 1] : steps[i - 1] + 1);
  });
  return steps;
};

const expiryFor = (config: PartiesConfig): number | null =>
  config.expiry ? config.expiry.defaultDays : null;

export interface UsePartiesStateResult {
  /** A party's current role. `undefined` = undecided. */
  roleFor: (partyId: string) => PartyRole | undefined;
  setRole: (partyId: string, next: PartyRole | undefined) => void;
  reorder: (activeId: string, overId: string) => void;
  joinStepOf: (activeId: string, targetId: string) => void;
  toggleGroupedWithPrevious: (partyId: string) => void;
  groupAll: () => void;
  sequenceAll: () => void;
  setExpiryDays: (days: number | null) => void;
  /** Signers in on-screen order, annotated with the routing step they share. */
  orderedSigners: { id: string; step: number }[];
  /** Party ids currently set to viewer. */
  viewers: string[];
  /** Party ids with no decision yet. */
  undecided: string[];
  selection: PartiesSelection;
}

/**
 * Owns the roles/order/grouping/expiry state behind a parties panel: pure
 * interaction logic, no rendering. Seeded from `config.initial` on mount and
 * re-seeded whenever `config.seedKey` changes. Role changes go through
 * `config.onRoleChange` when provided (falling back to the library default:
 * append a new signer, drop a former one); every resulting change is reported
 * to `config.onSelectionChange`.
 */
export const usePartiesState = (
  config: PartiesConfig,
  partyIds: string[]
): UsePartiesStateResult => {
  const [roles, setRoles] = useState<Record<string, PartyRole | undefined>>(
    () => ({ ...config.initial.roles })
  );
  const [order, setOrder] = useState<string[]>(() => [...config.initial.order]);
  const [groupedWithPrevious, setGroupedWithPrevious] = useState<
    Record<string, boolean>
  >(() => ({ ...config.initial.groupedWithPrevious }));
  const [expiryDays, setExpiryDaysState] = useState<number | null>(() =>
    expiryFor(config)
  );
  // Guards the seed below from re-running every render; only a genuinely new
  // seedKey (a new roster, per the contract) should reset the user's choices.
  const [seededKey, setSeededKey] = useState(config.seedKey);

  useEffect(() => {
    if (config.seedKey === seededKey) {
      return;
    }
    setRoles({ ...config.initial.roles });
    setOrder([...config.initial.order]);
    setGroupedWithPrevious({ ...config.initial.groupedWithPrevious });
    setExpiryDaysState(expiryFor(config));
    setSeededKey(config.seedKey);
    // Keying this on seedKey (not config.initial's contents) is what makes
    // this run exactly once per new roster instead of once per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.seedKey, seededKey]);

  const roleFor = (partyId: string): PartyRole | undefined =>
    partyId in roles ? roles[partyId] : undefined;

  const setRole = (partyId: string, next: PartyRole | undefined) => {
    const previous = roleFor(partyId);
    if (previous === next) {
      return;
    }
    const nextRoles = { ...roles, [partyId]: next };
    setRoles(nextRoles);

    const replacement = config.onRoleChange?.({
      partyId,
      previous,
      next,
      roles: nextRoles,
    });
    if (replacement) {
      setOrder(replacement.order);
      setGroupedWithPrevious(replacement.groupedWithPrevious);
      return;
    }

    if (next === "signer" && previous !== "signer") {
      setOrder((prev) => [...prev, partyId]);
      setGroupedWithPrevious((prev) => ({ ...prev, [partyId]: false }));
    } else if (previous === "signer" && next !== "signer") {
      setOrder((prev) => prev.filter((id) => id !== partyId));
      setGroupedWithPrevious((prev) => {
        const without = { ...prev };
        delete without[partyId];
        return without;
      });
    }
  };

  /**
   * Grouping is a CHAIN ("grouped with the row before me"), so when a row
   * leaves its slot the row after it silently re-chains to whatever is above.
   * If the leaver was its group's head, that would merge its former
   * step-mates into the step above -- people the user never touched changing
   * steps. Promote the follower to group head instead, so the remainder
   * stays exactly where it was.
   */
  const repairFollowerFlags = (
    currentOrder: string[],
    flags: Record<string, boolean>,
    leavingId: string
  ): Record<string, boolean> => {
    const index = currentOrder.indexOf(leavingId);
    const follower = currentOrder[index + 1];
    if (follower !== undefined && flags[follower] && !flags[leavingId]) {
      return { ...flags, [follower]: false };
    }
    return flags;
  };

  const reorder = (activeId: string, overId: string) => {
    if (activeId === overId) {
      return;
    }
    const oldIndex = order.indexOf(activeId);
    const newIndex = order.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    const repaired = repairFollowerFlags(order, groupedWithPrevious, activeId);
    setOrder(arrayMove(order, oldIndex, newIndex));
    // A row that moved no longer has a well-defined "row above" -- start it
    // as its own step at the new position; the host can re-group by hand.
    setGroupedWithPrevious({ ...repaired, [activeId]: false });
  };

  /**
   * Puts `activeId` in the same step as `targetId` -- the "drop onto a
   * person to sign together" gesture. Repositions the row directly after the
   * target with the grouped flag set, which by chain semantics shares the
   * target's step wherever that step sits, without disturbing any group the
   * target already belongs to.
   */
  const joinStepOf = (activeId: string, targetId: string) => {
    // Both must be current signers; checked up front so the grouped flag
    // below can never be set without the move actually happening.
    if (
      activeId === targetId ||
      !order.includes(activeId) ||
      !order.includes(targetId)
    ) {
      return;
    }
    const repaired = repairFollowerFlags(order, groupedWithPrevious, activeId);
    const without = order.filter((id) => id !== activeId);
    const next = without.slice();
    next.splice(without.indexOf(targetId) + 1, 0, activeId);
    setOrder(next);
    setGroupedWithPrevious({ ...repaired, [activeId]: true });
  };

  /** One-click pole: everyone signs at the same time (a single step). */
  const groupAll = () => {
    setGroupedWithPrevious(() => {
      const next: Record<string, boolean> = {};
      order.forEach((id, i) => {
        if (i > 0) next[id] = true;
      });
      return next;
    });
  };

  /** One-click pole: strictly one after another (each signer their own step). */
  const sequenceAll = () => {
    setGroupedWithPrevious({});
  };

  /**
   * The per-row toggle, PER PERSON, matching its outcome copy exactly:
   *
   * - Grouped -> "Sign after {step-mates}": the row moves to its own step
   *   directly BELOW the group it left, and the group stays together (a
   *   naive flag flip made everyone below the toggled row leave with them).
   * - Own step -> "Sign at the same time as {step above}": the row joins the
   *   step above, alone (a naive flag flip merged the row's whole step into
   *   the one above, moving people the user never touched).
   */
  const toggleGroupedWithPrevious = (partyId: string) => {
    const index = order.indexOf(partyId);
    if (index <= 0) {
      return;
    }
    const steps = deriveSteps(order, groupedWithPrevious);
    const grouped = steps[index] === steps[index - 1];
    // When leaving: after the last of its current step-mates. When joining:
    // after the last member of the step above.
    const destinationStep = grouped ? steps[index] : steps[index - 1];
    const anchor = order.filter(
      (id, i) => steps[i] === destinationStep && id !== partyId
    ).pop();
    if (anchor === undefined) {
      return;
    }
    const repaired = repairFollowerFlags(order, groupedWithPrevious, partyId);
    const without = order.filter((id) => id !== partyId);
    const next = without.slice();
    next.splice(without.indexOf(anchor) + 1, 0, partyId);
    setOrder(next);
    setGroupedWithPrevious({ ...repaired, [partyId]: !grouped });
  };

  const setExpiryDays = (days: number | null) => {
    setExpiryDaysState(days);
  };

  // Hosts routinely rebuild the whole config object literal every render
  // (PDFEditor itself does, and so do its hosts). Nothing here may therefore
  // depend on config IDENTITY: callbacks are read through a ref at call time,
  // and the derived selection below is memoized on the underlying state so
  // its identity only changes when its content does. Getting either of these
  // wrong produced a real infinite render loop (report -> host setState ->
  // re-render -> fresh objects -> report...) caught in review.
  const onSelectionChangeRef = useRef(config.onSelectionChange);
  onSelectionChangeRef.current = config.onSelectionChange;

  const partyIdsKey = partyIds.join("\u0000");
  const hasExpiry = !!config.expiry;

  const { orderedSigners, viewers, undecided, selection } = useMemo(() => {
    const ids = partyIdsKey ? partyIdsKey.split("\u0000") : [];
    const currentRole = (partyId: string): PartyRole | undefined =>
      partyId in roles ? roles[partyId] : undefined;

    const validOrder = order.filter((id) => ids.includes(id));
    // A party the HOST dropped from `participants` (without bumping
    // seedKey) leaves the same way an in-panel removal does, so its chain
    // flags need the same repair: a follower marked "grouped with
    // previous" behind a departed group HEAD would otherwise silently
    // re-chain to whoever now sits above it, merging two people into one
    // signing step nobody asked to merge. Every in-hook mutation routes
    // through repairFollowerFlags for exactly this; derivation from props
    // must not be the one path that skips it.
    const departed = order.filter((id) => !ids.includes(id));
    const repairedFlags = departed.reduce(
      (flags, leavingId) => repairFollowerFlags(order, flags, leavingId),
      groupedWithPrevious
    );
    const steps = deriveSteps(validOrder, repairedFlags);
    const signers = validOrder.map((id, i) => ({ id, step: steps[i] }));

    const viewerIds = ids.filter((id) => currentRole(id) === "viewer");
    const undecidedIds = ids.filter((id) => currentRole(id) === undefined);
    const hasSigner = signers.length > 0;
    const isComplete = hasSigner && undecidedIds.length === 0;

    const signerStepById = new Map(signers.map((s) => [s.id, s.step]));
    const parties = ids
      .filter((id) => currentRole(id) !== undefined)
      .map((id) => {
        const role = currentRole(id) as PartyRole;
        return role === "signer"
          ? { id, role, step: signerStepById.get(id) ?? 0 }
          : { id, role };
      });

    const built: PartiesSelection = {
      parties,
      hasSigner,
      isComplete,
      ...(hasExpiry ? { expiryDays } : {}),
    };
    return {
      orderedSigners: signers,
      viewers: viewerIds,
      undecided: undecidedIds,
      selection: built,
    };
  }, [roles, order, groupedWithPrevious, expiryDays, partyIdsKey, hasExpiry]);

  useEffect(() => {
    // Fires once per real change in the derived selection (its identity is
    // memoized above), through a ref so host callback identity churn cannot
    // re-trigger it.
    onSelectionChangeRef.current(selection);
  }, [selection]);

  return {
    roleFor,
    setRole,
    reorder,
    joinStepOf,
    toggleGroupedWithPrevious,
    groupAll,
    sequenceAll,
    setExpiryDays,
    orderedSigners,
    viewers,
    undecided,
    selection,
  };
};
