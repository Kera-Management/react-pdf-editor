import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { HeaderBar } from "./HeaderBar";

const baseProps = {
  mode: "edit" as const,
  zoomPercentage: 100,
  onZoomIn: vi.fn(),
  onZoomOut: vi.fn(),
  onSave: vi.fn(),
};

describe("HeaderBar signing progress entry", () => {
  it("renders the labeled progress button on mobile in edit mode when both props are provided", () => {
    const onOpenProgress = vi.fn();
    render(
      <HeaderBar
        {...baseProps}
        isMobile
        progressSummary={{ completed: 2, total: 5 }}
        onOpenProgress={onOpenProgress}
      />
    );

    const button = screen.getByRole("button", { name: "Signing progress" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("2/5");

    fireEvent.click(button);
    expect(onOpenProgress).toHaveBeenCalledTimes(1);
  });

  it("does not render on desktop even when both props are provided", () => {
    render(
      <HeaderBar
        {...baseProps}
        isMobile={false}
        progressSummary={{ completed: 2, total: 5 }}
        onOpenProgress={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: "Signing progress" })
    ).not.toBeInTheDocument();
  });

  it("does not render outside edit mode, even on mobile", () => {
    render(
      <HeaderBar
        {...baseProps}
        mode="build"
        isMobile
        progressSummary={{ completed: 2, total: 5 }}
        onOpenProgress={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: "Signing progress" })
    ).not.toBeInTheDocument();
  });

  it("does not render when only one of progressSummary/onOpenProgress is provided", () => {
    const { rerender } = render(
      <HeaderBar {...baseProps} isMobile progressSummary={{ completed: 2, total: 5 }} />
    );
    expect(
      screen.queryByRole("button", { name: "Signing progress" })
    ).not.toBeInTheDocument();

    rerender(
      <HeaderBar {...baseProps} isMobile onOpenProgress={vi.fn()} />
    );
    expect(
      screen.queryByRole("button", { name: "Signing progress" })
    ).not.toBeInTheDocument();
  });
});

describe("HeaderBar aria-label parity", () => {
  it("every icon-only control carries an accessible name", () => {
    render(
      <HeaderBar
        {...baseProps}
        isMobile
        onFitZoom={vi.fn()}
        onResetZoom={vi.fn()}
        onDownload={vi.fn()}
        onToggleLeftPanel={vi.fn()}
        onToggleHostPanel={vi.fn()}
        onToggleParties={vi.fn()}
        onClose={vi.fn()}
        progressSummary={{ completed: 1, total: 3 }}
        onOpenProgress={vi.fn()}
      />
    );

    // Download renders icon-only on mobile (its text label is hidden), so
    // it must carry its own aria-label rather than relying on visible text.
    const downloadButton = screen.getByRole("button", { name: "Download" });
    expect(downloadButton).toBeInTheDocument();

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAccessibleName();
    }
  });

  it("reflects an in-progress download in its accessible name", () => {
    render(
      <HeaderBar {...baseProps} isMobile onDownload={vi.fn()} isDownloading />
    );

    expect(
      screen.getByRole("button", { name: "Downloading" })
    ).toBeInTheDocument();
  });
});
