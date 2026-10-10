import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { renderWithChakra as render } from "../../../testUtils";

import { PartyRow } from "./PartyRow";
import { RoleSegmentedControlOption } from "./RoleSegmentedControl";

const ROLE_OPTIONS: RoleSegmentedControlOption[] = [
  { value: "signer", label: "Signs" },
  { value: "viewer", label: "Copy" },
  { value: "excluded", label: "None" },
];

const baseProps = {
  id: "p1",
  label: "Olive Ono",
  role: "signer" as const,
  roleOptions: ROLE_OPTIONS,
  onRoleChange: vi.fn(),
};

describe("PartyRow assign switch gating", () => {
  it("renders no switch when onAssignToggle is absent", () => {
    render(<PartyRow {...baseProps} />);

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("renders no switch when assignChecked is set but onAssignToggle is absent", () => {
    render(<PartyRow {...baseProps} assignChecked={true} />);

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("renders the switch on the name line, ahead of the role control", () => {
    render(
      <PartyRow {...baseProps} assignChecked={false} onAssignToggle={vi.fn()} />
    );

    const toggle = screen.getByRole("switch");
    const roleGroup = screen.getByRole("radiogroup", { name: "Role for Olive Ono" });
    expect(
      toggle.compareDocumentPosition(roleGroup) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("reflects assignChecked as the switch's checked state", () => {
    const { rerender } = render(
      <PartyRow {...baseProps} assignChecked={false} onAssignToggle={vi.fn()} />
    );
    expect(screen.getByRole("switch")).not.toBeChecked();

    rerender(
      <PartyRow {...baseProps} assignChecked={true} onAssignToggle={vi.fn()} />
    );
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("calls onAssignToggle when the switch is toggled", async () => {
    const user = userEvent.setup();
    const onAssignToggle = vi.fn();
    render(
      <PartyRow
        {...baseProps}
        assignChecked={false}
        onAssignToggle={onAssignToggle}
      />
    );

    await user.click(screen.getByRole("switch"));

    expect(onAssignToggle).toHaveBeenCalledTimes(1);
  });

  it("uses assignAriaLabel verbatim when given", () => {
    render(
      <PartyRow
        {...baseProps}
        assignChecked={false}
        onAssignToggle={vi.fn()}
        assignAriaLabel="Assign Olive Ono to Move-in date"
      />
    );

    expect(
      screen.getByRole("switch", { name: "Assign Olive Ono to Move-in date" })
    ).toBeInTheDocument();
  });

  it("falls back to a label built from the participant's name when assignAriaLabel is omitted", () => {
    render(<PartyRow {...baseProps} assignChecked={false} onAssignToggle={vi.fn()} />);

    expect(
      screen.getByRole("switch", { name: "Assign Olive Ono" })
    ).toBeInTheDocument();
  });

  it("stops propagation on the wrapper's pointerdown so a drag never starts from toggling it", () => {
    const onPointerDown = vi.fn();
    render(
      <PartyRow
        {...baseProps}
        draggable
        onPointerDown={onPointerDown}
        assignChecked={false}
        onAssignToggle={vi.fn()}
      />
    );

    const toggle = screen.getByRole("switch");
    const down = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.assign(down, { button: 0, clientX: 0, clientY: 0 });
    fireEvent(toggle, down);

    // The row's own drag-handle pointerdown handler never fires: the event
    // never bubbles past the wrapper around the switch.
    expect(onPointerDown).not.toHaveBeenCalled();
  });

  it("stops propagation on the wrapper's keydown so arrow keys never reorder the row", () => {
    const onKeyDown = vi.fn();
    render(
      <PartyRow
        {...baseProps}
        draggable
        onKeyDown={onKeyDown}
        assignChecked={false}
        onAssignToggle={vi.fn()}
      />
    );

    const toggle = screen.getByRole("switch");
    fireEvent.keyDown(toggle, { key: "ArrowDown" });

    // The row-level onKeyDown (bound only when draggable) never sees it.
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it("toggling via Space or Enter still never reaches the row's drag keydown handler", async () => {
    const user = userEvent.setup();
    const onKeyDown = vi.fn();
    const onAssignToggle = vi.fn();
    render(
      <PartyRow
        {...baseProps}
        draggable
        onKeyDown={onKeyDown}
        assignChecked={false}
        onAssignToggle={onAssignToggle}
      />
    );

    screen.getByRole("switch").focus();
    await user.keyboard(" ");
    await user.keyboard("{Enter}");

    expect(onAssignToggle).toHaveBeenCalledTimes(2);
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it("existing role control and drag handle remain present alongside the switch", () => {
    render(
      <PartyRow
        {...baseProps}
        draggable
        assignChecked={true}
        onAssignToggle={vi.fn()}
      />
    );

    expect(
      screen.getByRole("radiogroup", { name: "Role for Olive Ono" })
    ).toBeInTheDocument();
    expect(document.querySelector('[data-drag-handle="p1"]')).not.toBeNull();
  });
});

describe("PartyRow layout and drag affordances", () => {
  it("renders the drag handle as a labelled, non-submitting button outside the tab order", () => {
    const onPointerDown = vi.fn();
    render(<PartyRow {...baseProps} draggable onPointerDown={onPointerDown} />);

    const handle = screen.getByRole("button", { name: "Drag Olive Ono to reorder" });
    expect(handle).toHaveAttribute("data-drag-handle", "p1");
    expect(handle).toHaveAttribute("type", "button");
    expect(handle).toHaveAttribute("tabindex", "-1");

    const down = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.assign(down, { button: 0 });
    fireEvent(handle, down);
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });

  it("keeps data-reorder-id and keyboard reorder on the row, only when draggable", () => {
    const onKeyDown = vi.fn();
    const { rerender } = render(
      <PartyRow {...baseProps} draggable onKeyDown={onKeyDown} />
    );

    const row = screen.getByRole("group", { name: "Olive Ono" });
    expect(row).toHaveAttribute("data-reorder-id", "p1");
    expect(row).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(row, { key: "ArrowDown" });
    expect(onKeyDown).toHaveBeenCalledTimes(1);

    rerender(<PartyRow {...baseProps} />);
    const staticRow = screen.getByRole("group", { name: "Olive Ono" });
    expect(staticRow).not.toHaveAttribute("data-reorder-id");
    expect(staticRow).not.toHaveAttribute("tabindex");
    expect(
      screen.queryByRole("button", { name: "Drag Olive Ono to reorder" })
    ).not.toBeInTheDocument();
  });

  it("marks the dragged row and the drop target with data attributes", () => {
    const { rerender } = render(<PartyRow {...baseProps} draggable isDragging />);
    const row = screen.getByRole("group", { name: "Olive Ono" });
    expect(row).toHaveAttribute("data-dragging");
    expect(row).not.toHaveAttribute("data-drop-target");

    rerender(<PartyRow {...baseProps} draggable isDropTarget />);
    expect(row).toHaveAttribute("data-drop-target");
    expect(row).not.toHaveAttribute("data-dragging");
  });

  it("with a colorIndex: shows the avatar and keys the card to the party's field colour", () => {
    const { rerender } = render(<PartyRow {...baseProps} colorIndex={1} />);
    expect(screen.getByText("OO")).toBeInTheDocument();
    // Same token the canvas tints this party's fields with.
    expect(screen.getByRole("group", { name: baseProps.label })).toHaveAttribute(
      "data-recipient-color",
      "var(--pdfe-recipient-2)"
    );

    rerender(<PartyRow {...baseProps} />);
    expect(screen.queryByText("OO")).not.toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: baseProps.label })
    ).not.toHaveAttribute("data-recipient-color");
  });

  it("renders the host badge and the undecided hint", () => {
    render(
      <PartyRow {...baseProps} role={undefined} badge="Landlord" hint="Choose a role" />
    );

    expect(screen.getByText("Landlord")).toBeInTheDocument();
    expect(screen.getByText("Choose a role")).toBeInTheDocument();
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).not.toBeChecked();
    }
  });

  it("the same-time toggle is a type=button that calls onToggleGrouped", async () => {
    const user = userEvent.setup();
    const onToggleGrouped = vi.fn();
    render(
      <PartyRow
        {...baseProps}
        groupToggleLabel="Sign at the same time as Sam Poe"
        onToggleGrouped={onToggleGrouped}
      />
    );

    const button = screen.getByRole("button", {
      name: "Sign at the same time as Sam Poe",
    });
    expect(button).toHaveAttribute("type", "button");
    await user.click(button);
    expect(onToggleGrouped).toHaveBeenCalledTimes(1);
  });
});
