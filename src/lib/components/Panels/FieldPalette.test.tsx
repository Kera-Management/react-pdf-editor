import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { renderWithChakra } from "../../testUtils";
import { FieldPalette } from "./FieldPalette";

const renderPalette = (props: Partial<React.ComponentProps<typeof FieldPalette>> = {}) =>
  renderWithChakra(
    <FieldPalette
      onFieldDragStart={vi.fn()}
      onFieldDragEnd={vi.fn()}
      selectedField={null}
      onCloseEditor={vi.fn()}
      {...props}
    />
  );

describe("FieldPalette", () => {
  it("adds a field on click", () => {
    const onFieldAdd = vi.fn();
    renderPalette({ onFieldAdd });

    fireEvent.click(screen.getByRole("button", { name: /add text field/i }));
    expect(onFieldAdd).toHaveBeenCalledWith("text");
  });

  it("adds a field on Enter and Space (keyboard, previously keyboard-dead)", () => {
    const onFieldAdd = vi.fn();
    renderPalette({ onFieldAdd });

    const checkboxItem = screen.getByRole("button", {
      name: /add checkbox field/i,
    });
    fireEvent.keyDown(checkboxItem, { key: "Enter" });
    expect(onFieldAdd).toHaveBeenCalledWith("checkbox");

    fireEvent.keyDown(checkboxItem, { key: " " });
    expect(onFieldAdd).toHaveBeenCalledTimes(2);
  });

  it("renders every field type without a fake keyboard-shortcut badge", () => {
    renderPalette();

    expect(screen.getAllByRole("button", { name: /^add .* field$/i })).toHaveLength(6);
    expect(screen.getByText("Signature")).toBeInTheDocument();
    // The old single-letter badges (T/A/C/D/R/S) never did anything --
    // removed rather than left as a fake affordance.
    expect(screen.queryByText("S")).not.toBeInTheDocument();
  });

  it("keeps rows natively draggable and keyboard-focusable", () => {
    renderPalette();
    const row = screen.getByRole("button", { name: /add signature field/i });
    expect(row).toHaveAttribute("draggable", "true");
    expect(row).toHaveAttribute("tabindex", "0");
  });

  it("starts an HTML5 drag with the field type and marks the row as dragging", () => {
    const onFieldDragStart = vi.fn();
    const onFieldDragEnd = vi.fn();
    renderPalette({ onFieldDragStart, onFieldDragEnd });

    const row = screen.getByRole("button", { name: /add dropdown field/i });
    const setData = vi.fn();
    fireEvent.dragStart(row, {
      dataTransfer: { setData, effectAllowed: "" },
    });
    expect(setData).toHaveBeenCalledWith("fieldType", "dropdown");
    expect(onFieldDragStart).toHaveBeenCalledWith("dropdown");
    expect(row).toHaveAttribute("data-dragging");

    fireEvent.dragEnd(row);
    expect(onFieldDragEnd).toHaveBeenCalled();
    expect(row).not.toHaveAttribute("data-dragging");
  });

  it("shows the click-to-add helper copy", () => {
    renderPalette();
    expect(
      screen.getByText("Drag onto the page or click to add")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Drag fields onto the document")
    ).not.toBeInTheDocument();
  });
});
