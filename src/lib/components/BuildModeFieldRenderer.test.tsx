import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { BuildModeFieldRenderer } from "./BuildModeFieldRenderer";
import { BuildModeField } from "../PDFEditor";

function makeField(overrides: Partial<BuildModeField> = {}): BuildModeField {
  return {
    id: "field_1",
    type: "text",
    name: "field_1",
    x: 10,
    y: 10,
    width: 100,
    height: 20,
    page: 0,
    origin: "new",
    properties: {},
    ...overrides,
  };
}

describe("BuildModeFieldRenderer", () => {
  it("selects the field on focus (keyboard navigation)", () => {
    const onSelect = vi.fn();
    render(
      <BuildModeFieldRenderer
        field={makeField()}
        scale={1}
        isSelected={false}
        onSelect={onSelect}
        onDelete={vi.fn()}
        onMove={vi.fn()}
        onResize={vi.fn()}
      />
    );

    fireEvent.focus(screen.getByRole("button", { name: /text field: field_1/i }));
    expect(onSelect).toHaveBeenCalledWith("field_1");
  });

  it("deletes on both Delete and Backspace when selected", () => {
    const onDelete = vi.fn();
    const { rerender } = render(
      <BuildModeFieldRenderer
        field={makeField()}
        scale={1}
        isSelected
        onSelect={vi.fn()}
        onDelete={onDelete}
        onMove={vi.fn()}
        onResize={vi.fn()}
      />
    );

    fireEvent.keyDown(screen.getByRole("button", { name: /text field: field_1/i }), { key: "Delete" });
    expect(onDelete).toHaveBeenCalledTimes(1);

    rerender(
      <BuildModeFieldRenderer
        field={makeField()}
        scale={1}
        isSelected
        onSelect={vi.fn()}
        onDelete={onDelete}
        onMove={vi.fn()}
        onResize={vi.fn()}
      />
    );
    fireEvent.keyDown(screen.getByRole("button", { name: /text field: field_1/i }), { key: "Backspace" });
    expect(onDelete).toHaveBeenCalledTimes(2);
  });

  it("does not delete on Delete/Backspace when not selected", () => {
    const onDelete = vi.fn();
    render(
      <BuildModeFieldRenderer
        field={makeField()}
        scale={1}
        isSelected={false}
        onSelect={vi.fn()}
        onDelete={onDelete}
        onMove={vi.fn()}
        onResize={vi.fn()}
      />
    );

    fireEvent.keyDown(screen.getByRole("button", { name: /text field: field_1/i }), { key: "Delete" });
    fireEvent.keyDown(screen.getByRole("button", { name: /text field: field_1/i }), { key: "Backspace" });
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("duplicates on Cmd/Ctrl+D when selected", () => {
    const onDuplicate = vi.fn();
    render(
      <BuildModeFieldRenderer
        field={makeField()}
        scale={1}
        isSelected
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
        onResize={vi.fn()}
        onDuplicate={onDuplicate}
      />
    );

    fireEvent.keyDown(screen.getByRole("button", { name: /text field: field_1/i }), { key: "d", ctrlKey: true });
    expect(onDuplicate).toHaveBeenCalledWith("field_1");
  });

  it("no longer renders the inline field-controls overlay (superseded by ContextToolbar)", () => {
    render(
      <BuildModeFieldRenderer
        field={makeField()}
        scale={1}
        isSelected
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
        onResize={vi.fn()}
        onDuplicate={vi.fn()}
        onDuplicateOnAllPages={vi.fn()}
        onOpenProperties={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: /duplicate field/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete field/i })
    ).not.toBeInTheDocument();
  });

  it("fires onOpenProperties (and selects) on double-click, without a text label overlay", async () => {
    const onOpenProperties = vi.fn();
    const onSelect = vi.fn();
    render(
      <BuildModeFieldRenderer
        field={makeField()}
        scale={1}
        isSelected={false}
        onSelect={onSelect}
        onDelete={vi.fn()}
        onMove={vi.fn()}
        onResize={vi.fn()}
        onOpenProperties={onOpenProperties}
      />
    );

    fireEvent.dblClick(
      screen.getByRole("button", { name: /text field: field_1/i })
    );

    expect(onSelect).toHaveBeenCalledWith("field_1");
    expect(onOpenProperties).toHaveBeenCalledWith("field_1");
  });

  it("double-click is a no-op beyond selecting when onOpenProperties is not provided", () => {
    const onSelect = vi.fn();
    render(
      <BuildModeFieldRenderer
        field={makeField()}
        scale={1}
        isSelected={false}
        onSelect={onSelect}
        onDelete={vi.fn()}
        onMove={vi.fn()}
        onResize={vi.fn()}
      />
    );

    expect(() =>
      fireEvent.dblClick(
        screen.getByRole("button", { name: /text field: field_1/i })
      )
    ).not.toThrow();
    expect(onSelect).toHaveBeenCalledWith("field_1");
  });

  it("resolves an assignee chip's label from the full participant list when they've been excluded from the assignable list (audit #1)", () => {
    render(
      <BuildModeFieldRenderer
        field={makeField({ properties: { assignees: ["party-1"] } })}
        scale={1}
        isSelected={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
        onResize={vi.fn()}
        participants={[]}
        allParticipants={[{ id: "party-1", label: "Jane Landlord" }]}
      />
    );

    expect(screen.getByText("Jane Landlord")).toBeInTheDocument();
    expect(screen.queryByText("party-1")).not.toBeInTheDocument();
  });

  it("shows a required indicator when the field is required", () => {
    const { container, rerender } = render(
      <BuildModeFieldRenderer
        field={makeField({ properties: { required: true } })}
        scale={1}
        isSelected={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
        onResize={vi.fn()}
      />
    );
    expect(container.querySelector('[title="Required"]')).toBeTruthy();

    rerender(
      <BuildModeFieldRenderer
        field={makeField({ properties: { required: false } })}
        scale={1}
        isSelected={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
        onResize={vi.fn()}
      />
    );
    expect(container.querySelector('[title="Required"]')).toBeFalsy();
  });
});
