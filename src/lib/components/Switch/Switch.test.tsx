import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { renderWithChakra } from "../../testUtils";
import { Switch } from "./Switch";

/** Controlled wrapper so click/keyboard interactions exercise a real
 * re-render, the way a host consuming this as a controlled component would. */
function ControlledSwitch({ initial }: { initial: boolean }) {
  const [checked, setChecked] = useState(initial);
  return (
    <Switch checked={checked} onToggle={() => setChecked((c) => !c)} ariaLabel="Notify me" />
  );
}

describe("Switch", () => {
  it("renders with role switch and reflects checked state", () => {
    const { rerender } = renderWithChakra(
      <Switch checked={false} onToggle={vi.fn()} ariaLabel="Notify me" />
    );
    expect(screen.getByRole("switch", { name: "Notify me" })).not.toBeChecked();

    rerender(<Switch checked={true} onToggle={vi.fn()} ariaLabel="Notify me" />);
    expect(screen.getByRole("switch", { name: "Notify me" })).toBeChecked();
  });

  it("calls onToggle once on click", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderWithChakra(<Switch checked={false} onToggle={onToggle} ariaLabel="Notify me" />);

    await user.click(screen.getByRole("switch"));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("calls onToggle once on Space", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderWithChakra(<Switch checked={false} onToggle={onToggle} ariaLabel="Notify me" />);

    screen.getByRole("switch").focus();
    await user.keyboard(" ");

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("calls onToggle once on Enter", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderWithChakra(<Switch checked={false} onToggle={onToggle} ariaLabel="Notify me" />);

    screen.getByRole("switch").focus();
    await user.keyboard("{Enter}");

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated keys", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderWithChakra(<Switch checked={false} onToggle={onToggle} ariaLabel="Notify me" />);

    screen.getByRole("switch").focus();
    await user.keyboard("a");

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("toggles visible state across a full interaction when used as a controlled component", async () => {
    const user = userEvent.setup();
    renderWithChakra(<ControlledSwitch initial={false} />);

    const control = screen.getByRole("switch");
    expect(control).not.toBeChecked();

    await user.click(control);
    expect(control).toBeChecked();

    await user.keyboard("{Enter}");
    expect(control).not.toBeChecked();
  });

  it("is inert when disabled: click and keyboard never call onToggle", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderWithChakra(
      <Switch checked={false} onToggle={onToggle} disabled ariaLabel="Notify me" />
    );

    const control = screen.getByRole("switch");
    expect(control).toBeDisabled();

    await user.click(control);
    control.focus();
    await user.keyboard(" ");
    await user.keyboard("{Enter}");

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("is a native checkbox under the hood so it never submits a host form", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    const { container } = renderWithChakra(
      <form>
        <Switch checked={false} onToggle={vi.fn()} ariaLabel="Notify me" />
      </form>
    );
    container.querySelector("form")!.addEventListener("submit", onSubmit);

    await user.click(screen.getByRole("switch"));

    expect(screen.getByRole("switch")).toHaveAttribute("type", "checkbox");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
