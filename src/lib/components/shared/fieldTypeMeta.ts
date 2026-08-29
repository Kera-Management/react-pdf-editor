import React from "react";
import {
  TextAa,
  CheckSquare,
  RowsPlusBottom,
  RadioButton,
  Signature,
  TextAlignJustify,
} from "@phosphor-icons/react";
import { BuildModeFieldType } from "../../PDFEditor";

/**
 * Per-field-type icon and label, shared by anything that needs to identify a
 * build-mode field type to a user (PropertiesPanel header, field popover, ...).
 * Extracted from PropertiesPanel so it has one source of truth.
 */
export const fieldTypeIcons: Record<BuildModeFieldType, React.ReactNode> = {
  text: React.createElement(TextAa, { weight: "duotone", size: 16 }),
  multiline: React.createElement(TextAlignJustify, {
    weight: "duotone",
    size: 16,
  }),
  checkbox: React.createElement(CheckSquare, { weight: "duotone", size: 16 }),
  dropdown: React.createElement(RowsPlusBottom, {
    weight: "duotone",
    size: 16,
  }),
  radio: React.createElement(RadioButton, { weight: "duotone", size: 16 }),
  signature: React.createElement(Signature, { weight: "duotone", size: 16 }),
};

export const fieldTypeLabels: Record<BuildModeFieldType, string> = {
  text: "Text Field",
  multiline: "Text Area",
  checkbox: "Checkbox",
  dropdown: "Dropdown",
  radio: "Radio Button",
  signature: "Signature",
};
