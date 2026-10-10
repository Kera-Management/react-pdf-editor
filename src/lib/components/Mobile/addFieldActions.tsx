import React from "react";
import {
  CheckSquareIcon,
  RadioButtonIcon,
  RowsPlusBottomIcon,
  SignatureIcon,
  TextAaIcon,
  TextAlignJustifyIcon,
} from "@phosphor-icons/react";
import type { BuildModeFieldType } from "../../PDFEditor";

export interface FABAction {
  id: BuildModeFieldType;
  label: string;
  icon: React.ReactNode;
}

/** The six field types, in field-palette order, with the palette's labels. */
export const ADD_FIELD_ACTIONS: FABAction[] = [
  { id: "text", label: "Text", icon: <TextAaIcon /> },
  { id: "multiline", label: "Text Area", icon: <TextAlignJustifyIcon /> },
  { id: "checkbox", label: "Checkbox", icon: <CheckSquareIcon /> },
  { id: "dropdown", label: "Dropdown", icon: <RowsPlusBottomIcon /> },
  { id: "radio", label: "Radio", icon: <RadioButtonIcon /> },
  { id: "signature", label: "Signature", icon: <SignatureIcon /> },
];
