import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

describe("component test harness smoke test", () => {
  it("renders a trivial element into jsdom", () => {
    render(<div data-testid="smoke">hello</div>);

    expect(screen.getByTestId("smoke")).toHaveTextContent("hello");
  });
});
