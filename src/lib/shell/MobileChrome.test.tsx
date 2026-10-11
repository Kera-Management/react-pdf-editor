import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithChakra } from "../testUtils";
import {
  MobileChrome,
  type MobileChromeProps,
  type MobileDrawer,
} from "./MobileChrome";
import type { PageThumbnailsProps } from "../components/Panels/PageThumbnails";

// Panel bodies belong to other components; stub them so these tests cover
// only the drawer and pill chrome.
vi.mock("../components/Panels/PageThumbnails", () => ({
  PageThumbnails: ({ pages, onPageSelect, layout }: PageThumbnailsProps) => (
    <div data-layout={layout ?? "list"}>
      {pages.map((_, i) => (
        <button key={i} type="button" onClick={() => onPageSelect(i + 1)}>
          {`Thumbnail ${i + 1}`}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("../components/Panels/ProgressPanel", () => ({
  ProgressPanel: () => <div>Progress body</div>,
}));
vi.mock("../components/Panels/PropertiesPanel", () => ({
  PropertiesPanel: () => <div>Properties body</div>,
}));
vi.mock("../components/Panels/PartiesPanel", () => ({
  PartiesPanel: () => <div>Parties body</div>,
}));

const pages = Array.from({ length: 4 }, () => ({
  proxy: {} as PageThumbnailsProps["pages"][number]["proxy"],
}));

type HarnessProps = Partial<MobileChromeProps> & {
  initialDrawer?: MobileDrawer;
  onDrawer?: (d: MobileDrawer) => void;
};

function Harness({
  initialDrawer = null,
  onDrawer,
  onPageSelect,
  ...rest
}: HarnessProps) {
  const [openDrawer, setOpenDrawer] = useState<MobileDrawer>(initialDrawer);
  const [activePage, setActivePage] = useState(rest.activePage ?? 1);
  return (
    <MobileChrome
      openDrawer={openDrawer}
      onOpenDrawerChange={(d) => {
        onDrawer?.(d);
        setOpenDrawer(d);
      }}
      activePage={activePage}
      totalPages={pages.length}
      onPageSelect={(n) => {
        onPageSelect?.(n);
        setActivePage(n);
      }}
      pageThumbnailsProps={{
        pages,
        activePage,
        onPageSelect: () => {
          throw new Error("MobileChrome must route through its own onPageSelect");
        },
      }}
      showAddField={false}
      onAddField={vi.fn()}
      {...rest}
    />
  );
}

describe("MobileChrome", () => {
  it("C8: the page pill opens the Pages drawer; choosing a page selects it and closes", async () => {
    const onPageSelect = vi.fn();
    renderWithChakra(<Harness onPageSelect={onPageSelect} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Go to page, current page 1 of 4" })
    );
    const drawer = await screen.findByRole("dialog", { name: "Pages" });
    expect(drawer).toBeInTheDocument();
    // §3.11: two-column grid in the drawer; drawer re-scopes canvas vars.
    expect(drawer.querySelector('[data-layout="grid"]')).not.toBeNull();
    expect(drawer).toHaveClass("pdfe-portal-root");

    fireEvent.click(screen.getByRole("button", { name: "Thumbnail 4" }));
    expect(onPageSelect).toHaveBeenCalledWith(4);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Pages" })).toBeNull()
    );
    expect(
      screen.getByRole("button", { name: "Go to page, current page 4 of 4" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("C13: Esc closes the drawer and focus returns to the trigger", async () => {
    renderWithChakra(<Harness />);
    const trigger = screen.getByRole("button", {
      name: "Go to page, current page 1 of 4",
    });
    trigger.focus();
    fireEvent.click(trigger);

    const drawer = await screen.findByRole("dialog", { name: "Pages" });
    // Focus moves into the drawer (trap).
    await waitFor(() => expect(drawer).toContainElement(document.activeElement as HTMLElement));

    fireEvent.keyDown(document.activeElement ?? drawer, {
      key: "Escape",
      code: "Escape",
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Pages" })).toBeNull()
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("C13: the X closes the drawer", async () => {
    const onDrawer = vi.fn();
    renderWithChakra(
      <Harness
        initialDrawer="progress"
        onDrawer={onDrawer}
        progress={{} as MobileChromeProps["progress"]}
      />
    );
    const drawer = await screen.findByRole("dialog", { name: "Progress" });
    expect(drawer).toHaveTextContent("Progress body");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(onDrawer).toHaveBeenLastCalledWith(null));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("renders only the open drawer, titled per panel", async () => {
    const { rerender } = renderWithChakra(
      <MobileChrome
        openDrawer="parties"
        onOpenDrawerChange={vi.fn()}
        activePage={1}
        totalPages={1}
        onPageSelect={vi.fn()}
        progress={{} as MobileChromeProps["progress"]}
        parties={{
          title: "Recipients",
          config: {} as never,
          participants: [],
        }}
        hostPanel={{ title: "Signers", content: <p>Host body</p> }}
        showAddField={false}
        onAddField={vi.fn()}
      />
    );
    expect(
      await screen.findByRole("dialog", { name: "Recipients" })
    ).toHaveTextContent("Parties body");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    rerender(
      <MobileChrome
        openDrawer="hostPanel"
        onOpenDrawerChange={vi.fn()}
        activePage={1}
        totalPages={1}
        onPageSelect={vi.fn()}
        progress={{} as MobileChromeProps["progress"]}
        parties={{
          title: "Recipients",
          config: {} as never,
          participants: [],
        }}
        hostPanel={{ title: "Signers", content: <p>Host body</p> }}
        showAddField={false}
        onAddField={vi.fn()}
      />
    );
    expect(
      await screen.findByRole("dialog", { name: "Signers" })
    ).toHaveTextContent("Host body");
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
  });

  it("hides the page pill for a single page", () => {
    renderWithChakra(
      <MobileChrome
        openDrawer={null}
        onOpenDrawerChange={vi.fn()}
        activePage={1}
        totalPages={1}
        onPageSelect={vi.fn()}
        showAddField={false}
        onAddField={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /Go to page/ })).toBeNull();
  });

  it("C6: 'Add field' opens the Add a field drawer, adds the type and closes", async () => {
    const onAddField = vi.fn();
    renderWithChakra(<Harness showAddField onAddField={onAddField} />);

    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    const drawer = await screen.findByRole("dialog", { name: "Add a field" });
    // The pill hides while a drawer is open.
    expect(screen.queryByRole("button", { name: "Add field" })).toBeNull();
    expect(drawer).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Checkbox" }));
    expect(onAddField).toHaveBeenCalledWith("checkbox");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Add a field" })).toBeNull()
    );
    expect(screen.getByRole("button", { name: "Add field" })).toBeInTheDocument();
  });

  it("does not show 'Add field' outside Prepare", () => {
    renderWithChakra(<Harness showAddField={false} />);
    expect(screen.queryByRole("button", { name: "Add field" })).toBeNull();
  });
});

