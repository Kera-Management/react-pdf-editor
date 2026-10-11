import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithChakra } from "../testUtils";
import { PanelHeader, RightSidebar, type RightSidebarProps } from "./RightSidebar";

vi.mock("../components/Panels/PartiesPanel", () => ({
  PartiesPanel: () => <div data-testid="parties-panel" />,
}));

const progress: NonNullable<RightSidebarProps["progress"]> = {
  activeParticipantId: "s1",
  participants: [{ id: "s1", label: "Jane Smith", role: "Tenant" }],
  fieldAssignments: { a: ["s1"], b: ["s1"] },
  formFields: { a: "x" },
  totalFields: 2,
  completedFields: 1,
  mode: "edit",
};

const parties: NonNullable<RightSidebarProps["parties"]> = {
  title: "Recipients",
  config: {} as NonNullable<RightSidebarProps["parties"]>["config"],
  participants: [],
};

describe("PanelHeader (C11)", () => {
  it("renders a title heading, a count badge and trailing actions", () => {
    renderWithChakra(
      <PanelHeader
        title="Pages"
        count={12}
        actions={<button type="button">Act</button>}
      />
    );
    expect(screen.getByRole("heading", { name: "Pages" })).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
  });

  it("omits the badge when there is no count", () => {
    const { container } = renderWithChakra(<PanelHeader title="Fields" />);
    expect(container).toHaveTextContent(/^Fields$/);
  });
});

describe("RightSidebar", () => {
  it("doesn't render when no section is open", () => {
    const { container } = renderWithChakra(<RightSidebar />);
    expect(container.querySelector("[data-pdfe-sidebar]")).toBeNull();
  });

  it("doesn't render when collapsed, even with sections", () => {
    const { container } = renderWithChakra(
      <RightSidebar collapsed progress={progress} />
    );
    expect(container.querySelector("[data-pdfe-sidebar]")).toBeNull();
  });

  it("renders progress with a single 'Progress' heading and a '1 of 2' badge", () => {
    renderWithChakra(<RightSidebar progress={progress} />);
    expect(screen.getByRole("region", { name: "Progress" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Progress" })).toHaveLength(1);
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  it("renders the host panel slot with its title and untouched content", () => {
    renderWithChakra(
      <RightSidebar
        hostPanel={{
          title: "Lease checklist",
          content: <p data-testid="host-content">Host owns this</p>,
        }}
      />
    );
    const region = screen.getByRole("region", { name: "Lease checklist" });
    expect(region).toContainElement(screen.getByTestId("host-content"));
  });

  it("orders sections progress, host panel, parties", () => {
    renderWithChakra(
      <RightSidebar
        progress={progress}
        hostPanel={{ title: "Checklist", content: <p>body</p> }}
        parties={parties}
      />
    );
    const names = screen
      .getAllByRole("region")
      .map((r) => r.getAttribute("aria-label") ?? r.textContent?.split("\n")[0]);
    expect(screen.getAllByRole("region")).toHaveLength(3);
    expect(names[0]).toBe("Progress");
    expect(screen.getAllByRole("region")[1]).toHaveTextContent(/^Checklist/);
    expect(screen.getAllByRole("region")[2]).toHaveTextContent(/^Recipients/);
  });

  it("gives Parties its own scroll container", () => {
    renderWithChakra(<RightSidebar progress={progress} parties={parties} />);
    const partiesRegion = screen.getByRole("region", { name: "Recipients" });
    expect(partiesRegion).toHaveAttribute("data-pdfe-scroll", "parties");
    expect(partiesRegion).toContainElement(screen.getByTestId("parties-panel"));
    expect(
      screen.getByRole("region", { name: "Progress" }).closest("[data-pdfe-scroll]")
    ).toHaveAttribute("data-pdfe-scroll", "main");
  });
});
