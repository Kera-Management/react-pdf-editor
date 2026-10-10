import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { renderWithChakra as render } from "../../../testUtils";

import { PartiesPanel, PartiesPanelParticipant } from "./PartiesPanel";
import { PartiesConfig, PartiesPanelAssignMode, PartiesSelection } from "./types";

const P1 = "p1";
const P2 = "p2";
const P3 = "p3";
const P4 = "p4";

// Exactly 30 characters -- used to prove names never truncate.
const LONG_NAME = "Olive Constance Middleton-Vega";

const PARTICIPANTS: PartiesPanelParticipant[] = [
  { id: P1, label: "Olive Ono", badge: "Landlord" },
  { id: P2, label: LONG_NAME, badge: "Tenant" },
  { id: P3, label: "Sam Poe" },
  { id: P4, label: "Tam Lee" },
];

/** Two signers grouped into a single step, one viewer, one undecided. */
const groupedInitial = () => ({
  roles: {
    [P1]: "signer" as const,
    [P2]: "signer" as const,
    [P3]: "viewer" as const,
    [P4]: undefined,
  },
  order: [P1, P2],
  groupedWithPrevious: { [P1]: false, [P2]: true },
});

const buildConfig = (
  overrides: Partial<PartiesConfig> = {}
): { config: PartiesConfig; onSelectionChange: ReturnType<typeof vi.fn> } => {
  const onSelectionChange = vi.fn();
  const config: PartiesConfig = {
    seedKey: "doc-1",
    initial: groupedInitial(),
    onSelectionChange,
    expiry: { defaultDays: 7 },
    ...overrides,
  };
  return { config, onSelectionChange };
};

const lastSelection = (
  onSelectionChange: ReturnType<typeof vi.fn>
): PartiesSelection => {
  const calls = onSelectionChange.mock.calls;
  return calls[calls.length - 1][0];
};

describe("PartiesPanel", () => {
  it("renders the plain-language summary for a fully grouped signer set", () => {
    const { config } = buildConfig();
    render(<PartiesPanel config={config} participants={PARTICIPANTS} />);

    expect(
      screen.getByText("Everyone signs at the same time.")
    ).toBeInTheDocument();
    // The section says what it is FOR, not just who is in it.
    expect(screen.getByText("Signing order")).toBeInTheDocument();
  });

  it("switches a party's role via the segmented control and reports the new selection", async () => {
    const user = userEvent.setup();
    const { config, onSelectionChange } = buildConfig();
    render(<PartiesPanel config={config} participants={PARTICIPANTS} />);

    const tamGroup = screen.getByRole("radiogroup", {
      name: "Role for Tam Lee",
    });
    await user.click(within(tamGroup).getByRole("radio", { name: "Copy" }));

    const selection = lastSelection(onSelectionChange);
    const tam = selection.parties.find((p) => p.id === P4);
    expect(tam?.role).toBe("viewer");
  });

  it("toggles same-time grouping and updates the summary", async () => {
    const user = userEvent.setup();
    const { config } = buildConfig();
    render(<PartiesPanel config={config} participants={PARTICIPANTS} />);

    await user.click(
      screen.getByRole("button", { name: "Sign after Olive Ono" })
    );

    expect(
      screen.getByText(`Olive Ono signs first, then ${LONG_NAME}.`)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign at the same time as Olive Ono" })
    ).toBeInTheDocument();
  });

  it("emits expiryDays as the input changes, including clearing to null", async () => {
    const user = userEvent.setup();
    const { config, onSelectionChange } = buildConfig();
    render(<PartiesPanel config={config} participants={PARTICIPANTS} />);

    const input = screen.getByLabelText("This offer expires in");
    // Chakra NumberInput is a text input with inputMode="decimal".
    expect(input).toHaveValue("7");

    await user.clear(input);
    // Paste, not type: NumberInput re-syncs its value after each keystroke,
    // and under a loaded test run the caret could land back at 0 between
    // the two keys ("41"). Pasting enters the value in one event.
    await user.paste("14");
    expect(lastSelection(onSelectionChange).expiryDays).toBe(14);

    await user.clear(input);
    expect(lastSelection(onSelectionChange).expiryDays).toBeNull();
  });

  it("shows the validation line when no party is a signer", () => {
    const { config } = buildConfig({
      initial: {
        roles: {
          [P1]: "viewer",
          [P2]: "excluded",
          [P3]: undefined,
          [P4]: undefined,
        },
        order: [],
        groupedWithPrevious: {},
      },
    });
    render(<PartiesPanel config={config} participants={PARTICIPANTS} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "At least one person needs to sign."
    );
    expect(
      screen.queryByText("Everyone signs at the same time.")
    ).not.toBeInTheDocument();
  });

  it("renders a 30-character name in full, untruncated", () => {
    const { config } = buildConfig();
    render(<PartiesPanel config={config} participants={PARTICIPANTS} />);

    expect(LONG_NAME).toHaveLength(30);
    const nameNode = screen.getByText(LONG_NAME);
    expect(nameNode).toBeInTheDocument();
    expect(nameNode.textContent).toBe(LONG_NAME);
  });

  it("renders same-step signers inside ONE visible group box, sequential steps in separate boxes", () => {
    const { config } = buildConfig();
    render(<PartiesPanel config={config} participants={PARTICIPANTS} />);
    // Fixture starts with P1+P2 grouped in one step: one box, no headings.
    expect(screen.getByTestId("step-group-0")).toBeInTheDocument();
    expect(screen.queryByTestId("step-group-1")).not.toBeInTheDocument();
    // Split P2 out: now two boxes with ordinal headings and a "then" between.
    fireEvent.click(
      screen.getByRole("button", { name: "Sign after Olive Ono" })
    );
    const group0 = within(screen.getByTestId("step-group-0"));
    const group1 = within(screen.getByTestId("step-group-1"));
    expect(group0.getByText("Olive Ono")).toBeInTheDocument();
    expect(group1.getByText(LONG_NAME)).toBeInTheDocument();
    expect(screen.getByText(/Signs first/)).toBeInTheDocument();
    expect(screen.getByText(/Signs second/)).toBeInTheDocument();
    expect(screen.getByText("then")).toBeInTheDocument();
  });

  it("'All at once' collapses every signer into a single step", async () => {
    const user = userEvent.setup();
    const { config, onSelectionChange } = buildConfig();
    render(<PartiesPanel config={config} participants={PARTICIPANTS} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Sign after Olive Ono" })
    );
    expect(screen.getByTestId("step-group-1")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "All at once" }));
    const steps = lastSelection(onSelectionChange)
      .parties.filter((p) => p.role === "signer")
      .map((p) => p.step);
    expect(new Set(steps).size).toBe(1);
    expect(screen.queryByTestId("step-group-1")).not.toBeInTheDocument();
  });

  it("'One after another' gives every signer their own step", async () => {
    const user = userEvent.setup();
    const { config, onSelectionChange } = buildConfig();
    render(<PartiesPanel config={config} participants={PARTICIPANTS} />);
    await user.click(screen.getByRole("radio", { name: "One after another" }));
    const steps = lastSelection(onSelectionChange)
      .parties.filter((p) => p.role === "signer")
      .map((p) => p.step);
    expect(new Set(steps).size).toBe(steps.length);
  });
});

describe("PartiesPanel signing order segment group", () => {
  it("is a labelled radiogroup that lights the pole the signers sit at", async () => {
    const user = userEvent.setup();
    const { config, onSelectionChange } = buildConfig();
    render(<PartiesPanel config={config} participants={PARTICIPANTS} />);

    const order = screen.getByRole("radiogroup", { name: "Signing order" });
    // Fixture: both signers grouped into one step.
    expect(within(order).getByRole("radio", { name: "All at once" })).toBeChecked();
    expect(
      within(order).getByRole("radio", { name: "One after another" })
    ).not.toBeChecked();

    await user.click(within(order).getByRole("radio", { name: "One after another" }));
    const steps = lastSelection(onSelectionChange)
      .parties.filter((p) => p.role === "signer")
      .map((p) => p.step);
    expect(steps).toEqual([0, 1]);
    expect(
      within(order).getByRole("radio", { name: "One after another" })
    ).toBeChecked();
    expect(within(order).getByRole("radio", { name: "All at once" })).not.toBeChecked();
  });

  it("is hidden with fewer than two signers", () => {
    const { config } = buildConfig({
      initial: {
        roles: { [P1]: "signer", [P2]: "viewer", [P3]: "viewer", [P4]: "excluded" },
        order: [P1],
        groupedWithPrevious: {},
      },
    });
    render(<PartiesPanel config={config} participants={PARTICIPANTS} />);

    expect(
      screen.queryByRole("radiogroup", { name: "Signing order" })
    ).not.toBeInTheDocument();
  });

  it("shows section counts as badges next to the section titles", () => {
    const { config } = buildConfig();
    render(<PartiesPanel config={config} participants={PARTICIPANTS} />);

    const copyHeading = screen.getByRole("heading", { name: /Also gets a copy/ });
    expect(copyHeading.parentElement).toHaveTextContent("Also gets a copy1");
    const excludedHeading = screen.getByRole("heading", { name: /Not included/ });
    expect(excludedHeading.parentElement).toHaveTextContent("Not included0");
  });

  it("marks the expiry input's buttons and toggles as type=button so a host form never submits", () => {
    const { config } = buildConfig();
    render(<PartiesPanel config={config} participants={PARTICIPANTS} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
    }
  });
});

describe("PartiesPanel drag a signer into a step box", () => {
  const ROW_HEIGHT = 40;

  /** Stacks the signer rows in fixed 40px bands so clientY picks a row. */
  const stubSignerRowRects = () => {
    document
      .querySelectorAll<HTMLElement>("[data-reorder-id]")
      .forEach((node, index) => {
        node.getBoundingClientRect = () =>
          ({
            top: index * ROW_HEIGHT,
            bottom: index * ROW_HEIGHT + ROW_HEIGHT,
            left: 0,
            right: 100,
            width: 100,
            height: ROW_HEIGHT,
            x: 0,
            y: index * ROW_HEIGHT,
            toJSON: () => ({}),
          }) as DOMRect;
      });
  };

  const dispatchPointer = (
    type: "pointermove" | "pointerup",
    clientY: number
  ) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    // No pointerId anywhere in this test: jsdom's event fallback can drop
    // unknown init props, so the gesture and the moves must agree on
    // `undefined` rather than disagree on 1 vs undefined.
    Object.assign(event, { clientX: 0, clientY });
    // Through fireEvent (not document.dispatchEvent) so the resulting state
    // updates are wrapped in act() and flush before the next assertion.
    fireEvent(document, event);
  };

  it("shows the join hint mid-drag and merges both signers into one box on drop", () => {
    const { config, onSelectionChange } = buildConfig({
      initial: {
        roles: { [P1]: "signer", [P2]: "signer", [P3]: "viewer", [P4]: undefined },
        // Two separate steps: P1 first, then P2.
        order: [P1, P2],
        groupedWithPrevious: { [P2]: false },
      },
    });
    render(<PartiesPanel config={config} participants={PARTICIPANTS} />);

    // Sanity: two step boxes before the drag.
    expect(screen.getByTestId("step-group-1")).toBeInTheDocument();

    stubSignerRowRects();
    // Pointer drags start on the grip, not the row (the row-wide grab
    // cursor flickered across interactive children and was removed).
    const p2Grip = document.querySelector<HTMLElement>(
      `[data-drag-handle="${P2}"]`
    );
    expect(p2Grip).not.toBeNull();

    // Grab P2 (second band) and hover the MIDDLE of P1's row (first band).
    // Hand-built native event: jsdom's fireEvent fallback drops `button`,
    // which the hook (correctly) requires to be the primary button.
    const down = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.assign(down, { button: 0, clientX: 0, clientY: 60 });
    fireEvent(p2Grip as HTMLElement, down);
    dispatchPointer("pointermove", 20);

    // The would-be box advertises the drop before it happens.
    expect(screen.getByText("Drop to sign together")).toBeInTheDocument();

    dispatchPointer("pointerup", 20);

    // One box left, holding both signers, and the summary agrees.
    expect(screen.queryByTestId("step-group-1")).not.toBeInTheDocument();
    const box = screen.getByTestId("step-group-0");
    expect(within(box).getByText("Olive Ono")).toBeInTheDocument();
    expect(within(box).getByText(LONG_NAME)).toBeInTheDocument();
    expect(
      screen.getByText("Everyone signs at the same time.")
    ).toBeInTheDocument();

    const selection = lastSelection(onSelectionChange);
    const steps = selection.parties
      .filter((p) => p.role === "signer")
      .map((p) => ("step" in p ? p.step : undefined));
    expect(steps).toEqual([0, 0]);
  });
});

describe("PartiesPanel assign mode", () => {
  const FIELD_LABEL = "Move-in date";

  const buildAssignMode = (
    overrides: Partial<PartiesPanelAssignMode> = {}
  ): { assignMode: PartiesPanelAssignMode; onToggle: ReturnType<typeof vi.fn>; onDeselect: ReturnType<typeof vi.fn> } => {
    const onToggle = vi.fn();
    const onDeselect = vi.fn();
    const assignMode: PartiesPanelAssignMode = {
      fieldId: "field-1",
      fieldLabel: FIELD_LABEL,
      assignedIds: [],
      onToggle,
      participants: PARTICIPANTS,
      onDeselect,
      ...overrides,
    };
    return { assignMode, onToggle, onDeselect };
  };

  it("renders no switch and no banner when assignMode is omitted (byte-identical structure)", () => {
    const { config } = buildConfig();
    const { container } = render(
      <PartiesPanel config={config} participants={PARTICIPANTS} />
    );

    expect(container.querySelectorAll('[role="switch"]')).toHaveLength(0);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders the banner naming the field being assigned", () => {
    const { config } = buildConfig();
    const { assignMode } = buildAssignMode();
    render(
      <PartiesPanel
        config={config}
        participants={PARTICIPANTS}
        assignMode={assignMode}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      `Who fills "${FIELD_LABEL}"?`
    );
  });

  it("A1: the banner names the field by its display label, never its id", () => {
    const { config } = buildConfig();
    const { assignMode } = buildAssignMode({
      fieldId: "field-7f3a9c",
      fieldLabel: "Tenant signature",
    });
    render(
      <PartiesPanel
        config={config}
        participants={PARTICIPANTS}
        assignMode={assignMode}
      />
    );

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent('Who fills "Tenant signature"?');
    expect(banner).toHaveTextContent(
      "Turn on each person who should complete this field."
    );
    expect(banner).not.toHaveTextContent("field-7f3a9c");
    // The switches name the field the same way.
    expect(
      screen.getByRole("switch", { name: "Assign Olive Ono to Tenant signature" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/field-7f3a9c/)).not.toBeInTheDocument();
  });

  it("the banner closes (data-state=closed) then unmounts after assignMode clears", () => {
    vi.useFakeTimers();
    try {
      const { config } = buildConfig();
      const { assignMode } = buildAssignMode();
      const { rerender } = render(
        <PartiesPanel
          config={config}
          participants={PARTICIPANTS}
          assignMode={assignMode}
        />
      );
      expect(screen.getByRole("status")).toHaveAttribute("data-state", "open");

      rerender(<PartiesPanel config={config} participants={PARTICIPANTS} />);
      expect(screen.getByRole("status")).toHaveAttribute("data-state", "closed");

      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the banner's X button calls onDeselect", async () => {
    const user = userEvent.setup();
    const { config } = buildConfig();
    const { assignMode, onDeselect } = buildAssignMode();
    render(
      <PartiesPanel
        config={config}
        participants={PARTICIPANTS}
        assignMode={assignMode}
      />
    );

    await user.click(screen.getByRole("button", { name: "Stop assigning" }));

    expect(onDeselect).toHaveBeenCalledTimes(1);
  });

  it("checking a signer row's switch calls onToggle with that participant's id and checked=true", async () => {
    const user = userEvent.setup();
    const { config } = buildConfig();
    const { assignMode, onToggle } = buildAssignMode({ assignedIds: [] });
    render(
      <PartiesPanel
        config={config}
        participants={PARTICIPANTS}
        assignMode={assignMode}
      />
    );

    // P1 (Olive Ono) is a signer in the default fixture.
    await user.click(
      screen.getByRole("switch", { name: `Assign Olive Ono to ${FIELD_LABEL}` })
    );

    expect(onToggle).toHaveBeenCalledWith(P1, true);
  });

  it("unchecking an already-assigned row's switch calls onToggle with checked=false", async () => {
    const user = userEvent.setup();
    const { config } = buildConfig();
    const { assignMode, onToggle } = buildAssignMode({ assignedIds: [P1] });
    render(
      <PartiesPanel
        config={config}
        participants={PARTICIPANTS}
        assignMode={assignMode}
      />
    );

    const toggle = screen.getByRole("switch", {
      name: `Assign Olive Ono to ${FIELD_LABEL}`,
    });
    expect(toggle).toBeChecked();

    await user.click(toggle);

    expect(onToggle).toHaveBeenCalledWith(P1, false);
  });

  it("viewer rows get an assign switch too", () => {
    const { config } = buildConfig();
    const { assignMode } = buildAssignMode();
    render(
      <PartiesPanel
        config={config}
        participants={PARTICIPANTS}
        assignMode={assignMode}
      />
    );

    // P3 (Sam Poe) is the viewer in the default fixture.
    expect(
      screen.getByRole("switch", { name: `Assign Sam Poe to ${FIELD_LABEL}` })
    ).toBeInTheDocument();
  });

  it("excluded rows get a switch ONLY when stale-assigned", () => {
    const { config } = buildConfig({
      initial: {
        roles: {
          [P1]: "signer",
          [P2]: "signer",
          [P3]: "excluded",
          [P4]: "excluded",
        },
        order: [P1, P2],
        groupedWithPrevious: { [P2]: true },
      },
    });
    // P3 was assigned before being excluded (stale); the assignable list no
    // longer contains either excluded party. P4 was never assigned.
    const { assignMode } = buildAssignMode({
      assignedIds: [P3],
      participants: [
        { id: P1, label: "Olive Ono" },
        { id: P2, label: LONG_NAME },
      ],
      allParticipants: PARTICIPANTS,
    });
    render(
      <PartiesPanel
        config={config}
        participants={PARTICIPANTS}
        assignMode={assignMode}
      />
    );

    const staleToggle = screen.getByRole("switch", {
      name: `Assign Sam Poe to ${FIELD_LABEL}`,
    });
    expect(staleToggle).toBeChecked();
    expect(
      screen.queryByRole("switch", { name: `Assign Tam Lee to ${FIELD_LABEL}` })
    ).not.toBeInTheDocument();
  });

  it("role, order, and group controls remain fully functional in assign mode", async () => {
    const user = userEvent.setup();
    const { config, onSelectionChange } = buildConfig();
    const { assignMode } = buildAssignMode();
    render(
      <PartiesPanel
        config={config}
        participants={PARTICIPANTS}
        assignMode={assignMode}
      />
    );

    const tamGroup = screen.getByRole("radiogroup", { name: "Role for Tam Lee" });
    await user.click(within(tamGroup).getByRole("radio", { name: "Copy" }));

    const selection = lastSelection(onSelectionChange);
    expect(selection.parties.find((p) => p.id === P4)?.role).toBe("viewer");
  });
});

describe("PartiesPanel drag with assign mode active", () => {
  const ROW_HEIGHT = 40;

  const stubSignerRowRects = () => {
    document
      .querySelectorAll<HTMLElement>("[data-reorder-id]")
      .forEach((node, index) => {
        node.getBoundingClientRect = () =>
          ({
            top: index * ROW_HEIGHT,
            bottom: index * ROW_HEIGHT + ROW_HEIGHT,
            left: 0,
            right: 100,
            width: 100,
            height: ROW_HEIGHT,
            x: 0,
            y: index * ROW_HEIGHT,
            toJSON: () => ({}),
          }) as DOMRect;
      });
  };

  const dispatchPointer = (
    type: "pointermove" | "pointerup",
    clientY: number
  ) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { clientX: 0, clientY });
    fireEvent(document, event);
  };

  it("drag-into-step-box still works with switches rendered on every row", () => {
    const { config, onSelectionChange } = buildConfig({
      initial: {
        roles: { [P1]: "signer", [P2]: "signer", [P3]: "viewer", [P4]: undefined },
        order: [P1, P2],
        groupedWithPrevious: { [P2]: false },
      },
    });
    const assignMode: PartiesPanelAssignMode = {
      fieldId: "field-1",
      fieldLabel: "Move-in date",
      assignedIds: [],
      onToggle: vi.fn(),
      participants: PARTICIPANTS,
      onDeselect: vi.fn(),
    };
    render(
      <PartiesPanel
        config={config}
        participants={PARTICIPANTS}
        assignMode={assignMode}
      />
    );

    // Switches are present alongside the drag handles.
    expect(screen.getAllByRole("switch").length).toBeGreaterThan(0);
    expect(screen.getByTestId("step-group-1")).toBeInTheDocument();

    stubSignerRowRects();
    const p2Grip = document.querySelector<HTMLElement>(
      `[data-drag-handle="${P2}"]`
    );
    expect(p2Grip).not.toBeNull();

    const down = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.assign(down, { button: 0, clientX: 0, clientY: 60 });
    fireEvent(p2Grip as HTMLElement, down);
    dispatchPointer("pointermove", 20);
    dispatchPointer("pointerup", 20);

    expect(screen.queryByTestId("step-group-1")).not.toBeInTheDocument();
    const box = screen.getByTestId("step-group-0");
    expect(within(box).getByText("Olive Ono")).toBeInTheDocument();
    expect(within(box).getByText(LONG_NAME)).toBeInTheDocument();

    const selection = lastSelection(onSelectionChange);
    const steps = selection.parties
      .filter((p) => p.role === "signer")
      .map((p) => ("step" in p ? p.step : undefined));
    expect(steps).toEqual([0, 0]);
  });
});
