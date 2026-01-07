import React, { useCallback, useEffect, useRef, useState } from "react";
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
  onTouchDrop?: (fieldType: BuildModeFieldType, clientX: number, clientY: number) => boolean;
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
    icon: <TextAa weight="duotone" />,
    description: "Single line text input",
  },
  {
    type: "multiline",
    label: "Text Area",
    icon: <TextAlignJustify weight="duotone" />,
    description: "Multi-line text input",
  },
  {
    type: "checkbox",
    label: "Checkbox",
    icon: <CheckSquare weight="duotone" />,
    description: "Check/uncheck option",
  },
  {
    type: "dropdown",
    label: "Dropdown",
    icon: <RowsPlusBottom weight="duotone" />,
    description: "Select from dropdown list",
  },
  {
    type: "radio",
    label: "Radio",
    icon: <RadioButton weight="duotone" />,
    description: "Single selection from group",
  },
  {
    type: "signature",
    label: "Signature",
    icon: <Signature weight="duotone" />,
    description: "Digital signature field",
  },
];

export const FieldPalette: React.FC<FieldPaletteProps> = ({
  onFieldDragStart,
  onFieldDragEnd,
  onTouchDrop,
  selectedField,
  onUpdateField,
  onCloseEditor,
  onDeleteField,
  participants,
}) => {
  const [editingField, setEditingField] = useState<BuildModeField | null>(
    selectedField
  );
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const paletteRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const touchCurrentY = useRef<number>(0);
  const isDragging = useRef(false);

  // Check for mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    setEditingField(selectedField);
    // Auto-open drawer on mobile when field is selected
    if (selectedField && isMobile) {
      setIsMobileOpen(true);
    }
  }, [selectedField, isMobile]);

  // Handle touch gestures for swipe to close
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchCurrentY.current = e.touches[0].clientY;
    const deltaY = touchCurrentY.current - touchStartY.current;
    
    if (deltaY > 10) {
      isDragging.current = true;
    }

    if (isDragging.current && paletteRef.current) {
      const translateY = Math.max(0, deltaY);
      paletteRef.current.style.transform = `translateY(calc(100% - 56px + ${translateY}px))`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!paletteRef.current) return;

    const deltaY = touchCurrentY.current - touchStartY.current;
    paletteRef.current.style.transform = "";

    if (isDragging.current && deltaY > 100) {
      setIsMobileOpen(false);
    }

    isDragging.current = false;
  }, []);

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

  // Touch drag state for mobile
  const [touchDragFieldType, setTouchDragFieldType] = useState<BuildModeFieldType | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const dragIndicator = useRef<HTMLDivElement | null>(null);

  // Handle touch start on field item for mobile drag
  const handleFieldTouchStart = useCallback(
    (e: React.TouchEvent, fieldType: BuildModeFieldType) => {
      const touch = e.touches[0];
      touchStartPos.current = { x: touch.clientX, y: touch.clientY };
      setTouchDragFieldType(fieldType);
      onFieldDragStart(fieldType);

      // Create drag indicator element
      const indicator = document.createElement("div");
      indicator.style.cssText = `
        position: fixed;
        z-index: 9999;
        padding: 8px 16px;
        background: var(--color-primary-500, #00b298);
        color: white;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        pointer-events: none;
        transform: translate(-50%, -50%);
        left: ${touch.clientX}px;
        top: ${touch.clientY}px;
      `;
      indicator.textContent = fieldType.charAt(0).toUpperCase() + fieldType.slice(1);
      document.body.appendChild(indicator);
      dragIndicator.current = indicator;
    },
    [onFieldDragStart]
  );

  // Handle touch move for mobile drag
  const handleFieldTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchDragFieldType || !dragIndicator.current) return;

    const touch = e.touches[0];
    dragIndicator.current.style.left = `${touch.clientX}px`;
    dragIndicator.current.style.top = `${touch.clientY}px`;
  }, [touchDragFieldType]);

  // Handle touch end for mobile drop
  const handleFieldTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchDragFieldType) return;

      const touch = e.changedTouches[0];

      // Remove drag indicator
      if (dragIndicator.current) {
        document.body.removeChild(dragIndicator.current);
        dragIndicator.current = null;
      }

      // Try to drop the field
      if (onTouchDrop) {
        const dropped = onTouchDrop(touchDragFieldType, touch.clientX, touch.clientY);
        if (dropped) {
          setIsMobileOpen(false);
        }
      }

      setTouchDragFieldType(null);
      touchStartPos.current = null;
      onFieldDragEnd();
    },
    [touchDragFieldType, onTouchDrop, onFieldDragEnd]
  );

  // Toggle mobile drawer
  const toggleMobileDrawer = () => {
    setIsMobileOpen(!isMobileOpen);
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

    const handleBack = () => {
      onCloseEditor();
      if (isMobile) {
        setIsMobileOpen(false);
      }
    };

    return (
      <div
        ref={paletteRef}
        className={`${styles.palette} ${isMobileOpen ? styles.open : ""}`}
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchMove={isMobile ? handleTouchMove : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
      >
        {/* Mobile drag handle */}
        <div className={styles.dragHandle} onClick={toggleMobileDrawer}>
          <div className={styles.dragBar} />
        </div>

        <div className={styles.header}>
          <h3>Edit Field</h3>
          <p>
            {editingField.type.charAt(0).toUpperCase() + editingField.type.slice(1)} • Page {editingField.page + 1}
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
                  placeholder="Enter placeholder text..."
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
                  placeholder="Enter default value..."
                />
              </label>
            </>
          )}

          {(editingField.type === "dropdown" ||
            editingField.type === "radio") && (
            <div>
              <div className={styles.sectionHeader}>
                <span>Options</span>
                <button
                  type="button"
                  onClick={addOption}
                  className={styles.addButton}
                >
                  + Add Option
                </button>
              </div>
              {(editingField.properties.options || []).map((opt, idx) => (
                <div key={idx} className={styles.row3}>
                  <input
                    type="text"
                    placeholder="Display text"
                    value={opt.displayValue}
                    onChange={(e) =>
                      handleOptionChange(idx, "displayValue", e.target.value)
                    }
                    className={styles.input}
                  />
                  <input
                    type="text"
                    placeholder="Value"
                    value={opt.exportValue}
                    onChange={(e) =>
                      handleOptionChange(idx, "exportValue", e.target.value)
                    }
                    className={styles.input}
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className={styles.removeButton}
                    aria-label="Remove option"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Assignment */}
          {participants && participants.length > 0 && (
            <label className={styles.label}>
              <span>Assignee</span>
              <select
                value={editingField.properties.assignees?.[0] || ""}
                onChange={(e) =>
                  handleInput(
                    "properties.assignees",
                    e.target.value ? [e.target.value] : []
                  )
                }
                className={styles.input}
              >
                <option value="">No assignment</option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} {p.role && `(${p.role})`}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className={styles.checkboxRow}>
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
            <button type="button" onClick={handleBack}>
              ← Back
            </button>
            <button
              type="button"
              onClick={() => onDeleteField(editingField.id)}
              className={styles.deleteButton}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={paletteRef}
      className={`${styles.palette} ${isMobileOpen ? styles.open : ""}`}
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchMove={isMobile ? handleTouchMove : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}
    >
      {/* Mobile drag handle */}
      <div className={styles.dragHandle} onClick={toggleMobileDrawer}>
        <div className={styles.dragBar} />
      </div>

      <div className={styles.header}>
        <h3>Form Fields</h3>
        <p>Drag fields onto the PDF</p>
      </div>
      <div className={styles.fieldGrid}>
        {fieldTypes.map((fieldConfig) => (
          <div
            key={fieldConfig.type}
            className={styles.fieldItem}
            draggable
            onDragStart={(e) => handleDragStart(e, fieldConfig.type)}
            onDragEnd={handleDragEnd}
            onTouchStart={(e) => handleFieldTouchStart(e, fieldConfig.type)}
            onTouchMove={handleFieldTouchMove}
            onTouchEnd={handleFieldTouchEnd}
            title={fieldConfig.description}
          >
            <div className={styles.fieldIcon}>{fieldConfig.icon}</div>
            <div className={styles.fieldLabel}>{fieldConfig.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FieldPalette;
