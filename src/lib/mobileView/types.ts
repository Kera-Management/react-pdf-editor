/**
 * Mobile friendly view: the shared model.
 *
 * The CONVERTER (`./convert/**`) turns pdf.js text content plus the editor's
 * form widgets into a `MobileDocument` and a `FidelityReport`. The VIEW
 * (`./MobileFriendlyView.tsx`, `./view/**`) renders that document with Chakra
 * and binds every field to the editor's existing `fieldValues` store by
 * widget id. Neither side may import the other; this file is the contract.
 *
 * Spec: agent-docs/specs/PDF_EDITOR_MOBILE_FRIENDLY_VIEW_SPEC.md
 *
 * Coordinate convention used everywhere below: PDF points, origin at the
 * TOP-LEFT of the page's view box, y growing DOWN (pdf.js baselines are
 * flipped once, in `convert/extract.ts`). Page rotation is not supported:
 * any rotated page or rotated text makes the conversion fall back.
 */

/* ------------------------------------------------------------------------ */
/* Geometry                                                                  */
/* ------------------------------------------------------------------------ */

/** An axis-aligned box in top-left page space (points, y down). */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where a block came from on the original page. Used to keep the reader's
 * place when switching between "Mobile friendly" and "Original". */
export interface SourceOrigin {
  /** 0-based page index. */
  pageIndex: number;
  /** Union of the source items and widgets that produced the block. */
  box: Box;
}

/* ------------------------------------------------------------------------ */
/* Converter input                                                           */
/* ------------------------------------------------------------------------ */

/**
 * One pdf.js text item, normalized by `convert/extract.ts`. Items with an
 * empty `str` are dropped (their `hasEOL` is folded into the previous item).
 * The converter never edits `str`; output runs reference items by `index`.
 */
export interface SourceTextItem {
  /** Position of the item in the page's (filtered) item list, 0-based. This
   * is the id that `TextRun.sources` points at. */
  index: number;
  /** The raw string exactly as pdf.js returned it (ligatures already
   * normalized by pdf.js; `disableNormalization` is NOT set). */
  str: string;
  /** Glyph box: x from the transform, top = baseline - ascent, bottom =
   * baseline + descent (ascent 0.8 x fontSize, descent 0.2 x fontSize). */
  box: Box;
  /** Baseline y in top-left page space. */
  baseline: number;
  /** `hypot(a, b)` of the item's transform. */
  fontSize: number;
  /** Real font name when known (from `page.commonObjs` after render, e.g.
   * "Verdana-Bold"), otherwise the pdf.js generic family ("sans-serif"). */
  fontName: string;
  /** Font name matches /bold|black|heavy|semibold|demi/i. */
  bold: boolean;
  /** Font name matches /italic|oblique/i. */
  italic: boolean;
  /** Font name matches /dingbat|zapf|wingding|symbol/i. Dingbat glyphs under
   * a checkbox or radio widget are the printed box and may be excluded from
   * the output (see `FidelityReport.text.excludedChars`). */
  dingbat: boolean;
  /** The transform has a non-zero skew/rotation (|b| or |c| > 0.01). Any
   * rotated text with visible characters forces a fallback. */
  rotated: boolean;
  /** pdf.js `hasEOL` on this item or on an empty item that followed it. */
  hasEOL: boolean;
  /** Marked-content id when the page is tagged (`includeMarkedContent`). */
  mcid?: number;
  /** True when the item sits inside an `/Artifact` marked-content sequence
   * (headers, footers, page numbers on tagged files). */
  artifact?: boolean;
  /** Set by `extractPage` when this item draws the same string again over
   * the item at that index (fake bold or a shadow: same text, same
   * baseline, boxes overlapping). The layout leaves it out; the fidelity
   * check re-verifies the rule (`isDrawnTwice`) before excluding it. */
  duplicateOf?: number;
}

/**
 * What the page draws besides text, read from the pdf.js operator list.
 * Text the user can't see (render mode 3, the usual OCR layer) or text
 * under a picture can't be checked against what the original shows, so
 * either makes the conversion fall back.
 */
export interface PageGraphics {
  /** Painted raster images (and image masks), top-left page space, clipped
   * to the page. */
  images: Box[];
  /** Non-whitespace glyphs drawn with an invisible text render mode (3 or
   * 7). */
  invisibleChars: number;
}

/** Field kinds the mobile view can render. `signature` is decided by the
 * editor (`getEffectiveSignatureFieldNames`), not by the converter. */
export type MobileFieldKind =
  "text" | "multiline" | "checkbox" | "radio" | "select" | "signature";

/** A choice in a select field. Mirrors the editor's `ComboboxItem`. */
export interface SourceOption {
  exportValue: string;
  displayValue: string;
}

/**
 * One fillable widget, built by the editor from `page.fields` (the same
 * objects the original overlays render) plus pdf.js annotation extras.
 * The converter places each non-hidden widget exactly once.
 */
export interface SourceWidget {
  /** The editor's field id: the key in the `fieldValues` store. */
  id: string;
  /** AcroForm field name. Radio options share one name. */
  name: string;
  kind: MobileFieldKind;
  /** Widget rect in top-left page space. */
  box: Box;
  /** AcroForm /TU tooltip (pdf.js `alternativeText`), trimmed, when set. */
  tooltip?: string;
  /** /MaxLen, when > 0. */
  maxLength?: number;
  /** Comb text field (one character per cell). */
  comb?: boolean;
  /** Checkbox/radio "on" value (pdf.js `exportValue`). */
  exportValue?: string;
  /** Select options, in document order. */
  options?: SourceOption[];
  /** pdf.js `hidden` (annotation flag). Hidden widgets are never placed and
   * are counted in `FidelityReport.widgets.hidden`. */
  hidden: boolean;
}

/** Struct-tree role for a marked-content id, from `page.getStructTree()`.
 * Only roles the converter uses are kept; anything else is "other". */
export type StructRole =
  | "H1"
  | "H2"
  | "H3"
  | "H4"
  | "H5"
  | "H6"
  | "P"
  | "L"
  | "LI"
  | "Lbl"
  | "LBody"
  | "Table"
  | "TR"
  | "TH"
  | "TD"
  | "Form"
  | "other";

/** A node of the simplified struct tree, in tree (= reading) order. */
export interface StructNode {
  role: StructRole;
  /** Marked-content ids directly under this node, in order. */
  mcids: number[];
  children: StructNode[];
}

/** Everything the converter needs for one page. Built asynchronously by
 * `extractPage` (`convert/extract.ts`); consumed synchronously. */
export interface SourcePage {
  /** 0-based page index. */
  pageIndex: number;
  /** View box size in points. */
  width: number;
  height: number;
  /** Non-zero `/Rotate`. Any non-zero value forces a fallback. */
  rotation: number;
  items: SourceTextItem[];
  widgets: SourceWidget[];
  /** Simplified struct tree when the PDF is tagged, else null. */
  structure: StructNode[] | null;
  /** Images and invisible text. Undefined when the page was not inspected
   * (synthetic pages in tests); null when the operator list could not be
   * read, which falls back ("imageContent"). */
  graphics?: PageGraphics | null;
}

/** Tunables. All optional; defaults live in `convert/constants.ts`. */
export interface ConvertOptions {
  /** Documents with more pages fall back ("tooManyPages"). Default 50. */
  maxPages?: number;
  /** Minimum `FidelityReport.confidence` for an "ok" decision. Default 0.75. */
  minConfidence?: number;
}

/* ------------------------------------------------------------------------ */
/* Output model                                                              */
/* ------------------------------------------------------------------------ */

/**
 * A run of source text. `text` is the source items' `str` values joined in
 * order, with a single space inserted where the x gap between two items is
 * wider than 0.25 x fontSize (and between lines of a paragraph). The
 * fidelity check verifies that `text` equals its sources, whitespace aside.
 */
export interface TextRun {
  kind: "text";
  text: string;
  /** Indices into `SourcePage.items` of the page named by `pageIndex`, in
   * output order. Never empty. */
  sources: number[];
  pageIndex: number;
  /** Every source item is bold (render as strong). */
  bold?: boolean;
  /** Every source item is italic. */
  italic?: boolean;
  /** Source font size under 8pt: render at 14px `fg.muted`, never smaller. */
  small?: boolean;
  /** The run is one printed empty checkbox square with no widget over it
   * (a ZapfDingbats `q`/`o`/`p`, or a Unicode box character). `text` keeps
   * the source character; the view draws a box instead of the letter. */
  printedBox?: boolean;
}

/**
 * Text the converter made up (a tooltip label, a humanized field name).
 * It is never counted in the fidelity check and must render visibly
 * different from source text where it appears as a label (the view uses
 * the normal label style; it is only ever a label or an aria-label).
 */
export interface SyntheticText {
  kind: "synthetic";
  text: string;
  /** Where the text came from. */
  origin: "tooltip" | "fieldName";
}

/** A field placed inside a sentence ("pay this amount by [____]"). The view
 * renders a full-width control on its own line at this point in the flow. */
export interface InlineField {
  kind: "field";
  fieldId: string;
  /** Accessible name for the control; source text around it is the visual
   * label. */
  ariaLabel: SyntheticText | null;
  /** Printed guides that sat under the widget ("dd/mm/yyyy", "/ /"),
   * rendered as helper text under the control. Counted in fidelity. */
  hint?: TextRun[];
}

/** Content of a paragraph, list item, label or cell. */
export type InlineNode = TextRun | InlineField;

/**
 * A field's visible label. `source` labels are PDF text (counted in
 * fidelity); `synthetic` labels come from the tooltip or field name.
 */
export type FieldLabel =
  | { kind: "source"; runs: TextRun[] }
  | { kind: "synthetic"; text: SyntheticText };

/** Fields common to every block. */
interface BlockBase {
  /** Stable, unique within the document: `p{pageIndex}-b{n}` (nested
   * blocks append `-{n}`). Used for React keys and scroll mapping. */
  id: string;
  /** Null only for synthetic blocks (page breaks). */
  origin: SourceOrigin | null;
}

/** H1 = 20px/600, H2/H3 = 16px/600. Text only, never fields. */
export interface HeadingBlock extends BlockBase {
  type: "heading";
  level: 1 | 2 | 3;
  content: TextRun[];
}

/** Body text, possibly with fill-in-the-blank fields inside. */
export interface ParagraphBlock extends BlockBase {
  type: "paragraph";
  content: InlineNode[];
  /** "furniture" = a page header/footer line repeated on 2+ pages, rendered
   * in the page-break strip style (14px `fg.muted`), kept in place. */
  role: "body" | "small" | "furniture";
}

/** One list item. The printed marker ("(a)", "1.", "•") is source text. */
export interface ListItem {
  id: string;
  marker: TextRun | null;
  content: InlineNode[];
  /** Nested items (hanging indent one level deeper). */
  children: ListItem[];
}

export interface ListBlock extends BlockBase {
  type: "list";
  ordered: boolean;
  items: ListItem[];
}

/** A standalone field with its label above it (full-width control). */
export interface FieldBlock extends BlockBase {
  type: "field";
  fieldId: string;
  kind: MobileFieldKind;
  /** Null when no label could be found at all (counts against confidence;
   * the view falls back to "Field"). */
  label: FieldLabel | null;
  /** Printed guides under the widget, shown as helper text. */
  hint?: TextRun[];
}

/**
 * A checkbox with its label to the right. The label may itself contain a
 * text field ("[x] Other: [________]").
 */
export interface ChoiceBlock extends BlockBase {
  type: "choice";
  fieldId: string;
  label: InlineNode[];
}

/** One option of a radio group. */
export interface RadioOption {
  fieldId: string;
  label: InlineNode[];
}

/** All widgets sharing one radio `name`, rendered as one group. */
export interface RadioGroupBlock extends BlockBase {
  type: "radioGroup";
  /** AcroForm name shared by the options. */
  groupName: string;
  label: FieldLabel | null;
  /** In reading order. Every widget id of the group appears exactly once. */
  options: RadioOption[];
}

/**
 * Two-column label/body tables (N4 "What if you agree with the notice?")
 * and label/field grid rows. Rendered stacked: label, then value.
 */
export interface KeyValueBlock extends BlockBase {
  type: "keyValue";
  label: TextRun[];
  value: MobileBlock[];
}

/**
 * A rebuilt grid region: an address grid, a table or a checkbox grid. Each
 * cell becomes a sub-block; columns are never shown side by side.
 * Checkbox grids are emitted column by column with the column header as
 * `heading` of each `GroupBlock` child.
 */
export interface GroupBlock extends BlockBase {
  type: "group";
  layout: "grid" | "table" | "checkboxGrid";
  heading: TextRun[] | null;
  children: MobileBlock[];
}

/** Synthetic divider "Page {n} of {total}". Starts every page, including
 * the first. Its id is `mf_page_{pageIndex}` (scroll target). */
export interface PageBreakBlock extends BlockBase {
  type: "pageBreak";
  /** 1-based. */
  pageNumber: number;
  pageCount: number;
}

/**
 * A region the converter could not reflow but chose to keep (reserved; v1
 * never emits it, since any unreflowable text fails the fidelity check).
 * The view renders "Shown in the original" with a link that switches views
 * and scrolls to `origin`.
 */
export interface ImagePlaceholderBlock extends BlockBase {
  type: "imagePlaceholder";
  reason: "figure" | "unsupportedLayout";
}

export type MobileBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | FieldBlock
  | ChoiceBlock
  | RadioGroupBlock
  | KeyValueBlock
  | GroupBlock
  | PageBreakBlock
  | ImagePlaceholderBlock;

/** Discriminant of `MobileBlock`. */
export type MobileBlockType = MobileBlock["type"];

/** The reflowed document. Blocks are in final reading order. */
export interface MobileDocument {
  /** Bumped on any breaking model change. */
  version: 1;
  pageCount: number;
  /** Flat list; each page starts with its `PageBreakBlock`. */
  blocks: MobileBlock[];
  /** Every placed field id -> the id of the top-level block holding it. Lets
   * the view scroll to a field and map focus between views. */
  fieldBlockIds: Record<string, string>;
}

/* ------------------------------------------------------------------------ */
/* Fidelity report                                                           */
/* ------------------------------------------------------------------------ */

/** Why a document fell back (or lost confidence). Closed set. */
export type FidelityReasonCode =
  /** No page has text (scanned or vector-outlined text, e.g. MB Form-1A). */
  | "noTextLayer"
  /** A page has (almost) no text: a scanned or pictured page. */
  | "pageWithoutText"
  /** A page draws a large image, or an image over text (a scanned clause,
   * a picture of a schedule): its content is not in the text layer. */
  | "imageContent"
  /** A page has invisible text (an OCR layer), which may not match what
   * the original shows. */
  | "hiddenText"
  /** Page `/Rotate` is non-zero or visible text is rotated/skewed. */
  | "rotatedText"
  /** More pages than `ConvertOptions.maxPages`. */
  | "tooManyPages"
  /** A source character is not in the output. */
  | "textMissing"
  /** A source item is referenced more than once. */
  | "textDuplicated"
  /** A run's text does not match its source items. */
  | "textAltered"
  /** A line's text is out of order or the flow jumps back up a column. */
  | "orderViolation"
  /** A non-hidden widget is not placed. */
  | "widgetMissing"
  /** A widget is placed more than once, or a hidden one is placed. */
  | "widgetDuplicated"
  /** A field sits away from its label, on another page, or out of flow
   * order (above text that was read before it). */
  | "widgetMisplaced"
  /** Output alternates between two side-by-side columns (interleaving). */
  | "columnInterleave"
  /** Too many fields have only a field-name label. */
  | "weakLabels"
  /** A grid region could not be rebuilt into cells. */
  | "unresolvedGrid"
  /** Widgets overlap text that is not a printed box or guide. */
  | "widgetOverText"
  /** Confidence below `ConvertOptions.minConfidence`. */
  | "lowConfidence"
  /** The converter threw; the error message is in `detail`. */
  | "conversionError";

export interface FidelityReason {
  code: FidelityReasonCode;
  /** "fail" decides the fallback by itself; "warn" only lowers confidence. */
  severity: "fail" | "warn";
  pageIndex?: number;
  /** Developer-facing detail (never shown to users). */
  detail: string;
}

/** Character coverage: every count is of NORMALIZED characters (see spec
 * section 7: NFKC, whitespace, soft hyphen and zero-width removed). */
export interface TextFidelity {
  /** All source characters. */
  sourceChars: number;
  /** Dingbat/box glyphs under checkbox/radio widgets, legitimately left out. */
  excludedChars: number;
  /** Source characters found in output runs, once, unaltered. */
  matchedChars: number;
  /** matchedChars / (sourceChars - excludedChars); 1 when both are 0. */
  coverage: number;
  /** Count of segment-order and flow-order violations. */
  orderViolations: number;
  /** Count of runs whose text does not match their sources. */
  alteredRuns: number;
}

export interface WidgetFidelity {
  /** Non-hidden input widgets. */
  expected: number;
  /** Distinct widget ids placed. */
  placed: number;
  hidden: number;
  missing: string[];
  duplicated: string[];
  /** Fields away from their label or out of flow order (C10). */
  misplaced: number;
  /** Placed fields whose label is a field-name fallback or null. */
  weaklyLabelled: number;
}

export interface PageFidelity {
  pageIndex: number;
  sourceChars: number;
  matchedChars: number;
  widgets: number;
  /** Layout signals for tuning, never shown to users. */
  columns: number;
  gridRegions: number;
  usedStructTree: boolean;
}

export interface FidelityReport {
  decision: "ok" | "fallback";
  /** 0..1. Starts at 1 and loses points per warn reason (spec section 7). */
  confidence: number;
  text: TextFidelity;
  widgets: WidgetFidelity;
  reasons: FidelityReason[];
  pages: PageFidelity[];
  /** Wall time of convert + check, for the corpus harness. */
  durationMs: number;
}

/**
 * What the view receives. On fallback the document is withheld, so it can
 * never be rendered by mistake. (The corpus harness uses
 * `convertDocumentUnchecked` to inspect a failed conversion.)
 */
export type MobileConversionResult =
  | { status: "ok"; document: MobileDocument; report: FidelityReport }
  | { status: "fallback"; document: null; report: FidelityReport };

/* ------------------------------------------------------------------------ */
/* Converter entry points (implemented in convert/index.ts)                  */
/* ------------------------------------------------------------------------ */

/**
 * Minimal structural type of the pdf.js page the adapter reads, so this
 * file does not import pdfjs-dist. `PDFPageProxy` satisfies it.
 */
export interface PdfPageLike {
  view: number[];
  rotate: number;
  getTextContent(params?: {
    includeMarkedContent?: boolean;
    disableNormalization?: boolean;
  }): Promise<{ items: unknown[]; styles: Record<string, unknown> }>;
  getStructTree(): Promise<unknown>;
  commonObjs: { has(id: string): boolean; get(id: string): unknown };
  /** Optional so test doubles can omit it; `PDFPageProxy` has it. */
  getOperatorList?(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
}

/** Async pdf.js adapter: the only converter code that touches pdf.js. */
export type ExtractPage = (
  page: PdfPageLike,
  pageIndex: number,
  widgets: SourceWidget[],
) => Promise<SourcePage>;

/** Pure and synchronous: layout + fidelity check + decision. Never throws
 * (an internal error becomes a "conversionError" fallback). */
export type ConvertDocument = (
  pages: SourcePage[],
  options?: ConvertOptions,
) => MobileConversionResult;

/** Pure fidelity check, independent of the layout code. */
export type CheckFidelity = (
  pages: SourcePage[],
  document: MobileDocument,
  options?: ConvertOptions,
) => FidelityReport;
