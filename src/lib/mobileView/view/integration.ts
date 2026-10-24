import type {
  FidelityReport,
  MobileConversionResult,
  MobileFieldKind,
  SourceWidget,
} from "../types";

/** The slice of the editor's field record (`PDFFormRawField`, from pdf.js
 * `getFieldObjects`) a `SourceWidget` is built from. */
export interface RawFieldLike {
  id: string;
  name: string;
  type: string;
  rect: number[];
  multiline: boolean;
  hidden: boolean;
  exportValues?: string;
  charLimit?: number;
  comb?: boolean;
  items?: { exportValue: string; displayValue: string }[];
  /** The field's display name (AcroForm /TU), read by the editor. */
  displayName?: string;
}

/** pdf.js annotation extras `getFieldObjects` doesn't carry, by id. */
export interface WidgetExtras {
  /** /TU tooltip (pdf.js `alternativeText`). */
  tooltip?: string;
}

/** The editor's kind for a field (spec §9.2). Signature is the editor's
 * call (metadata + `signatureFieldNames`), never the converter's. */
export const widgetKind = (
  field: RawFieldLike,
  signatureNames: Set<string>
): MobileFieldKind => {
  if (signatureNames.has(field.name)) return "signature";
  if (field.type === "checkbox") return "checkbox";
  if (field.type === "radio" || field.type === "radiobutton") return "radio";
  if (field.type === "combobox") return "select";
  if (
    (field.type === "list" || field.type === "listbox") &&
    (field.items?.length ?? 0) > 0
  ) {
    return "select";
  }
  if (field.multiline) return "multiline";
  return "text";
};

/**
 * `SourceWidget[]` for one page, from the same `page.fields` the original
 * overlays render (spec §9.2). `view` is the page's pdf.js view box
 * ([x0, y0, x1, y1]); rects flip to top-left space against it.
 *
 * A widget's `tooltip` (its synthetic label when the page has no text for
 * it) follows the editor's one label rule: the host's `fieldLabels` entry,
 * else the field's display name, else pdf.js's per-widget /TU.
 */
export const buildSourceWidgets = (
  fields: RawFieldLike[] | undefined,
  view: number[],
  signatureNames: Set<string>,
  extras: Map<string, WidgetExtras> = new Map(),
  fieldLabels?: Record<string, string>
): SourceWidget[] => {
  // `?? []`: a test double (or a broken page) may have no view box.
  const [x0 = 0, , , y1 = 0] = view ?? [];
  return (fields ?? []).map((field) => {
    const [llx, lly, urx, ury] = field.rect;
    const kind = widgetKind(field, signatureNames);
    const tooltip =
      fieldLabels?.[field.name]?.trim() ||
      field.displayName?.trim() ||
      extras.get(field.id)?.tooltip?.trim();
    const widget: SourceWidget = {
      id: field.id,
      name: field.name,
      kind,
      box: {
        left: Math.min(llx, urx) - x0,
        top: y1 - Math.max(lly, ury),
        right: Math.max(llx, urx) - x0,
        bottom: y1 - Math.min(lly, ury),
      },
      hidden: !!field.hidden,
      ...(tooltip ? { tooltip } : {}),
      ...(field.charLimit && field.charLimit > 0
        ? { maxLength: field.charLimit }
        : {}),
      ...(field.comb ? { comb: true } : {}),
      ...((kind === "checkbox" || kind === "radio") && field.exportValues
        ? { exportValue: field.exportValues }
        : {}),
      ...(kind === "select" && field.items
        ? {
            options: field.items.map((item) => ({
              exportValue: item.exportValue,
              displayValue: item.displayValue,
            })),
          }
        : {}),
    };
    return widget;
  });
};

/** A stable key for the conversion cache: the document plus the exact set
 * of field ids (a Prepare save reloads the same bytes with new fields). */
export const conversionCacheKey = (
  documentKey: string,
  fieldIds: string[]
): string => `${documentKey}::${fieldIds.join("|")}`;

/** The page shape `readWidgetExtras` needs (pdf.js `PDFPageProxy`). */
interface AnnotatedPageLike {
  getAnnotations?: (params?: { intent?: string }) => Promise<unknown[]>;
}

/**
 * Tooltips (/TU, pdf.js `alternativeText`) by widget id. `getFieldObjects`
 * doesn't carry them, so they are read from the page's annotations, and
 * only when a conversion runs: hosts without the mobile friendly view pay
 * nothing. A failure just means no tooltips (labels fall back further).
 */
export const readWidgetExtras = async (
  page: AnnotatedPageLike
): Promise<Map<string, WidgetExtras>> => {
  const extras = new Map<string, WidgetExtras>();
  if (typeof page.getAnnotations !== "function") return extras;
  try {
    const annotations = await page.getAnnotations();
    annotations.forEach((raw) => {
      const annotation = raw as {
        id?: unknown;
        subtype?: unknown;
        alternativeText?: unknown;
      };
      if (
        annotation.subtype === "Widget" &&
        typeof annotation.id === "string" &&
        typeof annotation.alternativeText === "string" &&
        annotation.alternativeText.trim() !== ""
      ) {
        extras.set(annotation.id, {
          tooltip: annotation.alternativeText.trim(),
        });
      }
    });
  } catch {
    // No tooltips; nothing else depends on them.
  }
  return extras;
};

/**
 * The fallback the editor uses when converting threw outside the
 * converter's own guard (page extraction, a pdf.js error). Same shape as
 * the converter's own `conversionError` result, so the view can't tell
 * them apart and never renders a document.
 */
export const conversionErrorResult = (
  error: unknown
): MobileConversionResult => {
  const report: FidelityReport = {
    decision: "fallback",
    confidence: 0,
    text: {
      sourceChars: 0,
      excludedChars: 0,
      matchedChars: 0,
      coverage: 0,
      orderViolations: 0,
      alteredRuns: 0,
    },
    widgets: {
      expected: 0,
      placed: 0,
      hidden: 0,
      missing: [],
      duplicated: [],
      misplaced: 0,
      weaklyLabelled: 0,
    },
    reasons: [
      {
        code: "conversionError",
        severity: "fail",
        detail: error instanceof Error ? error.message : String(error),
      },
    ],
    pages: [],
    durationMs: 0,
  };
  return { status: "fallback", document: null, report };
};

const HINT_STORAGE_KEY = "rpe.mobileFriendlyHintSeen";

/** Whether the first-run hint was dismissed on this device. Storage can
 * throw (private mode, blocked cookies): then the hint just shows. */
export const readHintSeen = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(HINT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

export const writeHintSeen = (): void => {
  try {
    globalThis.localStorage?.setItem(HINT_STORAGE_KEY, "1");
  } catch {
    // Shows again next time; harmless.
  }
};
