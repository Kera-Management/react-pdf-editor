import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { Dialog } from "@chakra-ui/react";

import { renderWithChakra } from "../testUtils";
import {
  FieldSettingsPopover,
  type FieldSettingsPopoverProps,
} from "./FieldSettingsPopover";
import type { BuildModeField } from "../PDFEditor";

const makeField = (overrides: Partial<BuildModeField> = {}): BuildModeField => ({
  id: "f1",
  type: "text",
  name: "Tenant full name",
  x: 10,
  y: 20,
  width: 180,
  height: 24,
  page: 0,
  origin: "new",
  properties: {},
  ...overrides,
});

const renderPopover = (props: Partial<FieldSettingsPopoverProps> = {}) => {
  const all: FieldSettingsPopoverProps = {
    open: true,
    onOpenChange: vi.fn(),
    field: makeField(),
    getAnchorRect: vi.fn(() => new DOMRect(100, 100, 180, 24)),
    onUpdateField: vi.fn(),
    onEditOptions: vi.fn(),
    ...props,
  };
  const utils = renderWithChakra(<FieldSettingsPopover {...all} />);
  return { ...utils, props: all };
};

describe("FieldSettingsPopover", () => {
  it("renders nothing while closed", () => {
    renderPopover({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Field name")).not.toBeInTheDocument();
  });

  it("renders a labelled dialog anchored via getAnchorRect", async () => {
    const { props } = renderPopover();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Text Field");
    await waitFor(() => expect(props.getAnchorRect).toHaveBeenCalled());
  });

  it("copy #17: 'Field name' label edits the field name", () => {
    const { props } = renderPopover();
    const input = screen.getByLabelText("Field name");
    expect(input).toHaveValue("Tenant full name");
    fireEvent.change(input, { target: { value: "Landlord name" } });
    expect(props.onUpdateField).toHaveBeenCalledWith("f1", { name: "Landlord name" });
  });

  it("Placeholder (text fields only) carries an Optional badge and keeps other properties", () => {
    const { props } = renderPopover({
      field: makeField({ properties: { required: true } }),
    });
    expect(screen.getByText("Optional")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Placeholder"), {
      target: { value: "e.g. Jane" },
    });
    expect(props.onUpdateField).toHaveBeenCalledWith("f1", {
      properties: { required: true, placeholder: "e.g. Jane" },
    });
  });

  it("hides Placeholder for checkbox and signature fields", () => {
    renderPopover({ field: makeField({ type: "signature" }) });
    expect(screen.queryByLabelText("Placeholder")).not.toBeInTheDocument();
  });

  it("moves focus to the field name on open", async () => {
    renderPopover();
    const input = screen.getByLabelText("Field name");
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("Size: Width and Height inputs with a pt unit; rejects <= 0", async () => {
    const { props } = renderPopover();
    await waitFor(() => expect(screen.getByLabelText("Field name")).toHaveFocus());
    const width = screen.getByLabelText("Width");
    const height = screen.getByLabelText("Height");
    expect(width).toHaveValue("180");
    expect(height).toHaveValue("24");
    expect(screen.getAllByText("pt")).toHaveLength(2);
    expect(screen.getByRole("group", { name: "Size" })).toBeInTheDocument();

    await userEvent.clear(width);
    await userEvent.type(width, "250");
    expect(props.onUpdateField).toHaveBeenLastCalledWith("f1", { width: 250 });

    vi.mocked(props.onUpdateField).mockClear();
    await userEvent.clear(height);
    await userEvent.type(height, "0");
    expect(props.onUpdateField).not.toHaveBeenCalled();
  });

  it("Size: never applies a value under 20pt while typing; leaving the box clamps to 20", async () => {
    const { props } = renderPopover();
    const width = screen.getByLabelText("Width");
    await userEvent.clear(width);
    vi.mocked(props.onUpdateField).mockClear();
    await userEvent.type(width, "5");
    expect(props.onUpdateField).not.toHaveBeenCalled();

    await userEvent.tab();
    expect(props.onUpdateField).toHaveBeenLastCalledWith("f1", { width: 20 });
  });

  it("copy #18: dropdown shows 'Edit options' with an options count badge", async () => {
    const { props } = renderPopover({
      field: makeField({
        type: "dropdown",
        properties: {
          options: [
            { displayValue: "Yes", exportValue: "yes" },
            { displayValue: "No", exportValue: "no" },
          ],
        },
      }),
    });
    expect(screen.getByText("Options")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByTestId("no-options-warning")).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Edit options" });
    expect(button).toHaveAttribute("type", "button");
    await userEvent.click(button);
    expect(props.onEditOptions).toHaveBeenCalledTimes(1);
  });

  it("A7: zero-option radio shows the 'No options' warning line", () => {
    renderPopover({ field: makeField({ type: "radio", properties: { options: [] } }) });
    expect(screen.getByTestId("no-options-warning")).toHaveTextContent(
      "No options. Add at least one option so signers can choose."
    );
  });

  it("A7: no warning for an imported radio group, matching the canvas", () => {
    renderPopover({
      field: makeField({
        type: "radio",
        origin: "existing",
        properties: { options: [] },
      }),
    });
    expect(screen.queryByTestId("no-options-warning")).not.toBeInTheDocument();
  });

  it("text fields have no options section", () => {
    renderPopover();
    expect(screen.queryByRole("button", { name: "Edit options" })).not.toBeInTheDocument();
  });

  it("Close button requests close", async () => {
    const { props } = renderPopover();
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveAttribute("type", "button");
    await userEvent.click(close);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("re-runs positioning when the measured anchor rect changes", async () => {
    const getAnchorRect = vi.fn(() => new DOMRect(100, 100, 180, 24));
    const base = {
      open: true,
      onOpenChange: vi.fn(),
      field: makeField(),
      getAnchorRect,
      onUpdateField: vi.fn(),
      onEditOptions: vi.fn(),
    };
    const { rerender } = renderWithChakra(
      <FieldSettingsPopover {...base} anchorRect={new DOMRect(100, 100, 180, 24)} />
    );
    await waitFor(() => expect(getAnchorRect).toHaveBeenCalled());
    const before = getAnchorRect.mock.calls.length;
    rerender(
      <FieldSettingsPopover {...base} anchorRect={new DOMRect(100, 300, 180, 24)} />
    );
    await waitFor(() =>
      expect(getAnchorRect.mock.calls.length).toBeGreaterThan(before)
    );
  });

  it("Esc closes only the popover when it opens inside a host Dialog", async () => {
    const onPopoverOpenChange = vi.fn();
    const onDialogOpenChange = vi.fn();
    const Host = ({ popoverOpen }: { popoverOpen: boolean }) => (
      <Dialog.Root open onOpenChange={onDialogOpenChange}>
        <Dialog.Positioner>
          <Dialog.Content>
            <form>
              <FieldSettingsPopover
                open={popoverOpen}
                onOpenChange={onPopoverOpenChange}
                field={makeField()}
                getAnchorRect={() => new DOMRect(100, 100, 180, 24)}
                onUpdateField={vi.fn()}
                onEditOptions={vi.fn()}
              />
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
    );
    // The host Dialog is already open when the popover opens (real order).
    const { rerender } = renderWithChakra(<Host popoverOpen={false} />);
    await screen.findByRole("dialog");
    rerender(<Host popoverOpen />);

    const input = await screen.findByLabelText("Field name");
    await waitFor(() => expect(input).toHaveFocus());
    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(onPopoverOpenChange).toHaveBeenCalledWith(false));
    expect(onDialogOpenChange).not.toHaveBeenCalled();
  });

  it("renders in dark mode", () => {
    renderWithChakra(
      <FieldSettingsPopover
        open
        onOpenChange={vi.fn()}
        field={makeField()}
        getAnchorRect={() => null}
        onUpdateField={vi.fn()}
        onEditOptions={vi.fn()}
      />,
      { colorMode: "dark" }
    );
    expect(screen.getByLabelText("Field name")).toBeInTheDocument();
  });
});
