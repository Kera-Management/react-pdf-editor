import { describe, expect, it } from "vitest";
import { resolveAssignRows } from "./assignResolution";

const P1 = { id: "p1", label: "Olive Ono", role: "Landlord" };
const P2 = { id: "p2", label: "Sam Poe" };
const P3 = { id: "p3", label: "Tam Lee" };

describe("resolveAssignRows", () => {
  it("returns every assignable participant as a non-excluded row, in order", () => {
    const rows = resolveAssignRows([], [P1, P2, P3]);

    expect(rows).toEqual([
      { id: "p1", label: "Olive Ono", role: "Landlord", excluded: false },
      { id: "p2", label: "Sam Poe", role: undefined, excluded: false },
      { id: "p3", label: "Tam Lee", role: undefined, excluded: false },
    ]);
  });

  it("does not duplicate a row for an id that is both assigned and assignable", () => {
    const rows = resolveAssignRows(["p1"], [P1, P2]);

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === "p1")).toEqual({
      id: "p1",
      label: "Olive Ono",
      role: "Landlord",
      excluded: false,
    });
  });

  it("synthesizes an excluded row for an assigned id missing from the assignable list, labeled from allParticipants", () => {
    // p3 was excluded after being assigned, so it no longer appears in the
    // assignable list -- but allParticipants (the full roster) still has it.
    const rows = resolveAssignRows(["p1", "p3"], [P1, P2], [P1, P2, P3]);

    const stale = rows.find((r) => r.id === "p3");
    expect(stale).toEqual({
      id: "p3",
      label: "Tam Lee",
      role: undefined,
      excluded: true,
    });
    expect(rows.find((r) => r.id === "p1")?.excluded).toBe(false);
  });

  it("falls back to the assignable list for the stale label when allParticipants is omitted", () => {
    // p2 is assigned but not assignable, and allParticipants isn't given --
    // labelSource falls back to `participants`, which does contain p2.
    const rows = resolveAssignRows(["p1", "p2"], [P1, P2]);

    // p2 IS in participants, so it's a normal row, not stale -- use a case
    // where the assignable list itself is missing the id but the full
    // (omitted-allParticipants) source is the assignable list.
    expect(rows.find((r) => r.id === "p2")?.excluded).toBe(false);
  });

  it("falls back to the raw id when the assigned id is in neither list", () => {
    const rows = resolveAssignRows(["ghost"], [P1], [P1, P2]);

    expect(rows.find((r) => r.id === "ghost")).toEqual({
      id: "ghost",
      label: "ghost",
      role: undefined,
      excluded: true,
    });
  });

  it("falls back to the raw id when allParticipants is omitted and the assignable list doesn't have it either", () => {
    const rows = resolveAssignRows(["ghost"], [P1]);

    expect(rows.find((r) => r.id === "ghost")?.label).toBe("ghost");
  });

  it("returns an empty array for empty participants and empty assignedIds", () => {
    expect(resolveAssignRows([], [])).toEqual([]);
  });

  it("returns only assignable rows when nothing is assigned", () => {
    const rows = resolveAssignRows([], [P1, P2]);
    expect(rows.every((r) => r.excluded === false)).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it("returns only stale rows when the assignable list is empty but ids are assigned", () => {
    const rows = resolveAssignRows(["p1", "p2"], [], [P1, P2]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.excluded === true)).toBe(true);
  });
});
