import { describe, expect, it } from "vitest";
import { buildSegments, groupLines, joinItems } from "../layout/segments";
import { normalizeText } from "../normalize";
import { box, glyphs, makeItem, makePage, makeWidget, words } from "./fixtures";

const page = (items: ReturnType<typeof makeItem>[], widgets = [] as ReturnType<typeof makeWidget>[]) =>
  makePage(items, widgets);

describe("words", () => {
  it("joins per-glyph items without inventing spaces", () => {
    const p = page(glyphs("Total", 72, 100));
    const [seg] = buildSegments(0, p.items, []);
    expect(seg.text).toBe("Total");
  });

  it("inserts one space where the gap is wider than 0.25em", () => {
    const p = page(glyphs("Total rent", 72, 100));
    const [seg] = buildSegments(0, p.items, []);
    expect(seg.text).toBe("Total rent");
  });

  it("keeps kerning spaces inside str and never drops a character", () => {
    const items = [makeItem("R", 72, 100), makeItem("equireme nts", 77, 100)];
    const p = page(items);
    const [seg] = buildSegments(0, p.items, []);
    expect(seg.text).toBe("Requireme nts");
    expect(normalizeText(seg.text)).toBe(normalizeText(items.map((i) => i.str).join("")));
  });

  it("uses a whitespace-only item as a space hint without geometry", () => {
    // "to" + " " (0.2pt wide) + "show": the gap alone is under 0.25em.
    const items = [makeItem("to", 72, 100), makeItem(" ", 82, 100, 10, { width: 0.2 }), makeItem("show", 84, 100)];
    const p = page(items);
    const segs = buildSegments(0, p.items.filter((i) => i.str.trim()), [], p.items);
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe("to show");
  });
});

describe("lines and segments", () => {
  it("groups items whose baselines are within 0.35 x size", () => {
    const p = page([makeItem("A", 72, 100), makeItem("B", 90, 103), makeItem("C", 72, 112)]);
    expect(groupLines(p.items).map((l) => joinItems(l))).toEqual(["A B", "C"]);
  });

  it("splits a line at a wide gap", () => {
    const p = page([...words("Name", 72, 100), ...words("Date", 300, 100)]);
    expect(buildSegments(0, p.items, []).map((s) => s.text)).toEqual(["Name", "Date"]);
  });

  it("splits a line where a widget sits in the gap", () => {
    // "pay" and "by" are only 6pt apart, but a widget sits between them.
    const items = [makeItem("pay", 72, 100), makeItem("by", 93, 100)];
    const w = makeWidget("w", "text", box(88, 90, 4, 12));
    const p = page(items, [w]);
    expect(buildSegments(0, p.items, [w]).map((s) => s.text)).toEqual(["pay", "by"]);
  });

  it("splits at a bold/regular change with a visible gap", () => {
    const items = [makeItem("Important", 40, 100, 10, { bold: true }), makeItem("1. The guideline", 112, 100)];
    const p = page(items);
    expect(buildSegments(0, p.items, []).map((s) => s.text)).toEqual(["Important", "1. The guideline"]);
  });

  it("merges a superscript into the line it sits in", () => {
    const items = [makeItem("the 3", 72, 100), makeItem("rd", 97, 97, 6), makeItem("day", 106, 100)];
    const p = page(items);
    const segs = buildSegments(0, p.items, []);
    expect(segs).toHaveLength(1);
    expect(segs[0].items.map((i) => i.str)).toEqual(["the 3", "rd", "day"]);
  });
});
