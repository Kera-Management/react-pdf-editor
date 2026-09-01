import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { usePartiesState } from "./usePartiesState";
import { PartiesConfig, PartyRole } from "./types";

/**
 * Fixture roster mirrors the old SigningRecipientsPanel test fixtures
 * (manager/owner/tenant1/tenant2), but the library knows nothing about
 * "owner" or "manager" -- those are plain ids here, and the landlord-first
 * repartitioning they used to trigger is driven entirely through
 * `onRoleChange`, exactly as a host like Kera would wire it.
 */
const MANAGER = "manager-uid";
const OWNER = "olive@kera.com";
const TENANT_1 = "tam@kera.com";
const TENANT_2 = "sam@kera.com";
const ALL_IDS = [MANAGER, TENANT_1, TENANT_2, OWNER];

/** Default seed: manager + tenants sign in parallel, owner is undecided -- the old panel's starting state. */
const defaultInitial = () => ({
  roles: {
    [MANAGER]: "signer" as PartyRole,
    [TENANT_1]: "signer" as PartyRole,
    [TENANT_2]: "signer" as PartyRole,
    [OWNER]: undefined,
  },
  order: [MANAGER, TENANT_1, TENANT_2],
  // No owner signing -- everyone lands in step 0, fully parallel (today's
  // default): each row after the first is grouped with the one above it.
  groupedWithPrevious: {
    [MANAGER]: false,
    [TENANT_1]: true,
    [TENANT_2]: true,
  },
});

/**
 * Reproduces the old hook's "owner switched to Signs re-partitions the
 * whole signer set, landlord side first" rule via `onRoleChange`, the way
 * Kera's adapter is expected to. Landlord side = manager + owner ids.
 */
const landlordFirstOnRoleChange: PartiesConfig["onRoleChange"] = ({
  partyId,
  previous,
  next,
  roles,
}) => {
  const isOwner = partyId === OWNER;
  if (next !== "signer" || previous === "signer" || !isOwner) {
    return null;
  }
  const signerIds = ALL_IDS.filter((id) => roles[id] === "signer");
  const landlordSide: string[] = signerIds.filter(
    (id) => id === MANAGER || id === OWNER
  );
  const tenantSide = signerIds.filter((id) => id !== MANAGER && id !== OWNER);
  const order = [...landlordSide, ...tenantSide];
  const groupedWithPrevious: Record<string, boolean> = {};
  order.forEach((id, i) => {
    const side = landlordSide.includes(id) ? "landlord" : "tenant";
    const prevSide =
      i > 0
        ? landlordSide.includes(order[i - 1])
          ? "landlord"
          : "tenant"
        : null;
    groupedWithPrevious[id] = i > 0 && side === prevSide;
  });
  return { order, groupedWithPrevious };
};

const buildConfig = (
  overrides: Partial<PartiesConfig> = {}
): { config: PartiesConfig; onSelectionChange: ReturnType<typeof vi.fn> } => {
  const onSelectionChange = vi.fn();
  const config: PartiesConfig = {
    seedKey: "lease-1",
    initial: defaultInitial(),
    onSelectionChange,
    ...overrides,
  };
  return { config, onSelectionChange };
};

describe("usePartiesState", () => {
  it("seeds roles/order/grouping from config.initial and reports the initial selection", () => {
    const { config, onSelectionChange } = buildConfig();
    const { result } = renderHook(() => usePartiesState(config, ALL_IDS));

    expect(result.current.orderedSigners.map((s) => s.id)).toEqual([
      MANAGER,
      TENANT_1,
      TENANT_2,
    ]);
    expect(result.current.selection.hasSigner).toBe(true);
    expect(
      new Set(result.current.orderedSigners.map((s) => s.step))
    ).toEqual(new Set([0]));
    expect(result.current.viewers).toEqual([]);

    expect(onSelectionChange).toHaveBeenCalled();
    const lastCall =
      onSelectionChange.mock.calls[onSelectionChange.mock.calls.length - 1][0];
    expect(lastCall.hasSigner).toBe(true);
  });

  it("keeps an undecided party out of BOTH the signer list and the viewer list -- distinct from a deliberate exclusion", () => {
    const { config } = buildConfig();
    const { result } = renderHook(() => usePartiesState(config, ALL_IDS));

    expect(result.current.orderedSigners.map((s) => s.id)).not.toContain(
      OWNER
    );
    expect(result.current.viewers).not.toContain(OWNER);
    expect(result.current.undecided).toContain(OWNER);
    expect(result.current.selection.parties.map((p) => p.id)).not.toContain(
      OWNER
    );
    expect(result.current.selection.isComplete).toBe(false);
  });

  it("does not repartition on its own -- appends a newly-signing party to the end by default", () => {
    const { config } = buildConfig();
    const { result } = renderHook(() => usePartiesState(config, ALL_IDS));

    act(() => {
      result.current.setRole(OWNER, "signer");
    });

    expect(result.current.orderedSigners.map((s) => s.id)).toEqual([
      MANAGER,
      TENANT_1,
      TENANT_2,
      OWNER,
    ]);
  });

  it("repartitions via onRoleChange -- host-driven landlord-first ordering the moment an owner is switched to Signs", () => {
    const { config } = buildConfig({ onRoleChange: landlordFirstOnRoleChange });
    const { result } = renderHook(() => usePartiesState(config, ALL_IDS));

    act(() => {
      result.current.setRole(OWNER, "signer");
    });

    const stepFor = (id: string) =>
      result.current.orderedSigners.find((s) => s.id === id)?.step;

    expect(stepFor(MANAGER)).toBe(0);
    expect(stepFor(OWNER)).toBe(0);
    expect(stepFor(TENANT_1)).toBe(1);
    expect(stepFor(TENANT_2)).toBe(1);
    expect(result.current.selection.isComplete).toBe(true);
  });

  it("removing the only signers leaves hasSigner/isComplete false", () => {
    const { config } = buildConfig();
    const { result } = renderHook(() => usePartiesState(config, ALL_IDS));

    act(() => {
      result.current.setRole(MANAGER, "excluded");
      result.current.setRole(TENANT_1, "excluded");
      result.current.setRole(TENANT_2, "excluded");
    });

    expect(result.current.selection.hasSigner).toBe(false);
    expect(result.current.selection.isComplete).toBe(false);
  });

  it("moves a switched-away signer out of the ordered list and into viewers, reported via selection.parties", () => {
    const { config } = buildConfig();
    const { result } = renderHook(() => usePartiesState(config, ALL_IDS));

    act(() => {
      result.current.setRole(TENANT_1, "viewer");
    });

    expect(result.current.orderedSigners.map((s) => s.id)).not.toContain(
      TENANT_1
    );
    expect(result.current.viewers).toContain(TENANT_1);
    expect(
      result.current.selection.parties.find((p) => p.id === TENANT_1)?.role
    ).toBe("viewer");
  });

  it("reorders signers by swapping the active id into the target's slot", () => {
    const { config } = buildConfig();
    const { result } = renderHook(() => usePartiesState(config, ALL_IDS));

    act(() => {
      result.current.reorder(MANAGER, TENANT_2);
    });

    expect(result.current.orderedSigners.map((s) => s.id)).toEqual([
      TENANT_1,
      TENANT_2,
      MANAGER,
    ]);
  });

  it("un-groups a moved row from whatever was above it at its old position", () => {
    const { config } = buildConfig({
      initial: {
        roles: {
          [MANAGER]: "signer",
          [TENANT_1]: "signer",
          [TENANT_2]: "signer",
        },
        order: [MANAGER, TENANT_1, TENANT_2],
        groupedWithPrevious: { [TENANT_1]: true, [TENANT_2]: false },
      },
    });
    const { result } = renderHook(() =>
      usePartiesState(config, [MANAGER, TENANT_1, TENANT_2])
    );

    act(() => {
      result.current.reorder(TENANT_1, TENANT_2);
    });

    // TENANT_1 moved and is no longer grouped with whatever now precedes it.
    const stepFor = (id: string) =>
      result.current.orderedSigners.find((s) => s.id === id)?.step;
    expect(stepFor(MANAGER)).toBe(0);
    expect(stepFor(TENANT_2)).toBe(1);
    expect(stepFor(TENANT_1)).toBe(2);
  });

  it("toggleGroupedWithPrevious flips a row to share the previous row's step, and back", () => {
    const { config } = buildConfig({
      initial: {
        roles: {
          [MANAGER]: "signer",
          [TENANT_1]: "signer",
          [TENANT_2]: "signer",
        },
        order: [MANAGER, TENANT_1, TENANT_2],
        groupedWithPrevious: {
          [MANAGER]: false,
          [TENANT_1]: false,
          [TENANT_2]: false,
        },
      },
    });
    const { result } = renderHook(() =>
      usePartiesState(config, [MANAGER, TENANT_1, TENANT_2])
    );

    act(() => {
      result.current.toggleGroupedWithPrevious(TENANT_1);
    });
    let stepFor = (id: string) =>
      result.current.orderedSigners.find((s) => s.id === id)?.step;
    expect(stepFor(MANAGER)).toBe(0);
    expect(stepFor(TENANT_1)).toBe(0);
    expect(stepFor(TENANT_2)).toBe(1);

    act(() => {
      result.current.toggleGroupedWithPrevious(TENANT_1);
    });
    stepFor = (id: string) =>
      result.current.orderedSigners.find((s) => s.id === id)?.step;
    expect(stepFor(TENANT_1)).toBe(1);
    expect(stepFor(TENANT_2)).toBe(2);
  });

  it("re-seeds roles/order/grouping when seedKey changes", () => {
    const { config } = buildConfig();
    const { result, rerender } = renderHook(
      (props: PartiesConfig) => usePartiesState(props, ALL_IDS),
      { initialProps: config }
    );

    act(() => {
      result.current.setRole(OWNER, "viewer");
    });
    expect(result.current.viewers).toContain(OWNER);

    // Same seedKey -- a re-render (e.g. from a background refetch handing
    // back a new `initial` object) must NOT stomp the manager's choice.
    rerender({ ...config, initial: defaultInitial() });
    expect(result.current.viewers).toContain(OWNER);

    // A genuinely new seedKey re-seeds from scratch.
    rerender({ ...config, seedKey: "lease-2", initial: defaultInitial() });
    expect(result.current.viewers).not.toContain(OWNER);
    expect(result.current.undecided).toContain(OWNER);
  });

  it("does not fire onSelectionChange when setRole is a no-op (role unchanged)", () => {
    const { config, onSelectionChange } = buildConfig();
    const { result } = renderHook(() => usePartiesState(config, ALL_IDS));

    onSelectionChange.mockClear();
    act(() => {
      result.current.setRole(MANAGER, "signer");
    });

    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  describe("expiry", () => {
    it("omits expiryDays entirely when config.expiry is not set", () => {
      const { config } = buildConfig();
      const { result } = renderHook(() => usePartiesState(config, ALL_IDS));

      expect(result.current.selection.expiryDays).toBeUndefined();
      expect("expiryDays" in result.current.selection).toBe(false);
    });

    it("pre-fills defaultDays when config.expiry is set, visible with no toggle needed", () => {
      const { config } = buildConfig({ expiry: { defaultDays: 30 } });
      const { result } = renderHook(() => usePartiesState(config, ALL_IDS));

      expect(result.current.selection.expiryDays).toBe(30);
    });

    it("lets the host edit the day count per send via setExpiryDays", () => {
      const { config } = buildConfig({ expiry: { defaultDays: 30 } });
      const { result } = renderHook(() => usePartiesState(config, ALL_IDS));

      act(() => {
        result.current.setExpiryDays(7);
      });

      expect(result.current.selection.expiryDays).toBe(7);
    });

    it("clears to null to mean no expiry, rather than reverting to the default", () => {
      const { config } = buildConfig({ expiry: { defaultDays: 30 } });
      const { result } = renderHook(() => usePartiesState(config, ALL_IDS));

      act(() => {
        result.current.setExpiryDays(null);
      });

      expect(result.current.selection.expiryDays).toBeNull();
    });
  });
});

describe("usePartiesState joinStepOf", () => {
  it("moves the row next to the target and shares its step", () => {
    const { config } = buildConfig({
      initial: {
        roles: {
          [MANAGER]: "signer",
          [TENANT_1]: "signer",
          [TENANT_2]: "signer",
        },
        order: [MANAGER, TENANT_1, TENANT_2],
        groupedWithPrevious: {},
      },
    });
    const { result } = renderHook(() => usePartiesState(config, ALL_IDS));

    act(() => {
      result.current.joinStepOf(TENANT_2, MANAGER);
    });

    expect(result.current.orderedSigners).toEqual([
      { id: MANAGER, step: 0 },
      { id: TENANT_2, step: 0 },
      { id: TENANT_1, step: 1 },
    ]);
  });

  it("joins an existing group without breaking it apart", () => {
    const { config } = buildConfig({
      initial: {
        roles: {
          [MANAGER]: "signer",
          [TENANT_1]: "signer",
          [TENANT_2]: "signer",
        },
        // Tenants already share a step; the manager drops onto TENANT_1.
        order: [MANAGER, TENANT_1, TENANT_2],
        groupedWithPrevious: { [TENANT_2]: true },
      },
    });
    const { result } = renderHook(() => usePartiesState(config, ALL_IDS));

    act(() => {
      result.current.joinStepOf(MANAGER, TENANT_1);
    });

    // All three now sign at the same time.
    expect(result.current.orderedSigners.map((s) => s.step)).toEqual([0, 0, 0]);
  });

  it("ignores a join onto itself or onto an id that is not a signer", () => {
    const { config } = buildConfig();
    const { result } = renderHook(() => usePartiesState(config, ALL_IDS));
    const before = result.current.orderedSigners;

    act(() => {
      result.current.joinStepOf(MANAGER, MANAGER);
      result.current.joinStepOf(MANAGER, OWNER);
    });

    expect(result.current.orderedSigners).toEqual(before);
  });
});

describe("usePartiesState per-person step toggle", () => {
  it("moves ONLY the toggled row out of a group, placing it after its former step-mates", () => {
    const { config } = buildConfig({
      initial: {
        roles: {
          [MANAGER]: "signer",
          [TENANT_1]: "signer",
          [TENANT_2]: "signer",
        },
        // All three sign together; TENANT_1 is the MIDDLE member.
        order: [MANAGER, TENANT_1, TENANT_2],
        groupedWithPrevious: { [TENANT_1]: true, [TENANT_2]: true },
      },
    });
    const { result } = renderHook(() => usePartiesState(config, ALL_IDS));

    act(() => {
      result.current.toggleGroupedWithPrevious(TENANT_1);
    });

    // The remaining pair stays together; the leaver signs after BOTH of
    // them, exactly as the "Sign after {step-mates}" button promises. The
    // old chain-flip dragged TENANT_2 out along with TENANT_1.
    expect(result.current.orderedSigners).toEqual([
      { id: MANAGER, step: 0 },
      { id: TENANT_2, step: 0 },
      { id: TENANT_1, step: 1 },
    ]);
  });

  it("joins the step above ALONE when the toggled row heads its own group", () => {
    const { config } = buildConfig({
      initial: {
        roles: {
          [MANAGER]: "signer",
          [TENANT_1]: "signer",
          [TENANT_2]: "signer",
        },
        // Manager first, then the two tenants together; TENANT_1 heads the
        // tenant group.
        order: [MANAGER, TENANT_1, TENANT_2],
        groupedWithPrevious: { [TENANT_2]: true },
      },
    });
    const { result } = renderHook(() => usePartiesState(config, ALL_IDS));

    act(() => {
      result.current.toggleGroupedWithPrevious(TENANT_1);
    });

    // TENANT_1 joins the manager; TENANT_2 stays put as their own step
    // instead of being silently merged upward too.
    expect(result.current.orderedSigners).toEqual([
      { id: MANAGER, step: 0 },
      { id: TENANT_1, step: 0 },
      { id: TENANT_2, step: 1 },
    ]);
  });

  it("dragging a group head away leaves the remainder where it was", () => {
    const { config } = buildConfig({
      initial: {
        roles: {
          [MANAGER]: "signer",
          [TENANT_1]: "signer",
          [TENANT_2]: "signer",
        },
        order: [MANAGER, TENANT_1, TENANT_2],
        groupedWithPrevious: { [TENANT_2]: true },
      },
    });
    const { result } = renderHook(() => usePartiesState(config, ALL_IDS));

    act(() => {
      result.current.reorder(TENANT_1, TENANT_2);
    });

    // TENANT_2 must NOT re-chain into the manager's step just because its
    // group head moved.
    expect(result.current.orderedSigners).toEqual([
      { id: MANAGER, step: 0 },
      { id: TENANT_2, step: 1 },
      { id: TENANT_1, step: 2 },
    ]);
  });
});
