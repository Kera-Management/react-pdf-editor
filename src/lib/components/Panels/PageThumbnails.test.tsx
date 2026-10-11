import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { PDFPageProxy } from "pdfjs-dist";

import { renderWithChakra } from "../../testUtils";
import { PageThumbnails } from "./PageThumbnails";

// Controllable IntersectionObserver: tests decide which thumbnails are "seen".
class ControlledIO {
  static instances: ControlledIO[] = [];
  observed = new Set<Element>();
  constructor(
    public callback: IntersectionObserverCallback,
    public options?: IntersectionObserverInit
  ) {
    ControlledIO.instances.push(this);
  }
  observe(el: Element) {
    this.observed.add(el);
  }
  unobserve(el: Element) {
    this.observed.delete(el);
  }
  disconnect() {
    this.observed.clear();
  }
  takeRecords() {
    return [];
  }
  /** Report the given thumbnails (by page number) as intersecting. */
  show(pageNumbers: number[]) {
    const entries = Array.from(this.observed)
      .filter((el) =>
        pageNumbers.includes(Number((el as HTMLElement).dataset.page))
      )
      .map(
        (target) =>
          ({ target, isIntersecting: true }) as unknown as IntersectionObserverEntry
      );
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}

const makePages = (count: number) =>
  Array.from({ length: count }, (_, i) => {
    const render = vi.fn(() => ({
      promise: Promise.resolve(),
      cancel: vi.fn(),
    }));
    const proxy = {
      pageNumber: i + 1,
      getViewport: ({ scale }: { scale: number }) => ({
        width: 612 * scale,
        height: 792 * scale,
      }),
      render,
    } as unknown as PDFPageProxy;
    return { proxy, render };
  });

const latestIO = () => ControlledIO.instances[ControlledIO.instances.length - 1];

describe("PageThumbnails", () => {
  const originalIO = globalThis.IntersectionObserver;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    ControlledIO.instances = [];
    globalThis.IntersectionObserver =
      ControlledIO as unknown as typeof IntersectionObserver;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      scale: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    globalThis.IntersectionObserver = originalIO;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it("renders one labelled button per page and marks the active page", () => {
    const pages = makePages(3);
    renderWithChakra(
      <PageThumbnails
        pages={pages.map(({ proxy }) => ({ proxy }))}
        activePage={2}
        onPageSelect={vi.fn()}
      />
    );
    expect(screen.getAllByRole("button", { name: /^Page \d$/ })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("button", { name: "Page 1" })).not.toHaveAttribute(
      "aria-current"
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
    }
  });

  it("selects a page on click", () => {
    const onPageSelect = vi.fn();
    const pages = makePages(2);
    renderWithChakra(
      <PageThumbnails
        pages={pages.map(({ proxy }) => ({ proxy }))}
        activePage={1}
        onPageSelect={onPageSelect}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(onPageSelect).toHaveBeenCalledWith(2);
  });

  describe("C10: lazy rendering", () => {
    it("uses one observer rooted at the list and renders nothing before intersection", () => {
      const pages = makePages(5);
      renderWithChakra(
        <PageThumbnails
          pages={pages.map(({ proxy }) => ({ proxy }))}
          activePage={1}
          onPageSelect={vi.fn()}
        />
      );
      expect(ControlledIO.instances).toHaveLength(1);
      const io = latestIO();
      expect(io.observed.size).toBe(5);
      expect(io.options?.root).toBe(
        screen.getByRole("button", { name: "Page 1" }).parentElement
      );
      pages.forEach(({ render }) => expect(render).not.toHaveBeenCalled());
      for (let n = 1; n <= 5; n += 1) {
        expect(screen.getByTestId(`thumbnail-skeleton-${n}`)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: `Page ${n}` })).toHaveAttribute(
          "data-state",
          "loading"
        );
      }
    });

    it("renders only the intersecting thumbnails and swaps their skeleton out", async () => {
      const pages = makePages(5);
      renderWithChakra(
        <PageThumbnails
          pages={pages.map(({ proxy }) => ({ proxy }))}
          activePage={1}
          onPageSelect={vi.fn()}
        />
      );

      act(() => latestIO().show([1, 2]));

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute(
          "data-state",
          "rendered"
        )
      );
      expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute(
        "data-state",
        "rendered"
      );
      expect(pages[0].render).toHaveBeenCalledTimes(1);
      expect(pages[1].render).toHaveBeenCalledTimes(1);
      expect(pages[2].render).not.toHaveBeenCalled();
      expect(pages[4].render).not.toHaveBeenCalled();
      expect(screen.queryByTestId("thumbnail-skeleton-1")).not.toBeInTheDocument();
      expect(screen.getByTestId("thumbnail-skeleton-3")).toBeInTheDocument();
    });

    it("renders a page once even if it is reported visible again", async () => {
      const pages = makePages(2);
      renderWithChakra(
        <PageThumbnails
          pages={pages.map(({ proxy }) => ({ proxy }))}
          activePage={1}
          onPageSelect={vi.fn()}
        />
      );
      act(() => latestIO().show([1]));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute(
          "data-state",
          "rendered"
        )
      );
      // Seen pages are unobserved, so this is a no-op.
      act(() => latestIO().show([1]));
      act(() => latestIO().show([2]));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute(
          "data-state",
          "rendered"
        )
      );
      expect(pages[0].render).toHaveBeenCalledTimes(1);
    });

    it("keeps the skeleton when a render fails", async () => {
      const pages = makePages(1);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      pages[0].render.mockImplementation(() => ({
        promise: Promise.reject(new Error("boom")),
        cancel: vi.fn(),
      }));
      renderWithChakra(
        <PageThumbnails
          pages={pages.map(({ proxy }) => ({ proxy }))}
          activePage={1}
          onPageSelect={vi.fn()}
        />
      );
      act(() => latestIO().show([1]));
      await waitFor(() => expect(warn).toHaveBeenCalled());
      expect(screen.getByTestId("thumbnail-skeleton-1")).toBeInTheDocument();
      warn.mockRestore();
    });
  });

  it("grid layout renders two columns and observes against the viewport", () => {
    const pages = makePages(2);
    renderWithChakra(
      <PageThumbnails
        pages={pages.map(({ proxy }) => ({ proxy }))}
        activePage={1}
        onPageSelect={vi.fn()}
        layout="grid"
      />
    );
    expect(latestIO().options?.root).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});
