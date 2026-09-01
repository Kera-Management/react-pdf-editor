import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useDragReorder } from "./useDragReorder";

/**
 * Rows are stacked in fixed 40px bands starting at y=0, in list order, so
 * `clientY` can be picked to land inside/outside a specific row deterministically.
 */
const ROW_HEIGHT = 40;

function stubRect(node: HTMLElement, top: number, bottom: number): void {
  node.getBoundingClientRect = () =>
    ({
      top,
      bottom,
      left: 0,
      right: 100,
      width: 100,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

function setupRows(ids: string[]): void {
  ids.forEach((id, index) => {
    const row = document.createElement("div");
    row.setAttribute("data-reorder-id", id);
    stubRect(row, index * ROW_HEIGHT, index * ROW_HEIGHT + ROW_HEIGHT);
    document.body.appendChild(row);
  });
}

function cleanupRows(): void {
  document.querySelectorAll("[data-reorder-id]").forEach((node) => node.remove());
}

function makePointerDownEvent(
  overrides: Partial<{
    button: number;
    pointerId: number;
    pointerType: string;
    clientX: number;
    clientY: number;
  }> = {}
): ReactPointerEvent {
  return {
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
    clientX: 0,
    clientY: 0,
    ...overrides,
  } as unknown as ReactPointerEvent;
}

function makeKeyDownEvent(key: string): ReactKeyboardEvent {
  return { key, preventDefault: vi.fn() } as unknown as ReactKeyboardEvent;
}

/** Dispatches a document-level event carrying pointer-like fields, since
 * jsdom does not implement the PointerEvent constructor. */
function dispatchDocumentPointerEvent(
  type: "pointermove" | "pointerup" | "pointercancel",
  overrides: Partial<{ pointerId: number; clientX: number; clientY: number }> = {}
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1, clientX: 0, clientY: 0, ...overrides });
  document.dispatchEvent(event);
}

afterEach(() => {
  cleanupRows();
});

describe("useDragReorder", () => {
  it("fires onReorder and updates dropTargetId when dragging down past a neighbour", () => {
    setupRows(["a", "b", "c"]);
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({ ids: ["a", "b", "c"], onReorder })
    );

    act(() => {
      result.current.onPointerDown(
        "a",
        makePointerDownEvent({ pointerId: 1, clientY: 10 })
      );
    });
    expect(result.current.isDragging("a")).toBe(true);

    act(() => {
      // Row "b" spans [40, 80).
      dispatchDocumentPointerEvent("pointermove", { pointerId: 1, clientY: 50 });
    });
    expect(onReorder).toHaveBeenCalledWith("a", "b");
    expect(result.current.dropTargetId).toBe("b");

    act(() => {
      dispatchDocumentPointerEvent("pointerup", { pointerId: 1 });
    });
    expect(result.current.isDragging("a")).toBe(false);
    expect(result.current.dropTargetId).toBeNull();
  });

  it("does not fire onReorder again while hovering the same row", () => {
    setupRows(["a", "b", "c"]);
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({ ids: ["a", "b", "c"], onReorder })
    );

    act(() => {
      result.current.onPointerDown(
        "a",
        makePointerDownEvent({ pointerId: 1, clientY: 10 })
      );
    });

    act(() => {
      dispatchDocumentPointerEvent("pointermove", { pointerId: 1, clientY: 50 });
      dispatchDocumentPointerEvent("pointermove", { pointerId: 1, clientY: 55 });
      dispatchDocumentPointerEvent("pointermove", { pointerId: 1, clientY: 60 });
    });

    expect(onReorder).toHaveBeenCalledTimes(1);
  });

  it("holds off engaging a touch drag until the 10px threshold is crossed", () => {
    setupRows(["a", "b"]);
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({ ids: ["a", "b"], onReorder })
    );

    act(() => {
      result.current.onPointerDown(
        "a",
        makePointerDownEvent({ pointerId: 2, pointerType: "touch", clientX: 0, clientY: 10 })
      );
    });
    // Taps must still work: nothing engages on pointerdown alone.
    expect(result.current.isDragging("a")).toBe(false);

    act(() => {
      // Delta of 5px, under the threshold.
      dispatchDocumentPointerEvent("pointermove", { pointerId: 2, clientX: 0, clientY: 15 });
    });
    expect(result.current.isDragging("a")).toBe(false);
    expect(onReorder).not.toHaveBeenCalled();

    act(() => {
      // Cumulative delta of 15px from the start point, past the threshold.
      dispatchDocumentPointerEvent("pointermove", { pointerId: 2, clientX: 0, clientY: 25 });
    });
    expect(result.current.isDragging("a")).toBe(true);
  });

  it("ignores pointer move/up events from an unrelated pointerId", () => {
    setupRows(["a", "b"]);
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({ ids: ["a", "b"], onReorder })
    );

    act(() => {
      result.current.onPointerDown("a", makePointerDownEvent({ pointerId: 1, clientY: 10 }));
    });

    act(() => {
      dispatchDocumentPointerEvent("pointermove", { pointerId: 99, clientY: 50 });
    });
    expect(onReorder).not.toHaveBeenCalled();
    expect(result.current.dropTargetId).toBeNull();

    act(() => {
      dispatchDocumentPointerEvent("pointerup", { pointerId: 99 });
    });
    // The original gesture is still live because pointerId 99 wasn't ours.
    expect(result.current.isDragging("a")).toBe(true);
  });

  it("ignores non-primary button presses", () => {
    setupRows(["a", "b"]);
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({ ids: ["a", "b"], onReorder })
    );

    act(() => {
      result.current.onPointerDown("a", makePointerDownEvent({ button: 2 }));
    });
    expect(result.current.isDragging("a")).toBe(false);

    act(() => {
      dispatchDocumentPointerEvent("pointermove", { pointerId: 1, clientY: 50 });
    });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("moves a row up and down one position via arrow keys", () => {
    setupRows(["a", "b", "c"]);
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({ ids: ["a", "b", "c"], onReorder })
    );

    act(() => {
      result.current.onKeyDown("b", makeKeyDownEvent("ArrowUp"));
    });
    expect(onReorder).toHaveBeenLastCalledWith("b", "a");

    act(() => {
      result.current.onKeyDown("b", makeKeyDownEvent("ArrowDown"));
    });
    expect(onReorder).toHaveBeenLastCalledWith("b", "c");

    expect(onReorder).toHaveBeenCalledTimes(2);
  });

  it("no-ops ArrowUp on the first row and ArrowDown on the last row", () => {
    setupRows(["a", "b", "c"]);
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({ ids: ["a", "b", "c"], onReorder })
    );

    act(() => {
      result.current.onKeyDown("a", makeKeyDownEvent("ArrowUp"));
    });
    act(() => {
      result.current.onKeyDown("c", makeKeyDownEvent("ArrowDown"));
    });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("ignores keys other than ArrowUp/ArrowDown", () => {
    setupRows(["a", "b"]);
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({ ids: ["a", "b"], onReorder })
    );

    act(() => {
      result.current.onKeyDown("a", makeKeyDownEvent("Enter"));
    });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("clamps the drop target to the first row when the pointer drags above the list", () => {
    setupRows(["a", "b", "c"]);
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({ ids: ["a", "b", "c"], onReorder })
    );

    act(() => {
      result.current.onPointerDown(
        "c",
        makePointerDownEvent({ pointerId: 3, clientY: 100 })
      );
    });

    act(() => {
      // Above every row's top edge.
      dispatchDocumentPointerEvent("pointermove", { pointerId: 3, clientY: -50 });
    });
    expect(onReorder).toHaveBeenCalledWith("c", "a");
    expect(result.current.dropTargetId).toBe("a");
  });

  it("clamps the drop target to the last row when the pointer drags below the list", () => {
    setupRows(["a", "b", "c"]);
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({ ids: ["a", "b", "c"], onReorder })
    );

    act(() => {
      result.current.onPointerDown(
        "a",
        makePointerDownEvent({ pointerId: 4, clientY: 10 })
      );
    });

    act(() => {
      // Below every row's bottom edge.
      dispatchDocumentPointerEvent("pointermove", { pointerId: 4, clientY: 500 });
    });
    expect(onReorder).toHaveBeenCalledWith("a", "c");
    expect(result.current.dropTargetId).toBe("c");
  });
});

describe("useDragReorder drop-onto-a-row (join)", () => {
  it("arms a join instead of reordering when hovering another row's middle band", () => {
    setupRows(["a", "b", "c"]);
    const onReorder = vi.fn();
    const onJoin = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({ ids: ["a", "b", "c"], onReorder, onJoin })
    );

    act(() => {
      result.current.onPointerDown(
        "a",
        makePointerDownEvent({ pointerId: 1, clientY: 10 })
      );
    });

    act(() => {
      // Row "b" spans [40, 80); its middle band is [50, 70].
      dispatchDocumentPointerEvent("pointermove", { pointerId: 1, clientY: 60 });
    });

    expect(onReorder).not.toHaveBeenCalled();
    expect(result.current.joinTargetId).toBe("b");
    expect(result.current.dropTargetId).toBeNull();

    act(() => {
      dispatchDocumentPointerEvent("pointerup", { pointerId: 1 });
    });
    expect(onJoin).toHaveBeenCalledTimes(1);
    expect(onJoin).toHaveBeenCalledWith("a", "b");
    expect(result.current.joinTargetId).toBeNull();
  });

  it("keeps reordering in the edge bands and disarms any pending join", () => {
    setupRows(["a", "b", "c"]);
    const onReorder = vi.fn();
    const onJoin = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({ ids: ["a", "b", "c"], onReorder, onJoin })
    );

    act(() => {
      result.current.onPointerDown(
        "a",
        makePointerDownEvent({ pointerId: 1, clientY: 10 })
      );
    });

    // Arm a join on "b"...
    act(() => {
      dispatchDocumentPointerEvent("pointermove", { pointerId: 1, clientY: 60 });
    });
    expect(result.current.joinTargetId).toBe("b");

    // ...then slide into its top edge band: back to reorder semantics.
    act(() => {
      dispatchDocumentPointerEvent("pointermove", { pointerId: 1, clientY: 42 });
    });
    expect(result.current.joinTargetId).toBeNull();
    expect(result.current.dropTargetId).toBe("b");
    expect(onReorder).toHaveBeenCalledWith("a", "b");

    act(() => {
      dispatchDocumentPointerEvent("pointerup", { pointerId: 1 });
    });
    expect(onJoin).not.toHaveBeenCalled();
  });

  it("treats every hover position as reorder when onJoin is not provided", () => {
    setupRows(["a", "b", "c"]);
    const onReorder = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({ ids: ["a", "b", "c"], onReorder })
    );

    act(() => {
      result.current.onPointerDown(
        "a",
        makePointerDownEvent({ pointerId: 1, clientY: 10 })
      );
    });
    act(() => {
      dispatchDocumentPointerEvent("pointermove", { pointerId: 1, clientY: 60 });
    });

    expect(result.current.joinTargetId).toBeNull();
    expect(result.current.dropTargetId).toBe("b");
    expect(onReorder).toHaveBeenCalledWith("a", "b");
  });

  it("does not join on pointercancel", () => {
    setupRows(["a", "b", "c"]);
    const onReorder = vi.fn();
    const onJoin = vi.fn();
    const { result } = renderHook(() =>
      useDragReorder({ ids: ["a", "b", "c"], onReorder, onJoin })
    );

    act(() => {
      result.current.onPointerDown(
        "a",
        makePointerDownEvent({ pointerId: 1, clientY: 10 })
      );
    });
    act(() => {
      dispatchDocumentPointerEvent("pointermove", { pointerId: 1, clientY: 60 });
    });
    expect(result.current.joinTargetId).toBe("b");

    act(() => {
      dispatchDocumentPointerEvent("pointercancel", { pointerId: 1 });
    });
    expect(onJoin).not.toHaveBeenCalled();
  });
});
