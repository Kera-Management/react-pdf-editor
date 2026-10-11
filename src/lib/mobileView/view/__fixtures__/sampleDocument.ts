/**
 * Hand-built `MobileDocument` and reports for the view and integration
 * tests, so they never depend on the converter's output. Field ids match
 * the fake AcroForm fields in PDFEditor.mobileFriendlyView.test.tsx.
 */
import type {
  FidelityReport,
  MobileConversionResult,
  MobileDocument,
  TextRun,
} from "../../types";

let runSource = 0;
/** A source run (fidelity details don't matter to the view). */
export const run = (
  text: string,
  extra: Partial<TextRun> = {}
): TextRun => ({
  kind: "text",
  text,
  sources: [runSource++],
  pageIndex: extra.pageIndex ?? 0,
  ...extra,
});

const origin = (pageIndex: number, top: number) => ({
  pageIndex,
  box: { left: 40, top, right: 560, bottom: top + 14 },
});

export const makeSampleDocument = (): MobileDocument => ({
  version: 1,
  pageCount: 2,
  blocks: [
    {
      id: "mf_page_0",
      type: "pageBreak",
      origin: null,
      pageNumber: 1,
      pageCount: 2,
    },
    {
      id: "p0-b0",
      type: "paragraph",
      role: "furniture",
      origin: origin(0, 10),
      content: [run("Form T1 | Residential Tenancies")],
    },
    {
      id: "p0-b1",
      type: "heading",
      level: 1,
      origin: origin(0, 40),
      content: [run("Part 1: Parties", { bold: true })],
    },
    {
      id: "p0-b2",
      type: "paragraph",
      role: "body",
      origin: origin(0, 70),
      content: [
        run("I,"),
        { kind: "field", fieldId: "f_name", ariaLabel: null },
        run("agree to rent the unit below. Return by ________ please."),
      ],
    },
    {
      id: "p0-b3",
      type: "field",
      origin: origin(0, 100),
      fieldId: "f_phone",
      kind: "text",
      label: { kind: "source", runs: [run("Tenant phone number")] },
      hint: [run("(###) ###-####")],
    },
    {
      id: "p0-b4",
      type: "choice",
      origin: origin(0, 130),
      fieldId: "f_park",
      label: [run("Parking is included")],
    },
    {
      id: "p0-b5",
      type: "radioGroup",
      origin: origin(0, 160),
      groupName: "heat",
      label: { kind: "source", runs: [run("Who pays for heat?")] },
      options: [
        { fieldId: "f_heat_l", label: [run("Landlord")] },
        { fieldId: "f_heat_t", label: [run("Tenant")] },
      ],
    },
    {
      id: "mf_page_1",
      type: "pageBreak",
      origin: null,
      pageNumber: 2,
      pageCount: 2,
    },
    {
      id: "p1-b0",
      type: "list",
      origin: origin(1, 20),
      ordered: true,
      items: [
        {
          id: "p1-b0-0",
          marker: run("(a)", { pageIndex: 1 }),
          content: [run("Rent is due on the first day.", { pageIndex: 1 })],
          children: [],
        },
      ],
    },
    {
      id: "p1-b1",
      type: "keyValue",
      origin: origin(1, 60),
      label: [run("Province", { pageIndex: 1 })],
      value: [
        {
          id: "p1-b1-0",
          type: "field",
          origin: origin(1, 60),
          fieldId: "f_prov",
          kind: "select",
          label: {
            kind: "synthetic",
            text: { kind: "synthetic", text: "Province", origin: "tooltip" },
          },
        },
      ],
    },
    {
      id: "p1-b2",
      type: "field",
      origin: origin(1, 100),
      fieldId: "f_name2",
      kind: "text",
      label: { kind: "source", runs: [run("Tenant name", { pageIndex: 1 })] },
    },
    {
      id: "p1-b3",
      type: "field",
      origin: origin(1, 140),
      fieldId: "f_sig",
      kind: "signature",
      label: {
        kind: "source",
        runs: [run("Signature of tenant", { pageIndex: 1 })],
      },
    },
  ],
  fieldBlockIds: {
    f_name: "p0-b2",
    f_phone: "p0-b3",
    f_park: "p0-b4",
    f_heat_l: "p0-b5",
    f_heat_t: "p0-b5",
    f_prov: "p1-b1",
    f_name2: "p1-b2",
    f_sig: "p1-b3",
  },
});

export const makeReport = (
  decision: "ok" | "fallback"
): FidelityReport => ({
  decision,
  confidence: decision === "ok" ? 1 : 0.4,
  text: {
    sourceChars: 100,
    excludedChars: 0,
    matchedChars: decision === "ok" ? 100 : 90,
    coverage: decision === "ok" ? 1 : 0.9,
    orderViolations: 0,
    alteredRuns: 0,
  },
  widgets: {
    expected: 8,
    placed: 8,
    hidden: 0,
    missing: [],
    duplicated: [],
    misplaced: 0,
    weaklyLabelled: 0,
  },
  reasons:
    decision === "ok"
      ? []
      : [{ code: "textMissing", severity: "fail", detail: "fixture" }],
  pages: [],
  durationMs: 1,
});

export const okResult = (): MobileConversionResult => ({
  status: "ok",
  document: makeSampleDocument(),
  report: makeReport("ok"),
});

export const fallbackResult = (): MobileConversionResult => ({
  status: "fallback",
  document: null,
  report: makeReport("fallback"),
});
