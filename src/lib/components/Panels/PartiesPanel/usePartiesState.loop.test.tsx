import { render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { PartiesSelection } from "./types";
import { usePartiesState } from "./usePartiesState";

/**
 * Regression: the report-to-host loop.
 *
 * Hosts rebuild the whole parties config object literal on every render
 * (PDFEditor itself does, and so do its hosts), and a host's
 * onSelectionChange typically performs a state update. The first shipped
 * version of this hook rebuilt `selection` fresh each render with the
 * reporting effect keyed on it, which made that combination an infinite
 * render loop: report -> host setState -> re-render -> fresh objects ->
 * report... A review repro pinned a vitest worker at 100% CPU until killed.
 *
 * This test mounts exactly that host shape. If the loop ever comes back, the
 * assertion on call count fails fast (or vitest's timeout kills the test)
 * instead of the bug reaching a manager's browser tab.
 */

const PARTY_IDS = ["a", "b"];

const LoopHost = ({ onReport }: { onReport: () => void }) => {
  const [selection, setSelection] = useState<PartiesSelection | null>(null);

  // Deliberately rebuilt every render: fresh config identity, fresh initial
  // objects, callback closing over setState -- the hostile-but-normal case.
  const state = usePartiesState(
    {
      seedKey: "lease-1",
      initial: {
        roles: { a: "signer", b: "signer" },
        order: ["a", "b"],
        groupedWithPrevious: { b: true },
      },
      onSelectionChange: (next) => {
        onReport();
        setSelection(next);
      },
    },
    PARTY_IDS
  );

  return (
    <div>
      <output data-testid="signers">{state.orderedSigners.length}</output>
      <output data-testid="complete">{String(selection?.isComplete)}</output>
    </div>
  );
};

describe("usePartiesState report loop regression", () => {
  it("settles after mount instead of reporting forever", () => {
    const onReport = vi.fn();
    render(<LoopHost onReport={onReport} />);

    // One report for the seeded selection, plus at most one echo from the
    // host's own setState re-render. Anything unbounded is the loop.
    expect(onReport.mock.calls.length).toBeLessThanOrEqual(2);
    expect(screen.getByTestId("signers").textContent).toBe("2");
    expect(screen.getByTestId("complete").textContent).toBe("true");
  });

  it("stays settled across parent re-renders with fresh config identity", () => {
    const onReport = vi.fn();
    const { rerender } = render(<LoopHost onReport={onReport} />);
    const afterMount = onReport.mock.calls.length;

    rerender(<LoopHost onReport={onReport} />);
    rerender(<LoopHost onReport={onReport} />);

    // Re-renders with unchanged state must not produce new reports at all.
    expect(onReport.mock.calls.length).toBe(afterMount);
  });
});
