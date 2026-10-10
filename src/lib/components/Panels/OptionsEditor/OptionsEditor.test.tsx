import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { renderWithChakra as render } from "../../../testUtils";
import { OptionsEditor } from "./OptionsEditor";

const noop = () => {};

describe("OptionsEditor", () => {
  it("renders the current options", () => {
    render(
      <OptionsEditor
        options={[
          { exportValue: "red", displayValue: "Red" },
          { exportValue: "blue", displayValue: "Blue" },
        ]}
        onAddOption={noop}
        onRemoveOption={noop}
      />
    );

    expect(screen.getByText("Red")).toBeInTheDocument();
    expect(screen.getByText("Blue")).toBeInTheDocument();
  });

  it("pairs the new-option control with an accessible (visually hidden) label", () => {
    render(
      <OptionsEditor options={[]} onAddOption={noop} onRemoveOption={noop} />
    );

    expect(screen.getByLabelText("New option")).toBeInTheDocument();
  });

  it("calls onRemoveOption with the option's index when its remove button is clicked", async () => {
    const user = userEvent.setup();
    const onRemoveOption = vi.fn();

    render(
      <OptionsEditor
        options={[
          { exportValue: "red", displayValue: "Red" },
          { exportValue: "blue", displayValue: "Blue" },
        ]}
        onAddOption={noop}
        onRemoveOption={onRemoveOption}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Remove option Blue" })
    );

    expect(onRemoveOption).toHaveBeenCalledWith(1);
  });

  it("adds an option via the Add button, trimmed, and clears the input", async () => {
    const user = userEvent.setup();
    const onAddOption = vi.fn();

    render(
      <OptionsEditor options={[]} onAddOption={onAddOption} onRemoveOption={noop} />
    );

    const input = screen.getByLabelText("New option");
    await user.type(input, "  Green  ");
    await user.click(screen.getByRole("button", { name: "Add option" }));

    expect(onAddOption).toHaveBeenCalledWith("Green");
    expect(input).toHaveValue("");
  });

  it("adds an option via the Enter key", async () => {
    const user = userEvent.setup();
    const onAddOption = vi.fn();

    render(
      <OptionsEditor options={[]} onAddOption={onAddOption} onRemoveOption={noop} />
    );

    const input = screen.getByLabelText("New option");
    await user.type(input, "Yellow{Enter}");

    expect(onAddOption).toHaveBeenCalledWith("Yellow");
    expect(input).toHaveValue("");
  });

  it("disables the Add button while the input is empty or whitespace-only", async () => {
    const user = userEvent.setup();
    const onAddOption = vi.fn();

    render(
      <OptionsEditor options={[]} onAddOption={onAddOption} onRemoveOption={noop} />
    );

    const addButton = screen.getByRole("button", { name: "Add option" });
    expect(addButton).toBeDisabled();

    const input = screen.getByLabelText("New option");
    await user.type(input, "   ");
    expect(addButton).toBeDisabled();

    await user.click(addButton);
    expect(onAddOption).not.toHaveBeenCalled();
  });

  it("shows the option count as a badge next to the Options heading", () => {
    render(
      <OptionsEditor
        options={[
          { exportValue: "a", displayValue: "A" },
          { exportValue: "b", displayValue: "B" },
          { exportValue: "c", displayValue: "C" },
        ]}
        onAddOption={noop}
        onRemoveOption={noop}
      />
    );
    const group = screen.getByRole("group", { name: "Options" });
    expect(group).toHaveTextContent("3");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("puts type=button on every button (the host wraps the editor in a form)", () => {
    render(
      <OptionsEditor
        options={[{ exportValue: "a", displayValue: "A" }]}
        onAddOption={noop}
        onRemoveOption={noop}
      />
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
    }
  });

  describe("A7: no options", () => {
    it("warns when there are no options", () => {
      render(
        <OptionsEditor options={[]} onAddOption={noop} onRemoveOption={noop} />
      );
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("No options");
      expect(alert).toHaveTextContent(
        "Add at least one option so signers can choose."
      );
    });

    it("clears the warning once an option is added", () => {
      const { rerender } = render(
        <OptionsEditor options={[]} onAddOption={noop} onRemoveOption={noop} />
      );
      expect(screen.getByRole("alert")).toBeInTheDocument();
      rerender(
        <OptionsEditor
          options={[{ exportValue: "a", displayValue: "A" }]}
          onAddOption={noop}
          onRemoveOption={noop}
        />
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("can leave the warning to the parent (showEmptyWarning={false})", () => {
      render(
        <OptionsEditor
          options={[]}
          onAddOption={noop}
          onRemoveOption={noop}
          showEmptyWarning={false}
        />
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
