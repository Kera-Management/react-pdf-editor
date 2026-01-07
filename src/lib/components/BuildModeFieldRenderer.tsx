import React, { useCallback, useRef, useState } from "react";
import { BuildModeField } from "../PDFEditor";
import styles from "./BuildModeFieldRenderer.module.css";

interface BuildModeFieldRendererProps {
  field: BuildModeField;
  scale: number;
  isSelected: boolean;
  onSelect: (fieldId: string) => void;
  onDelete: (fieldId: string) => void;
  onMove: (fieldId: string, x: number, y: number) => void;
  onResize: (fieldId: string, width: number, height: number) => void;
}

type ResizeHandle = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export const BuildModeFieldRenderer: React.FC<BuildModeFieldRendererProps> = ({
  field,
  scale,
  isSelected,
  onSelect,
  onDelete,
  onMove,
  onResize,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const longPressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef<number>(0);

  const fieldStyle: React.CSSProperties = {
    position: "absolute",
    left: field.x * scale,
    top: field.y * scale,
    width: field.width * scale,
    height: field.height * scale,
    cursor: isDragging ? "grabbing" : "move",
    zIndex: isSelected ? 1001 : 1000,
    boxSizing: "border-box",
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(field.id);
  };

  // Double tap detection for mobile
  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    
    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      // Double tap detected - could open property editor
      onSelect(field.id);
    }
    lastTap.current = now;
  }, [field.id, onSelect]);

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startFieldX = field.x;
    const startFieldY = field.y;
    let hasMoved = false;

    setIsDragging(true);

    const handleMouseMove = (e: MouseEvent) => {
      if (!hasMoved) {
        hasMoved = true;
        document.addEventListener('click', preventClick, { capture: true, once: true });
      }
      const deltaX = (e.clientX - startX) / scale;
      const deltaY = (e.clientY - startY) / scale;
      onMove(field.id, startFieldX + deltaX, startFieldY + deltaY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    const preventClick = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Touch drag handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;
    const startFieldX = field.x;
    const startFieldY = field.y;
    let hasMoved = false;

    // Long press to select
    longPressTimeout.current = setTimeout(() => {
      onSelect(field.id);
    }, 500);

    const handleTouchMove = (e: TouchEvent) => {
      // Cancel long press if moving
      if (longPressTimeout.current) {
        clearTimeout(longPressTimeout.current);
        longPressTimeout.current = null;
      }

      const touch = e.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      // Only start dragging after moving 10px
      if (!hasMoved && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
        hasMoved = true;
        setIsDragging(true);
      }

      if (hasMoved) {
        e.preventDefault();
        onMove(field.id, startFieldX + deltaX / scale, startFieldY + deltaY / scale);
      }
    };

    const handleTouchEnd = () => {
      if (longPressTimeout.current) {
        clearTimeout(longPressTimeout.current);
        longPressTimeout.current = null;
      }

      setIsDragging(false);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);

      if (!hasMoved) {
        handleDoubleTap();
        onSelect(field.id);
      }
    };

    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
  }, [field.id, field.x, field.y, scale, onMove, onSelect, handleDoubleTap]);

  // Mouse resize handlers
  const handleResizeMouseDown = (e: React.MouseEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = field.width;
    const startHeight = field.height;
    const startFieldX = field.x;
    const startFieldY = field.y;

    setIsResizing(true);

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = (e.clientX - startX) / scale;
      const deltaY = (e.clientY - startY) / scale;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newX = startFieldX;
      let newY = startFieldY;

      switch (handle) {
        case "bottomRight":
          newWidth = startWidth + deltaX;
          newHeight = startHeight + deltaY;
          break;
        case "bottomLeft":
          newWidth = startWidth - deltaX;
          newHeight = startHeight + deltaY;
          newX = startFieldX + deltaX;
          break;
        case "topRight":
          newWidth = startWidth + deltaX;
          newHeight = startHeight - deltaY;
          newY = startFieldY + deltaY;
          break;
        case "topLeft":
          newWidth = startWidth - deltaX;
          newHeight = startHeight - deltaY;
          newX = startFieldX + deltaX;
          newY = startFieldY + deltaY;
          break;
      }

      // Enforce minimum size
      if (newWidth >= 20 && newHeight >= 20) {
        onResize(field.id, newWidth, newHeight);
        if (handle === "bottomLeft" || handle === "topLeft" || handle === "topRight") {
          onMove(field.id, newX, newY);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Touch resize handlers
  const handleResizeTouchStart = useCallback((e: React.TouchEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    e.preventDefault();

    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;
    const startWidth = field.width;
    const startHeight = field.height;
    const startFieldX = field.x;
    const startFieldY = field.y;

    setIsResizing(true);

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      const deltaX = (touch.clientX - startX) / scale;
      const deltaY = (touch.clientY - startY) / scale;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newX = startFieldX;
      let newY = startFieldY;

      switch (handle) {
        case "bottomRight":
          newWidth = startWidth + deltaX;
          newHeight = startHeight + deltaY;
          break;
        case "bottomLeft":
          newWidth = startWidth - deltaX;
          newHeight = startHeight + deltaY;
          newX = startFieldX + deltaX;
          break;
        case "topRight":
          newWidth = startWidth + deltaX;
          newHeight = startHeight - deltaY;
          newY = startFieldY + deltaY;
          break;
        case "topLeft":
          newWidth = startWidth - deltaX;
          newHeight = startHeight - deltaY;
          newX = startFieldX + deltaX;
          newY = startFieldY + deltaY;
          break;
      }

      // Enforce minimum size
      if (newWidth >= 20 && newHeight >= 20) {
        onResize(field.id, newWidth, newHeight);
        if (handle === "bottomLeft" || handle === "topLeft" || handle === "topRight") {
          onMove(field.id, newX, newY);
        }
      }
    };

    const handleTouchEnd = () => {
      setIsResizing(false);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };

    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
  }, [field.id, field.width, field.height, field.x, field.y, scale, onResize, onMove]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Delete" && isSelected) {
      onDelete(field.id);
    }
    // Arrow key movement
    if (isSelected) {
      const step = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          onMove(field.id, field.x, field.y - step);
          break;
        case "ArrowDown":
          e.preventDefault();
          onMove(field.id, field.x, field.y + step);
          break;
        case "ArrowLeft":
          e.preventDefault();
          onMove(field.id, field.x - step, field.y);
          break;
        case "ArrowRight":
          e.preventDefault();
          onMove(field.id, field.x + step, field.y);
          break;
      }
    }
  };

  const renderFieldPreview = () => {
    const scaledFontSize = Math.max(8, (field.properties.fontSize || 12) * scale * 0.75);

    const baseInputStyle: React.CSSProperties = {
      fontSize: scaledFontSize,
    };

    switch (field.type) {
      case "text":
        return (
          <div className={styles.fieldPreview}>
            <input
              type="text"
              value={field.properties.placeholder || field.name}
              style={baseInputStyle}
              readOnly
            />
          </div>
        );
      case "multiline":
        return (
          <div className={styles.fieldPreview}>
            <textarea
              value={field.properties.placeholder || field.name}
              style={{ ...baseInputStyle, resize: "none" }}
              readOnly
            />
          </div>
        );
      case "checkbox":
        return (
          <div className={styles.fieldPreview}>
            <input type="checkbox" readOnly />
          </div>
        );
      case "dropdown":
        return (
          <div className={styles.fieldPreview}>
            <select style={baseInputStyle} disabled>
              <option>{field.properties.defaultValue || "Select..."}</option>
            </select>
          </div>
        );
      case "radio":
        return (
          <div className={styles.fieldPreview} style={{ display: "flex", alignItems: "center", padding: "4px 8px" }}>
            <input type="radio" readOnly />
            <span style={{ fontSize: scaledFontSize, color: "var(--color-text-tertiary, #78716c)" }}>
              {field.name}
            </span>
          </div>
        );
      case "signature":
        return (
          <div className={styles.signaturePlaceholder}>
            <span style={{ fontSize: scaledFontSize }}>✍ Signature</span>
          </div>
        );
      default:
        return (
          <div className={styles.fieldPreview}>
            <input
              type="text"
              value={field.name}
              style={baseInputStyle}
              readOnly
            />
          </div>
        );
    }
  };

  const getFieldTypeLabel = () => {
    const labels: Record<string, string> = {
      text: "Text",
      multiline: "Area",
      checkbox: "Check",
      dropdown: "Select",
      radio: "Radio",
      signature: "Sign",
    };
    return labels[field.type] || field.type;
  };

  return (
    <div
      className={`${styles.buildField} ${isSelected ? styles.selected : ""} ${isDragging ? styles.isDragging : ""}`}
      style={fieldStyle}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`${field.type} field: ${field.name}`}
      aria-selected={isSelected}
    >
      {renderFieldPreview()}
      
      {isSelected && (
        <div className={styles.fieldControls}>
          <span className={styles.typeBadge}>{getFieldTypeLabel()}</span>
          <span className={styles.fieldInfo}>{field.name}</span>
          <button
            className={styles.deleteButton}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(field.id);
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onDelete(field.id);
            }}
            title="Delete field"
            aria-label="Delete field"
          >
            ×
          </button>
        </div>
      )}
      
      {isSelected && !isResizing && (
        <>
          {/* Corner resize handles */}
          <div
            className={`${styles.resizeHandle} ${styles.bottomRight}`}
            onMouseDown={(e) => handleResizeMouseDown(e, "bottomRight")}
            onTouchStart={(e) => handleResizeTouchStart(e, "bottomRight")}
          />
          <div
            className={`${styles.resizeHandle} ${styles.bottomLeft}`}
            onMouseDown={(e) => handleResizeMouseDown(e, "bottomLeft")}
            onTouchStart={(e) => handleResizeTouchStart(e, "bottomLeft")}
          />
          <div
            className={`${styles.resizeHandle} ${styles.topRight}`}
            onMouseDown={(e) => handleResizeMouseDown(e, "topRight")}
            onTouchStart={(e) => handleResizeTouchStart(e, "topRight")}
          />
          <div
            className={`${styles.resizeHandle} ${styles.topLeft}`}
            onMouseDown={(e) => handleResizeMouseDown(e, "topLeft")}
            onTouchStart={(e) => handleResizeTouchStart(e, "topLeft")}
          />
        </>
      )}
    </div>
  );
};

export default BuildModeFieldRenderer;
