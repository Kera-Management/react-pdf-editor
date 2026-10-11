import { PDFCheckBox, PDFName } from "pdf-lib";

/**
 * Writes an editor checkbox value into a pdf-lib check box.
 *
 * `value` is the field's value as the editor holds it: "Off" or empty for
 * unticked, otherwise the export value of the ticked box. A check box field
 * can have several widgets with different export values (a group like
 * "deposit: A / B / C" that shares one name): pdf-lib's `check()` always
 * ticks the first widget's, so pick the widget whose export value matches
 * and tick only that one. A value that matches no widget (a lone box, or a
 * plain "On") falls back to `check()`.
 */
export function setCheckBoxValue(field: PDFCheckBox, value: string | undefined) {
  if (!value || value === "Off") {
    field.uncheck();
    return;
  }
  const widgets = field.acroField.getWidgets();
  const match = widgets
    .map((widget) => widget.getOnValue())
    .find((onValue) => onValue?.decodeText() === value);
  if (!match) {
    field.check();
    return;
  }
  // uncheck() marks the field dirty (protected API) so pdf-lib refreshes
  // its appearances; then point V and each widget's state at the match.
  field.uncheck();
  field.acroField.dict.set(PDFName.of("V"), match);
  widgets.forEach((widget) =>
    widget.setAppearanceState(
      widget.getOnValue() === match ? match : PDFName.of("Off")
    )
  );
}
