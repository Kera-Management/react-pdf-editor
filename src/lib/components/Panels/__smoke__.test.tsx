import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Badge } from "@chakra-ui/react";
import "@testing-library/jest-dom/vitest";

import { renderWithChakra } from "../../testUtils";

describe("component test harness smoke test", () => {
  it("renders a Chakra element into jsdom", () => {
    renderWithChakra(<Badge data-testid="smoke">hello</Badge>);

    expect(screen.getByTestId("smoke")).toHaveTextContent("hello");
  });
});
