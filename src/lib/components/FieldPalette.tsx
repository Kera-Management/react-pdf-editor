import React, { useEffect, useState } from "react";
import { BuildModeField, BuildModeFieldType } from "../PDFEditor";
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
  selectedField: BuildModeField | null;
  onUpdateField: (fieldId: string, updates: Partial<BuildModeField>) => void;
  onCloseEditor: () => void;
  onDeleteField: (fieldId: string) => void;
  participants?: { id: string; label: string; role?: "landlord" | "tenant" }[];
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
  selectedField,
  onUpdateField,
  onCloseEditor,
  onDeleteField,
  participants,
}) => {
  const [editingField, setEditingField] = useState<BuildModeField | null>(
    selectedField
  );

  useEffect(() => {
    setEditingField(selectedField);
  }, [selectedField]);
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

  if (editingField) {
    const handleInput = (
      key: keyof BuildModeField | string,
      value: unknown
    ) => {
      if (!editingField) return;
      if (key.startsWith("properties.")) {
        const propKey = key.replace("properties.", "");
        const updated: BuildModeField = {
          ...editingField,
          properties: {
            ...editingField.properties,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            [propKey as any]: value,
          },
        };
        setEditingField(updated);
        onUpdateField(editingField.id, updated);
      } else {
        const updated = { ...editingField, [key]: value } as BuildModeField;
        setEditingField(updated);
        onUpdateField(editingField.id, updated);
      }
    };

    const handleOptionChange = (
      index: number,
      field: "exportValue" | "displayValue",
      value: string
    ) => {
      if (!editingField.properties.options) return;
      const options = [...editingField.properties.options];
      options[index] = { ...options[index], [field]: value };
      handleInput("properties.options", options);
    };

    const addOption = () => {
      const options = [...(editingField.properties.options || [])];
      options.push({
        exportValue: `option${options.length + 1}`,
        displayValue: `Option ${options.length + 1}`,
      });
      handleInput("properties.options", options);
    };

    const removeOption = (index: number) => {
      if (!editingField.properties.options) return;
      const options = editingField.properties.options.filter(
        (_, i) => i !== index
      );
      handleInput("properties.options", options);
    };

    return (
      <div className={styles.palette}>
        <div className={styles.header}>
          <h3>Edit Field</h3>
          <p>
            {editingField.type.toUpperCase()} • Page {editingField.page + 1}
          </p>
        </div>
        <div className={styles.editorContent}>
          <label className={styles.label}>
            <span>Field Name</span>
            <input
              type="text"
              value={editingField.name}
              onChange={(e) => handleInput("name", e.target.value)}
              className={styles.input}
            />
          </label>
          <div className={styles.row2}>
            <label className={styles.label}>
              <span>X</span>
              <input
                type="number"
                value={Math.round(editingField.x)}
                onChange={(e) =>
                  handleInput("x", parseFloat(e.target.value) || 0)
                }
                className={styles.input}
              />
            </label>
            <label className={styles.label}>
              <span>Y</span>
              <input
                type="number"
                value={Math.round(editingField.y)}
                onChange={(e) =>
                  handleInput("y", parseFloat(e.target.value) || 0)
                }
                className={styles.input}
              />
            </label>
            <label className={styles.label}>
              <span>Width</span>
              <input
                type="number"
                value={Math.round(editingField.width)}
                onChange={(e) =>
                  handleInput("width", parseFloat(e.target.value) || 20)
                }
                className={styles.input}
              />
            </label>
            <label className={styles.label}>
              <span>Height</span>
              <input
                type="number"
                value={Math.round(editingField.height)}
                onChange={(e) =>
                  handleInput("height", parseFloat(e.target.value) || 20)
                }
                className={styles.input}
              />
            </label>
          </div>

          <label className={styles.label}>
            <span>Font Size</span>
            <input
              type="number"
              min={6}
              max={72}
              value={editingField.properties.fontSize || 12}
              onChange={(e) =>
                handleInput(
                  "properties.fontSize",
                  parseFloat(e.target.value) || 12
                )
              }
              className={styles.input}
            />
          </label>

          {(editingField.type === "text" ||
            editingField.type === "multiline") && (
            <>
              <label className={styles.label}>
                <span>Placeholder</span>
                <input
                  type="text"
                  value={editingField.properties.placeholder || ""}
                  onChange={(e) =>
                    handleInput("properties.placeholder", e.target.value)
                  }
                  className={styles.input}
                />
              </label>
              <label className={styles.label}>
                <span>Default Value</span>
                <input
                  type="text"
                  value={editingField.properties.defaultValue || ""}
                  onChange={(e) =>
                    handleInput("properties.defaultValue", e.target.value)
                  }
                  className={styles.input}
                />
              </label>
            </>
          )}

          {(editingField.type === "dropdown" ||
            editingField.type === "radio") && (
            <div className={styles.editorContent}>
              <div className={styles.actions}>
                <span>Options</span>
                <button type="button" onClick={addOption}>
                  + Add
                </button>
              </div>
              {(editingField.properties.options || []).map((opt, idx) => (
                <div key={idx} className={styles.row3}>
                  <input
                    type="text"
                    placeholder="Display value"
                    value={opt.displayValue}
                    onChange={(e) =>
                      handleOptionChange(idx, "displayValue", e.target.value)
                    }
                    className={styles.input}
                  />
                  <input
                    type="text"
                    placeholder="Export value"
                    value={opt.exportValue}
                    onChange={(e) =>
                      handleOptionChange(idx, "exportValue", e.target.value)
                    }
                    className={styles.input}
                  />
                  <button type="button" onClick={() => removeOption(idx)}>
                    −
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Assignment */}
          {participants && participants.length > 0 && (
            <div className={styles.editorContent}>
              <label className={styles.label}>
                <span>Assignees</span>
                <select
                  multiple
                  value={editingField.properties.assignees || []}
                  onChange={(e) =>
                    handleInput(
                      "properties.assignees",
                      Array.from(e.target.selectedOptions).map((o) => o.value)
                    )
                  }
                  className={styles.input}
                >
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={editingField.properties.required || false}
              onChange={(e) =>
                handleInput("properties.required", e.target.checked)
              }
            />
            <span>Required field</span>
          </label>

          <div className={styles.actions}>
            <button type="button" onClick={onCloseEditor}>
              Back
            </button>
            <button
              type="button"
              onClick={() => onDeleteField(editingField.id)}
              style={{ color: "#b00020" }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

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
