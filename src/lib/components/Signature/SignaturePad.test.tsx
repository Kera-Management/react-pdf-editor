import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { renderWithChakra } from "../../testUtils";

import { SignaturePad, SignatureTab } from "./SignaturePad";
import { stubCanvas } from "./testUtils";

/** Controlled wrapper, the way SignatureAdoptionModal drives this. */
function Harness({ signerName }: { signerName?: string }) {
  const [activeTab, setActiveTab] = useState<SignatureTab>("draw");
  return (
    <SignaturePad
      activeTab={activeTab}
      onTabChange={setActiveTab}
      signerName={signerName}
      onChange={vi.fn()}
    />
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SignaturePad", () => {
  it("shows Draw by default with both tabs available", () => {
    stubCanvas();
    renderWithChakra(<Harness />);

    expect(screen.getByRole("tab", { name: "Draw" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: "Type" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
    expect(
      screen.getByRole("img", { name: /signature drawing area/i })
    ).toBeInTheDocument();
  });

  it("switches to the Type tab's input on click", async () => {
    stubCanvas();
    const user = userEvent.setup();
    renderWithChakra(<Harness signerName="Jane Doe" />);

    await user.click(screen.getByRole("tab", { name: "Type" }));

    expect(screen.getByRole("tab", { name: "Type" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByLabelText(/signature text/i)).toHaveValue("Jane Doe");
    // Only the active tab stays mounted (lazyMount + unmountOnExit).
    await waitFor(() =>
      expect(
        screen.queryByRole("img", { name: /signature drawing area/i })
      ).not.toBeInTheDocument()
    );
  });

  it("labels the tab list and marks the selected tab", () => {
    stubCanvas();
    renderWithChakra(<Harness />);

    expect(
      screen.getByRole("tablist", { name: "Signature style" })
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Draw" })).toHaveAttribute(
      "data-selected"
    );
    expect(screen.getByRole("tabpanel")).toContainElement(
      screen.getByRole("img", { name: /signature drawing area/i })
    );
  });

  it("never submits a surrounding host form from its tabs or pad buttons", async () => {
    stubCanvas();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const user = userEvent.setup();
    renderWithChakra(
      <form onSubmit={onSubmit}>
        <Harness />
      </form>
    );

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
    }
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveAttribute("type", "button");
    }
    await user.click(screen.getByRole("tab", { name: "Type" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
