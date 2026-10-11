/**
 * Converter thresholds. Distances are in PDF points unless the name ends in
 * `Em` (a multiple of the font size involved). Starting values come from the
 * spec (section 6) and are tuned against the corpus harness.
 */

/** Documents with more pages fall back ("tooManyPages"). */
export const DEFAULT_MAX_PAGES = 50;
/** Minimum confidence for an "ok" decision. */
export const DEFAULT_MIN_CONFIDENCE = 0.75;

/* Preflight ---------------------------------------------------------------- */

/** Fewer visible characters than this in the whole document: no text layer. */
export const MIN_DOCUMENT_CHARS = 20;
/** Share of visible characters that may be rotated before falling back. */
export const MAX_ROTATED_SHARE = 0.01;
/** A page with fewer visible characters than this is a scanned or pictured
 * page (a scanned schedule, building rules as an image): its content is
 * not in the text layer, so the document falls back ("pageWithoutText"). */
export const MIN_PAGE_CHARS = 20;
/** An image covering this share of the page or more (alone or with the
 * page's other images) may carry content the text layer lacks. Logos in
 * the corpus cover at most 2%. */
export const MAX_IMAGE_PAGE_SHARE = 0.08;

/* Lines, words, segments ------------------------------------------------- */

/** Two items share a line when their baselines are this close (x min size). */
export const LINE_BASELINE_TOLERANCE_EM = 0.35;
/** A line at most 1/this the size of the line it sits inside is a
 * superscript or subscript and joins it. */
export const SCRIPT_SIZE_RATIO = 1.25;
/** A gap wider than this inserts a space between two items. */
export const WORD_GAP_EM = 0.25;
/** A gap wider than max(this x size, SEGMENT_GAP_MIN_PT) splits a segment. */
export const SEGMENT_GAP_EM = 1;
export const SEGMENT_GAP_MIN_PT = 8;
/** A bold/regular change with a gap wider than this also splits a segment
 * (a sidebar title printed right next to body text). */
export const SEGMENT_STYLE_GAP_EM = 0.6;

/* Regions (XY-cut) --------------------------------------------------------- */

/** Line height as a multiple of the font size. */
export const LINE_HEIGHT_EM = 1.2;
/** A horizontal cut needs a vertical gap wider than this x line height. */
export const HORIZONTAL_CUT_LINES = 1.2;
/** A gutter is at least this wide (x median font size). */
export const GUTTER_MIN_EM = 0.9;
/** A gutter needs at least this many rows with text on both sides. */
export const GUTTER_MIN_ROWS = 3;
/** Label/body tables: the label column is narrower than this share. */
export const KEY_VALUE_MAX_LABEL_SHARE = 0.3;
/** Label/body tables: label and value tops line up within this (x size). */
export const KEY_VALUE_LEVEL_EM = 0.5;

/* Blocks ------------------------------------------------------------------ */

/** Paragraph lines: font sizes within this ratio. */
export const PARAGRAPH_SIZE_RATIO = 0.1;
/** Paragraph lines: left edges within this (x size). */
export const PARAGRAPH_LEFT_EM = 1;
/** Paragraph lines: baseline-to-baseline distance at most this (x size). */
export const PARAGRAPH_LINE_GAP_EM = 1.6;
/** ...or this, when the sentence plainly runs on (no closing punctuation,
 * next line starts lowercase): the second line of N5-N7, N12 and N13's
 * "move out of your / rental unit by ..." sits 2.5em lower, under a field. */
export const RUN_ON_LINE_GAP_EM = 2.8;
/** Hanging indent allowed after a list marker (x size). */
export const LIST_HANGING_EM = 4;
/** List nesting buckets (x size). */
export const LIST_INDENT_EM = 1.5;
/** Headings: at most this many characters. */
export const HEADING_MAX_CHARS = 100;
/** Headings: at least this x the page's median body size (unless bold). */
export const HEADING_SIZE_RATIO = 1.2;
/** Level 1 headings: at least this x the median body size. */
export const HEADING_H1_RATIO = 1.4;
/** Source text under this size is small print. */
export const SMALL_PRINT_PT = 8;

/* Furniture --------------------------------------------------------------- */

/** Header/footer candidates sit in the top or bottom share of the page. */
export const FURNITURE_EDGE_SHARE = 0.08;
/** With this many pages or more, a repeated line must be on half of them. */
export const FURNITURE_MANY_PAGES = 4;
export const FURNITURE_MIN_PAGE_SHARE = 0.5;

/* Fields ------------------------------------------------------------------ */

/** An item is "under" a widget when this share of its box is inside it. */
export const UNDER_WIDGET_SHARE = 0.6;
/** Band tolerance for widget anchoring: x widget height, plus points. */
export const BAND_TOLERANCE_SHARE = 0.3;
export const BAND_TOLERANCE_PT = 2;
/** Widgets taller than this many line heights anchor on their first line. */
export const TALL_WIDGET_LINES = 2.5;
/** Inline (fill-in-the-blank) fields: text within this distance (x size). */
export const INLINE_TEXT_EM = 3;
/** A left label of at most this many characters (or ending ":"). */
export const LABEL_MAX_CHARS = 80;
/** Labels above a widget: at most this many line heights away. */
export const LABEL_ABOVE_LINES = 1.5;
/** Labels below a widget (signature lines): at most this many lines away. */
export const LABEL_BELOW_LINES = 1;
/** Choice labels end at a gap wider than this (x size). */
export const CHOICE_LABEL_GAP_EM = 3;
/** A text close to a checkbox (x size) votes for that label side. */
export const CHOICE_LABEL_NEAR_EM = 1.5;
/** Checkbox grid columns share a left x within this. */
export const CHECKBOX_COLUMN_PT = 3;
/** Checkbox grids: a column has at least this many boxes. */
export const CHECKBOX_GRID_MIN_ROWS = 3;
/** Checkbox grids: at least this many columns. */
export const CHECKBOX_GRID_MIN_COLUMNS = 2;

/* Fidelity check ---------------------------------------------------------- */

/** Checker segments: baselines within this x the smaller size. Kept stricter
 * than the layout's line tolerance so checker segments are never coarser. */
export const CHECK_BASELINE_EM = 0.3;
/** Checker segments: x gap at most this (x size). */
export const CHECK_SEGMENT_GAP_EM = 1;
/** Checker segments: a bold/regular change with a gap wider than this
 * splits (kept below the layout's SEGMENT_STYLE_GAP_EM). */
export const CHECK_STYLE_GAP_EM = 0.5;
/** Flow order: "above" means more than this many line heights higher. */
export const CHECK_ABOVE_LINES = 0.5;
/** Flow order: two boxes share an x band when they overlap by more than
 * this share of the narrower one (and more than 0.5pt). */
export const CHECK_BAND_OVERLAP_SHARE = 0.2;
/** Flow order for fields: a widget may sit this many more lines above a
 * label printed under it (signature lines; the layout allows 1). */
export const CHECK_WIDGET_BELOW_LABEL_LINES = 1.5;
/** Widget placement: a field's label (or the text around an inline field)
 * is at most this far from the widget (x the label's size). The corpus
 * maximum on documents that pass is 1.9em. */
export const CHECK_LABEL_MAX_EM = 4;
/** Interleave: both segments are at least this share of the page width
 * (prose columns; narrow key/value labels do not count). */
export const CHECK_INTERLEAVE_MIN_WIDTH_SHARE = 0.2;
/** Interleave: more steps than this in a row fail; 2..this warn. */
export const CHECK_INTERLEAVE_FAIL_STEPS = 3;
export const CHECK_INTERLEAVE_WARN_STEPS = 2;
/** Interleave: a step back to a column counts when it lands on the next
 * line (tops at most this x the size apart), as interleaved prose does. */
export const CHECK_NEXT_LINE_EM = 1.6;
/** Fused columns: a word gap wider than this (x size) inside a checker
 * segment, lined up on CHECK_FUSED_MIN_LINES consecutive lines. */
export const CHECK_FUSED_GAP_EM = 0.6;
export const CHECK_FUSED_MIN_LINES = 3;

/* Confidence --------------------------------------------------------------- */

/** weakLabels warns above this share of placed fields. */
export const WEAK_LABEL_WARN_SHARE = 0.2;
export const WEAK_LABEL_PENALTY = 0.5;
export const OVER_TEXT_PENALTY = 0.05;
export const OVER_TEXT_PENALTY_MAX = 0.2;
export const FALLBACK_PLACED_PENALTY = 0.03;
export const FALLBACK_PLACED_PENALTY_MAX = 0.2;
export const INTERLEAVE_WARN_PENALTY = 0.1;
