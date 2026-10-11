import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithChakra } from "../../testUtils";
import { PagePill } from "./PagePill";
import { AddFieldList, FloatingActionButton } from "./FloatingActionButton";

describe("PagePill (C8)", () => {
  it("renders nothing for a single page", () => {
    renderWithChakra(
      <PagePill
        activePage={1}
        totalPages={1}
        onPageSelect={vi.fn()}
        onOpenPages={vi.fn()}
      />
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows 'N of M' and opens the pages drawer", () => {
    const onOpenPages = vi.fn();
    renderWithChakra(
      <PagePill
        activePage={3}
        totalPages={12}
        onPageSelect={vi.fn()}
        onOpenPages={onOpenPages}
      />
    );
    const pill = screen.getByRole("button", {
      name: "Go to page, current page 3 of 12",
    });
    expect(pill).toHaveTextContent("3 of 12");
    fireEvent.click(pill);
    expect(onOpenPages).toHaveBeenCalledTimes(1);
  });

  it("disables previous on page 1 and next on the last page", () => {
    const onPageSelect = vi.fn();
    const { rerender } = renderWithChakra(
      <PagePill
        activePage={1}
        totalPages={3}
        onPageSelect={onPageSelect}
        onOpenPages={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageSelect).toHaveBeenLastCalledWith(2);

    rerender(
      <PagePill
        activePage={3}
        totalPages={3}
        onPageSelect={onPageSelect}
        onOpenPages={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(onPageSelect).toHaveBeenLastCalledWith(2);
  });

  it("never submits a host form", () => {
    renderWithChakra(
      <PagePill
        activePage={2}
        totalPages={3}
        onPageSelect={vi.fn()}
        onOpenPages={vi.fn()}
      />
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
    }
  });
});

describe("FloatingActionButton (C6)", () => {
  it("is a labelled 'Add field' pill, not a round icon-only FAB", () => {
    const onClick = vi.fn();
    renderWithChakra(<FloatingActionButton onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Add field" });
    expect(button).toHaveTextContent("Add field");
    expect(button).toHaveAttribute("type", "button");
    // No radial menu state any more.
    expect(button).not.toHaveAttribute("aria-expanded");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when not visible", () => {
    renderWithChakra(
      <FloatingActionButton onClick={vi.fn()} isVisible={false} />
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("lists the six field types with the palette labels", () => {
    const onSelect = vi.fn();
    renderWithChakra(<AddFieldList onSelect={onSelect} />);
    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual([
      "Text",
      "Text Area",
      "Checkbox",
      "Dropdown",
      "Radio",
      "Signature",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Signature" }));
    expect(onSelect).toHaveBeenCalledWith("signature");
  });
});
