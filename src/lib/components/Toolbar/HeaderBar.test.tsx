import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { renderWithChakra } from "../../testUtils";
import { HeaderBar, type HeaderBarProps } from "./HeaderBar";

const baseProps: HeaderBarProps = {
  mode: "edit",
  zoomPercentage: 100,
  onZoomIn: vi.fn(),
  onZoomOut: vi.fn(),
  onSave: vi.fn(),
};

const renderHeader = (props: Partial<HeaderBarProps> = {}) =>
  renderWithChakra(<HeaderBar {...baseProps} {...props} />);

describe("HeaderBar: shared rules", () => {
  it("every button is type=button and has an accessible name", () => {
    renderHeader({
      layout: "desktop",
      allowedModes: ["build", "edit"],
      onFitZoom: vi.fn(),
      onResetZoom: vi.fn(),
      onDownload: vi.fn(),
      onDecline: vi.fn(),
      onToggleLeftSidebar: vi.fn(),
      onClose: vi.fn(),
      isDirty: true,
    });

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(5);
    for (const button of buttons) {
      expect(button).toHaveAttribute("type", "button");
      expect(button).toHaveAccessibleName();
    }
  });

  it("clicking a header button inside a form never submits it", async () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    renderWithChakra(
      <form onSubmit={(e) => onSubmit(e.nativeEvent)}>
        <HeaderBar {...baseProps} layout="desktop" onClose={vi.fn()} />
      </form>
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders in dark mode", () => {
    renderWithChakra(<HeaderBar {...baseProps} layout="desktop" />, {
      colorMode: "dark",
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

describe("HeaderBar: desktop", () => {
  it("A8: sidebar toggle flips its label and aria-pressed (uncontrolled)", async () => {
    const onToggle = vi.fn();
    renderHeader({ layout: "desktop", onToggleLeftSidebar: onToggle });

    const hide = screen.getByRole("button", { name: "Hide pages panel" });
    expect(hide).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(hide);
    expect(onToggle).toHaveBeenCalledTimes(1);

    const show = screen.getByRole("button", { name: "Show pages panel" });
    expect(show).toHaveAttribute("aria-pressed", "false");
  });

  it("A8: follows leftSidebarOpen when controlled", async () => {
    const onToggle = vi.fn();
    renderHeader({
      layout: "desktop",
      leftSidebarOpen: false,
      onToggleLeftSidebar: onToggle,
    });
    const show = screen.getByRole("button", { name: "Show pages panel" });
    await userEvent.click(show);
    expect(onToggle).toHaveBeenCalledTimes(1);
    // Controlled: stays as the host says until it re-renders.
    expect(
      screen.getByRole("button", { name: "Show pages panel" })
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("C3: no page indicator while the pages rail is visible; '3 of 12' when it is hidden", () => {
    const { rerender } = renderHeader({
      layout: "desktop",
      leftSidebarOpen: true,
      onToggleLeftSidebar: vi.fn(),
      currentPage: 3,
      totalPages: 12,
    });
    expect(screen.queryByText("3 of 12")).not.toBeInTheDocument();
    expect(screen.queryByText(/3 \/ 12/)).not.toBeInTheDocument();

    rerender(
      <HeaderBar
        {...baseProps}
        layout="desktop"
        leftSidebarOpen={false}
        onToggleLeftSidebar={vi.fn()}
        currentPage={3}
        totalPages={12}
      />
    );
    expect(screen.getByText("3 of 12")).toBeInTheDocument();
  });

  it("zoom group: callbacks fire and disabled states apply", async () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onFitZoom = vi.fn();
    const onResetZoom = vi.fn();
    renderHeader({
      layout: "desktop",
      zoomPercentage: 125,
      onZoomIn,
      onZoomOut,
      onFitZoom,
      onResetZoom,
      zoomInDisabled: true,
    });

    expect(screen.getByText("125%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    await userEvent.click(screen.getByRole("button", { name: "Fit to width" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Reset zoom to 100%" })
    );
    expect(onZoomOut).toHaveBeenCalledTimes(1);
    expect(onFitZoom).toHaveBeenCalledTimes(1);
    expect(onResetZoom).toHaveBeenCalledTimes(1);
    expect(onZoomIn).not.toHaveBeenCalled();
  });

  it("C5/C12: zoom tooltips show the keyboard shortcut", async () => {
    renderHeader({ layout: "desktop" });
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    await userEvent.hover(zoomIn);
    expect(
      await screen.findByText("Zoom in · Ctrl +", undefined, { timeout: 2000 })
    ).toBeInTheDocument();
  });

  it("single mode renders no mode label or menu (copy #4)", () => {
    renderHeader({ layout: "desktop", mode: "edit", allowedModes: ["edit"] });
    expect(screen.queryByText("Fill & Sign")).not.toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("mode menu lists allowed modes as radio items and switches mode", async () => {
    const onModeChange = vi.fn();
    renderHeader({
      layout: "desktop",
      mode: "edit",
      allowedModes: ["build", "edit"],
      onModeChange,
    });

    const trigger = screen.getByRole("button", { name: /fill & sign/i });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await userEvent.click(trigger);

    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items).toHaveLength(2);
    expect(
      within(menu).getByRole("menuitemradio", { name: /fill & sign/i })
    ).toHaveAttribute("aria-checked", "true");
    expect(within(menu).getByText("Place fields and choose who signs")).toBeInTheDocument();

    await userEvent.click(
      within(menu).getByRole("menuitemradio", { name: /prepare/i })
    );
    expect(onModeChange).toHaveBeenCalledWith("build");
  });

  it("Save: dirty dot, aria-label, live region and loading state", () => {
    const { rerender } = renderHeader({ layout: "desktop", isDirty: true });
    expect(
      screen.getByRole("button", { name: "Save (unsaved changes)" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("dirty-dot")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");

    rerender(<HeaderBar {...baseProps} layout="desktop" isSaving />);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute("data-loading");
    expect(screen.getByRole("status")).toHaveTextContent("Saving");
  });

  it("Download is an inline button on desktop and reflects loading", () => {
    const { rerender } = renderHeader({ layout: "desktop", onDownload: vi.fn() });
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
    rerender(
      <HeaderBar {...baseProps} layout="desktop" onDownload={vi.fn()} isDownloading />
    );
    expect(screen.getByRole("button", { name: "Downloading" })).toBeDisabled();
  });

  it("Decline renders in edit mode only", () => {
    const { rerender } = renderHeader({ layout: "desktop", onDecline: vi.fn() });
    expect(
      screen.getByRole("button", { name: "I can't sign this" })
    ).toBeInTheDocument();
    rerender(
      <HeaderBar {...baseProps} mode="build" layout="desktop" onDecline={vi.fn()} />
    );
    expect(
      screen.queryByRole("button", { name: "I can't sign this" })
    ).not.toBeInTheDocument();
  });

  it("Close renders only with onClose", async () => {
    const onClose = vi.fn();
    const { rerender } = renderHeader({ layout: "desktop" });
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    rerender(<HeaderBar {...baseProps} layout="desktop" onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has no overflow menu on desktop", () => {
    renderHeader({ layout: "desktop", onDownload: vi.fn(), onOpenParties: vi.fn() });
    expect(
      screen.queryByRole("button", { name: "More actions" })
    ).not.toBeInTheDocument();
  });
});

describe("HeaderBar: mobile", () => {
  it("A8/C3: no hamburger, no page indicator, no zoom +/-", () => {
    renderHeader({
      isMobile: true,
      onToggleLeftSidebar: vi.fn(),
      currentPage: 3,
      totalPages: 12,
    });
    expect(screen.queryByRole("button", { name: "Toggle menu" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pages panel/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/3 (of|\/) 12/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom in" })).not.toBeInTheDocument();
  });

  it("B1: Progress button with a '2 of 5' badge opens progress", async () => {
    const onOpenProgress = vi.fn();
    renderHeader({
      layout: "mobile",
      progressSummary: { completed: 2, total: 5 },
      onOpenProgress,
    });
    const button = screen.getByRole("button", { name: /progress/i });
    expect(button).toHaveTextContent("Progress");
    expect(button).toHaveTextContent("2 of 5");
    await userEvent.click(button);
    expect(onOpenProgress).toHaveBeenCalledTimes(1);
  });

  it("B1: Progress button needs edit mode, a non-desktop layout, and both props", () => {
    const { rerender } = renderHeader({
      layout: "desktop",
      progressSummary: { completed: 2, total: 5 },
      onOpenProgress: vi.fn(),
    });
    expect(screen.queryByRole("button", { name: /progress/i })).not.toBeInTheDocument();

    rerender(
      <HeaderBar
        {...baseProps}
        mode="build"
        layout="mobile"
        progressSummary={{ completed: 2, total: 5 }}
        onOpenProgress={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /progress/i })).not.toBeInTheDocument();

    rerender(
      <HeaderBar {...baseProps} layout="mobile" progressSummary={{ completed: 2, total: 5 }} />
    );
    expect(screen.queryByRole("button", { name: /progress/i })).not.toBeInTheDocument();
  });

  it("More actions holds Recipients, host panel, Download and Fit to width; Decline stays visible", async () => {
    const onOpenParties = vi.fn();
    const onOpenHostPanel = vi.fn();
    const onDownload = vi.fn();
    const onDecline = vi.fn();
    renderHeader({
      layout: "mobile",
      onOpenParties,
      onOpenHostPanel,
      hostPanelTitle: "Checklist",
      onDownload,
      onFitZoom: vi.fn(),
      onDecline,
    });

    // Decline is a visible button, not a menu item (§9 decision 4).
    await userEvent.click(screen.getByRole("button", { name: "I can't sign this" }));
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = await screen.findByRole("menu");
    const labels = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(labels).toEqual(["Recipients", "Checklist", "Download", "Fit to width"]);

    await userEvent.click(within(menu).getByRole("menuitem", { name: "Recipients" }));
    expect(onOpenParties).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Checklist" })
    );
    expect(onOpenHostPanel).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Download" })
    );
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it("hides More actions when it would be empty", () => {
    renderHeader({ layout: "mobile" });
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
  });

  it("disables the Download item while downloading", async () => {
    renderHeader({ layout: "mobile", onDownload: vi.fn(), isDownloading: true });
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    const item = within(await screen.findByRole("menu")).getByRole("menuitem", {
      name: "Download",
    });
    expect(item).toHaveAttribute("data-disabled");
  });

  it("shows the mode menu on mobile only when more than one mode is allowed", () => {
    const { rerender } = renderHeader({ layout: "mobile", mode: "build", allowedModes: ["build"] });
    expect(screen.queryByRole("button", { name: /prepare/i })).not.toBeInTheDocument();
    rerender(
      <HeaderBar {...baseProps} layout="mobile" mode="build" allowedModes={["build", "edit"]} />
    );
    expect(screen.getByRole("button", { name: /prepare/i })).toBeInTheDocument();
  });

  it("keeps the Save label visible on mobile", () => {
    renderHeader({ layout: "mobile", saveLabel: "Submit signature" });
    expect(screen.getByRole("button", { name: "Submit signature" })).toHaveTextContent(
      "Submit signature"
    );
  });
});

describe("HeaderBar: tablet", () => {
  it("keeps the desktop zoom group, moves Download to More actions, keeps Decline visible", async () => {
    const onDownload = vi.fn();
    renderHeader({
      layout: "tablet",
      onDownload,
      onDecline: vi.fn(),
      onToggleLeftSidebar: vi.fn(),
      onOpenHostPanel: vi.fn(),
      hostPanelTitle: "Checklist",
    });

    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    // Tablet's left rail starts collapsed.
    expect(screen.getByRole("button", { name: "Show pages panel" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: "I can't sign this" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = await screen.findByRole("menu");
    const labels = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(labels).toEqual(["Checklist", "Download"]);
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Download" }));
    await waitFor(() => expect(onDownload).toHaveBeenCalledTimes(1));
  });

  it("B1/C9: tablet shows the Progress button, which opens the end drawer", async () => {
    const onOpenProgress = vi.fn();
    renderHeader({
      layout: "tablet",
      progressSummary: { completed: 2, total: 5 },
      onOpenProgress,
    });
    const button = screen.getByRole("button", { name: /progress/i });
    expect(button).toHaveTextContent("2 of 5");
    expect(button).toHaveAttribute("type", "button");
    await userEvent.click(button);
    expect(onOpenProgress).toHaveBeenCalledTimes(1);
  });
});
