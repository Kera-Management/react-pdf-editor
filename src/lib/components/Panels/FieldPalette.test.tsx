import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { FieldPalette } from "./FieldPalette";

describe("FieldPalette", () => {
  it("adds a field on click", () => {
    const onFieldAdd = vi.fn();
    render(
      <FieldPalette
        onFieldDragStart={vi.fn()}
        onFieldDragEnd={vi.fn()}
        onFieldAdd={onFieldAdd}
        selectedField={null}
        onCloseEditor={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /add text field/i }));
    expect(onFieldAdd).toHaveBeenCalledWith("text");
  });

  it("adds a field on Enter and Space (keyboard, previously keyboard-dead)", () => {
    const onFieldAdd = vi.fn();
    render(
      <FieldPalette
        onFieldDragStart={vi.fn()}
        onFieldDragEnd={vi.fn()}
        onFieldAdd={onFieldAdd}
        selectedField={null}
        onCloseEditor={vi.fn()}
      />
    );

    const checkboxItem = screen.getByRole("button", {
      name: /add checkbox field/i,
    });
    fireEvent.keyDown(checkboxItem, { key: "Enter" });
    expect(onFieldAdd).toHaveBeenCalledWith("checkbox");

    fireEvent.keyDown(checkboxItem, { key: " " });
    expect(onFieldAdd).toHaveBeenCalledTimes(2);
  });

  it("renders every field type without a fake keyboard-shortcut badge", () => {
    render(
      <FieldPalette
        onFieldDragStart={vi.fn()}
        onFieldDragEnd={vi.fn()}
        selectedField={null}
        onCloseEditor={vi.fn()}
      />
    );

    expect(screen.getByText("Signature")).toBeInTheDocument();
    // The old single-letter badges (T/A/C/D/R/S) never did anything --
    // removed rather than left as a fake affordance.
    expect(screen.queryByText("S")).not.toBeInTheDocument();
  });
});
