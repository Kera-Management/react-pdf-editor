import { describe, expect, it, vi } from "vitest";

import { renderHook, act } from "@testing-library/react";

import { useFieldValues } from "./hooks/useFieldValues";

/**
 * Provenance contract behind the Prepare-save seed guard: a seeded value is
 * recognizable until the user touches that field, at which point it becomes
 * the session's own content.
 */
describe("useFieldValues seed provenance", () => {
  it("flags an untouched seed and un-flags it after a user edit", () => {
    const { result } = renderHook(() => useFieldValues());
    act(() => {
      result.current.seed({ f1: "Olive Ono", f2: "2026-08-25" });
    });
    expect(result.current.isSeededValue("f1", "Olive Ono")).toBe(true);
    expect(result.current.isSeededValue("f2", "2026-08-25")).toBe(true);

    act(() => {
      result.current.setValue("f1", "edited");
    });
    expect(result.current.isSeededValue("f1", "edited")).toBe(false);
    // Even reverting to the identical string counts as user content now.
    act(() => {
      result.current.setValue("f1", "Olive Ono");
    });
    expect(result.current.isSeededValue("f1", "Olive Ono")).toBe(false);
  });

  it("radio-style group edits clear provenance for every id", () => {
    const { result } = renderHook(() => useFieldValues());
    act(() => {
      result.current.seed({ r1: "On", r2: "On" });
      result.current.setValueForIds(["r1", "r2"], "Off");
    });
    expect(result.current.isSeededValue("r1", "Off")).toBe(false);
    expect(result.current.isSeededValue("r2", "Off")).toBe(false);
  });

  it("reset clears provenance so a new document starts clean", () => {
    const { result } = renderHook(() => useFieldValues());
    act(() => {
      result.current.seed({ f1: "x" });
      result.current.reset();
      result.current.seed({ f1: "y" });
    });
    expect(result.current.isSeededValue("f1", "y")).toBe(true);
    expect(result.current.isSeededValue("f1", "x")).toBe(false);
  });
});

// Silence unused-import lint if vi is unneeded in future edits.
void vi;
