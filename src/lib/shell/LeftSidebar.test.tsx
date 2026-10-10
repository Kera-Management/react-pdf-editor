import { describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import type { PDFPageProxy } from "pdfjs-dist";

import { renderWithChakra } from "../testUtils";
import {
  LeftSidebar,
  RAIL_TRANSITION_MS,
  type LeftSidebarProps,
} from "./LeftSidebar";

const pages = [1, 2, 3].map((pageNumber) => ({
  proxy: {
    pageNumber,
    getViewport: ({ scale }: { scale: number }) => ({
      width: 612 * scale,
      height: 792 * scale,
    }),
    render: vi.fn(),
  } as unknown as PDFPageProxy,
}));

const baseProps: LeftSidebarProps = {
  isOpen: true,
  showFieldPalette: true,
  fieldPaletteProps: {
    onFieldDragStart: vi.fn(),
    onFieldDragEnd: vi.fn(),
    onFieldAdd: vi.fn(),
    selectedField: null,
    onCloseEditor: vi.fn(),
  },
  pageThumbnailsProps: { pages, activePage: 2, onPageSelect: vi.fn() },
};

describe("LeftSidebar", () => {
  it("renders the Fields and Pages sections with a page-count badge", () => {
    renderWithChakra(<LeftSidebar {...baseProps} />);
    expect(screen.getByRole("region", { name: "Fields" })).toBeInTheDocument();
    const pagesSection = screen.getByRole("region", { name: "Pages" });
    expect(pagesSection).toHaveTextContent("3");
    expect(screen.getAllByRole("button", { name: /^Page \d$/ })).toHaveLength(3);
  });

  it("A8: renders nothing when the rail is hidden", () => {
    const { container } = renderWithChakra(
      <LeftSidebar {...baseProps} isOpen={false} />
    );
    expect(container.querySelector("[data-pdfe-sidebar]")).toBeNull();
    expect(screen.queryByRole("region", { name: "Pages" })).not.toBeInTheDocument();
  });

  it("slides shut: stays mounted (inert) through the slide, then unmounts", () => {
    vi.useFakeTimers();
    try {
      const { container, rerender } = renderWithChakra(
        <LeftSidebar {...baseProps} />
      );
      const slot = () =>
        container.querySelector<HTMLElement>('[data-part="rail-slot"]');
      act(() => {
        vi.runOnlyPendingTimers();
      });
      expect(slot()).toHaveAttribute("data-state", "open");

      rerender(<LeftSidebar {...baseProps} isOpen={false} />);
      expect(slot()).toHaveAttribute("data-state", "closed");
      expect(slot()).toHaveAttribute("inert");
      expect(
        screen.queryByRole("region", { name: "Pages" })
      ).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(RAIL_TRANSITION_MS);
      });
      expect(slot()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides the field palette outside Prepare", () => {
    renderWithChakra(<LeftSidebar {...baseProps} showFieldPalette={false} />);
    expect(screen.queryByRole("region", { name: "Fields" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add text field/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Pages" })).toBeInTheDocument();
  });

  it("A4: the palette section sizes to its content; Pages takes the rest", () => {
    renderWithChakra(<LeftSidebar {...baseProps} />);
    const fields = screen.getByRole("region", { name: "Fields" });
    const pagesSection = screen.getByRole("region", { name: "Pages" });
    expect(getComputedStyle(fields).flex).toMatch(/none|0 0 auto/);
    expect(getComputedStyle(pagesSection).flex).toMatch(/^1/);
  });

  it("renders the Pages header without thumbnails until pages exist", () => {
    renderWithChakra(
      <LeftSidebar {...baseProps} pageThumbnailsProps={undefined} />
    );
    expect(screen.getByRole("region", { name: "Pages" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Page/ })).not.toBeInTheDocument();
  });
});
