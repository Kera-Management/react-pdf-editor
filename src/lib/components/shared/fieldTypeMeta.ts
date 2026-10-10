import React from "react";
import {
  TextAaIcon,
  CheckSquareIcon,
  RowsPlusBottomIcon,
  RadioButtonIcon,
  SignatureIcon,
  TextAlignJustifyIcon,
} from "@phosphor-icons/react";
import type { BuildModeField, BuildModeFieldType } from "../../PDFEditor";

/**
 * Per-field-type icon and label, shared by anything that needs to identify a
 * build-mode field type to a user (PropertiesPanel header, field popover, ...).
 * Extracted from PropertiesPanel so it has one source of truth.
 */
export const fieldTypeIcons: Record<BuildModeFieldType, React.ReactNode> = {
  text: React.createElement(TextAaIcon, { weight: "duotone", size: 16 }),
  multiline: React.createElement(TextAlignJustifyIcon, {
    weight: "duotone",
    size: 16,
  }),
  checkbox: React.createElement(CheckSquareIcon, { weight: "duotone", size: 16 }),
  dropdown: React.createElement(RowsPlusBottomIcon, {
    weight: "duotone",
    size: 16,
  }),
  radio: React.createElement(RadioButtonIcon, { weight: "duotone", size: 16 }),
  signature: React.createElement(SignatureIcon, { weight: "duotone", size: 16 }),
};

export const fieldTypeLabels: Record<BuildModeFieldType, string> = {
  text: "Text Field",
  multiline: "Text Area",
  checkbox: "Checkbox",
  dropdown: "Dropdown",
  radio: "Radio Button",
  signature: "Signature",
};

/**
 * A7: a dropdown or radio field that signers can't choose from because it
 * has no options. Single source of truth for the canvas `data-invalid` flag,
 * the Properties panel / Options dialog alert and the field popover warning.
 *
 * Radio fields imported from an existing PDF are one widget per option and
 * carry no `options` list, so only radios placed in Prepare (`origin: "new"`)
 * are checked; dropdowns are always checked.
 */
export const isFieldMissingOptions = (
  field: Pick<BuildModeField, "type" | "origin" | "properties">
): boolean => {
  const count = field.properties.options?.length ?? 0;
  if (count > 0) return false;
  if (field.type === "dropdown") return true;
  if (field.type === "radio") return field.origin === "new";
  return false;
};
