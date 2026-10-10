import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Button } from "@chakra-ui/react";
import { renderWithChakra } from "./testUtils";

describe("renderWithChakra", () => {
  it("renders Chakra components inside the provider (light by default)", () => {
    const { container } = renderWithChakra(
      <Button type="button">Save</Button>
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(container).not.toHaveClass("dark");
  });

  it('adds the .dark class to the container for colorMode "dark"', () => {
    const { container, rerender } = renderWithChakra(
      <Button type="button">Save</Button>,
      { colorMode: "dark" }
    );
    expect(container).toHaveClass("dark");
    rerender(<Button type="button">Saved</Button>);
    expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
  });
});
