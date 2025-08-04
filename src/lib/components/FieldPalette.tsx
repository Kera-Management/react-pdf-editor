import React from "react";
import { BuildModeFieldType } from "../PDFEditor";
import styles from "./FieldPalette.module.css";

interface FieldPaletteProps {
  onFieldDragStart: (fieldType: BuildModeFieldType) => void;
  onFieldDragEnd: () => void;
}

interface FieldTypeConfig {
  type: BuildModeFieldType;
  label: string;
  icon: string;
  description: string;
}

const fieldTypes: FieldTypeConfig[] = [
  {
    type: "text",
    label: "Text Field",
    icon: "📝",
    description: "Single line text input"
  },
  {
    type: "multiline",
    label: "Text Area",
    icon: "📄",
    description: "Multi-line text input"
  },
  {
    type: "checkbox",
    label: "Checkbox",
    icon: "☑️",
    description: "Check/uncheck option"
  },
  {
    type: "dropdown",
    label: "Dropdown",
    icon: "📋",
    description: "Select from dropdown list"
  },
  {
    type: "radio",
    label: "Radio Button",
    icon: "🔘",
    description: "Single selection from group"
  },
  {
    type: "signature",
    label: "Signature",
    icon: "✍️",
    description: "Digital signature field"
  }
];

export const FieldPalette: React.FC<FieldPaletteProps> = ({
  onFieldDragStart,
  onFieldDragEnd
}) => {
  const handleDragStart = (e: React.DragEvent, fieldType: BuildModeFieldType) => {
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