import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { Modal } from "./Modal";

/** Opener + toggle so tests exercise real mount/unmount and focus restore
 * the way a host consuming this as a controlled component would. */
function Harness({
  footer,
  children = <p>Body content</p>,
}: {
  footer?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setIsOpen(true)}>Open modal</button>
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Confirm action"
        footer={footer}
      >
        {children}
      </Modal>
    </div>
  );
}

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} title="Hidden">
        <p>content</p>
      </Modal>
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders as an accessible dialog labelled by its title when open", () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Confirm action">
        <p>Body content</p>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Confirm action");
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("renders footer content when provided", () => {
    render(
      <Modal
        isOpen
        onClose={vi.fn()}
        title="Confirm action"
        footer={<button>Confirm</button>}
      >
        <p>Body content</p>
      </Modal>
    );

    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });

  it("calls onClose on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Confirm action">
        <p>Body content</p>
      </Modal>
    );

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on backdrop click but not on dialog content click", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Confirm action">
        <p>Body content</p>
      </Modal>
    );

    fireEvent.mouseDown(screen.getByText("Body content"));
    expect(onClose).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog");
    // The backdrop is the dialog's parent element.
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Confirm action">
        <p>Body content</p>
      </Modal>
    );

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the dialog on open, to the first focusable element", () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Confirm action">
        <input aria-label="Name" />
      </Modal>
    );

    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("traps focus inside the dialog, cycling both directions", async () => {
    const user = userEvent.setup();
    render(
      <Modal
        isOpen
        onClose={vi.fn()}
        title="Confirm action"
        footer={<button>Confirm</button>}
      >
        <input aria-label="Name" />
      </Modal>
    );

    const closeButton = screen.getByRole("button", { name: "Close" });
    const nameInput = screen.getByRole("textbox", { name: "Name" });
    const confirmButton = screen.getByRole("button", { name: "Confirm" });

    expect(closeButton).toHaveFocus();

    await user.tab();
    expect(nameInput).toHaveFocus();

    await user.tab();
    expect(confirmButton).toHaveFocus();

    // Tab from the last focusable element wraps to the first.
    await user.tab();
    expect(closeButton).toHaveFocus();

    // Shift+Tab from the first focusable element wraps to the last.
    await user.tab({ shift: true });
    expect(confirmButton).toHaveFocus();
  });

  it("restores focus to the opener when closed via Escape", async () => {
    render(<Harness />);

    const opener = screen.getByRole("button", { name: "Open modal" });
    await userEvent.click(opener);
    expect(opener).not.toHaveFocus();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
