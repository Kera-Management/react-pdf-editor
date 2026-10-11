import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithChakra as render } from "../testUtils";

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

  const baseProps = {
    scale: 1,
    onDelete: vi.fn(),
    onMove: vi.fn(),
    onResize: vi.fn(),
  };

  it("A6: shift-click asks for an additive (toggle) selection, plain click does not", () => {
    const onSelect = vi.fn();
    render(
      <BuildModeFieldRenderer
        {...baseProps}
        field={makeField()}
        isSelected={false}
        onSelect={onSelect}
      />
    );
    const box = screen.getByRole("button", { name: /text field: field_1/i });

    fireEvent.click(box, { shiftKey: true });
    expect(onSelect).toHaveBeenLastCalledWith("field_1", { additive: true });

    fireEvent.click(box);
    expect(onSelect).toHaveBeenLastCalledWith("field_1");
  });

  it("A6: a multi-selected field shows the selection outline but no resize handles", () => {
    const { container, rerender } = render(
      <BuildModeFieldRenderer
        {...baseProps}
        field={makeField()}
        isSelected
        onSelect={vi.fn()}
      />
    );
    const box = screen.getByRole("button", { name: /text field: field_1/i });
    expect(box).toHaveAttribute("data-selected", "true");
    expect(container.querySelectorAll("[data-resize-handle]")).toHaveLength(4);

    rerender(
      <BuildModeFieldRenderer
        {...baseProps}
        field={makeField()}
        isSelected
        isMultiSelected
        onSelect={vi.fn()}
      />
    );
    expect(box).toHaveAttribute("data-selected", "true");
    expect(container.querySelectorAll("[data-resize-handle]")).toHaveLength(0);

    rerender(
      <BuildModeFieldRenderer
        {...baseProps}
        field={makeField()}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );
    expect(box).not.toHaveAttribute("data-selected");
  });

  it("A6: a shift-drag still moves only this field (drag math unchanged)", () => {
    const onMove = vi.fn();
    render(
      <BuildModeFieldRenderer
        {...baseProps}
        onMove={onMove}
        scale={2}
        field={makeField({ x: 10, y: 10 })}
        isSelected
        isMultiSelected
        onSelect={vi.fn()}
      />
    );
    const box = screen.getByRole("button", { name: /text field: field_1/i });
    fireEvent.mouseDown(box, { clientX: 100, clientY: 100, shiftKey: true });
    fireEvent.mouseMove(document, { clientX: 120, clientY: 140 });
    fireEvent.mouseUp(document);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith("field_1", 20, 30);
  });

  it("A7: a dropdown with no options is flagged invalid with a 'No options' chip", () => {
    const { rerender } = render(
      <BuildModeFieldRenderer
        {...baseProps}
        field={makeField({ type: "dropdown", properties: { options: [] } })}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );
    const box = screen.getByRole("button", { name: /dropdown field: field_1/i });
    expect(box).toHaveAttribute("data-invalid", "true");
    expect(box).toHaveAccessibleName(/no options/i);
    expect(screen.getByText("No options")).toBeInTheDocument();

    rerender(
      <BuildModeFieldRenderer
        {...baseProps}
        field={makeField({
          type: "dropdown",
          properties: { options: [{ exportValue: "yes", displayValue: "Yes" }] },
        })}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );
    expect(box).not.toHaveAttribute("data-invalid");
    expect(screen.queryByText("No options")).toBeNull();
  });

  it("A7: radios imported from the PDF (no options list) are not flagged", () => {
    render(
      <BuildModeFieldRenderer
        {...baseProps}
        field={makeField({ type: "radio", origin: "existing", properties: {} })}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: /radio field: field_1/i })
    ).not.toHaveAttribute("data-invalid");
  });

  it("renders the signature placeholder with an icon, not an emoji", () => {
    const { container } = render(
      <BuildModeFieldRenderer
        {...baseProps}
        field={makeField({ type: "signature" })}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("Signature")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\u270D/);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("carries data-build-field-id (not the PDF overlays' data-field-id)", () => {
    const { container } = render(
      <BuildModeFieldRenderer
        {...baseProps}
        field={makeField()}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );
    expect(container.querySelector('[data-build-field-id="field_1"]')).toBeTruthy();
    expect(container.querySelector("[data-field-id]")).toBeNull();
  });
});
