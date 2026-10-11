import type {
  FieldLabel,
  InlineField,
  InlineNode,
  ListItem,
  MobileBlock,
  MobileDocument,
  PageBreakBlock,
  TextRun,
} from "../types";

/** Plain text of some runs, for labels and aria-labels. A printed box
 * glyph is a symbol-font letter ("q"), not words, so it is left out. */
export const runsToText = (runs: TextRun[] | null | undefined): string =>
  (runs ?? [])
    .filter((run) => !run.printedBox)
    .map((run) => run.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

/** Plain text of a field label (source or synthetic). Empty when null. */
export const fieldLabelText = (label: FieldLabel | null): string => {
  if (!label) return "";
  return label.kind === "source"
    ? runsToText(label.runs)
    : label.text.text.trim();
};

/**
 * Splits inline content at each field. The view renders text pieces as
 * paragraphs and each field as a full-width control on its own line
 * between them (spec §8.2), so a sentence like "pay [x] by [y]" reads as
 * "pay" / control / "by" / control.
 */
export type InlinePiece =
  | { kind: "text"; runs: TextRun[] }
  | { kind: "field"; field: InlineField };

export const splitInline = (content: InlineNode[]): InlinePiece[] => {
  const pieces: InlinePiece[] = [];
  let runs: TextRun[] = [];
  content.forEach((node) => {
    if (node.kind === "field") {
      if (runs.length > 0) pieces.push({ kind: "text", runs });
      runs = [];
      pieces.push({ kind: "field", field: node });
    } else {
      runs.push(node);
    }
  });
  if (runs.length > 0) pieces.push({ kind: "text", runs });
  return pieces;
};

/** Text before the first field, for an inline field's fallback aria-label
 * ("The tenant agrees to pay rent of" -> the amount box). */
export const textAroundField = (
  content: InlineNode[],
  fieldId: string
): string => {
  const index = content.findIndex(
    (node) => node.kind === "field" && node.fieldId === fieldId
  );
  if (index < 0) return "";
  const before: TextRun[] = [];
  for (let i = index - 1; i >= 0; i--) {
    const node = content[i];
    if (node.kind === "field") break;
    before.unshift(node);
  }
  const text = runsToText(before);
  if (text) return text;
  const after: TextRun[] = [];
  for (let i = index + 1; i < content.length; i++) {
    const node = content[i];
    if (node.kind === "field") break;
    after.push(node);
  }
  return runsToText(after);
};

const inlineFieldIds = (content: InlineNode[], out: string[]) => {
  content.forEach((node) => {
    if (node.kind === "field") out.push(node.fieldId);
  });
};

const listItemFieldIds = (items: ListItem[], out: string[]) => {
  items.forEach((item) => {
    inlineFieldIds(item.content, out);
    listItemFieldIds(item.children, out);
  });
};

const blockFieldIds = (block: MobileBlock, out: string[]) => {
  switch (block.type) {
    case "paragraph":
      inlineFieldIds(block.content, out);
      break;
    case "list":
      listItemFieldIds(block.items, out);
      break;
    case "field":
      out.push(block.fieldId);
      break;
    case "choice":
      out.push(block.fieldId);
      inlineFieldIds(block.label, out);
      break;
    case "radioGroup":
      block.options.forEach((option) => {
        out.push(option.fieldId);
        inlineFieldIds(option.label, out);
      });
      break;
    case "keyValue":
      block.value.forEach((child) => blockFieldIds(child, out));
      break;
    case "group":
      block.children.forEach((child) => blockFieldIds(child, out));
      break;
    default:
      break;
  }
};

/** Every placed field id in render (= reading) order. */
export const fieldIdsInOrder = (doc: MobileDocument): string[] => {
  const ids: string[] = [];
  doc.blocks.forEach((block) => blockFieldIds(block, ids));
  return ids;
};

/** One page of the reflowed document: its divider and the blocks after it. */
export interface PageSection {
  pageIndex: number;
  pageBreak: PageBreakBlock | null;
  blocks: MobileBlock[];
}

/** Groups the flat block list by page, so each page can be observed (the
 * page pill) and scrolled to as one section. */
export const groupByPage = (doc: MobileDocument): PageSection[] => {
  const sections: PageSection[] = [];
  let current: PageSection | null = null;
  doc.blocks.forEach((block) => {
    if (block.type === "pageBreak") {
      current = {
        pageIndex: block.pageNumber - 1,
        pageBreak: block,
        blocks: [],
      };
      sections.push(current);
      return;
    }
    if (!current) {
      current = { pageIndex: 0, pageBreak: null, blocks: [] };
      sections.push(current);
    }
    current.blocks.push(block);
  });
  return sections;
};

/** DOM id of a page's divider: the scroll target for page navigation. */
export const pageAnchorId = (pageIndex: number): string =>
  `mf_page_${pageIndex}`;

/** Runs of 4 or more underscores are printed blanks ("______"): the view
 * draws them as a muted rule but keeps the characters in the DOM. */
export const BLANK_RUN = /_{4,}/g;
