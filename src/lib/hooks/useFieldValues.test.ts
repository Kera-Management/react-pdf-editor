import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useFieldValues } from "./useFieldValues";

describe("useFieldValues", () => {
  it("returns the fallback for an untouched field", () => {
    const { result } = renderHook(() => useFieldValues());
    expect(result.current.getValue("field_1")).toBe("");
    expect(result.current.getValue("field_1", "default text")).toBe(
      "default text"
    );
  });

  it("setValue updates only the targeted field id", () => {
    const { result } = renderHook(() => useFieldValues());

    act(() => {
      result.current.setValue("field_1", "hello");
    });

    expect(result.current.getValue("field_1")).toBe("hello");
    expect(result.current.getValue("field_2", "untouched")).toBe("untouched");
    expect(result.current.values).toEqual({ field_1: "hello" });
  });

  it("setValueForIds writes the same value to every id in the group (radio groups)", () => {
    const { result } = renderHook(() => useFieldValues());

    act(() => {
      result.current.setValueForIds(
        ["radio_opt_a", "radio_opt_b", "radio_opt_c"],
        "opt_b"
      );
    });

    expect(result.current.values).toEqual({
      radio_opt_a: "opt_b",
      radio_opt_b: "opt_b",
      radio_opt_c: "opt_b",
    });
  });

  it("reset clears every stored value", () => {
    const { result } = renderHook(() => useFieldValues());

    act(() => {
      result.current.setValue("field_1", "hello");
      result.current.setValue("field_2", "world");
    });
    expect(Object.keys(result.current.values)).toHaveLength(2);

    act(() => {
      result.current.reset();
    });

    expect(result.current.values).toEqual({});
    expect(result.current.getValue("field_1")).toBe("");
  });

  it("setValue is a no-op re-render guard: same value in returns the same map reference", () => {
    const { result } = renderHook(() => useFieldValues());

    act(() => {
      result.current.setValue("field_1", "hello");
    });
    const afterFirstSet = result.current.values;

    act(() => {
      result.current.setValue("field_1", "hello");
    });

    // Writing the identical value must not produce a new object -- this is
    // the same identity-stability discipline PDFEditor's renderPages relies
    // on: a value write should never look like a "something changed" event
    // to anything watching this map by reference.
    expect(result.current.values).toBe(afterFirstSet);
  });

  it("seed fills ids with no existing entry", () => {
    const { result } = renderHook(() => useFieldValues());

    act(() => {
      result.current.seed({ field_1: "hello", field_2: "world" });
    });

    expect(result.current.values).toEqual({
      field_1: "hello",
      field_2: "world",
    });
  });

  it("seed never overwrites an id that already has an entry", () => {
    const { result } = renderHook(() => useFieldValues());

    act(() => {
      result.current.setValue("field_1", "typed by user");
    });
    act(() => {
      result.current.seed({ field_1: "seeded value", field_2: "new field" });
    });

    expect(result.current.values).toEqual({
      field_1: "typed by user",
      field_2: "new field",
    });
  });

  it("seed is a no-op re-render guard: seeding only already-present ids returns the same map reference", () => {
    const { result } = renderHook(() => useFieldValues());

    act(() => {
      result.current.setValue("field_1", "hello");
    });
    const afterSet = result.current.values;

    act(() => {
      result.current.seed({ field_1: "would-be-clobber" });
    });

    expect(result.current.values).toBe(afterSet);
  });

  it("getValue/setValue identities stay stable across value-changing renders", () => {
    const { result } = renderHook(() => useFieldValues());
    const firstSetValue = result.current.setValue;
    const firstGetValue = result.current.getValue;
    const firstSetValueForIds = result.current.setValueForIds;
    const firstSeed = result.current.seed;
    const firstReset = result.current.reset;

    act(() => {
      result.current.setValue("field_1", "hello");
    });

    // setValue/setValueForIds/seed/reset never depend on `values`, so their
    // identities must survive every value change -- a consumer (e.g. a
    // memoized callback closing over them) should never need to re-derive.
    expect(result.current.setValue).toBe(firstSetValue);
    expect(result.current.setValueForIds).toBe(firstSetValueForIds);
    expect(result.current.seed).toBe(firstSeed);
    expect(result.current.reset).toBe(firstReset);
    // getValue DOES depend on `values` (it reads the current map), so its
    // identity is expected to change -- documented here rather than left
    // implicit.
    expect(result.current.getValue).not.toBe(firstGetValue);
  });
});
