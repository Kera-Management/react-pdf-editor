import { describe, expect, it } from "vitest";
import type {
  FieldBlock,
  MobileBlock,
  MobileDocument,
  ParagraphBlock,
  SourcePage,
  TextRun,
} from "../../types";
import { checkFidelity, convertDocumentUnchecked } from "../index";
import { box, makeItem, makePage, makeWidget, paragraph, rightOf, words } from "./fixtures";

/**
 * A small form: a title, two paragraphs, a checkbox with a printed
 * ZapfDingbats box under it, a labelled text field, a dingbat bullet that is
 * NOT under a widget, a letter "X" printed under a second checkbox, and a
 * hidden widget.
 */
function basePage(): SourcePage {
  const title = words("Notice of Rent Increase", 72, 60, 16);
  const p1 = paragraph(["The landlord gives this notice to the", "tenant named in this form below."], 72, 100);
  const p2 = paragraph(["The new rent takes effect on the date", "shown in the box further down."], 72, 140);
  const cbItems = [makeItem("q", 73, 189, 9, { dingbat: true }), ...words("The rent includes parking.", 90, 189)];
  const label = words("Tenant name:", 72, 230);
  const bullet = [makeItem("l", 72, 270, 8, { dingbat: true }), ...words("Keep a copy of this notice.", 90, 270)];
  const xItems = [makeItem("X", 73, 309, 9), ...words("The tenant has a pet.", 90, 309)];
  const widgets = [
    makeWidget("cb", "checkbox", box(72, 180, 10, 10)),
    makeWidget("name", "text", box(rightOf(label) + 8, 220, 200, 14)),
    makeWidget("cbx", "checkbox", box(72, 300, 10, 10)),
    makeWidget("ghost", "text", box(300, 500, 100, 14), { hidden: true }),
  ];
  return makePage([...title, ...p1, ...p2, ...cbItems, ...label, ...bullet, ...xItems], widgets);
}

function base(): { pages: SourcePage[]; doc: MobileDocument } {
  const pages = [basePage()];
  const { document, report } = convertDocumentUnchecked(pages);
  if (!document || report.decision !== "ok") throw new Error(JSON.stringify(report.reasons));
  return { pages, doc: document };
}

const codes = (pages: SourcePage[], doc: MobileDocument) =>
  checkFidelity(pages, doc).reasons.filter((r) => r.severity === "fail").map((r) => r.code);

/** All runs in the document, in order, as live references. */
function runs(doc: MobileDocument): TextRun[] {
  const out: TextRun[] = [];
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(visit);
    const o = v as Record<string, unknown>;
    // FieldBlock also has kind "text" (the field kind); runs have sources.
    if (o.kind === "text" && Array.isArray(o.sources)) out.push(o as unknown as TextRun);
    Object.values(o).forEach(visit);
  };
  visit(doc.blocks);
  return out;
}

const findRun = (doc: MobileDocument, text: string) => {
  const r = runs(doc).find((x) => x.text.includes(text));
  if (!r) throw new Error(`no run with "${text}"`);
  return r;
};

describe("checkFidelity on a faithful conversion", () => {
  it("passes with full coverage, the printed box excluded and the hidden widget not placed", () => {
    const { pages, doc } = base();
    const report = checkFidelity(pages, doc);
    expect(report.decision).toBe("ok");
    expect(report.text.coverage).toBe(1);
    expect(report.text.excludedChars).toBe(1); // the "q" under the checkbox
    expect(report.widgets).toMatchObject({ expected: 3, placed: 3, hidden: 1, missing: [], duplicated: [] });
    expect(report.text.orderViolations).toBe(0);
  });
});

describe("checkFidelity mutation tests (each must fail with the exact reason)", () => {
  it("dropped run -> textMissing", () => {
    const { pages, doc } = base();
    const p = doc.blocks.find((b) => b.type === "paragraph") as ParagraphBlock;
    p.content = p.content.slice(1);
    expect(codes(pages, doc)).toContain("textMissing");
  });

  it("duplicated source ref -> textDuplicated", () => {
    const { pages, doc } = base();
    const a = findRun(doc, "landlord gives");
    const b = findRun(doc, "new rent");
    b.sources = [...b.sources, a.sources[0]];
    b.text = `${b.text} ${pages[0].items[a.sources[0]].str}`;
    expect(codes(pages, doc)).toEqual(["textDuplicated"]);
  });

  it("one edited character -> textAltered", () => {
    const { pages, doc } = base();
    const r = findRun(doc, "landlord gives");
    r.text = r.text.replace("landlord", "landlard");
    expect(codes(pages, doc)).toEqual(["textAltered"]);
  });

  it("two items swapped inside a line -> orderViolation", () => {
    const { pages, doc } = base();
    const r = findRun(doc, "landlord gives");
    const items = pages[0].items;
    [r.sources[0], r.sources[1]] = [r.sources[1], r.sources[0]];
    r.text = r.sources.map((i) => items[i].str).join(" ");
    expect(codes(pages, doc)).toEqual(["orderViolation"]);
  });

  it("a paragraph moved above its predecessor in the same column -> orderViolation", () => {
    const { pages, doc } = base();
    const i1 = doc.blocks.findIndex((b) => b.type === "paragraph" && runs({ ...doc, blocks: [b] })[0].text.startsWith("The landlord"));
    const i2 = doc.blocks.findIndex((b) => b.type === "paragraph" && runs({ ...doc, blocks: [b] })[0].text.startsWith("The new rent"));
    expect(i2).toBe(i1 + 1);
    [doc.blocks[i1], doc.blocks[i2]] = [doc.blocks[i2], doc.blocks[i1]];
    expect(codes(pages, doc)).toEqual(["orderViolation"]);
  });

  it("a dropped widget -> widgetMissing", () => {
    const { pages, doc } = base();
    const k = doc.blocks.findIndex((b) => b.type === "field");
    const f = doc.blocks[k] as FieldBlock;
    const replacement: ParagraphBlock = {
      type: "paragraph",
      id: f.id,
      origin: f.origin,
      role: "body",
      content: f.label?.kind === "source" ? f.label.runs : [],
    };
    doc.blocks[k] = replacement;
    delete doc.fieldBlockIds[f.fieldId];
    expect(codes(pages, doc)).toEqual(["widgetMissing"]);
  });

  it("a widget placed twice -> widgetDuplicated", () => {
    const { pages, doc } = base();
    const extra: FieldBlock = {
      type: "field",
      id: "extra",
      origin: null,
      fieldId: "name",
      kind: "text",
      label: { kind: "synthetic", text: { kind: "synthetic", text: "Name", origin: "tooltip" } },
    };
    doc.blocks.push(extra);
    expect(codes(pages, doc)).toContain("widgetDuplicated");
  });

  it("a hidden widget placed -> widgetDuplicated", () => {
    const { pages, doc } = base();
    const ghost: FieldBlock = { type: "field", id: "g", origin: null, fieldId: "ghost", kind: "text", label: null };
    doc.blocks.push(ghost);
    doc.fieldBlockIds.ghost = "g";
    expect(codes(pages, doc)).toEqual(["widgetDuplicated"]);
  });

  it("a non-dingbat letter under a checkbox left out -> textMissing", () => {
    const { pages, doc } = base();
    const xIndex = pages[0].items.findIndex((i) => i.str === "X");
    const r = runs(doc).find((x) => x.sources.includes(xIndex))!;
    if (r.sources.length > 1) {
      r.sources = r.sources.filter((i) => i !== xIndex);
      r.text = r.text.replace("X", "");
    } else {
      // The "X" is a run of its own (text under the box comes before it).
      doc.blocks = doc.blocks.filter((b) => !runs({ ...doc, blocks: [b] }).includes(r));
    }
    expect(codes(pages, doc)).toEqual(["textMissing"]);
  });

  it("a dingbat not under any widget left out -> textMissing", () => {
    const { pages, doc } = base();
    const lIndex = pages[0].items.findIndex((i) => i.str === "l" && i.dingbat);
    const r = runs(doc).find((x) => x.sources.includes(lIndex))!;
    r.sources = r.sources.filter((i) => i !== lIndex);
    r.text = r.text.replace(/^l\s*/, "");
    expect(codes(pages, doc)).toEqual(["textMissing"]);
  });

  it("synthetic text never counts as source text", () => {
    const { pages, doc } = base();
    const k = doc.blocks.findIndex((b) => b.type === "field");
    const f = doc.blocks[k] as FieldBlock;
    const text = f.label?.kind === "source" ? f.label.runs.map((r) => r.text).join(" ") : "";
    f.label = { kind: "synthetic", text: { kind: "synthetic", text, origin: "tooltip" } };
    expect(codes(pages, doc)).toEqual(["textMissing"]);
  });

  it("a field index that does not match -> widgetMissing", () => {
    const { pages, doc } = base();
    doc.fieldBlockIds.name = "p0-b999";
    expect(codes(pages, doc)).toEqual(["widgetMissing"]);
  });

  it("text from a later page placed first -> orderViolation", () => {
    const pages = [basePage(), { ...basePage(), pageIndex: 1 }];
    const { document } = convertDocumentUnchecked(pages);
    const doc = document!;
    const firstOfPage1 = doc.blocks.findIndex((b) => b.id === "mf_page_1");
    const moved = doc.blocks.splice(firstOfPage1 + 1, 1);
    doc.blocks.splice(1, 0, ...moved);
    // Block ids stay unique; only the order changed.
    expect(codes(pages, doc)).toContain("orderViolation");
  });
});

describe("column interleave (C7)", () => {
  function twoColumns(): SourcePage {
    const left = ["The landlord must keep the premises", "in a good state of repair and fit", "for habitation at all times during", "the term of this lease agreement."];
    const right = ["The tenant must keep the premises", "clean and repair any damage caused", "by the tenant or by guests of the", "tenant during the term of the lease."];
    return makePage([...paragraph(left, 72, 100), ...paragraph(right, 330, 100)]);
  }

  /** One paragraph per line, in the given line order. */
  function linesDoc(page: SourcePage, order: number[][]): MobileDocument {
    const lines = new Map<string, number[]>();
    for (const it of page.items) {
      const k = `${it.box.left < 300 ? 0 : 1}:${it.baseline}`;
      lines.set(k, [...(lines.get(k) ?? []), it.index]);
    }
    const keys = [...lines.keys()].sort((a, b) => Number(a.split(":")[1]) - Number(b.split(":")[1]));
    const blocks: MobileBlock[] = order.map(([col, row], n) => {
      const key = keys.filter((k) => k.startsWith(`${col}:`))[row];
      const sources = lines.get(key)!;
      return {
        type: "paragraph",
        id: `p0-b${n}`,
        origin: null,
        role: "body",
        content: [{ kind: "text", text: sources.map((i) => page.items[i].str).join(" "), sources, pageIndex: 0 }],
      };
    });
    return { version: 1, pageCount: 1, blocks, fieldBlockIds: {} };
  }

  it("passes when the columns are read one after the other", () => {
    const page = twoColumns();
    const doc = linesDoc(page, [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2], [1, 3]]);
    expect(checkFidelity([page], doc).decision).toBe("ok");
  });

  it("fails when the columns are read across, line by line", () => {
    const page = twoColumns();
    const doc = linesDoc(page, [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2], [0, 3], [1, 3]]);
    expect(codes([page], doc)).toContain("columnInterleave");
  });
});

describe("flow order frontier (C6)", () => {
  /** Three paragraphs in a column, a footer line and a narrow page code
   * printed at the right of the footer. */
  function footerPage(): SourcePage {
    return makePage([
      ...paragraph(["The landlord may attach a schedule of rules", "that the tenant must follow while living here."], 72, 100),
      ...paragraph(["The rent is due on the first day of each", "month and is paid to the landlord directly."], 72, 160),
      ...paragraph(["The tenant must give written notice before", "moving out at the end of the lease term."], 72, 220),
      ...words("2026-05 Form P Residential Tenancies Program", 72, 760, 8),
      ...words("G1", 548, 758, 12, { bold: true }),
    ]);
  }

  it("fails a paragraph moved to the end of the page, past a narrow page code", () => {
    const pages = [footerPage()];
    const { document, report } = convertDocumentUnchecked(pages);
    expect(report.decision).toBe("ok");
    const doc = document!;
    const i = doc.blocks.findIndex((b) => runs({ ...doc, blocks: [b] }).some((r) => r.text.startsWith("The landlord")));
    const [moved] = doc.blocks.splice(i, 1);
    doc.blocks.push(moved);
    expect(codes(pages, doc)).toContain("orderViolation");
  });

  it("fails a paragraph moved below the next one even with a short label in between", () => {
    const pages = [footerPage()];
    const doc = convertDocumentUnchecked(pages).document!;
    const find = (t: string) => doc.blocks.findIndex((b) => runs({ ...doc, blocks: [b] }).some((r) => r.text.startsWith(t)));
    const [moved] = doc.blocks.splice(find("The rent"), 1);
    doc.blocks.splice(find("2026-05") + 1, 0, moved);
    expect(codes(pages, doc)).toContain("orderViolation");
  });
});

describe("right column read first (C6)", () => {
  it("fails when the right column is read before the left one", () => {
    const left = ["The landlord must keep the premises", "in a good state of repair and fit", "for habitation at all times during", "the term of this lease agreement."];
    const right = ["The tenant must keep the premises", "clean and repair any damage caused", "by the tenant or by guests of the", "tenant during the term of the lease."];
    const page = makePage([...paragraph(left, 72, 100), ...paragraph(right, 330, 100)]);
    const line = (col: number, row: number): MobileBlock => {
      const sources = page.items
        .filter((it) => (col === 0 ? it.box.left < 300 : it.box.left >= 300) && it.baseline === 100 + row * 12)
        .map((it) => it.index);
      return {
        type: "paragraph",
        id: `p0-b${col}${row}`,
        origin: null,
        role: "body",
        content: [{ kind: "text", text: sources.map((i) => page.items[i].str).join(" "), sources, pageIndex: 0 }],
      };
    };
    const doc = (order: [number, number][]): MobileDocument => ({
      version: 1,
      pageCount: 1,
      blocks: order.map(([c, r]) => line(c, r)),
      fieldBlockIds: {},
    });
    const rows = [0, 1, 2, 3];
    expect(checkFidelity([page], doc([...rows.map((r) => [0, r] as [number, number]), ...rows.map((r) => [1, r] as [number, number])])).decision).toBe("ok");
    expect(codes([page], doc([...rows.map((r) => [1, r] as [number, number]), ...rows.map((r) => [0, r] as [number, number])]))).toContain("orderViolation");
  });
});

describe("widget placement (C10)", () => {
  function twoFieldsPage(pageIndex = 0, top = 100): SourcePage {
    const a = words("Mailing address", 72, top);
    const b = words("The tenant will pay rent of", 72, top + 500);
    return makePage(
      [...a, ...b],
      [
        makeWidget(`mail${pageIndex}`, "text", box(rightOf(a) + 8, top - 10, 200, 14)),
        makeWidget(`rent${pageIndex}`, "text", box(rightOf(b) + 8, top + 490, 120, 14)),
      ],
      { pageIndex }
    );
  }

  const fieldBlocks = (doc: MobileDocument) => {
    const out: FieldBlock[] = [];
    const visit = (b: MobileBlock) => {
      if (b.type === "field") out.push(b);
      if (b.type === "keyValue") b.value.forEach(visit);
      if (b.type === "group") b.children.forEach(visit);
    };
    doc.blocks.forEach(visit);
    return out;
  };

  const swap = (doc: MobileDocument, a: FieldBlock, b: FieldBlock) => {
    const topA = doc.fieldBlockIds[a.fieldId];
    const topB = doc.fieldBlockIds[b.fieldId];
    [a.fieldId, b.fieldId] = [b.fieldId, a.fieldId];
    doc.fieldBlockIds[a.fieldId] = topA;
    doc.fieldBlockIds[b.fieldId] = topB;
  };

  it("fails two fields swapped between their labels", () => {
    const pages = [twoFieldsPage()];
    const { document, report } = convertDocumentUnchecked(pages);
    expect(report.decision).toBe("ok");
    const doc = document!;
    const [a, b] = fieldBlocks(doc);
    expect(a.label?.kind).toBe("source");
    swap(doc, a, b);
    expect(codes(pages, doc)).toContain("widgetMisplaced");
  });

  it("fails a field moved under a label on another page", () => {
    const pages = [twoFieldsPage(0), twoFieldsPage(1, 140)];
    const { document, report } = convertDocumentUnchecked(pages);
    expect(report.decision).toBe("ok");
    const doc = document!;
    const blocks = fieldBlocks(doc);
    swap(doc, blocks[0], blocks[3]);
    expect(codes(pages, doc)).toContain("widgetMisplaced");
  });
});

describe("text drawn twice (fake bold)", () => {
  function fakeBoldPage(): SourcePage {
    const label = words("Address of the Rental Unit:", 72, 100, 10, { bold: true });
    // The same words again 0.3pt to the right, as fake bold is drawn.
    const again = label.map((it) => ({ ...it, box: { ...it.box, left: it.box.left + 0.3, right: it.box.right + 0.3 } }));
    const body = paragraph(["This is a legal notice that could lead to", "you being evicted from your home."], 72, 140);
    const page = makePage([...label, ...again, ...body]);
    page.items.slice(label.length, 2 * label.length).forEach((it, k) => {
      it.duplicateOf = k;
    });
    return page;
  }

  it("shows the text once and excludes the copy", () => {
    const pages = [fakeBoldPage()];
    const { document, report } = convertDocumentUnchecked(pages);
    expect(report.decision).toBe("ok");
    const text = runs(document!).map((r) => r.text).join(" ");
    expect(text.match(/Address/g)).toHaveLength(1);
    expect(report.text.excludedChars).toBe("Addressofthe RentalUnit:".replace(/\s/g, "").length);
  });

  it("fails when the copy is shown as well", () => {
    const pages = [fakeBoldPage()];
    const doc = convertDocumentUnchecked(pages).document!;
    const r = findRun(doc, "Address");
    const copy = pages[0].items.find((it) => it.duplicateOf === r.sources[0])!;
    r.sources = [...r.sources, copy.index];
    r.text = `${r.text} ${copy.str}`;
    expect(codes(pages, doc)).toContain("textDuplicated");
  });

  it("does not trust a copy mark that the geometry does not support", () => {
    const pages = [fakeBoldPage()];
    // A body word wrongly marked as a copy of the label: the layout leaves
    // it out, and the check, re-verifying the mark, finds it missing.
    pages[0].items.find((it) => it.str === "legal")!.duplicateOf = 0;
    const { document, report } = convertDocumentUnchecked(pages);
    expect(runs(document!).some((r) => r.text.includes("legal"))).toBe(false);
    expect(report.reasons.filter((r) => r.severity === "fail").map((r) => r.code)).toContain("textMissing");
  });
});
