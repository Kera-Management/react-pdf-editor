import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { renderWithChakra } from "../../testUtils";

import { DrawSignatureCanvas } from "./DrawSignatureCanvas";
import { BLANK_IMAGE_DATA, drawAGesture, inkedImageData, stubCanvas } from "./testUtils";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DrawSignatureCanvas", () => {
  it("reports null on mount, before anything is drawn", () => {
    const { ctx } = stubCanvas();
    ctx.getImageData.mockReturnValue(BLANK_IMAGE_DATA);
    const onChange = vi.fn();

    renderWithChakra(<DrawSignatureCanvas onChange={onChange} />);

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("rejects a near-blank result below the coverage threshold", () => {
    const { ctx } = stubCanvas();
    ctx.getImageData.mockReturnValue(BLANK_IMAGE_DATA);
    const onChange = vi.fn();

    renderWithChakra(<DrawSignatureCanvas onChange={onChange} />);
    onChange.mockClear();

    const canvas = screen.getByRole("img", { name: /signature drawing area/i });
    drawAGesture(canvas);

    // getImageData still reports blank (below MIN_INK_COVERAGE) even
    // though a gesture completed -- adoption stays blocked.
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("accepts a signature once ink coverage clears the threshold", () => {
    const { ctx, dataUrl } = stubCanvas();
    ctx.getImageData.mockReturnValue(BLANK_IMAGE_DATA);
    const onChange = vi.fn();

    renderWithChakra(<DrawSignatureCanvas onChange={onChange} />);

    ctx.getImageData.mockReturnValue(inkedImageData());
    const canvas = screen.getByRole("img", { name: /signature drawing area/i });
    drawAGesture(canvas);

    expect(onChange).toHaveBeenLastCalledWith(dataUrl);
  });

  it("undo removes the last stroke and re-evaluates coverage against what remains", () => {
    const { ctx, dataUrl } = stubCanvas();
    ctx.getImageData.mockReturnValue(BLANK_IMAGE_DATA);
    const onChange = vi.fn();

    renderWithChakra(<DrawSignatureCanvas onChange={onChange} />);

    ctx.getImageData.mockReturnValue(inkedImageData());
    const canvas = screen.getByRole("img", { name: /signature drawing area/i });
    drawAGesture(canvas);
    expect(onChange).toHaveBeenLastCalledWith(dataUrl);

    const undoButton = screen.getByRole("button", { name: /undo/i });
    expect(undoButton).toBeEnabled();

    // Undoing the only stroke leaves the canvas genuinely blank.
    ctx.getImageData.mockReturnValue(BLANK_IMAGE_DATA);
    act(() => {
      undoButton.click();
    });

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(undoButton).toBeDisabled();
  });

  it("clear empties the canvas and reports null", () => {
    const { ctx, dataUrl } = stubCanvas();
    ctx.getImageData.mockReturnValue(BLANK_IMAGE_DATA);
    const onChange = vi.fn();

    renderWithChakra(<DrawSignatureCanvas onChange={onChange} />);

    ctx.getImageData.mockReturnValue(inkedImageData());
    const canvas = screen.getByRole("img", { name: /signature drawing area/i });
    drawAGesture(canvas);
    expect(onChange).toHaveBeenLastCalledWith(dataUrl);

    ctx.getImageData.mockReturnValue(BLANK_IMAGE_DATA);
    const clearButton = screen.getByRole("button", { name: /clear/i });
    act(() => {
      clearButton.click();
    });

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(clearButton).toBeDisabled();
  });

  it("undo and clear start disabled with nothing drawn", () => {
    stubCanvas();

    renderWithChakra(<DrawSignatureCanvas onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /undo/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /clear/i })).toBeDisabled();
  });
});
