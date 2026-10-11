import { describe, expect, it, vi } from "vitest";
import {
  buildSourceWidgets,
  conversionErrorResult,
  readWidgetExtras,
  widgetKind,
} from "./integration";

const field = (overrides: Record<string, unknown>) => ({
  id: "1R",
  name: "f",
  type: "text",
  rect: [100, 600, 300, 620],
  multiline: false,
  hidden: false,
  ...overrides,
});

describe("buildSourceWidgets", () => {
  it("flips rects into top-left page space against the view box", () => {
    const [widget] = buildSourceWidgets(
      [field({})],
      [0, 0, 612, 792],
      new Set()
    );
    expect(widget.box).toEqual({ left: 100, top: 172, right: 300, bottom: 192 });
    expect(widget.kind).toBe("text");
    expect(widget.hidden).toBe(false);
  });

  it("maps kinds, with signature decided by the editor's names", () => {
    const sig = new Set(["sign_here"]);
    expect(widgetKind(field({ name: "sign_here" }), sig)).toBe("signature");
    expect(widgetKind(field({ type: "checkbox" }), sig)).toBe("checkbox");
    expect(widgetKind(field({ type: "radio" }), sig)).toBe("radio");
    expect(widgetKind(field({ type: "combobox" }), sig)).toBe("select");
    expect(widgetKind(field({ multiline: true }), sig)).toBe("multiline");
    expect(widgetKind(field({ type: "list" }), sig)).toBe("text");
  });

  it("carries tooltip, max length, comb, export value and options", () => {
    const [text, box, select] = buildSourceWidgets(
      [
        field({ charLimit: 10, comb: true }),
        field({ id: "2R", type: "checkbox", exportValues: "Yes" }),
        field({
          id: "3R",
          type: "combobox",
          items: [{ exportValue: "ON", displayValue: "Ontario" }],
        }),
      ],
      [0, 0, 612, 792],
      new Set(),
      new Map([["1R", { tooltip: " Tenant name " }]])
    );
    expect(text).toMatchObject({ tooltip: "Tenant name", maxLength: 10, comb: true });
    expect(box.exportValue).toBe("Yes");
    expect(select.options).toEqual([{ exportValue: "ON", displayValue: "Ontario" }]);
    // No undefined-valued keys (Firestore-style hygiene, and cleaner diffs).
    expect(Object.values(box).includes(undefined)).toBe(false);
  });
});

describe("readWidgetExtras", () => {
  it("collects widget tooltips by id and survives a failing page", async () => {
    const page = {
      getAnnotations: vi.fn(async () => [
        { subtype: "Widget", id: "1R", alternativeText: "Phone" },
        { subtype: "Link", id: "2R", alternativeText: "x" },
        { subtype: "Widget", id: "3R", alternativeText: "  " },
      ]),
    };
    const extras = await readWidgetExtras(page);
    expect(Array.from(extras.entries())).toEqual([["1R", { tooltip: "Phone" }]]);
    const broken = { getAnnotations: vi.fn(async () => Promise.reject(new Error("x"))) };
    expect((await readWidgetExtras(broken)).size).toBe(0);
    expect((await readWidgetExtras({})).size).toBe(0);
  });
});

describe("conversionErrorResult", () => {
  it("withholds the document and names the error", () => {
    const result = conversionErrorResult(new Error("boom"));
    expect(result.status).toBe("fallback");
    expect(result.document).toBeNull();
    expect(result.report.reasons).toEqual([
      { code: "conversionError", severity: "fail", detail: "boom" },
    ]);
  });
});
