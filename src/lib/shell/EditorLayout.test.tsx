import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithChakra } from "../testUtils";
import { EditorLayout, type EditorLayoutProps } from "./EditorLayout";

const base = (
  overrides: Partial<EditorLayoutProps> = {}
): EditorLayoutProps => ({
  header: <header>Header</header>,
  leftSidebar: <aside aria-label="Left rail">Left</aside>,
  rightSidebar: <aside aria-label="Right rail">Right</aside>,
  canvas: <div data-testid="scroller">Pages</div>,
  canvasBanner: <div role="status">Banner</div>,
  canvasOverlays: <div data-testid="toolbar">Toolbar</div>,
  mobileChrome: <div data-testid="mobile-chrome">Mobile</div>,
  overlays: <div data-testid="overlays">Dialogs</div>,
  layout: "desktop",
  leftOpen: true,
  onLeftOpenChange: vi.fn(),
  rightOpen: true,
  onRightOpenChange: vi.fn(),
  ...overrides,
});

describe("EditorLayout", () => {
  it("renders one .pdf-editor-root with the scroller inside the canvas area (C1)", () => {
    const { container } = renderWithChakra(<EditorLayout {...base()} />);
    const roots = container.querySelectorAll(".pdf-editor-root");
    expect(roots).toHaveLength(1);
    const canvasArea = container.querySelector('[data-part="canvas-area"]');
    // The scroller is a direct child: no extra wrapper takes over scrolling
    // or the IntersectionObserver root.
    expect(screen.getByTestId("scroller").parentElement).toBe(canvasArea);
    expect(canvasArea).toContainElement(screen.getByTestId("toolbar"));
    expect(canvasArea).toContainElement(screen.getByRole("status"));
  });

  it("desktop: rails inline, no drawers, no mobile chrome", () => {
    renderWithChakra(<EditorLayout {...base()} />);
    expect(screen.getByLabelText("Left rail")).toBeInTheDocument();
    expect(screen.getByLabelText("Right rail")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByTestId("mobile-chrome")).toBeNull();
    expect(screen.getByTestId("overlays")).toBeInTheDocument();
  });

  it("C9 tablet: collapses both rails when the layout is entered", () => {
    const onLeftOpenChange = vi.fn();
    const onRightOpenChange = vi.fn();
    renderWithChakra(
      <EditorLayout
        {...base({ layout: "tablet", onLeftOpenChange, onRightOpenChange })}
      />
    );
    expect(onLeftOpenChange).toHaveBeenCalledWith(false);
    expect(onRightOpenChange).toHaveBeenCalledWith(false);
  });

  it("C9 tablet: rails are not inline; the left rail opens as a start drawer", async () => {
    const onLeftOpenChange = vi.fn();
    const { rerender } = renderWithChakra(
      <EditorLayout
        {...base({
          layout: "tablet",
          leftOpen: false,
          rightOpen: false,
          onLeftOpenChange,
        })}
      />
    );
    expect(screen.queryByLabelText("Left rail")).toBeNull();
    expect(screen.queryByLabelText("Right rail")).toBeNull();
    expect(onLeftOpenChange).not.toHaveBeenCalled();

    rerender(
      <EditorLayout
        {...base({
          layout: "tablet",
          leftOpen: true,
          rightOpen: false,
          onLeftOpenChange,
        })}
      />
    );
    const drawer = await screen.findByRole("dialog", { name: "Pages panel" });
    expect(drawer).toContainElement(screen.getByLabelText("Left rail"));
    // Chakra moves focus into the drawer a tick after it opens; Escape is
    // only handled once the dismissable layer is active.
    await waitFor(() =>
      expect(drawer).toContainElement(document.activeElement as HTMLElement)
    );

    fireEvent.keyDown(document.activeElement ?? drawer, {
      key: "Escape",
      code: "Escape",
    });
    await waitFor(() => expect(onLeftOpenChange).toHaveBeenCalledWith(false));
  });

  it("C9 tablet: the right rail opens as an end drawer", async () => {
    const onRightOpenChange = vi.fn();
    const { rerender } = renderWithChakra(
      <EditorLayout
        {...base({
          layout: "tablet",
          leftOpen: false,
          rightOpen: false,
          onRightOpenChange,
        })}
      />
    );
    rerender(
      <EditorLayout
        {...base({
          layout: "tablet",
          leftOpen: false,
          rightOpen: true,
          onRightOpenChange,
        })}
      />
    );
    const drawer = await screen.findByRole("dialog", { name: "Side panel" });
    expect(drawer).toContainElement(screen.getByLabelText("Right rail"));
    // Portaled outside .pdf-editor-root: the drawer re-scopes the canvas
    // variables so parties avatars keep their recipient colour.
    expect(drawer).toHaveClass("pdfe-portal-root");
  });

  it("tablet: the pages drawer is non-modal so palette drags reach the page", async () => {
    renderWithChakra(
      <EditorLayout
        {...base({ layout: "tablet", leftOpen: true, rightOpen: false })}
      />
    );
    const drawer = await screen.findByRole("dialog", { name: "Pages panel" });
    // No backdrop, and the full-viewport positioner lets pointer and drag
    // events through to the canvas; only the panel itself is live.
    expect(document.querySelector('[data-part="backdrop"]')).toBeNull();
    const positioner = drawer.parentElement as HTMLElement;
    expect(positioner).toHaveAttribute("data-part", "positioner");
    expect(getComputedStyle(positioner).pointerEvents).toBe("none");
    expect(getComputedStyle(drawer).pointerEvents).toBe("auto");
  });

  it("tablet: the side drawer stays modal, with a backdrop", async () => {
    renderWithChakra(
      <EditorLayout
        {...base({ layout: "tablet", leftOpen: false, rightOpen: true })}
      />
    );
    await screen.findByRole("dialog", { name: "Side panel" });
    expect(document.querySelector('[data-part="backdrop"]')).not.toBeNull();
  });

  it("mobile: no rails, renders mobile chrome", () => {
    renderWithChakra(<EditorLayout {...base({ layout: "mobile" })} />);
    expect(screen.queryByLabelText("Left rail")).toBeNull();
    expect(screen.queryByLabelText("Right rail")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("mobile-chrome")).toBeInTheDocument();
  });

  it("dark mode renders the same frame (tokens only)", () => {
    const { container } = renderWithChakra(<EditorLayout {...base()} />, {
      colorMode: "dark",
    });
    expect(container).toHaveClass("dark");
    expect(container.querySelector(".pdf-editor-root")).not.toBeNull();
  });
});
