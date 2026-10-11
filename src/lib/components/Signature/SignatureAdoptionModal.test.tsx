import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { renderWithChakra } from "../../testUtils";

import { SignatureAdoptionModal } from "./SignatureAdoptionModal";
import { drawAGesture, inkedImageData, stubCanvas } from "./testUtils";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SignatureAdoptionModal - capture flow", () => {
  it("blocks Adopt until a signature is drawn, then fires onAdopt with a data URL and closes", async () => {
    const { ctx, dataUrl } = stubCanvas();
    const onAdopt = vi.fn();
    const onClose = vi.fn();

    renderWithChakra(
      <SignatureAdoptionModal
        isOpen
        onClose={onClose}
        onAdopt={onAdopt}
      />
    );

    const adoptButton = screen.getByRole("button", { name: "Adopt" });
    expect(adoptButton).toBeDisabled();
    expect(screen.getByText(/draw your signature to continue/i)).toBeInTheDocument();

    ctx.getImageData.mockReturnValue(inkedImageData());
    const canvas = screen.getByRole("img", { name: /signature drawing area/i });
    drawAGesture(canvas);

    expect(adoptButton).toBeEnabled();
    await userEvent.click(adoptButton);

    expect(onAdopt).toHaveBeenCalledWith(dataUrl);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("adopts a typed signature the same way", async () => {
    const { dataUrl } = stubCanvas();
    const onAdopt = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithChakra(
      <SignatureAdoptionModal
        isOpen
        onClose={onClose}
        signerName="Jane Doe"
        onAdopt={onAdopt}
      />
    );

    await user.click(screen.getByRole("tab", { name: "Type" }));

    const adoptButton = screen.getByRole("button", { name: "Adopt" });
    expect(adoptButton).toBeEnabled(); // pre-filled from signerName

    await user.click(adoptButton);

    expect(onAdopt).toHaveBeenCalledWith(dataUrl);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("SignatureAdoptionModal - saved signature", () => {
  const SAVED = "data:image/png;base64,SAVED";

  it("offers a one-click adopt of the saved signature without entering capture", async () => {
    stubCanvas();
    const onAdopt = vi.fn();
    const onClose = vi.fn();

    renderWithChakra(
      <SignatureAdoptionModal
        isOpen
        onClose={onClose}
        savedSignature={SAVED}
        onAdopt={onAdopt}
      />
    );

    expect(screen.getByText(/your saved signature/i)).toBeInTheDocument();
    expect(screen.getByAltText(/your saved signature/i)).toHaveAttribute("src", SAVED);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /use this signature/i }));

    expect(onAdopt).toHaveBeenCalledWith(SAVED);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("falls through to capture when the signer chooses to draw a new one", async () => {
    stubCanvas();
    renderWithChakra(
      <SignatureAdoptionModal
        isOpen
        onClose={vi.fn()}
        savedSignature={SAVED}
        onAdopt={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /draw a new one/i }));

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Draw" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });
});

describe("SignatureAdoptionModal - tab memory across reopen", () => {
  const SAVED = "data:image/png;base64,SAVED";

  /** Mirrors a host that persists whatever was last adopted and passes it
   * back in as `savedSignature` on the next open. */
  function Harness() {
    const [isOpen, setIsOpen] = useState(true);
    const [savedSignature, setSavedSignature] = useState<string | undefined>();

    return (
      <div>
        <button onClick={() => setIsOpen(true)}>Reopen</button>
        <SignatureAdoptionModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          savedSignature={savedSignature}
          onAdopt={(dataUrl) => setSavedSignature(dataUrl)}
        />
      </div>
    );
  }

  it("reopens straight to the saved-signature view, defaulting Draw when redone", async () => {
    const { ctx } = stubCanvas(SAVED);
    const user = userEvent.setup();

    renderWithChakra(<Harness />);

    // First open: no saved signature yet, capture defaults to Draw.
    expect(screen.getByRole("tab", { name: "Draw" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    ctx.getImageData.mockReturnValue(inkedImageData());
    const canvas = screen.getByRole("img", { name: /signature drawing area/i });
    drawAGesture(canvas);
    await user.click(screen.getByRole("button", { name: "Adopt" }));

    // Reopen: the modal now has a savedSignature and shows the quick view.
    await user.click(screen.getByRole("button", { name: "Reopen" }));
    expect(screen.getByText(/your saved signature/i)).toBeInTheDocument();

    // Choosing to redo still defaults to Draw, since that's what produced it.
    await user.click(screen.getByRole("button", { name: /draw a new one/i }));
    expect(screen.getByRole("tab", { name: "Draw" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("remembers Type when a typed signature is what's currently saved", async () => {
    stubCanvas(SAVED);
    const user = userEvent.setup();

    renderWithChakra(<Harness />);

    await user.click(screen.getByRole("tab", { name: "Type" }));
    await user.type(screen.getByLabelText(/signature text/i), "Jane Doe");
    await user.click(screen.getByRole("button", { name: "Adopt" }));

    await user.click(screen.getByRole("button", { name: "Reopen" }));
    await user.click(screen.getByRole("button", { name: /draw a new one/i }));

    expect(screen.getByRole("tab", { name: "Type" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });
});

describe("SignatureAdoptionModal - shell", () => {
  it("is a dialog titled 'Add your signature' with Cancel that closes without adopting", async () => {
    stubCanvas();
    const onAdopt = vi.fn();
    const onClose = vi.fn();

    renderWithChakra(
      <SignatureAdoptionModal isOpen onClose={onClose} onAdopt={onAdopt} />
    );

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Add your signature");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAdopt).not.toHaveBeenCalled();
  });

  it("never submits the host form the editor is mounted in", async () => {
    stubCanvas();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());

    renderWithChakra(
      <form onSubmit={onSubmit}>
        <SignatureAdoptionModal
          isOpen
          onClose={vi.fn()}
          savedSignature="data:image/png;base64,SAVED"
          onAdopt={vi.fn()}
        />
      </form>
    );

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
    }
    await userEvent.click(screen.getByRole("button", { name: /use this signature/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders in dark mode with the same capture flow", () => {
    stubCanvas();
    renderWithChakra(
      <SignatureAdoptionModal isOpen onClose={vi.fn()} onAdopt={vi.fn()} />,
      { colorMode: "dark" }
    );

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Add your signature");
    expect(
      screen.getByRole("img", { name: /signature drawing area/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adopt" })).toBeDisabled();
  });
});
