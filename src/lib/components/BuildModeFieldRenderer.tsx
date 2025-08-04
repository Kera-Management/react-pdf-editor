import React from "react";
import { BuildModeField } from "../PDFEditor";
import styles from "./BuildModeFieldRenderer.module.css";

interface BuildModeFieldRendererProps {
  field: BuildModeField;
  scale: number;
  isSelected: boolean;
  onSelect: (fieldId: string) => void;
  onDoubleClick?: (fieldId: string) => void;
  onDelete: (fieldId: string) => void;
  onMove: (fieldId: string, x: number, y: number) => void;
  onResize: (fieldId: string, width: number, height: number) => void;
}

export const BuildModeFieldRenderer: React.FC<BuildModeFieldRendererProps> = ({
  field,
  scale,
  isSelected,
  onSelect,
  onDoubleClick,
  onDelete,
  onMove
}) => {
  const fieldStyle: React.CSSProperties = {
    position: "absolute",
    left: field.x * scale,
    top: field.y * scale, // Use direct y positioning since we store in top-left coordinates
    width: field.width * scale,
    height: field.height * scale,
    cursor: "move",
    zIndex: 1000,
    boxSizing: "border-box",
    // Add selection outline that doesn't interfere with input borders
    outline: isSelected ? "2px solid #007bff" : "none",
    outlineOffset: isSelected ? "2px" : "0",
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(field.id);
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startFieldX = field.x;
    const startFieldY = field.y;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = (e.clientX - startX) / scale;
      const deltaY = (e.clientY - startY) / scale; // Direct Y for top-left coordinates
      onMove(field.id, startFieldX + deltaX, startFieldY + deltaY);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Delete" && isSelected) {
      onDelete(field.id);
    }
  };

  const renderFieldPreview = () => {
    const baseInputStyle: React.CSSProperties = {
      width: "100%",
      height: "100%",
      borderTop: "0px",
      borderLeft: "0px", 
      borderRight: "0px",
      borderBottom: "1px solid #000",
      backgroundColor: "rgb(242, 244, 254)",
      fontSize: Math.max(8, (field.properties.fontSize || 12) * scale * 0.75),
      padding: "0",
      margin: "0",
      boxSizing: "border-box",
      pointerEvents: "none",
      outline: "none",
    };

    switch (field.type) {
      case "text":
        return (
          <input
            type="text"
            value={field.properties.placeholder || ""}
            style={baseInputStyle}
            readOnly
          />
        );
      case "multiline":
        return (
          <textarea
            value={field.properties.placeholder || ""}
            style={{
              ...baseInputStyle,
              resize: "none",
              fontFamily: "inherit",
            }}
            readOnly
          />
        );
      case "checkbox":
        return (
          <input
            type="checkbox"
            style={{
              ...baseInputStyle,
              width: "auto",
              height: "auto",
              margin: "auto",
            }}
            readOnly
          />
        );
      case "dropdown":
        return (
          <select
            style={baseInputStyle}
            disabled
          >
            <option>{field.properties.defaultValue || "Select..."}</option>
          </select>
        );
      case "radio":
        return (
          <div style={{
            ...baseInputStyle,
            display: "flex",
            alignItems: "center",
            padding: "2px 4px",
          }}>
            <input
              type="radio"
              style={{ margin: 0, marginRight: "4px" }}
              readOnly
            />
            <span style={{ fontSize: "inherit" }}>{field.name}</span>
          </div>
        );
      case "signature":
        return (
          <input
            type="text"
            value="[Signature]"
            style={{
              ...baseInputStyle,
              fontStyle: "italic",
              textAlign: "center",
            }}
            readOnly
          />
        );
      default:
        return (
          <input
            type="text"
            value={field.name}
            style={baseInputStyle}
            readOnly
          />
        );
    }
  };

  return (
    <div
      className={`${styles.buildField} ${isSelected ? styles.selected : ""}`}
      style={fieldStyle}
      onMouseDown={handleMouseDown}
      onDoubleClick={() => onDoubleClick?.(field.id)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {renderFieldPreview()}
      {isSelected && (
        <div className={styles.fieldControls}>
          <button
            className={styles.deleteButton}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(field.id);
            }}
            title="Delete field"
          >
            ×
          </button>
          <div className={styles.fieldInfo}>
            {field.name}
          </div>
        </div>
      )}
      {isSelected && (
        <>
          {/* Resize handles */}
          <div className={`${styles.resizeHandle} ${styles.bottomRight}`} />
          <div className={`${styles.resizeHandle} ${styles.bottomLeft}`} />
          <div className={`${styles.resizeHandle} ${styles.topRight}`} />
          <div className={`${styles.resizeHandle} ${styles.topLeft}`} />
        </>
      )}
    </div>
  );
};

export default BuildModeFieldRenderer;