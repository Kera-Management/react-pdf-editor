import { describe, expect, it } from "vitest";
import { RECIPIENT_COLOR_COUNT, recipientColorVar } from "./colors";

describe("recipientColorVar", () => {
  it("maps the first index to the first token", () => {
    expect(recipientColorVar(0)).toBe("var(--pdfe-recipient-1)");
  });

  it("maps the last in-range index to the last token", () => {
    expect(recipientColorVar(RECIPIENT_COLOR_COUNT - 1)).toBe(
      `var(--pdfe-recipient-${RECIPIENT_COLOR_COUNT})`
    );
  });

  it("wraps back to the first token once the count is exceeded", () => {
    expect(recipientColorVar(RECIPIENT_COLOR_COUNT)).toBe("var(--pdfe-recipient-1)");
    expect(recipientColorVar(RECIPIENT_COLOR_COUNT + 1)).toBe(
      "var(--pdfe-recipient-2)"
    );
  });

  it("wraps multiple times around the palette", () => {
    expect(recipientColorVar(RECIPIENT_COLOR_COUNT * 2 + 3)).toBe(
      "var(--pdfe-recipient-4)"
    );
  });

  it("wraps negative indices to a valid token instead of producing a bad name", () => {
    expect(recipientColorVar(-1)).toBe(
      `var(--pdfe-recipient-${RECIPIENT_COLOR_COUNT})`
    );
    expect(recipientColorVar(-RECIPIENT_COLOR_COUNT)).toBe(
      "var(--pdfe-recipient-1)"
    );
  });

  it("exposes exactly 6 recipient colors, matching the theme.css token set", () => {
    expect(RECIPIENT_COLOR_COUNT).toBe(6);
  });

  it("resolves the ink set with the same wrapping", () => {
    expect(recipientColorVar(0, "ink")).toBe("var(--pdfe-recipient-ink-1)");
    expect(recipientColorVar(RECIPIENT_COLOR_COUNT + 1, "ink")).toBe(
      "var(--pdfe-recipient-ink-2)"
    );
    expect(recipientColorVar(2, "canvas")).toBe("var(--pdfe-recipient-3)");
  });
});
