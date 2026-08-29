import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { Popover } from "./Popover";

const ANCHOR_RECT = new DOMRect(100, 100, 40, 20);

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
      <button onClick={() => setIsOpen(true)}>Open popover</button>
      <Popover
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRect={ANCHOR_RECT}
        title="Field properties"
        footer={footer}
      >
        {children}
      </Popover>
    </div>
  );
}

describe("Popover", () => {
  it("renders nothing when closed", () => {
    render(
      <Popover
        isOpen={false}
        onClose={vi.fn()}
        anchorRect={ANCHOR_RECT}
        title="Hidden"
      >
        <p>content</p>
      </Popover>
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders nothing when there's no anchor, even if isOpen", () => {
    render(
      <Popover isOpen onClose={vi.fn()} anchorRect={null} title="Hidden">
        <p>content</p>
      </Popover>
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the title and body when open", () => {
    render(
      <Popover
        isOpen
        onClose={vi.fn()}
        anchorRect={ANCHOR_RECT}
        title="Field properties"
      >
        <p>Body content</p>
      </Popover>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Field properties");
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("renders footer content when provided", () => {
    render(
      <Popover
        isOpen
        onClose={vi.fn()}
        anchorRect={ANCHOR_RECT}
        title="Field properties"
        footer={<button>Save</button>}
      >
        <p>Body content</p>
      </Popover>
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("calls onClose on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Popover
        isOpen
        onClose={onClose}
        anchorRect={ANCHOR_RECT}
        title="Field properties"
      >
        <p>Body content</p>
      </Popover>
    );

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Popover
        isOpen
        onClose={onClose}
        anchorRect={ANCHOR_RECT}
        title="Field properties"
      >
        <p>Body content</p>
      </Popover>
    );

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on outside mousedown but not on a click inside", () => {
    const onClose = vi.fn();
    render(
      <div>
        <div data-testid="outside">outside</div>
        <Popover
          isOpen
          onClose={onClose}
          anchorRect={ANCHOR_RECT}
          title="Field properties"
        >
          <p>Body content</p>
        </Popover>
      </div>
    );

    fireEvent.mouseDown(screen.getByText("Body content"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the popover on open, to the first focusable element", () => {
    render(
      <Popover
        isOpen
        onClose={vi.fn()}
        anchorRect={ANCHOR_RECT}
        title="Field properties"
      >
        <input aria-label="Name" />
      </Popover>
    );

    // The header's close button precedes the body content in DOM order.
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("restores focus to the opener when closed via Escape", async () => {
    render(<Harness />);

    const opener = screen.getByRole("button", { name: "Open popover" });
    await userEvent.click(opener);
    expect(opener).not.toHaveFocus();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
