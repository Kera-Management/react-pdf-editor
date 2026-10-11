import { describe, expect, it } from "vitest";
import {
  guidedAnchor,
  guidedPosition,
  nextIncompleteName,
  orderNamesByDocument,
  previousName,
} from "./guided";

const names: Record<string, string> = {
  a1: "alpha",
  b1: "beta",
  b2: "beta",
  c1: "gamma",
};

describe("guided navigation helpers", () => {
  it("orders names by first appearance in the reflowed document", () => {
    expect(
      orderNamesByDocument(
        ["gamma", "alpha", "beta", "missing"],
        ["b1", "c1", "a1", "b2"],
        (id) => names[id]
      )
    ).toEqual(["beta", "gamma", "alpha", "missing"]);
  });

  it("finds the next incomplete name after the current one, wrapping", () => {
    const order = ["a", "b", "c"];
    const done = new Set(["b"]);
    const isComplete = (n: string) => done.has(n);
    expect(nextIncompleteName(order, null, isComplete)).toBe("a");
    expect(nextIncompleteName(order, "a", isComplete)).toBe("c");
    expect(nextIncompleteName(order, "c", isComplete)).toBe("a");
    expect(nextIncompleteName(order, "a", () => true)).toBeNull();
    expect(nextIncompleteName([], null, isComplete)).toBeNull();
  });

  it("steps back through the list, complete or not", () => {
    expect(previousName(["a", "b"], "b")).toBe("a");
    expect(previousName(["a", "b"], "a")).toBeNull();
    expect(previousName(["a", "b"], null)).toBeNull();
  });

  it("reports the current position, else where Next goes", () => {
    const none = () => false;
    expect(guidedPosition(["a", "b", "c"], "b", none)).toBe(2);
    expect(guidedPosition(["a", "b", "c"], null, (n) => n === "a")).toBe(2);
    expect(guidedPosition(["a", "b", "c"], null, () => true)).toBe(3);
    expect(guidedPosition([], null, none)).toBe(0);
  });

  it("never shows a position ahead of the stop Next lands on", () => {
    // Fields 1 and 3 of 5 were filled earlier: "completed + 1" would read
    // "3 of 5", but Next goes to field 2.
    const order = ["f1", "f2", "f3", "f4", "f5"];
    const done = new Set(["f1", "f3"]);
    const isComplete = (n: string) => done.has(n);
    const next = nextIncompleteName(order, null, isComplete);
    expect(next).toBe("f2");
    expect(guidedPosition(order, null, isComplete)).toBe(2);
    expect(guidedPosition(order, next, isComplete)).toBe(2);
  });

  it("keeps the signer's place when they are on an optional field", () => {
    // Document: r1, opt (optional), r2, r3. Required order: r1, r2, r3.
    const ids = ["r1", "opt", "r2", "r3"];
    const nameOf = (id: string) => id;
    const order = ["r1", "r2", "r3"];
    const at = guidedAnchor(order, "opt", ids, nameOf);
    expect(at).toBe(0.5);
    const none = () => false;
    // Next carries on below, Previous goes back above, the counter shows
    // the stop Next lands on.
    expect(nextIncompleteName(order, at, none)).toBe("r2");
    expect(previousName(order, at)).toBe("r1");
    expect(guidedPosition(order, at, none)).toBe(2);
    // On a required field it is just that field.
    expect(guidedAnchor(order, "r2", ids, nameOf)).toBe(1);
    // Before every required field: Previous has nowhere to go.
    expect(previousName(order, guidedAnchor(order, "opt", ["opt", ...order], nameOf))).toBeNull();
  });
});
