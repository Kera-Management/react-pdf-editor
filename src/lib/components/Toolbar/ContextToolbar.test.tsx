import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { renderWithChakra } from "../../testUtils";
import {
  ContextToolbar,
  type ContextToolbarFieldContext,
  type ContextToolbarProps,
} from "./ContextToolbar";

const TARGET_RECT = new DOMRect(100, 100, 40, 20);

const TEXT_CONTEXT: ContextToolbarFieldContext = {
  fieldName: "Full Name",
  fieldType: "text",
};

const renderToolbar = (props: Partial<ContextToolbarProps> = {}) =>
  renderWithChakra(
    <ContextToolbar
      targetRect={TARGET_RECT}
      isVisible
      context={TEXT_CONTEXT}
      {...props}
    />
  );

const containerOfWidth = (width: number): React.RefObject<HTMLElement> => {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => new DOMRect(0, 0, width, 800);
  return { current: el };
};

describe("ContextToolbar", () => {
  it("renders nothing when isVisible is false", () => {
    renderToolbar({ isVisible: false, onDelete: vi.fn() });
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("renders nothing when targetRect is null", () => {
    renderToolbar({ targetRect: null, onDelete: vi.fn() });
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("renders as an accessible toolbar with a placement", () => {
    renderToolbar({ onDelete: vi.fn() });
    const toolbar = screen.getByRole("toolbar", { name: "Field actions" });
    expect(toolbar).toHaveAttribute("data-placement");
  });

  it("renders without a context segment when context is omitted", () => {
    renderToolbar({ context: undefined, onDelete: vi.fn() });
    expect(screen.getByRole("toolbar", { name: "Field actions" })).toBeInTheDocument();
    expect(screen.queryByText("Full Name")).not.toBeInTheDocument();
  });

  it("shows the field name in the context segment", () => {
    renderToolbar();
    expect(screen.getByText("Full Name")).toBeInTheDocument();
  });

  it("replaces the field name with feedbackText in a status region", () => {
    renderToolbar({ feedbackText: "Added to 4 pages" });
    expect(screen.getByRole("status")).toHaveTextContent("Added to 4 pages");
    expect(screen.queryByText("Full Name")).not.toBeInTheDocument();
  });

  it("falls back to the field name once feedbackText clears", () => {
    const { rerender } = renderToolbar({ feedbackText: "Added to 4 pages" });
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
    renderToolbar();
    for (const name of ["Required", "Edit", "Duplicate", "Delete"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("every action is type=button with a visible label matching its aria-label", () => {
    renderToolbar({
      onToggleRequired: vi.fn(),
      onOpenProperties: vi.fn(),
      onDuplicate: vi.fn(),
      onDuplicateAllPages: vi.fn(),
      onDelete: vi.fn(),
    });

    for (const label of ["Required", "Edit", "Duplicate", "Delete"]) {
      const button = screen.getByRole("button", { name: label });
      expect(button).toHaveAccessibleName(label);
      expect(button).toHaveTextContent(label);
    }
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
    }
  });

  it("Required fires the callback and reflects state via aria-pressed", async () => {
    const onToggleRequired = vi.fn();
    const { rerender } = renderToolbar({ onToggleRequired, isRequired: false });

    const button = screen.getByRole("button", { name: "Required" });
    expect(button).toHaveAttribute("aria-pressed", "false");
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
    expect(screen.getByRole("button", { name: "Required" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("Edit fires onOpenProperties", async () => {
    const onOpenProperties = vi.fn();
    renderToolbar({ onOpenProperties });
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onOpenProperties).toHaveBeenCalledTimes(1);
  });

  it("Delete fires onDelete", async () => {
    const onDelete = vi.fn();
    renderToolbar({ onDelete });
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("A2: split Duplicate button duplicates in place; the options menu offers both choices", async () => {
    const onDuplicate = vi.fn();
    const onDuplicateAllPages = vi.fn();
    renderToolbar({ onDuplicate, onDuplicateAllPages });

    await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(onDuplicate).toHaveBeenCalledTimes(1);

    const options = screen.getByRole("button", { name: "Duplicate options" });
    expect(options).toHaveAttribute("aria-haspopup", "menu");
    expect(options).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(options);
    expect(options).toHaveAttribute("aria-expanded", "true");
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "On this page" })).toBeInTheDocument();

    await userEvent.click(within(menu).getByRole("menuitem", { name: "On every page" }));
    expect(onDuplicateAllPages).toHaveBeenCalledTimes(1);
    expect(options).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(options);
    await userEvent.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: "On this page" })
    );
    expect(onDuplicate).toHaveBeenCalledTimes(2);
  });

  it("Duplicate acts directly with no options menu when only one callback is provided", async () => {
    const onDuplicateAllPages = vi.fn();
    renderToolbar({ onDuplicateAllPages });
    const button = screen.getByRole("button", { name: "Duplicate" });
    expect(button).not.toHaveAttribute("aria-haspopup");
    expect(
      screen.queryByRole("button", { name: "Duplicate options" })
    ).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(onDuplicateAllPages).toHaveBeenCalledTimes(1);
  });

  it("closes the duplicate menu on Escape", async () => {
    renderToolbar({ onDuplicate: vi.fn(), onDuplicateAllPages: vi.fn() });
    const options = screen.getByRole("button", { name: "Duplicate options" });
    await userEvent.click(options);
    const menu = await screen.findByRole("menu");
    await waitFor(() => expect(menu).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(options).toHaveAttribute("aria-expanded", "false")
    );
  });

  it("C12: collapses to icon buttons with unchanged aria-labels on narrow canvases", () => {
    renderToolbar({
      containerRef: containerOfWidth(360),
      onToggleRequired: vi.fn(),
      onOpenProperties: vi.fn(),
      onDelete: vi.fn(),
    });
    const toolbar = screen.getByRole("toolbar", { name: "Field actions" });
    expect(toolbar).toHaveAttribute("data-compact");
    for (const label of ["Required", "Edit", "Delete"]) {
      const button = screen.getByRole("button", { name: label });
      expect(button).not.toHaveTextContent(label);
    }
  });

  it("keeps labels on wide canvases", () => {
    renderToolbar({ containerRef: containerOfWidth(900), onDelete: vi.fn() });
    expect(screen.getByRole("toolbar")).not.toHaveAttribute("data-compact");
    expect(screen.getByRole("button", { name: "Delete" })).toHaveTextContent("Delete");
  });

  it("A6: single selection renders no selection badge", () => {
    renderToolbar({ selectionCount: 1, onDelete: vi.fn() });
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it("A6: multi-selection shows 'N selected', disables Edit/Duplicate, batches Required/Delete", async () => {
    const onBatchRequired = vi.fn();
    const onBatchDelete = vi.fn();
    const onToggleRequired = vi.fn();
    const onDelete = vi.fn();
    renderToolbar({
      selectionCount: 3,
      isRequired: false,
      onToggleRequired,
      onOpenProperties: vi.fn(),
      onDuplicate: vi.fn(),
      onDuplicateAllPages: vi.fn(),
      onDelete,
      onBatchRequired,
      onBatchDelete,
    });

    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.queryByText("Full Name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Duplicate options" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Required" }));
    expect(onBatchRequired).toHaveBeenCalledWith(true);
    expect(onToggleRequired).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onBatchDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("does not render a lock button even when onToggleLock/isLocked are passed", () => {
    renderToolbar({ onToggleLock: vi.fn(), isLocked: true });
    expect(screen.queryByRole("button", { name: /lock/i })).not.toBeInTheDocument();
  });

  it("renders additionalActions when provided", () => {
    renderToolbar({ additionalActions: <button type="button">Extra action</button> });
    expect(screen.getByRole("button", { name: "Extra action" })).toBeInTheDocument();
  });

  it("does not render an assign-to-participant button", () => {
    renderToolbar({
      onDelete: vi.fn(),
      onDuplicate: vi.fn(),
      onToggleRequired: vi.fn(),
      onOpenProperties: vi.fn(),
    });
    expect(screen.queryByRole("button", { name: /assign/i })).not.toBeInTheDocument();
  });

  it("renders in dark mode", () => {
    renderWithChakra(
      <ContextToolbar targetRect={TARGET_RECT} isVisible context={TEXT_CONTEXT} onDelete={vi.fn()} />,
      { colorMode: "dark" }
    );
    expect(screen.getByRole("toolbar", { name: "Field actions" })).toBeInTheDocument();
  });
});
