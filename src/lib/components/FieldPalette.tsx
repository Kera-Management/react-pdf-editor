import React from "react";
import { BuildModeFieldType } from "../PDFEditor";
import styles from "./FieldPalette.module.css";
import {
  CheckSquare,
  RadioButton,
  RowsPlusBottom,
  Signature,
  TextAa,
  TextAlignJustify,
} from "@phosphor-icons/react";

interface FieldPaletteProps {
  onFieldDragStart: (fieldType: BuildModeFieldType) => void;
  onFieldDragEnd: () => void;
}

interface FieldTypeConfig {
  type: BuildModeFieldType;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const fieldTypes: FieldTypeConfig[] = [
  {
    type: "text",
    label: "Text Field",
    icon: <TextAa />,
    description: "Single line text input",
  },
  {
    type: "multiline",
    label: "Text Area",
    icon: <TextAlignJustify />,
    description: "Multi-line text input",
  },
  {
    type: "checkbox",
    label: "Checkbox",
    icon: <CheckSquare />,
    description: "Check/uncheck option",
  },
  {
    type: "dropdown",
    label: "Dropdown",
    icon: <RowsPlusBottom />,
    description: "Select from dropdown list",
  },
  {
    type: "radio",
    label: "Radio Button",
    icon: <RadioButton />,
    description: "Single selection from group",
  },
  {
    type: "signature",
    label: "Signature",
    icon: <Signature />,
    description: "Digital signature field",
  },
];

export const FieldPalette: React.FC<FieldPaletteProps> = ({
  onFieldDragStart,
  onFieldDragEnd,
}) => {
  const handleDragStart = (
    e: React.DragEvent,
    fieldType: BuildModeFieldType
  ) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ fieldType }));
    e.dataTransfer.effectAllowed = "copy";
    onFieldDragStart(fieldType);
  };

  const handleDragEnd = () => {
    onFieldDragEnd();
  };

  return (
    <div className={styles.palette}>
      <div className={styles.header}>
        <h3>Form Fields</h3>
        <p>Drag fields onto the PDF to add them</p>
      </div>
      <div className={styles.fieldGrid}>
        {fieldTypes.map((field) => (
          <div
            key={field.type}
            className={styles.fieldItem}
            draggable
            onDragStart={(e) => handleDragStart(e, field.type)}
            onDragEnd={handleDragEnd}
            title={field.description}
          >
            <div className={styles.fieldIcon}>{field.icon}</div>
            <div className={styles.fieldLabel}>{field.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FieldPalette;
