import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

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
    render(<Harness />);

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
    render(<Harness signerName="Jane Doe" />);

    await user.click(screen.getByRole("tab", { name: "Type" }));

    expect(screen.getByRole("tab", { name: "Type" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByLabelText(/signature text/i)).toHaveValue("Jane Doe");
    expect(
      screen.queryByRole("img", { name: /signature drawing area/i })
    ).not.toBeInTheDocument();
  });
});
