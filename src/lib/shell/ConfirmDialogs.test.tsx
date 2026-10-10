import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { Dialog, Portal } from "@chakra-ui/react";

import { renderWithChakra } from "../testUtils";
import {
  ConfirmDialogs,
  OptionsEditorDialog,
  type ConfirmDialogsProps,
} from "./ConfirmDialogs";

function makeProps(
  overrides: Partial<{
    [K in keyof ConfirmDialogsProps]: Partial<ConfirmDialogsProps[K]>;
  }> = {}
): ConfirmDialogsProps {
  return {
    unsaved: {
      open: false,
      isSaving: false,
      onKeepEditing: vi.fn(),
      onDiscard: vi.fn(),
      onSave: vi.fn(),
      ...overrides.unsaved,
    },
    prepare: {
      open: false,
      isSaving: false,
      onStay: vi.fn(),
      onContinueWithoutSaving: vi.fn(),
      onSaveAndContinue: vi.fn(),
      ...overrides.prepare,
    },
    decline: {
      open: false,
      isDeclining: false,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
      ...overrides.decline,
    },
    incomplete: {
      open: false,
      count: 3,
      isSaving: false,
      onKeepSigning: vi.fn(),
      onSaveAnyway: vi.fn(),
      ...overrides.incomplete,
    },
  };
}

function footerButtonNames(dialog: HTMLElement): string[] {
  return within(dialog)
    .getAllByRole("button")
    .map((b) => b.textContent?.trim() ?? "");
}

beforeEach(() => {
  // jsdom lays nothing out, so Chakra's focus trap (zag) treats every
  // element as invisible and skips `initialFocusEl`. Report one client rect
  // so focus behaves as in a browser.
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([
    new DOMRect(0, 0, 10, 10),
  ] as unknown as DOMRectList);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ConfirmDialogs", () => {
  it("renders nothing while every dialog is closed", () => {
    renderWithChakra(<ConfirmDialogs {...makeProps()} />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("unsaved guard: alertdialog, cancel-like first, focus on Keep editing", async () => {
    const props = makeProps({ unsaved: { open: true } });
    renderWithChakra(<ConfirmDialogs {...props} />);

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Save your changes?");
    expect(
      screen.getByRole("heading", { name: "Save your changes?" })
    ).toBeInTheDocument();
    expect(footerButtonNames(dialog)).toEqual(["Keep editing", "Discard", "Save"]);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus()
    );

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(props.unsaved.onDiscard).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.unsaved.onSave).toHaveBeenCalledTimes(1);
  });

  it("prepare guard: Stay in Prepare first and focused", async () => {
    const props = makeProps({ prepare: { open: true } });
    renderWithChakra(<ConfirmDialogs {...props} />);

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Save your fields first?");
    expect(footerButtonNames(dialog)).toEqual([
      "Stay in Prepare",
      "Continue without saving",
      "Save and continue",
    ]);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Stay in Prepare" })
      ).toHaveFocus()
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Continue without saving" })
    );
    expect(props.prepare.onContinueWithoutSaving).toHaveBeenCalledTimes(1);
  });

  it("decline: Cancel focused; confirm calls onConfirm", async () => {
    const props = makeProps({ decline: { open: true } });
    renderWithChakra(<ConfirmDialogs {...props} />);

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Decline to sign?");
    expect(footerButtonNames(dialog)).toEqual(["Cancel", "Decline"]);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus()
    );

    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(props.decline.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("decline while declining: Decline shows loading, Cancel and Esc are blocked", async () => {
    const props = makeProps({ decline: { open: true, isDeclining: true } });
    renderWithChakra(<ConfirmDialogs {...props} />);

    const dialog = screen.getByRole("alertdialog");
    const [cancel, confirm] = within(dialog).getAllByRole("button");
    expect(cancel).toBeDisabled();
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute("data-loading");

    await userEvent.keyboard("{Escape}");
    expect(props.decline.onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("incomplete save gate (B3): pluralised title, Keep signing focused, Save anyway saves", async () => {
    const props = makeProps({ incomplete: { open: true, count: 3 } });
    const { rerender } = renderWithChakra(<ConfirmDialogs {...props} />);

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("You still have 3 fields to complete");
    expect(footerButtonNames(dialog)).toEqual(["Keep signing", "Save anyway"]);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Keep signing" })).toHaveFocus()
    );

    await userEvent.click(screen.getByRole("button", { name: "Save anyway" }));
    expect(props.incomplete.onSaveAnyway).toHaveBeenCalledTimes(1);

    rerender(
      <ConfirmDialogs
        {...makeProps({ incomplete: { open: true, count: 1 } })}
      />
    );
    expect(screen.getByRole("alertdialog")).toHaveAccessibleName(
      "You still have 1 field to complete"
    );
  });

  it("Save shows loading and the other actions disable while saving", () => {
    renderWithChakra(
      <ConfirmDialogs {...makeProps({ unsaved: { open: true, isSaving: true } })} />
    );
    const [keep, discard, save] = within(
      screen.getByRole("alertdialog")
    ).getAllByRole("button");
    expect(keep).toBeDisabled();
    expect(discard).toBeDisabled();
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute("data-loading");
  });

  it.each([
    ["unsaved", "onKeepEditing"],
    ["prepare", "onStay"],
    ["decline", "onCancel"],
    ["incomplete", "onKeepSigning"],
  ] as const)("Esc on the %s dialog runs its cancel-like action", async (key, handler) => {
    const props = makeProps({ [key]: { open: true } });
    renderWithChakra(<ConfirmDialogs {...props} />);
    await waitFor(() =>
      expect(screen.getByRole("alertdialog")).toContainElement(
        document.activeElement as HTMLElement
      )
    );

    await userEvent.keyboard("{Escape}");

    const section = props[key] as unknown as Record<string, ReturnType<typeof vi.fn>>;
    expect(section[handler]).toHaveBeenCalledTimes(1);
  });

  it("Esc inside the host's dialog closes only the confirm", async () => {
    const hostOpenChange = vi.fn();
    const onKeepEditing = vi.fn();
    const Host = ({ confirmOpen }: { confirmOpen: boolean }) => (
      <Dialog.Root open onOpenChange={hostOpenChange}>
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content aria-label="Host">
              <ConfirmDialogs
                {...makeProps({ unsaved: { open: confirmOpen, onKeepEditing } })}
              />
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    );
    const { rerender } = renderWithChakra(<Host confirmOpen={false} />);
    const host = await screen.findByRole("dialog", { name: "Host" });
    // Let the host's own focus trap settle before the confirm opens on top.
    await waitFor(() => expect(host).toHaveFocus());

    rerender(<Host confirmOpen />);
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: "Keep editing" })
        ).toHaveFocus(),
      { timeout: 3000 }
    );
    await userEvent.keyboard("{Escape}");

    expect(onKeepEditing).toHaveBeenCalledTimes(1);
    expect(hostOpenChange).not.toHaveBeenCalled();
  });

  it("never submits the host form", async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    renderWithChakra(
      <form onSubmit={onSubmit}>
        <ConfirmDialogs {...makeProps({ unsaved: { open: true } })} />
      </form>
    );

    for (const button of within(screen.getByRole("alertdialog")).getAllByRole(
      "button"
    )) {
      expect(button).toHaveAttribute("type", "button");
    }
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("OptionsEditorDialog", () => {
  const options = [
    { exportValue: "yes", displayValue: "Yes" },
    { exportValue: "no", displayValue: "No" },
  ];

  it("renders the options editor in an 'Edit options' dialog with a Done exit", async () => {
    const onClose = vi.fn();
    renderWithChakra(
      <OptionsEditorDialog
        open
        onClose={onClose}
        options={options}
        onAddOption={vi.fn()}
        onRemoveOption={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Edit options");
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("forwards add and remove to the caller", async () => {
    const onAddOption = vi.fn();
    const onRemoveOption = vi.fn();
    renderWithChakra(
      <OptionsEditorDialog
        open
        onClose={vi.fn()}
        options={options}
        onAddOption={onAddOption}
        onRemoveOption={onRemoveOption}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Remove option No" })
    );
    expect(onRemoveOption).toHaveBeenCalledWith(1);

    await userEvent.type(screen.getByLabelText("New option"), "Maybe{Enter}");
    expect(onAddOption).toHaveBeenCalledWith("Maybe");
  });

  it("renders nothing when closed", () => {
    renderWithChakra(
      <OptionsEditorDialog
        open={false}
        onClose={vi.fn()}
        options={options}
        onAddOption={vi.fn()}
        onRemoveOption={vi.fn()}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
