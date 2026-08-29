import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

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

  it("renders a switch as the row's first element when onAssignToggle is present", () => {
    const { container } = render(
      <PartyRow {...baseProps} assignChecked={false} onAssignToggle={vi.fn()} />
    );

    const row = container.firstElementChild as HTMLElement;
    const firstChild = row.firstElementChild as HTMLElement;
    expect(firstChild.querySelector('button[role="switch"]')).not.toBeNull();
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

  it("toggling via Space or Enter still never reaches the row's drag keydown handler", () => {
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

    const toggle = screen.getByRole("switch");
    fireEvent.keyDown(toggle, { key: " " });
    fireEvent.keyDown(toggle, { key: "Enter" });

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
