import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { Button } from "@chakra-ui/react";

import { renderWithChakra } from "../../testUtils";
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
      <button type="button" onClick={() => setIsOpen(true)}>
        Open modal
      </button>
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

/** Chakra moves focus into the dialog asynchronously after mount. */
async function waitForFocusInDialog() {
  await waitFor(() =>
    expect(screen.getByRole("dialog")).toContainElement(
      document.activeElement as HTMLElement
    )
  );
}

const originalInnerWidth = window.innerWidth;

beforeEach(() => {
  // jsdom lays nothing out, so Chakra's focus trap (zag) would treat every
  // element as invisible. Report one client rect so focus behaves as in a
  // browser.
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([
    new DOMRect(0, 0, 10, 10),
  ] as unknown as DOMRectList);
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: originalInnerWidth,
  });
});

describe("Modal", () => {
  it("renders nothing when closed", () => {
    renderWithChakra(
      <Modal isOpen={false} onClose={vi.fn()} title="Hidden">
        <p>content</p>
      </Modal>
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders as an accessible dialog labelled by its title when open", () => {
    renderWithChakra(
      <Modal isOpen onClose={vi.fn()} title="Confirm action">
        <p>Body content</p>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Confirm action");
    expect(dialog).toHaveAttribute("data-pdfe-modal", "dialog");
    expect(dialog).toHaveAttribute("data-state", "open");
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("renders footer content when provided", () => {
    renderWithChakra(
      <Modal
        isOpen
        onClose={vi.fn()}
        title="Confirm action"
        footer={<Button type="button">Confirm</Button>}
      >
        <p>Body content</p>
      </Modal>
    );

    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });

  it("calls onClose on Escape", async () => {
    const onClose = vi.fn();
    renderWithChakra(
      <Modal isOpen onClose={onClose} title="Confirm action">
        <p>Body content</p>
      </Modal>
    );

    await waitForFocusInDialog();
    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    renderWithChakra(
      <Modal isOpen onClose={onClose} title="Confirm action">
        <p>Body content</p>
      </Modal>
    );

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not submit a surrounding host form from its close button", async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    renderWithChakra(
      <form onSubmit={onSubmit}>
        <Modal isOpen onClose={vi.fn()} title="Confirm action">
          <p>Body content</p>
        </Modal>
      </form>
    );

    expect(screen.getByRole("button", { name: "Close" })).toHaveAttribute(
      "type",
      "button"
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("moves focus into the dialog on open (C13)", async () => {
    renderWithChakra(<Harness>{<input aria-label="Name" />}</Harness>);

    await userEvent.click(screen.getByRole("button", { name: "Open modal" }));

    await waitFor(() =>
      expect(screen.getByRole("dialog")).toContainElement(
        document.activeElement as HTMLElement
      )
    );
  });

  it("traps Tab focus inside the dialog, cycling both directions (C13)", async () => {
    const user = userEvent.setup();
    renderWithChakra(
      <Harness footer={<Button type="button">Confirm</Button>}>
        <input aria-label="Name" />
      </Harness>
    );

    await user.click(screen.getByRole("button", { name: "Open modal" }));
    const closeButton = await screen.findByRole("button", { name: "Close" });
    const nameInput = screen.getByRole("textbox", { name: "Name" });
    const confirmButton = screen.getByRole("button", { name: "Confirm" });

    await waitFor(() => expect(closeButton).toHaveFocus());

    await user.tab();
    expect(nameInput).toHaveFocus();
    await user.tab();
    expect(confirmButton).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirmButton).toHaveFocus();
  });

  it("restores focus to the opener when closed via Escape (C13)", async () => {
    renderWithChakra(<Harness />);

    const opener = screen.getByRole("button", { name: "Open modal" });
    await userEvent.click(opener);
    await waitForFocusInDialog();

    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("renders as a bottom drawer on mobile, with the same title, footer and close", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 375,
    });
    const onClose = vi.fn();
    renderWithChakra(
      <Modal
        isOpen
        onClose={onClose}
        title="Confirm action"
        footer={<Button type="button">Confirm</Button>}
      >
        <p>Body content</p>
      </Modal>
    );

    const drawer = screen.getByRole("dialog");
    expect(drawer).toHaveAttribute("data-pdfe-modal", "drawer");
    expect(drawer).toHaveAccessibleName("Confirm action");
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
