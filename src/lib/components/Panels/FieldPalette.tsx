import React, { useCallback, useRef, useState } from "react";
import { BuildModeField, BuildModeFieldType } from "../../PDFEditor";
import styles from "./FieldPalette.module.css";
import {
  CheckSquare,
  RadioButton,
  RowsPlusBottom,
  Signature,
  TextAa,
  TextAlignJustify,
  DotsSixVertical,
} from "@phosphor-icons/react";

interface FieldPaletteProps {
  onFieldDragStart: (fieldType: BuildModeFieldType) => void;
  onFieldDragEnd: () => void;
  onTouchDrop?: (
    fieldType: BuildModeFieldType,
    clientX: number,
    clientY: number
  ) => boolean;
  selectedField: BuildModeField | null;
  onCloseEditor: () => void;
  isCollapsed?: boolean;
}

interface FieldTypeConfig {
  type: BuildModeFieldType;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
}

const fieldTypes: FieldTypeConfig[] = [
  {
    type: "text",
    label: "Text",
    icon: <TextAa weight="duotone" size={20} />,
    shortcut: "T",
  },
  {
    type: "multiline",
    label: "Text Area",
    icon: <TextAlignJustify weight="duotone" size={20} />,
    shortcut: "A",
  },
  {
    type: "checkbox",
    label: "Checkbox",
    icon: <CheckSquare weight="duotone" size={20} />,
    shortcut: "C",
  },
  {
    type: "dropdown",
    label: "Dropdown",
    icon: <RowsPlusBottom weight="duotone" size={20} />,
    shortcut: "D",
  },
  {
    type: "radio",
    label: "Radio",
    icon: <RadioButton weight="duotone" size={20} />,
    shortcut: "R",
  },
  {
    type: "signature",
    label: "Signature",
    icon: <Signature weight="duotone" size={20} />,
    shortcut: "S",
  },
];

export const FieldPalette: React.FC<FieldPaletteProps> = ({
  onFieldDragStart,
  onFieldDragEnd,
  onTouchDrop,
  isCollapsed = false,
}) => {
  const [activeType, setActiveType] = useState<BuildModeFieldType | null>(null);
  const isDraggingTouch = useRef(false);
  const draggedFieldTypeRef = useRef<BuildModeFieldType | null>(null);

  // Desktop drag handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent, fieldType: BuildModeFieldType) => {
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("fieldType", fieldType);
      setActiveType(fieldType);
      onFieldDragStart(fieldType);
    },
    [onFieldDragStart]
  );

  const handleDragEnd = useCallback(() => {
    setActiveType(null);
    onFieldDragEnd();
  }, [onFieldDragEnd]);

  // Touch drag handlers
  const handleTouchStart = useCallback(
    (e: React.TouchEvent, fieldType: BuildModeFieldType) => {
      e.stopPropagation();
      isDraggingTouch.current = true;
      draggedFieldTypeRef.current = fieldType;
      setActiveType(fieldType);
      onFieldDragStart(fieldType);
    },
    [onFieldDragStart]
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingTouch.current) return;
    e.preventDefault();
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!isDraggingTouch.current || !draggedFieldTypeRef.current) return;

      isDraggingTouch.current = false;
      setActiveType(null);
      onFieldDragEnd();

      const touch = e.changedTouches[0];
      if (touch && onTouchDrop) {
        onTouchDrop(draggedFieldTypeRef.current, touch.clientX, touch.clientY);
      }
      draggedFieldTypeRef.current = null;
    },
    [onFieldDragEnd, onTouchDrop]
  );

  if (isCollapsed) return null;

  return (
    <div className={styles.palette}>
      <div className={styles.fieldList}>
        {fieldTypes.map((field) => (
          <div
            key={field.type}
            className={`${styles.fieldItem} ${activeType === field.type ? styles.active : ""}`}
            draggable
            onDragStart={(e) => handleDragStart(e, field.type)}
            onDragEnd={handleDragEnd}
            onTouchStart={(e) => handleTouchStart(e, field.type)}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            role="button"
            tabIndex={0}
            aria-label={`Add ${field.label} field`}
          >
            <div className={styles.dragIndicator}>
              <DotsSixVertical weight="bold" size={12} />
            </div>
            <div className={styles.fieldIcon}>{field.icon}</div>
            <span className={styles.fieldLabel}>{field.label}</span>
            {field.shortcut && (
              <span className={styles.shortcut}>{field.shortcut}</span>
            )}
          </div>
        ))}
      </div>

      <div className={styles.hint}>
        <span>Drag fields onto the document</span>
      </div>
    </div>
  );
};

export default FieldPalette;



