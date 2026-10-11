import { describe, expect, it } from "vitest";
import type { PdfPageLike } from "../../types";
import { extractPage, PDF_OPS, scanGraphics, simplifyStructTree } from "../extract";

function fakePage(
  items: unknown[],
  opts: { struct?: unknown; structThrows?: boolean; ops?: [number, unknown[] | null][] | "throws" } = {}
): PdfPageLike {
  const ops = opts.ops;
  return {
    ...(ops
      ? {
          getOperatorList: async () => {
            if (ops === "throws") throw new Error("worker gone");
            return { fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) };
          },
        }
      : {}),
    view: [0, 0, 612, 792],
    rotate: 0,
    getTextContent: async () => ({
      items,
      styles: { f1: { fontFamily: "sans-serif" }, f2: { fontFamily: "serif" } },
    }),
    getStructTree: async () => {
      if (opts.structThrows) throw new Error("no tree");
      return opts.struct ?? null;
    },
    commonObjs: {
      has: (id: string) => id === "f1",
      get: (id: string) => (id === "f1" ? { name: "ABCDEF+Verdana-Bold" } : undefined),
    },
  };
}

const text = (str: string, x: number, y: number, size = 10, font = "f1", extra: Record<string, unknown> = {}) => ({
  str,
  transform: [size, 0, 0, size, x, y],
  width: str.length * 5,
  height: size,
  fontName: font,
  hasEOL: false,
  ...extra,
});

describe("extractPage", () => {
  it("flips y, reads real font names, folds empty items and marks dingbats", async () => {
    const page = fakePage([
      text("Hello", 72, 700),
      text("", 0, 0, 10, "f1", { hasEOL: true }),
      text("q", 72, 680, 9, "f2"),
    ]);
    const sp = await extractPage(page, 3, []);
    expect(sp).toMatchObject({ pageIndex: 3, width: 612, height: 792, rotation: 0, structure: null });
    expect(sp.items).toHaveLength(2);
    const [hello, q] = sp.items;
    expect(hello).toMatchObject({
      index: 0,
      str: "Hello",
      baseline: 92,
      fontSize: 10,
      fontName: "ABCDEF+Verdana-Bold",
      bold: true,
      hasEOL: true,
      rotated: false,
    });
    expect(hello.box).toEqual({ left: 72, top: 84, right: 97, bottom: 94 });
    expect(q).toMatchObject({ index: 1, fontName: "serif", bold: false, dingbat: false });
  });

  it("tracks marked content ids and artifacts", async () => {
    const page = fakePage([
      { type: "beginMarkedContentProps", tag: "P", id: "p12R_mc4" },
      text("Tagged", 72, 700),
      { type: "endMarkedContent" },
      { type: "beginMarkedContent", tag: "Artifact" },
      text("Page 1", 500, 30),
      { type: "endMarkedContent" },
    ]);
    const sp = await extractPage(page, 0, []);
    expect(sp.items[0]).toMatchObject({ mcid: 4 });
    expect(sp.items[0].artifact).toBeUndefined();
    expect(sp.items[1]).toMatchObject({ artifact: true });
    expect(sp.items[1].mcid).toBeUndefined();
  });

  it("flags rotated text", async () => {
    const page = fakePage([{ ...text("Side", 20, 400), transform: [0, 10, -10, 0, 20, 400] }]);
    const sp = await extractPage(page, 0, []);
    expect(sp.items[0]).toMatchObject({ rotated: true, fontSize: 10 });
  });

  it("returns null structure when getStructTree throws", async () => {
    const sp = await extractPage(fakePage([text("x", 72, 700)], { structThrows: true }), 0, []);
    expect(sp.structure).toBeNull();
  });
});

describe("extractPage cleanup", () => {
  it("drops text wholly outside the page and marks text drawn twice", async () => {
    const page = fakePage([
      text("Address", 72, 700),
      // Fake bold: the same word 0.3pt to the right.
      text("Address", 72.3, 700),
      text("Address", 300, 700),
      text("Hidden", 700, 700),
      text("Below", 72, -40),
    ]);
    const sp = await extractPage(page, 0, []);
    expect(sp.items.map((i) => i.str)).toEqual(["Address", "Address", "Address"]);
    expect(sp.items[0].duplicateOf).toBeUndefined();
    expect(sp.items[1].duplicateOf).toBe(0);
    // Same word elsewhere on the line is real text.
    expect(sp.items[2].duplicateOf).toBeUndefined();
    expect(sp.graphics).toBeUndefined();
  });
});

describe("scanGraphics", () => {
  it("uses the pdf.js OPS codes", async () => {
    // The legacy build loads outside a browser (the main build needs
    // DOMMatrix).
    const { OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    for (const [name, code] of Object.entries(PDF_OPS)) {
      expect(OPS[name as keyof typeof OPS], name).toBe(code);
    }
  });

  it("places images through nested transforms and form XObjects", async () => {
    const page = fakePage([], {
      ops: [
        [PDF_OPS.save, null],
        // A 100 x 50 image at (72, 692) in PDF space: top-left (72, 50).
        [PDF_OPS.transform, [100, 0, 0, 50, 72, 692]],
        [PDF_OPS.paintImageXObject, ["img1", 10, 10]],
        [PDF_OPS.restore, null],
        [PDF_OPS.paintFormXObjectBegin, [[1, 0, 0, 1, 0, 100], [0, 0, 1, 1]]],
        [PDF_OPS.transform, [612, 0, 0, 200, 0, 0]],
        [PDF_OPS.paintImageXObject, ["img2", 10, 10]],
        [PDF_OPS.paintFormXObjectEnd, null],
        // Back to the identity: a 1 x 1 point mask at the origin.
        [PDF_OPS.paintImageMaskXObject, [{}]],
      ],
    });
    const g = await scanGraphics(page);
    expect(g?.images).toEqual([
      { left: 72, top: 50, right: 172, bottom: 100 },
      { left: 0, top: 492, right: 612, bottom: 692 },
      { left: 0, top: 791, right: 1, bottom: 792 },
    ]);
  });

  it("counts glyphs drawn with an invisible render mode", async () => {
    const glyphs = (s: string) => Array.from(s).map((unicode) => ({ unicode }));
    const page = fakePage([], {
      ops: [
        [PDF_OPS.showText, [glyphs("Seen")]],
        [PDF_OPS.save, null],
        [PDF_OPS.setTextRenderingMode, [3]],
        [PDF_OPS.showText, [glyphs("OCR text")]],
        [PDF_OPS.restore, null],
        [PDF_OPS.showText, [glyphs("Seen again")]],
      ],
    });
    expect(await scanGraphics(page)).toEqual({ images: [], invisibleChars: 7 });
  });

  it("reports an unreadable operator list as null", async () => {
    const sp = await extractPage(fakePage([text("x", 72, 700)], { ops: "throws" }), 0, []);
    expect(sp.graphics).toBeNull();
  });
});

describe("simplifyStructTree", () => {
  it("keeps roles and mcids in tree order and drops annotations", () => {
    const tree = {
      role: "Root",
      children: [
        {
          role: "Document",
          children: [
            { role: "H1", children: [{ type: "content", id: "p5R_mc0" }] },
            { role: "P", children: [{ type: "content", id: "p5R_mc1" }, { type: "annotation", id: "pdfjs_internal_id_9R" }] },
            { role: "Figure", children: [{ type: "content", id: "p5R_mc2" }] },
          ],
        },
      ],
    };
    expect(simplifyStructTree(tree)).toEqual([
      {
        role: "other",
        mcids: [],
        children: [
          { role: "H1", mcids: [0], children: [] },
          { role: "P", mcids: [1], children: [] },
          { role: "other", mcids: [2], children: [] },
        ],
      },
    ]);
  });

  it("returns null when there is no marked content", () => {
    expect(simplifyStructTree({ role: "Root", children: [{ role: "Document", children: [] }] })).toBeNull();
    expect(simplifyStructTree(null)).toBeNull();
  });
});
