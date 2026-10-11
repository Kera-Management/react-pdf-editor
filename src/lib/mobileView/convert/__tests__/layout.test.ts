import { describe, expect, it } from "vitest";
import type {
  ChoiceBlock,
  FieldBlock,
  GroupBlock,
  HeadingBlock,
  KeyValueBlock,
  ListBlock,
  ParagraphBlock,
  RadioGroupBlock,
  SourcePage,
} from "../../types";
import { convertDocument, convertDocumentUnchecked } from "../index";
import {
  allRuns,
  bodyBlocks,
  box,
  flowText,
  inlineText,
  makeItem,
  makePage,
  makeWidget,
  paragraph,
  rightOf,
  words,
} from "./fixtures";

const convert = (...args: Parameters<typeof convertDocumentUnchecked>) => {
  const res = convertDocumentUnchecked(...args);
  if (!res.document) throw new Error(`no document: ${JSON.stringify(res.report.reasons)}`);
  return { doc: res.document, report: res.report };
};

describe("reading order and paragraphs", () => {
  it("reads lines top to bottom whatever the item order, and joins a paragraph", () => {
    const items = paragraph(["The tenant agrees to pay", "rent on the first day", "of each month."], 72, 100);
    const { doc, report } = convert([makePage(items.slice().reverse())]);
    expect(report.decision).toBe("ok");
    const [p] = bodyBlocks(doc) as ParagraphBlock[];
    expect(p.type).toBe("paragraph");
    expect(inlineText(p.content)).toBe("The tenant agrees to pay rent on the first day of each month.");
  });

  it("starts every page with a page break block", () => {
    const pages = [
      makePage(words("The first page of the lease.", 72, 100)),
      makePage(words("The second page of the lease.", 72, 100), [], { pageIndex: 1 }),
    ];
    const { doc } = convert(pages);
    expect(doc.blocks.filter((b) => b.type === "pageBreak").map((b) => b.id)).toEqual(["mf_page_0", "mf_page_1"]);
    expect(doc.blocks[0]).toMatchObject({ type: "pageBreak", pageNumber: 1, pageCount: 2 });
    expect(doc.blocks[1].id).toBe("p0-b0");
    expect(doc.blocks[1].origin?.pageIndex).toBe(0);
  });

  it("keeps a hyphenated word whole and never removes the hyphen", () => {
    const items = paragraph(["This is an inter-", "national agreement."], 72, 100);
    const { doc } = convert([makePage(items)]);
    expect(flowText(doc)).toBe("This is an inter-national agreement.");
  });

  it("reads two prose columns one after the other", () => {
    const left = paragraph(
      ["The landlord must keep the", "premises in a good state of", "repair and fit for habitation.", "This applies to every unit."],
      72, 100
    );
    const right = paragraph(
      ["The tenant must keep the", "premises clean and must repair", "damage caused by the tenant.", "This also applies to guests."],
      330, 100
    );
    // Interleave the stream order to prove geometry decides.
    const items = left.flatMap((it, i) => [it, ...(right[i] ? [right[i]] : [])]).concat(right.slice(left.length));
    const { doc, report } = convert([makePage(items)]);
    expect(report.decision).toBe("ok");
    const text = flowText(doc);
    expect(text.indexOf("This applies to every unit.")).toBeLessThan(text.indexOf("The tenant must keep"));
  });

  it("pairs a narrow column of bold labels with the text level with them", () => {
    const items = [
      ...words("Termination", 30, 100, 10, { bold: true }),
      ...words("date", 30, 112, 10, { bold: true }),
      ...paragraph(["The date must be at least 60 days", "after the landlord gives notice."], 150, 100),
      ...words("Moving", 30, 160, 10, { bold: true }),
      ...words("out", 30, 172, 10, { bold: true }),
      ...paragraph(["If you move out by the termination", "date your tenancy ends then."], 150, 160),
      ...words("Disputes", 30, 220, 10, { bold: true }),
      ...paragraph(["You do not have to move out if", "you disagree with this notice."], 150, 220),
    ];
    const { doc, report } = convert([makePage(items)]);
    expect(report.decision).toBe("ok");
    const kv = bodyBlocks(doc) as KeyValueBlock[];
    expect(kv.map((b) => b.type)).toEqual(["keyValue", "keyValue", "keyValue"]);
    expect(inlineText(kv[0].label)).toBe("Termination date");
    expect(inlineText((kv[1].value[0] as ParagraphBlock).content)).toBe(
      "If you move out by the termination date your tenancy ends then."
    );
  });

  it("does not join a label in another typeface onto the label above (N8)", () => {
    // N8 page 2 geometry: a bold sidebar label over the radio row, and a
    // regular "First Name" caption 13pt below it, over a full-width field.
    const bold = { fontName: "QHPNRC+Verdana-Bold", bold: true };
    const body = { fontName: "OROWPG+Verdana" };
    const caption = { fontName: "LUZJZM+ArialMT" };
    const items = [
      ...words("More", 27, 300, 10, bold),
      ...words("information", 27, 312, 10, bold),
      ...paragraph(["For more information about this notice or your rights,", "you can contact the Board."], 117, 300, 10, 12, body),
      ...words("Signature", 27, 368, 10, bold),
      ...words("Landlord", 165, 368, 10, body),
      ...words("Representative", 277, 368, 10, body),
      ...words("First Name", 29, 381, 10, caption),
      ...words("Last Name", 29, 417, 10, caption),
    ];
    const widgets = [
      makeWidget("sel_l", "radio", box(147, 359, 12, 12), { name: "SelectSign", exportValue: "L" }),
      makeWidget("sel_r", "radio", box(259, 359, 12, 12), { name: "SelectSign", exportValue: "R" }),
      makeWidget("first", "text", box(28, 383, 556, 20)),
      makeWidget("last", "text", box(28, 419, 556, 20)),
    ];
    const { doc, report } = convert([makePage(items, widgets)]);
    expect(report.decision).toBe("ok");
    const text = flowText(doc);
    expect(text).not.toContain("Signature First Name");
    expect(text.indexOf("Representative")).toBeLessThan(text.indexOf("First Name"));
  });
});

describe("headings and lists", () => {
  it("keeps a run-on sentence over a tall field in one paragraph (N5)", () => {
    // N5: two bold lines 2.5em apart, the second holding a tall date field.
    const first = words("I am giving you this notice because I want you to move out of your", 30, 100, 10, { bold: true });
    const second = words("rental unit by the following termination date:", 30, 125, 10, { bold: true });
    const date = makeWidget("date", "text", box(rightOf(second) + 6, 108, 120, 20), { tooltip: "Termination date" });
    const stop = makeItem(".", date.box.right + 2, 125, 10, { bold: true });
    const { doc, report } = convert([makePage([...first, ...second, stop], [date])]);
    expect(report.decision).toBe("ok");
    const blocks = bodyBlocks(doc);
    expect(blocks.map((b) => b.type)).toEqual(["paragraph"]);
    expect(inlineText((blocks[0] as ParagraphBlock).content)).toBe(
      "I am giving you this notice because I want you to move out of your rental unit by the following termination date:[date]."
    );
  });

  it("detects bold and large headings", () => {
    const items = [
      ...words("Standard Form of Lease", 72, 80, 16),
      ...words("Parties", 72, 110, 10, { bold: true }),
      ...words("This agreement is made between the parties named below.", 72, 130),
    ];
    const { doc } = convert([makePage(items)]);
    const [h1, h2, p] = bodyBlocks(doc);
    expect(h1).toMatchObject({ type: "heading", level: 1 });
    expect(h2).toMatchObject({ type: "heading", level: 2 });
    expect(inlineText((h2 as HeadingBlock).content)).toBe("Parties");
    expect(p.type).toBe("paragraph");
  });

  it("builds lists with the printed marker as a separate source run", () => {
    const items = [
      makeItem("(a)", 72, 100), ...words("pay the rent owing;", 92, 100),
      makeItem("(b)", 72, 114), ...words("apply to the Director.", 92, 114),
      makeItem("•", 72, 140), ...words("a bullet point", 84, 140),
      makeItem("iv)", 72, 160), ...words("roman numeral item", 92, 160),
      makeItem("1.", 72, 200), ...words("Parties to the lease", 92, 200),
    ];
    const { doc } = convert([makePage(items)]);
    const lists = bodyBlocks(doc) as ListBlock[];
    expect(lists[0].type).toBe("list");
    expect(lists[0].ordered).toBe(true);
    expect(lists[0].items.map((i) => i.marker?.text)).toEqual(["(a)", "(b)"]);
    expect(inlineText(lists[0].items[1].content)).toBe("apply to the Director.");
    expect(lists[1]).toMatchObject({ type: "list", ordered: false });
    expect(lists[1].items[0].marker?.text).toBe("•");
    expect(lists[2].items[0].marker?.text).toBe("iv)");
    expect(lists[3]).toMatchObject({ type: "list", ordered: true });
    expect(lists[3].items[0].marker?.text).toBe("1.");
  });

  it("does not start a list item mid-sentence", () => {
    const items = paragraph(["terminable by either party upon thirty", "(30) days' written notice."], 72, 100);
    const { doc } = convert([makePage(items)]);
    expect(bodyBlocks(doc).map((b) => b.type)).toEqual(["paragraph"]);
  });
});

describe("headers and footers", () => {
  it("keeps repeated page furniture in place on every page", () => {
    const page = (i: number) =>
      makePage(
        [
          ...words("Form N4", 72, 30, 9),
          ...words(`Body text of page ${i + 1} goes here.`, 72, 200),
          ...words(`Page ${i + 1} of 2`, 500, 770, 9),
        ],
        [],
        { pageIndex: i }
      );
    const { doc, report } = convert([page(0), page(1)]);
    expect(report.decision).toBe("ok");
    const roles = doc.blocks.map((b) => (b.type === "paragraph" ? b.role : b.type));
    expect(roles).toEqual(["pageBreak", "furniture", "body", "furniture", "pageBreak", "furniture", "body", "furniture"]);
    const last = doc.blocks[3] as ParagraphBlock;
    expect(inlineText(last.content)).toBe("Page 1 of 2");
  });

  it("keeps an /Artifact line repeated mid-page as furniture where it is", () => {
    const page = (i: number) =>
      makePage(
        [
          ...words("Body text above the repeated artifact line.", 72, 200),
          ...words("Confidential draft", 72, 400, 9, { artifact: true }),
          ...words("Body text below the repeated artifact line.", 72, 600),
        ],
        [],
        { pageIndex: i }
      );
    const { doc } = convert([page(0), page(1)]);
    const roles = bodyBlocks(doc).map((b) => (b.type === "paragraph" ? b.role : b.type));
    expect(roles).toEqual(["body", "furniture", "body", "body", "furniture", "body"]);
  });
});

describe("field anchoring", () => {
  it("places a fill-in-the-blank field inside its sentence, with the comb guide as hint", () => {
    const before = words("Pay this amount by", 72, 100);
    const w = makeWidget("due", "text", box(rightOf(before) + 4, 90, 80, 14), { comb: true, tooltip: "Due date" });
    const guide = makeItem("dd/mm/yyyy", w.box.left + 10, 101, 7);
    const after = words(". This is the termination date.", w.box.right + 4, 100);
    const { doc, report } = convert([makePage([...before, guide, ...after], [w])]);
    expect(report.decision).toBe("ok");
    const [p] = bodyBlocks(doc) as ParagraphBlock[];
    expect(inlineText(p.content)).toBe("Pay this amount by[due]. This is the termination date.");
    const field = p.content.find((n) => n.kind === "field");
    expect(field).toMatchObject({ kind: "field", fieldId: "due", ariaLabel: { origin: "tooltip", text: "Due date" } });
    expect(field && field.kind === "field" && field.hint?.map((h) => h.text)).toEqual(["dd/mm/yyyy"]);
    expect(doc.fieldBlockIds.due).toBe(p.id);
  });

  it("turns an address row into a labelled grid, left to right", () => {
    const a = words("Apartment", 72, 100);
    const wa = makeWidget("apt", "text", box(rightOf(a) + 6, 90, 50, 14));
    const c = words("City or town", wa.box.right + 10, 100);
    const wc = makeWidget("city", "text", box(rightOf(c) + 6, 90, 120, 14));
    const pc = words("Postal code", wc.box.right + 10, 100);
    const wp = makeWidget("postal", "text", box(rightOf(pc) + 6, 90, 60, 14));
    const { doc, report } = convert([makePage([...a, ...c, ...pc], [wa, wc, wp])]);
    expect(report.decision).toBe("ok");
    const [g] = bodyBlocks(doc) as GroupBlock[];
    expect(g).toMatchObject({ type: "group", layout: "grid" });
    const fields = g.children as FieldBlock[];
    expect(fields.map((f) => f.fieldId)).toEqual(["apt", "city", "postal"]);
    expect(fields.map((f) => (f.label?.kind === "source" ? inlineText(f.label.runs) : null))).toEqual([
      "Apartment",
      "City or town",
      "Postal code",
    ]);
  });

  it("takes labels printed above a row of boxes, and a two-line label belongs to one field", () => {
    const items = [
      ...words("Street number and", 72, 100, 8),
      ...words("Unit", 300, 108, 8),
      ...words("name (civic address)", 72, 108, 8),
    ];
    const ws = [makeWidget("street", "text", box(72, 112, 200, 16)), makeWidget("unit", "text", box(300, 112, 60, 16))];
    const { doc, report } = convert([makePage(items, ws)]);
    expect(report.decision).toBe("ok");
    const [g] = bodyBlocks(doc) as GroupBlock[];
    const labels = (g.children as FieldBlock[]).map((f) => (f.label?.kind === "source" ? inlineText(f.label.runs) : null));
    expect(labels).toEqual(["Street number and name (civic address)", "Unit"]);
  });

  it("places overlapping stacked widgets once each", () => {
    const items = [
      ...words("This agreement is between the landlord and", 72, 60),
      ...words("Tenant", 72, 100), ...words("Tenant", 72, 114), ...words("Tenant", 72, 128),
    ];
    const ws = [0, 1, 2].map((k) => makeWidget(`t${k}`, "text", box(120, 90 + k * 14, 300, 16)));
    const { report } = convert([makePage(items, ws)]);
    expect(report.decision).toBe("ok");
    expect(report.widgets).toMatchObject({ expected: 3, placed: 3, duplicated: [], missing: [] });
  });

  it("labels a signature line from the text printed below it", () => {
    const items = [...words("Signature of landlord", 72, 140, 8)];
    const sig = makeWidget("sig", "signature", box(72, 110, 200, 20));
    const { doc } = convert([makePage([...words("Signed this day.", 72, 80), ...items], [sig])]);
    const field = bodyBlocks(doc).find((b) => b.type === "field") as FieldBlock;
    expect(field.kind).toBe("signature");
    expect(field.label?.kind === "source" && inlineText(field.label.runs)).toBe("Signature of landlord");
  });

  it("falls back to the tooltip, then to a humanized field name", () => {
    const items = words("A paragraph that is not a label at all because it is far too long to be one, really.", 72, 80);
    const ws = [
      makeWidget("w1", "text", box(72, 200, 200, 16), { tooltip: "Enter the occupant's name" }),
      makeWidget("w2", "text", box(72, 300, 200, 16), { name: "form1[0].#subform[0].PayDate[0]" }),
    ];
    const { doc, report } = convert([makePage(items, ws)]);
    const [f1, f2] = bodyBlocks(doc).filter((b) => b.type === "field") as FieldBlock[];
    expect(f1.label).toEqual({ kind: "synthetic", text: { kind: "synthetic", text: "Enter the occupant's name", origin: "tooltip" } });
    expect(f2.label).toEqual({ kind: "synthetic", text: { kind: "synthetic", text: "Pay date", origin: "fieldName" } });
    expect(report.widgets.weaklyLabelled).toBe(1);
  });
});

describe("checkboxes, grids and radios", () => {
  /** A 3 x 4 checkbox grid with a printed ZapfDingbats "q" under each box. */
  function rentIncludes() {
    const cols = [80, 180, 330];
    const labels = [
      ["stove", "fridge", "washer & dryer", "dishwasher"],
      ["heat", "water", "hot water", "electricity"],
      ["lawn care", "snow removal", "garbage removal", "Other"],
    ];
    const items = [
      ...words("Appliances", 80, 100), ...words("Utilities", 180, 100), ...words("Services", 330, 100),
    ];
    const widgets = [];
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 4; r++) {
        const top = 106 + r * 14;
        const cb = makeWidget(`c${c}r${r}`, "checkbox", box(cols[c], top, 10, 10), { name: `cb${c}${r}` });
        widgets.push(cb);
        items.push(makeItem("q", cols[c] + 1, top + 9, 9, { dingbat: true }));
        items.push(...words(labels[c][r], cols[c] + 14, top + 9));
      }
    }
    // "Other [cb] + [text]" in the last cell.
    const other = makeWidget("otherText", "text", box(372, 146, 100, 12), { tooltip: "Specify" });
    widgets.push(other);
    return makePage(items, widgets);
  }

  it("flags a printed box with no widget over it, keeping its character", () => {
    const q = makeItem("q", 72, 100, 10, { dingbat: true });
    const label = words("month-to-month", 86, 100);
    const greek = makeItem("q", 72, 130, 10, { dingbat: true, fontName: "Symbol" });
    const after = words("is theta", 86, 130);
    const { doc, report } = convert([makePage([q, ...label, greek, ...after])]);
    expect(report.decision).toBe("ok");
    const runs = allRuns(doc);
    const boxes = runs.filter((r) => r.printedBox);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].text.trim()).toBe("q");
    expect(boxes[0].sources).toHaveLength(1);
    // The Symbol font's "q" is a letter, not a box.
    expect(flowText(doc)).toContain("q is theta");
  });

  it("rebuilds a checkbox grid column by column and leaves out printed boxes", () => {
    const { doc, report } = convert([rentIncludes()]);
    expect(report.decision).toBe("ok");
    expect(report.text.excludedChars).toBe(12);
    const grid = bodyBlocks(doc).find((b) => b.type === "group") as GroupBlock;
    expect(grid.layout).toBe("checkboxGrid");
    const cols = grid.children as GroupBlock[];
    expect(cols.map((c) => inlineText(c.heading ?? []))).toEqual(["Appliances", "Utilities", "Services"]);
    expect((cols[0].children as ChoiceBlock[]).map((c) => inlineText(c.label))).toEqual([
      "stove", "fridge", "washer & dryer", "dishwasher",
    ]);
    const last = cols[2].children[3] as ChoiceBlock;
    expect(inlineText(last.label)).toBe("Other[otherText]");
  });

  it("splits a line that pdf.js gave across two cells at the widget between them", () => {
    const items = [
      ...words("The rent includes the following:", 72, 80),
      makeItem("q", 81, 109, 9, { dingbat: true }), ...words("washer & dryer", 94, 109),
      makeItem("q", 181, 109, 9, { dingbat: true }), ...words("heat", 194, 109),
    ];
    const ws = [makeWidget("a", "checkbox", box(80, 100, 10, 10)), makeWidget("b", "checkbox", box(180, 100, 10, 10))];
    const { doc } = convert([makePage(items, ws)]);
    const choices = bodyBlocks(doc).filter((b) => b.type === "choice") as ChoiceBlock[];
    expect(choices.map((c) => [c.fieldId, inlineText(c.label)])).toEqual([
      ["a", "washer & dryer"],
      ["b", "heat"],
    ]);
  });

  it("groups same-name radios into one group with labels from the right", () => {
    const items = [
      ...words("Who pays for heat?", 72, 100),
      ...words("Landlord", 90, 120), ...words("Tenant", 200, 120),
    ];
    const ws = [
      makeWidget("r1", "radio", box(72, 111, 10, 10), { name: "heat" }),
      makeWidget("r2", "radio", box(182, 111, 10, 10), { name: "heat" }),
    ];
    const { doc, report } = convert([makePage(items, ws)]);
    expect(report.decision).toBe("ok");
    const [g] = bodyBlocks(doc) as RadioGroupBlock[];
    expect(g).toMatchObject({ type: "radioGroup", groupName: "heat" });
    expect(g.label?.kind === "source" && inlineText(g.label.runs)).toBe("Who pays for heat?");
    expect(g.options.map((o) => [o.fieldId, inlineText(o.label)])).toEqual([
      ["r1", "Landlord"],
      ["r2", "Tenant"],
    ]);
    expect(doc.fieldBlockIds).toEqual({ r1: g.id, r2: g.id });
  });

  it("attaches a wrapped checkbox label with a hanging indent", () => {
    const items = [
      ...words("Reason 2: the following person intends to", 90, 100),
      ...words("move into the rental unit.", 140, 112),
      ...words("Details follow below this line of the form.", 72, 160),
    ];
    const ws = [makeWidget("r2", "checkbox", box(72, 91, 10, 10))];
    const { doc } = convert([makePage(items, ws)]);
    const [c] = bodyBlocks(doc) as ChoiceBlock[];
    expect(inlineText(c.label)).toBe("Reason 2: the following person intends to move into the rental unit.");
  });
});

describe("tagged pages", () => {
  it("orders side-by-side regions by the struct tree and maps heading roles", () => {
    const left = paragraph(
      ["Left column text that the struct", "tree puts second in the reading", "order of this page on purpose."],
      72, 120, 10, 12, { mcid: 1 }
    );
    const right = paragraph(
      ["Right column text that the struct", "tree puts first in the reading", "order of this page on purpose."],
      330, 120, 10, 12, { mcid: 2 }
    );
    const title = words("A title that spans both of the columns below", 150, 80, 10, { mcid: 0 });
    const page = makePage([...title, ...left, ...right], [], {
      structure: [
        { role: "H1", mcids: [0], children: [] },
        { role: "P", mcids: [2], children: [] },
        { role: "P", mcids: [1], children: [] },
      ],
    });
    const { doc, report } = convert([page]);
    expect(report.pages[0].usedStructTree).toBe(true);
    const [h] = bodyBlocks(doc);
    expect(h).toMatchObject({ type: "heading", level: 1 });
    const text = flowText(doc);
    expect(text.indexOf("Right column")).toBeLessThan(text.indexOf("Left column"));
  });
});

describe("tagged label columns", () => {
  it("still pairs a sidebar of labels with its text on a tagged page", () => {
    // The struct tree lists each label before its text, as N-forms do.
    const items = [
      ...words("Termination", 30, 100, 10, { bold: true, mcid: 0 }),
      ...words("date", 30, 112, 10, { bold: true, mcid: 0 }),
      ...paragraph(["The date must be at least 60 days", "after the landlord gives notice."], 150, 100, 10, 12, { mcid: 1 }),
      ...words("Moving", 30, 160, 10, { bold: true, mcid: 2 }),
      ...words("out", 30, 172, 10, { bold: true, mcid: 2 }),
      ...paragraph(["If you move out by the termination", "date your tenancy ends then."], 150, 160, 10, 12, { mcid: 3 }),
    ];
    const structure = [0, 1, 2, 3].map((mc) => ({ role: mc % 2 ? ("P" as const) : ("H2" as const), mcids: [mc], children: [] }));
    const { doc } = convert([makePage(items, [], { structure })]);
    expect(bodyBlocks(doc).map((b) => b.type)).toEqual(["keyValue", "keyValue"]);
  });
});

describe("preflight and decision", () => {
  it("falls back with noTextLayer when there is no text", () => {
    const res = convertDocument([makePage([])]);
    expect(res.status).toBe("fallback");
    expect(res.document).toBeNull();
    expect(res.report.reasons.map((r) => r.code)).toEqual(["noTextLayer"]);
  });

  it("falls back on page rotation and on rotated text", () => {
    const text = words("Some text that is long enough to count.", 72, 100);
    expect(convertDocument([makePage(text, [], { rotation: 90 })]).report.reasons.map((r) => r.code)).toContain("rotatedText");
    const rotated = [...text, makeItem("SIDEWAYS LABEL TEXT", 20, 400, 10, { rotated: true })];
    expect(convertDocument([makePage(rotated)]).report.reasons.map((r) => r.code)).toContain("rotatedText");
  });

  it("falls back on too many pages and on a page with widgets but no text", () => {
    const many = Array.from({ length: 51 }, (_, i) => makePage(words("Page text here.", 72, 100), [], { pageIndex: i }));
    expect(convertDocument(many).report.reasons.map((r) => r.code)).toEqual(["tooManyPages"]);
    const pages = [
      makePage(words("Enough text on the first page to pass.", 72, 100)),
      makePage([], [makeWidget("w", "text", box(72, 100, 100, 16))], { pageIndex: 1 }),
    ];
    expect(convertDocument(pages).report.reasons.map((r) => r.code)).toContain("pageWithoutText");
  });

  it("falls back on a page with (almost) no text, even without widgets", () => {
    // A scanned schedule appended to a text lease: nothing in the text layer.
    const pages = [
      makePage(words("Enough text on the first page to pass.", 72, 100)),
      makePage(words("Schedule A", 72, 60), [], { pageIndex: 1 }),
    ];
    const res = convertDocument(pages);
    expect(res.status).toBe("fallback");
    expect(res.report.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "pageWithoutText", pageIndex: 1 })])
    );
  });

  it("falls back on images that may carry content, and on invisible text", () => {
    const text = words("A page of ordinary lease text that is long enough.", 72, 100);
    const withGraphics = (graphics: SourcePage["graphics"]) => {
      const page = makePage(text);
      page.graphics = graphics;
      return convertDocument([page]);
    };
    const codesOf = (graphics: SourcePage["graphics"]) => withGraphics(graphics).report.reasons.map((r) => r.code);
    // A small logo away from the text is fine.
    expect(withGraphics({ images: [box(500, 20, 60, 40)], invisibleChars: 0 }).status).toBe("ok");
    // A picture of clauses covering a third of the page.
    expect(codesOf({ images: [box(72, 300, 468, 340)], invisibleChars: 0 })).toContain("imageContent");
    // A small image over the text (a scanned line pasted in).
    expect(codesOf({ images: [box(72, 90, 80, 14)], invisibleChars: 0 })).toContain("imageContent");
    // An OCR layer (render mode 3).
    expect(codesOf({ images: [], invisibleChars: 120 })).toContain("hiddenText");
    // The operator list could not be read.
    expect(codesOf(null)).toContain("imageContent");
  });

  it("withholds the document when confidence is too low", () => {
    const items = words("Fill in every box below, as many as you need to.", 72, 60);
    const ws = Array.from({ length: 6 }, (_, k) => makeWidget(`box${k}`, "text", box(72, 120 + k * 60, 200, 16)));
    const res = convertDocument([makePage(items, ws)]);
    expect(res.status).toBe("fallback");
    expect(res.document).toBeNull();
    expect(res.report.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["weakLabels", "lowConfidence"]));
    expect(res.report.text.coverage).toBe(1);
  });

  it("returns ok with the document when every check passes", () => {
    const res = convertDocument([makePage(words("A short and simple document.", 72, 100))]);
    expect(res.status).toBe("ok");
    expect(res.document?.version).toBe(1);
    expect(res.report).toMatchObject({ decision: "ok", confidence: 1, text: { coverage: 1 } });
  });

  it("never throws: a broken input becomes a conversionError fallback", () => {
    const broken = [{ ...makePage(words("Text", 72, 100)), items: null }] as unknown as Parameters<typeof convertDocument>[0];
    const res = convertDocument(broken);
    expect(res.status).toBe("fallback");
    expect(res.report.reasons[0].code).toBe("conversionError");
  });

  it("detects columns printed too close together to separate", () => {
    // Two prose columns 0.7em apart: the layout reads them as single lines,
    // and the fidelity check spots the aligned gap.
    const en = ["English text runs here", "and continues on this", "line and this one too", "before it finally end"];
    const fr = ["Le texte suit ici", "et il continue sur", "la ligne suivante", "puis se termine"];
    const items = en.flatMap((l, i) => [
      makeItem(l, 72, 100 + i * 12, 10, { width: 120 }),
      makeItem(fr[i], 72 + 120 + 7, 100 + i * 12, 10, { width: 100 }),
    ]);
    const res = convertDocument([makePage(items)]);
    expect(res.status).toBe("fallback");
    expect(res.report.reasons.map((r) => r.code)).toContain("columnInterleave");
  });
});
