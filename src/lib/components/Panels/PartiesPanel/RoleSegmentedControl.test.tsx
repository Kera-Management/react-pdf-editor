import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { renderWithChakra as render } from "../../../testUtils";

import {
  RoleSegmentedControl,
  RoleSegmentedControlOption,
} from "./RoleSegmentedControl";

const options: RoleSegmentedControlOption[] = [
  { value: "signer", label: "Signs" },
  { value: "viewer", label: "Copy" },
  { value: "excluded", label: "None" },
];

/** Controlled wrapper so interactions exercise real re-renders, the way a
 * host consuming this as a controlled component would use it. */
function ControlledControl({
  initial,
}: {
  initial: string | undefined;
}) {
  const [value, setValue] = useState<string | undefined>(initial);
  return (
    <RoleSegmentedControl
      options={options}
      value={value}
      onChange={setValue}
      aria-label="Role"
    />
  );
}

describe("RoleSegmentedControl", () => {
  it("renders undecided state with no segment selected", () => {
    render(
      <RoleSegmentedControl
        options={options}
        value={undefined}
        onChange={vi.fn()}
        aria-label="Role"
      />
    );

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(radio).not.toBeChecked();
    }
  });

  it("marks the radiogroup with the given accessible name", () => {
    render(
      <RoleSegmentedControl
        options={options}
        value="signer"
        onChange={vi.fn()}
        aria-label="Role for Jane Doe"
      />
    );

    expect(
      screen.getByRole("radiogroup", { name: "Role for Jane Doe" })
    ).toBeInTheDocument();
  });

  it("calls onChange with the clicked option's value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RoleSegmentedControl
        options={options}
        value={undefined}
        onChange={onChange}
        aria-label="Role"
      />
    );

    await user.click(screen.getByRole("radio", { name: "Copy" }));

    expect(onChange).toHaveBeenCalledWith("viewer");
  });

  it("selects the clicked segment and reflects it visually via checked state", async () => {
    const user = userEvent.setup();
    render(<ControlledControl initial={undefined} />);

    const signsRadio = screen.getByRole("radio", { name: "Signs" });
    await user.click(signsRadio);

    expect(signsRadio).toBeChecked();
    expect(screen.getByRole("radio", { name: "Copy" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "None" })).not.toBeChecked();
  });

  it("allows re-selecting a different option after one is already selected", async () => {
    const user = userEvent.setup();
    render(<ControlledControl initial="signer" />);

    expect(screen.getByRole("radio", { name: "Signs" })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "None" }));

    expect(screen.getByRole("radio", { name: "None" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Signs" })).not.toBeChecked();
  });

  it("navigates and selects with the right/down arrow keys, wrapping at the end", async () => {
    const user = userEvent.setup();
    render(<ControlledControl initial="signer" />);

    const signs = screen.getByRole("radio", { name: "Signs" });
    const copy = screen.getByRole("radio", { name: "Copy" });
    const none = screen.getByRole("radio", { name: "None" });

    signs.focus();
    expect(signs).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(copy).toBeChecked();
    expect(copy).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(none).toBeChecked();
    expect(none).toHaveFocus();

    // Wraps back around to the first option.
    await user.keyboard("{ArrowRight}");
    expect(signs).toBeChecked();
    expect(signs).toHaveFocus();
  });

  it("navigates and selects with the left/up arrow keys, wrapping at the start", async () => {
    const user = userEvent.setup();
    render(<ControlledControl initial="signer" />);

    const signs = screen.getByRole("radio", { name: "Signs" });
    const none = screen.getByRole("radio", { name: "None" });
    const copy = screen.getByRole("radio", { name: "Copy" });

    signs.focus();

    // Wraps backward from the first option to the last.
    await user.keyboard("{ArrowLeft}");
    expect(none).toBeChecked();
    expect(none).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(copy).toBeChecked();
    expect(copy).toHaveFocus();
  });

  it("treats undecided as starting from the first option for arrow navigation", async () => {
    const user = userEvent.setup();
    render(<ControlledControl initial={undefined} />);

    const signs = screen.getByRole("radio", { name: "Signs" });
    const copy = screen.getByRole("radio", { name: "Copy" });

    signs.focus();
    await user.keyboard("{ArrowRight}");

    expect(copy).toBeChecked();
    expect(copy).toHaveFocus();
  });

  it("groups the segments as native radios sharing one name (browser roving tab stop)", () => {
    render(<ControlledControl initial="viewer" />);

    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(3);
    const names = new Set(radios.map((radio) => radio.name));
    expect(names.size).toBe(1);
    expect([...names][0]).not.toBe("");
    expect(screen.getByRole("radio", { name: "Copy" })).toBeChecked();
  });
});
