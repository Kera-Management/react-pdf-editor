import React, { useState, useCallback } from "react";
import { BuildModeField, BuildModeFieldType } from "../../PDFEditor";
import styles from "./PropertiesPanel.module.css";
import {
  Trash,
  TextAa,
  CheckSquare,
  RowsPlusBottom,
  RadioButton,
  Signature,
  TextAlignJustify,
  Plus,
  X,
} from "@phosphor-icons/react";

interface PropertiesPanelProps {
  /** Currently selected field */
  selectedField: BuildModeField | null;
  /** Callback when field is updated */
  onUpdateField: (fieldId: string, updates: Partial<BuildModeField>) => void;
  /** Callback when field is deleted */
  onDeleteField: (fieldId: string) => void;
  /** Callback to close the panel */
  onClose: () => void;
  /** Available participants for assignment */
  participants?: { id: string; label: string; role?: string }[];
}

const fieldTypeIcons: Record<BuildModeFieldType, React.ReactNode> = {
  text: <TextAa weight="duotone" size={16} />,
  multiline: <TextAlignJustify weight="duotone" size={16} />,
  checkbox: <CheckSquare weight="duotone" size={16} />,
  dropdown: <RowsPlusBottom weight="duotone" size={16} />,
  radio: <RadioButton weight="duotone" size={16} />,
  signature: <Signature weight="duotone" size={16} />,
};

const fieldTypeLabels: Record<BuildModeFieldType, string> = {
  text: "Text Field",
  multiline: "Text Area",
  checkbox: "Checkbox",
  dropdown: "Dropdown",
  radio: "Radio Button",
  signature: "Signature",
};

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedField,
  onUpdateField,
  onDeleteField,
  onClose,
  participants = [],
}) => {
  const [newOption, setNewOption] = useState("");

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (selectedField) {
        onUpdateField(selectedField.id, { name: e.target.value });
      }
    },
    [selectedField, onUpdateField]
  );

  const handleRequiredChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (selectedField) {
        onUpdateField(selectedField.id, {
          properties: {
            ...selectedField.properties,
            required: e.target.checked,
          },
        });
      }
    },
    [selectedField, onUpdateField]
  );

  const handlePlaceholderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (selectedField) {
        onUpdateField(selectedField.id, {
          properties: {
            ...selectedField.properties,
            placeholder: e.target.value,
          },
        });
      }
    },
    [selectedField, onUpdateField]
  );

  const handleSizeChange = useCallback(
    (dimension: "width" | "height", value: string) => {
      if (selectedField) {
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue) && numValue > 0) {
          onUpdateField(selectedField.id, { [dimension]: numValue });
        }
      }
    },
    [selectedField, onUpdateField]
  );

  const handleAssignmentChange = useCallback(
    (participantId: string, checked: boolean) => {
      if (selectedField) {
        const currentAssignments =
          selectedField.properties.assignees || [];
        const newAssignments = checked
          ? [...currentAssignments, participantId]
          : currentAssignments.filter((id: string) => id !== participantId);
        onUpdateField(selectedField.id, {
          properties: {
            ...selectedField.properties,
            assignees: newAssignments,
          },
        });
      }
    },
    [selectedField, onUpdateField]
  );

  const handleAddOption = useCallback(() => {
    if (selectedField && newOption.trim()) {
      const currentOptions = selectedField.properties.options || [];
      const newOptionItem = {
        exportValue: newOption.trim().toLowerCase().replace(/\s+/g, "_"),
        displayValue: newOption.trim(),
      };
      onUpdateField(selectedField.id, {
        properties: {
          ...selectedField.properties,
          options: [...currentOptions, newOptionItem],
        },
      });
      setNewOption("");
    }
  }, [selectedField, newOption, onUpdateField]);

  const handleRemoveOption = useCallback(
    (index: number) => {
      if (selectedField) {
        const currentOptions = selectedField.properties.options || [];
        onUpdateField(selectedField.id, {
          properties: {
            ...selectedField.properties,
            options: currentOptions.filter((_, i) => i !== index),
          },
        });
      }
    },
    [selectedField, onUpdateField]
  );

  if (!selectedField) {
    return (
      <div className={styles.empty}>
        <p>Select a field to edit its properties</p>
      </div>
    );
  }

  const needsOptions =
    selectedField.type === "dropdown" || selectedField.type === "radio";

  return (
    <div className={styles.panel}>
      {/* Field Type Header */}
      <div className={styles.header}>
        <div className={styles.fieldType}>
          <span className={styles.fieldTypeIcon}>
            {fieldTypeIcons[selectedField.type]}
          </span>
          <span>{fieldTypeLabels[selectedField.type]}</span>
        </div>
        <button
          type="button"
          className={styles.deleteButton}
          onClick={() => onDeleteField(selectedField.id)}
          title="Delete field"
        >
          <Trash weight="bold" size={16} />
        </button>
      </div>

      {/* Properties Form */}
      <div className={styles.form}>
        {/* Field Name */}
        <div className={styles.formGroup}>
          <label className={styles.label}>Field Name</label>
          <input
            type="text"
            className={styles.input}
            value={selectedField.name}
            onChange={handleNameChange}
            placeholder="Enter field name"
          />
        </div>

        {/* Placeholder (for text fields) */}
        {(selectedField.type === "text" ||
          selectedField.type === "multiline") && (
          <div className={styles.formGroup}>
            <label className={styles.label}>Placeholder</label>
            <input
              type="text"
              className={styles.input}
              value={selectedField.properties.placeholder || ""}
              onChange={handlePlaceholderChange}
              placeholder="Enter placeholder text"
            />
          </div>
        )}

        {/* Options (for dropdown/radio) */}
        {needsOptions && (
          <div className={styles.formGroup}>
            <label className={styles.label}>Options</label>
            <div className={styles.optionsList}>
              {(selectedField.properties.options || []).map((option, index) => (
                <div key={index} className={styles.optionItem}>
                  <span>{option.displayValue}</span>
                  <button
                    type="button"
                    className={styles.optionRemove}
                    onClick={() => handleRemoveOption(index)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <div className={styles.addOption}>
                <input
                  type="text"
                  className={styles.input}
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  placeholder="Add option"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddOption();
                    }
                  }}
                />
                <button
                  type="button"
                  className={styles.addButton}
                  onClick={handleAddOption}
                  disabled={!newOption.trim()}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Size */}
        <div className={styles.formGroup}>
          <label className={styles.label}>Size</label>
          <div className={styles.sizeInputs}>
            <div className={styles.sizeField}>
              <span className={styles.sizeLabel}>W</span>
              <input
                type="number"
                className={styles.sizeInput}
                value={Math.round(selectedField.width)}
                onChange={(e) => handleSizeChange("width", e.target.value)}
                min={20}
              />
            </div>
            <div className={styles.sizeField}>
              <span className={styles.sizeLabel}>H</span>
              <input
                type="number"
                className={styles.sizeInput}
                value={Math.round(selectedField.height)}
                onChange={(e) => handleSizeChange("height", e.target.value)}
                min={20}
              />
            </div>
          </div>
        </div>

        {/* Required */}
        <div className={styles.formGroup}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={selectedField.properties.required || false}
              onChange={handleRequiredChange}
            />
            <span className={styles.checkmark} />
            <span>Required field</span>
          </label>
        </div>

        {/* Assignment */}
        {participants.length > 0 && (
          <div className={styles.formGroup}>
            <label className={styles.label}>Assign to</label>
            <div className={styles.participantList}>
              {participants.map((participant) => {
                const isAssigned = (
                  selectedField.properties.assignees || []
                ).includes(participant.id);
                return (
                  <label key={participant.id} className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={isAssigned}
                      onChange={(e) =>
                        handleAssignmentChange(participant.id, e.target.checked)
                      }
                    />
                    <span className={styles.checkmark} />
                    <span>{participant.label}</span>
                    {participant.role && (
                      <span className={styles.role}>{participant.role}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PropertiesPanel;

