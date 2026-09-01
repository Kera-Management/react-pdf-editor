import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { ContextToolbar, ContextToolbarFieldContext } from "./ContextToolbar";

const TARGET_RECT = new DOMRect(100, 100, 40, 20);

const TEXT_CONTEXT: ContextToolbarFieldContext = {
  fieldName: "Full Name",
  fieldType: "text",
};

describe("ContextToolbar", () => {
  it("renders nothing when isVisible is false", () => {
    const { container } = render(
      <ContextToolbar
        targetRect={TARGET_RECT}
        isVisible={false}
        context={TEXT_CONTEXT}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when targetRect is null", () => {
    const { container } = render(
      <ContextToolbar
        targetRect={null}
        isVisible
        context={TEXT_CONTEXT}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders as an accessible toolbar when visible with a target", () => {
    render(
      <ContextToolbar
        targetRect={TARGET_RECT}
        isVisible
        context={TEXT_CONTEXT}
        onDelete={vi.fn()}
      />
    );

    expect(
      screen.getByRole("toolbar", { name: "Field actions" })
    ).toBeInTheDocument();
  });

  it("renders without a context chip when context is omitted (defensive fallback)", () => {
    render(
      <ContextToolbar targetRect={TARGET_RECT} isVisible onDelete={vi.fn()} />
    );

    expect(
      screen.getByRole("toolbar", { name: "Field actions" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Full Name")).not.toBeInTheDocument();
  });

  it("shows the field name in the context chip", () => {
    render(
      <ContextToolbar targetRect={TARGET_RECT} isVisible context={TEXT_CONTEXT} />
    );

    expect(screen.getByText("Full Name")).toBeInTheDocument();
  });

  it("replaces the chip text with feedbackText when provided", () => {
    render(
      <ContextToolbar
        targetRect={TARGET_RECT}
        isVisible
        context={TEXT_CONTEXT}
        feedbackText="Added to 4 pages"
      />
    );

    expect(screen.getByText("Added to 4 pages")).toBeInTheDocument();
    expect(screen.queryByText("Full Name")).not.toBeInTheDocument();
  });

  it("falls back to the field name once feedbackText clears", () => {
    const { rerender } = render(
      <ContextToolbar
        targetRect={TARGET_RECT}
        isVisible
        context={TEXT_CONTEXT}
        feedbackText="Added to 4 pages"
      />
    );
    expect(screen.getByText("Added to 4 pages")).toBeInTheDocument();

    rerender(
      <ContextToolbar
        targetRect={TARGET_RECT}
        isVisible
        context={TEXT_CONTEXT}
        feedbackText={null}
      />
    );
    expect(screen.getByText("Full Name")).toBeInTheDocument();
  });

  it("renders only the buttons whose callback is passed", () => {
    render(
      <ContextToolbar targetRect={TARGET_RECT} isVisible context={TEXT_CONTEXT} />
    );

    expect(
      screen.queryByRole("button", { name: "Required" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Duplicate" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" })
    ).not.toBeInTheDocument();
  });

  it("every rendered action shows a visible text label matching its aria-label", () => {
    render(
      <ContextToolbar
        targetRect={TARGET_RECT}
        isVisible
        context={TEXT_CONTEXT}
        onToggleRequired={vi.fn()}
        onOpenProperties={vi.fn()}
        onDuplicate={vi.fn()}
        onDuplicateAllPages={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    for (const label of ["Required", "Edit", "Duplicate", "Delete"]) {
      const button = screen.getByRole("button", { name: label });
      expect(button).toHaveAccessibleName(label);
      expect(button).toHaveTextContent(label);
    }
  });

  it("renders Required, fires the callback, and reflects state visibly", async () => {
    const onToggleRequired = vi.fn();
    const { rerender } = render(
      <ContextToolbar
        targetRect={TARGET_RECT}
        isVisible
        context={TEXT_CONTEXT}
        onToggleRequired={onToggleRequired}
        isRequired={false}
      />
    );

    const button = screen.getByRole("button", { name: "Required" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button.className).not.toMatch(/active/);

    await userEvent.click(button);
    expect(onToggleRequired).toHaveBeenCalledTimes(1);

    rerender(
      <ContextToolbar
        targetRect={TARGET_RECT}
        isVisible
        context={TEXT_CONTEXT}
        onToggleRequired={onToggleRequired}
        isRequired
      />
    );
    const activeButton = screen.getByRole("button", { name: "Required" });
    expect(activeButton).toHaveAttribute("aria-pressed", "true");
    expect(activeButton.className).toMatch(/active/);
  });

  it("renders Edit and fires onOpenProperties", async () => {
    const onOpenProperties = vi.fn();
    render(
      <ContextToolbar
        targetRect={TARGET_RECT}
        isVisible
        context={TEXT_CONTEXT}
        onOpenProperties={onOpenProperties}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onOpenProperties).toHaveBeenCalledTimes(1);
  });

  it("renders Delete and fires onDelete", async () => {
    const onDelete = vi.fn();
    render(
      <ContextToolbar
        targetRect={TARGET_RECT}
        isVisible
        context={TEXT_CONTEXT}
        onDelete={onDelete}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("Duplicate opens a menu with both duplicate choices and fires the matching callback", async () => {
    const onDuplicate = vi.fn();
    const onDuplicateAllPages = vi.fn();
    render(
      <ContextToolbar
        targetRect={TARGET_RECT}
        isVisible
        context={TEXT_CONTEXT}
        onDuplicate={onDuplicate}
        onDuplicateAllPages={onDuplicateAllPages}
      />
    );

    const duplicateButton = screen.getByRole("button", { name: "Duplicate" });
    expect(duplicateButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await userEvent.click(duplicateButton);
    expect(duplicateButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();

    const onThisPage = screen.getByRole("menuitem", { name: "On this page" });
    const onEveryPage = screen.getByRole("menuitem", {
      name: "On every page",
    });
    expect(onThisPage).toBeInTheDocument();
    expect(onEveryPage).toBeInTheDocument();

    await userEvent.click(onThisPage);
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDuplicateAllPages).not.toHaveBeenCalled();
    // Menu closes after a choice is made.
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: "On every page" })
    );
    expect(onDuplicateAllPages).toHaveBeenCalledTimes(1);
  });

  it("Duplicate performs the action directly (no menu) when only one duplicate callback is provided", async () => {
    const onDuplicate = vi.fn();
    render(
      <ContextToolbar
        targetRect={TARGET_RECT}
        isVisible
        context={TEXT_CONTEXT}
        onDuplicate={onDuplicate}
      />
    );

    const duplicateButton = screen.getByRole("button", { name: "Duplicate" });
    expect(duplicateButton).not.toHaveAttribute("aria-haspopup");

    await userEvent.click(duplicateButton);
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the duplicate menu on outside click", async () => {
    render(
      <ContextToolbar
        targetRect={TARGET_RECT}
        isVisible
        context={TEXT_CONTEXT}
        onDuplicate={vi.fn()}
        onDuplicateAllPages={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await userEvent.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("does not render a lock button even when onToggleLock/isLocked are passed", () => {
    render(
      <ContextToolbar
        targetRect={TARGET_RECT}
        isVisible
        context={TEXT_CONTEXT}
        onToggleLock={vi.fn()}
        isLocked
      />
    );

    expect(
      screen.queryByRole("button", { name: /lock/i })
    ).not.toBeInTheDocument();
  });

  it("renders additionalActions when provided", () => {
    render(
      <ContextToolbar
        targetRect={TARGET_RECT}
        isVisible
        context={TEXT_CONTEXT}
        additionalActions={<button>Extra action</button>}
      />
    );

    expect(
      screen.getByRole("button", { name: "Extra action" })
    ).toBeInTheDocument();
  });

  it("no longer renders an assign-to-participant button", () => {
    render(
      <ContextToolbar
        targetRect={TARGET_RECT}
        isVisible
        context={TEXT_CONTEXT}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onToggleRequired={vi.fn()}
        onOpenProperties={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: /assign/i })
    ).not.toBeInTheDocument();
    // ContextToolbarProps no longer accepts onAssign/participants/
    // assignedParticipant -- TypeScript enforces this at compile time.
  });
});
