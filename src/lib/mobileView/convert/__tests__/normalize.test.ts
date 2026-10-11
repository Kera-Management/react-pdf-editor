import { describe, expect, it } from "vitest";
import { humanizeFieldName } from "../fields/humanize";
import { isBoxGlyphItem, normalizeText, sortedChars } from "../normalize";

describe("normalizeText (N)", () => {
  it("applies NFKC so ligatures become letters", () => {
    expect(normalizeText("ﬁle")).toBe("file");
  });

  it("removes whitespace, soft hyphens and zero-width characters", () => {
    expect(normalizeText(" a\tb\nc d­e​f‌g‍h﻿i ")).toBe("abcdefghi");
  });

  it("keeps case and punctuation", () => {
    expect(normalizeText("Rent: $1,850.00 (CAD)")).toBe("Rent:$1,850.00(CAD)");
  });

  it("sortedChars compares character multisets", () => {
    expect(sortedChars("b a c")).toBe(sortedChars("cab"));
    expect(sortedChars("abc")).not.toBe(sortedChars("abd"));
  });
});

describe("isBoxGlyphItem", () => {
  it("accepts any dingbat item and Unicode box glyphs", () => {
    expect(isBoxGlyphItem({ str: "q", dingbat: true })).toBe(true);
    expect(isBoxGlyphItem({ str: "☐", dingbat: false })).toBe(true);
    expect(isBoxGlyphItem({ str: "□", dingbat: false })).toBe(true);
  });

  it("never treats a plain letter as a box", () => {
    expect(isBoxGlyphItem({ str: "q", dingbat: false })).toBe(false);
    expect(isBoxGlyphItem({ str: "o", dingbat: false })).toBe(false);
  });
});

describe("humanizeFieldName", () => {
  it("takes the last LiveCycle path part and uses sentence case", () => {
    expect(humanizeFieldName("form1[0].#subform[1].PayDate[0]")).toBe("Pay date");
  });

  it("splits underscores and digits and keeps acronyms", () => {
    expect(humanizeFieldName("tenant_phone2")).toBe("Tenant phone 2");
    expect(humanizeFieldName("SINNumber")).toBe("SIN number");
    expect(humanizeFieldName("IncOth")).toBe("Inc oth");
  });

  it("falls back to Field for empty names", () => {
    expect(humanizeFieldName("[0]")).toBe("Field");
  });
});
