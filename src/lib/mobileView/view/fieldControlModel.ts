import type { MobileFieldKind, SourceOption } from "../types";

/**
 * Everything a control needs to show and edit one field, resolved by
 * PDFEditor from the same `fieldValues` store, gating and required metadata
 * the original overlays use (spec §9.1). The mobile friendly view only ever
 * reads and writes values through this model, never the store directly, so
 * the two views can't disagree about a value or a business rule.
 */
export interface FieldControlModel {
  /** The editor's field id (the `fieldValues` key). */
  id: string;
  /** AcroForm field name (the field's ID). Radio options share it. */
  name: string;
  /** The name shown to people: host `fieldLabels`, else the PDF's display
   * name (/TU), else the humanized `name`. Display only. */
  label: string;
  kind: MobileFieldKind;
  /** Current value: typed text, the checkbox/radio export value or "Off",
   * the selected option's export value, or a signature data URL. */
  value: string;
  /** Checkbox: checked. Radio: this option is the selected one. */
  checked: boolean;
  /**
   * Text/select: set the value on every id sharing this field's name (spec
   * §9.4): same-name widgets are one PDF field with one value, and the
   * mobile friendly view shows each widget once.
   */
  setValue: (value: string) => void;
  /** Checkbox: export value or "Off". Radio: selects this option for the
   * whole group (every id sharing the name). */
  setChecked: (on: boolean) => void;
  /** /MaxLen, when > 0. */
  maxLength?: number;
  /** Select options, in document order. */
  options?: SourceOption[];
  /** Checkbox/radio "on" value: names an option that has no label text. */
  exportValue?: string;
  /** Required by the template. Gated fields (another signer's) are not
   * required of the active participant: views check `gated` too. */
  required: boolean;
  /** Same rule as progress: non-empty and not the "Off" sentinel; a
   * signature is complete once it holds an image. */
  complete: boolean;
  /** View mode or gated. */
  readOnly: boolean;
  /** The active participant may not fill it: another signer's field, or
   * (once any assignment exists) a field assigned to no one. */
  gated: boolean;
  /** "Assigned to {name}" for another signer's field; null otherwise
   * (including a gated field assigned to no one, which shows no text). */
  gatedLabel: string | null;
  /** Gated with `unassignedVisibility="hidden"`: render no control at all
   * (the surrounding document text still shows). */
  hidden: boolean;
  /**
   * Set when the field is a member of a choice group (one question answered
   * by several checkboxes, e.g. yes/no). `label` is the group's name for a
   * person, `required` whether one answer is required, and `first` marks the
   * member the group's label and help are shown with (once per group).
   */
  choiceGroup?: {
    id: string;
    label: string;
    help?: string;
    required: boolean;
    first: boolean;
  };
}

/** Looks a field up by id. Null for an id the editor doesn't know. */
export type GetFieldControl = (fieldId: string) => FieldControlModel | null;

/** Required of the active participant. Another signer's field is not,
 * whatever the template says: progress and the guided bar leave it out,
 * and so does the original layout. */
export const isRequiredHere = (control: FieldControlModel | null): boolean =>
  !!control && control.required && !control.gated;

/** A signature value is a PNG data URL once adopted. */
export const isSignedValue = (value: string): boolean =>
  !!value && value.startsWith("data:image");

/**
 * Picks a mobile keyboard from a field's label (spec §8.3). Free text
 * stays free text: `type="date"` is never used, and a value is never
 * reformatted, because the PDF field expects exactly what was typed.
 */
export const inputModeFor = (
  label: string
): "tel" | "email" | "decimal" | "numeric" | undefined => {
  const text = label.toLowerCase();
  if (/\b(phone|telephone|tel|fax|cell)\b/.test(text)) return "tel";
  if (/\be-?mail\b/.test(text)) return "email";
  // Amounts keep the decimal point ("1850.00"). Deliberately narrow: a
  // "Rent is payable to" name field must keep the full keyboard.
  if (/\b(amount|price)\b|\$/.test(text)) return "decimal";
  if (/\bnumber of\b/.test(text)) return "numeric";
  return undefined;
};
