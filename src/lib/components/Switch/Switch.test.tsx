import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

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
  it("renders with role switch and reflects checked via aria-checked", () => {
    const { rerender } = render(
      <Switch checked={false} onToggle={vi.fn()} ariaLabel="Notify me" />
    );
    expect(screen.getByRole("switch", { name: "Notify me" })).toHaveAttribute(
      "aria-checked",
      "false"
    );

    rerender(<Switch checked={true} onToggle={vi.fn()} ariaLabel="Notify me" />);
    expect(screen.getByRole("switch", { name: "Notify me" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("jest-dom's toBeChecked reflects the switch's aria-checked state", () => {
    const { rerender } = render(
      <Switch checked={false} onToggle={vi.fn()} ariaLabel="Notify me" />
    );
    expect(screen.getByRole("switch")).not.toBeChecked();

    rerender(<Switch checked={true} onToggle={vi.fn()} ariaLabel="Notify me" />);
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("calls onToggle once on click", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<Switch checked={false} onToggle={onToggle} ariaLabel="Notify me" />);

    await user.click(screen.getByRole("switch"));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("calls onToggle once on Space", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<Switch checked={false} onToggle={onToggle} ariaLabel="Notify me" />);

    screen.getByRole("switch").focus();
    await user.keyboard(" ");

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("calls onToggle once on Enter", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<Switch checked={false} onToggle={onToggle} ariaLabel="Notify me" />);

    screen.getByRole("switch").focus();
    await user.keyboard("{Enter}");

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("calls onToggle exactly once for a raw Space keydown (no double-fire from native activation)", () => {
    const onToggle = vi.fn();
    render(<Switch checked={false} onToggle={onToggle} ariaLabel="Notify me" />);

    fireEvent.keyDown(screen.getByRole("switch"), { key: " " });

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("calls onToggle exactly once for a raw Enter keydown (no double-fire from native activation)", () => {
    const onToggle = vi.fn();
    render(<Switch checked={false} onToggle={onToggle} ariaLabel="Notify me" />);

    fireEvent.keyDown(screen.getByRole("switch"), { key: "Enter" });

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated keys", () => {
    const onToggle = vi.fn();
    render(<Switch checked={false} onToggle={onToggle} ariaLabel="Notify me" />);

    fireEvent.keyDown(screen.getByRole("switch"), { key: "a" });

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("toggles visible state across a full interaction when used as a controlled component", async () => {
    const user = userEvent.setup();
    render(<ControlledSwitch initial={false} />);

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
    render(
      <Switch checked={false} onToggle={onToggle} disabled ariaLabel="Notify me" />
    );

    const control = screen.getByRole("switch");
    expect(control).toBeDisabled();

    await user.click(control);
    fireEvent.keyDown(control, { key: " " });
    fireEvent.keyDown(control, { key: "Enter" });

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("removes a disabled switch from the tab order", () => {
    render(<Switch checked={false} onToggle={vi.fn()} disabled ariaLabel="Notify me" />);

    expect(screen.getByRole("switch")).toHaveAttribute("disabled");
  });

  it("defaults to the md size and accepts sm", () => {
    const { rerender, container } = render(
      <Switch checked={false} onToggle={vi.fn()} ariaLabel="Notify me" />
    );
    const mdClass = (container.querySelector('[role="switch"]') as HTMLElement)
      .className;
    expect(mdClass).toMatch(/md/);

    rerender(
      <Switch checked={false} onToggle={vi.fn()} size="sm" ariaLabel="Notify me" />
    );
    const smClass = (container.querySelector('[role="switch"]') as HTMLElement)
      .className;
    expect(smClass).toMatch(/sm/);
  });
});
