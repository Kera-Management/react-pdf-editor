import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { TypeSignature } from "./TypeSignature";
import { stubCanvas } from "./testUtils";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TypeSignature", () => {
  it("pre-fills the input from signerName and reports a data URL immediately", () => {
    const { dataUrl } = stubCanvas();
    const onChange = vi.fn();

    render(<TypeSignature signerName="Jane Doe" onChange={onChange} />);

    expect(screen.getByLabelText(/signature text/i)).toHaveValue("Jane Doe");
    expect(onChange).toHaveBeenLastCalledWith(dataUrl);
  });

  it("reports null when there is no signerName and nothing typed yet", () => {
    stubCanvas();
    const onChange = vi.fn();

    render(<TypeSignature onChange={onChange} />);

    expect(screen.getByLabelText(/signature text/i)).toHaveValue("");
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("re-renders and reports a fresh data URL as the signer edits the text", async () => {
    const { dataUrl } = stubCanvas();
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<TypeSignature onChange={onChange} />);
    onChange.mockClear();

    await user.type(screen.getByLabelText(/signature text/i), "A");

    expect(onChange).toHaveBeenLastCalledWith(dataUrl);
  });

  it("reports null once the text is cleared back to blank", async () => {
    stubCanvas();
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<TypeSignature signerName="A" onChange={onChange} />);
    onChange.mockClear();

    await user.clear(screen.getByLabelText(/signature text/i));

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("treats whitespace-only text as blank", async () => {
    stubCanvas();
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<TypeSignature onChange={onChange} />);
    onChange.mockClear();

    await user.type(screen.getByLabelText(/signature text/i), "   ");

    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
