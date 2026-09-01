import React, { useCallback, useRef, useState } from "react";
import { BuildModeField } from "../PDFEditor";
import { recipientColorVar } from "../colors";
import styles from "./BuildModeFieldRenderer.module.css";

interface FieldParticipant {
  id: string;
  label: string;
  role?: string;
}

interface BuildModeFieldRendererProps {
  field: BuildModeField;
  scale: number;
  isSelected: boolean;
  onSelect: (fieldId: string) => void;
  onDelete: (fieldId: string) => void;
  onMove: (fieldId: string, x: number, y: number) => void;
  onResize: (fieldId: string, width: number, height: number) => void;
  /** Duplicate this field in place (offset a little so it's visibly distinct). */
  onDuplicate?: (fieldId: string) => void;
  /**
   * Duplicate this field onto every OTHER page in the document, same rect.
   * No longer wired to a control here -- ContextToolbar's Duplicate menu
   * ("On every page") drives it. Kept for prop-shape compatibility with
   * existing hosts.
   */
  onDuplicateOnAllPages?: (fieldId: string) => void;
  /**
   * Opens the field's properties (the ContextToolbar's "Edit" action /
   * the field Popover). Fired on double-click, in addition to selecting
   * the field.
   */
  onOpenProperties?: (fieldId: string) => void;
  /**
   * Assignable participants -- used to resolve field.properties.assignees
   * ids to display labels and to pick a stable recipient color (roster
   * order). `role` is a free-form display tag; presentation only.
   */
  participants?: FieldParticipant[];
  /**
   * The FULL, unfiltered participant list. Used only to resolve a display
   * name/color for an assignee id that's fallen out of `participants`
   * (e.g. excluded after fields were assigned to them) -- so a chip keeps
   * showing their name instead of the raw id (audit #1), and the field
   * tints as read-only rather than losing its color entirely. Falls back
   * to `participants` when omitted.
   */
  allParticipants?: FieldParticipant[];
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
  onDuplicate,
  onOpenProperties,
  participants,
  allParticipants,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const longPressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef<number>(0);

  // Roster used for color assignment -- the FULL list when available, so a
  // party's color stays stable even if they later get excluded from
  // `participants`. Falls back to `participants` for hosts not yet on the
  // roster-order contract.
  const roster = allParticipants ?? participants;
  const primaryAssigneeId = field.properties.assignees?.[0];
  const primaryAssigneeIndex = primaryAssigneeId
    ? roster?.findIndex((p) => p.id === primaryAssigneeId) ?? -1
    : -1;
  // Assigned to someone who's fallen out of the assignable list (e.g.
  // excluded after fields were assigned to them) -- still colored, but
  // with the neutral read-only tint rather than their roster color.
  const primaryAssigneeExcluded =
    !!primaryAssigneeId &&
    !!participants &&
    !participants.some((p) => p.id === primaryAssigneeId);
  const tintColor =
    primaryAssigneeId && primaryAssigneeIndex >= 0
      ? primaryAssigneeExcluded
        ? "var(--recipient-readonly)"
        : recipientColorVar(primaryAssigneeIndex)
      : undefined;
  const primaryAssigneeLabel = primaryAssigneeId
    ? roster?.find((p) => p.id === primaryAssigneeId)?.label
    : undefined;
  const initials = primaryAssigneeLabel
    ? primaryAssigneeLabel.trim().slice(0, 2).toUpperCase()
    : undefined;

  const fieldStyle: React.CSSProperties = {
    position: "absolute",
    left: field.x * scale,
    top: field.y * scale,
    width: field.width * scale,
    height: field.height * scale,
    cursor: isDragging ? "grabbing" : "move",
    zIndex: isSelected ? 1001 : 1000,
    boxSizing: "border-box",
    ...(tintColor
      ? ({
          // Local overrides scoped to this field's subtree -- the child
          // `.fieldPreview` reads these same custom property names, so
          // this recolors just this one field without touching the
          // global tokens every other field still uses.
          "--field-border-default": tintColor,
          "--field-border-selected": tintColor,
          "--field-border-hover": tintColor,
          "--field-bg-default": `color-mix(in srgb, ${tintColor} 15%, transparent)`,
          "--field-bg-selected": `color-mix(in srgb, ${tintColor} 25%, transparent)`,
        } as React.CSSProperties)
      : {}),
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(field.id);
  };

  // Opens the field's properties (ContextToolbar's "Edit" / the field
  // Popover), same trigger a desktop user would reach for after a single
  // click already selected the field. `.fieldPreview` has
  // `pointer-events: none` for every field type (text/checkbox/dropdown/
  // radio/signature), so this always lands on the wrapper -- it never
  // fights a double-click into the readOnly preview input/textarea/select
  // stealing focus or triggering native text selection.
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(field.id);
    onOpenProperties?.(field.id);
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
    // Both Delete and Backspace remove the field -- Backspace is the only
    // "delete" key on a Mac keyboard, and the desktop ContextToolbar's
    // Delete button already advertises it.
    if ((e.key === "Delete" || e.key === "Backspace") && isSelected) {
      e.preventDefault();
      onDelete(field.id);
      return;
    }
    // Cmd/Ctrl+D duplicates the selected field on this page -- matches the
    // desktop ContextToolbar's "Duplicate" action.
    if (
      isSelected &&
      (e.metaKey || e.ctrlKey) &&
      e.key.toLowerCase() === "d"
    ) {
      e.preventDefault();
      onDuplicate?.(field.id);
      return;
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

  // With more than one participant, the person placing fields can't tell
  // who a field belongs to without selecting it and opening the
  // properties panel. Resolve assignee ids to labels so it's visible at a
  // glance -- from the assignable list first, then the FULL roster (audit
  // #1: an excluded party's chip used to fall back straight to their raw
  // id, e.g. an email, once they dropped out of `participants`), and only
  // the raw id itself if truly nowhere to be found.
  const assigneeLabels = (field.properties.assignees || []).map(
    (id) =>
      participants?.find((p) => p.id === id)?.label ||
      allParticipants?.find((p) => p.id === id)?.label ||
      id
  );

  const renderAssigneeChips = () => {
    if (assigneeLabels.length === 0) return null;

    // A 16px checkbox can't fit even one label — collapse to a count badge
    // instead of letting the chip row spill outside the field.
    const scaledWidth = field.width * scale;
    const compact = scaledWidth < 50;

    return (
      <div
        className={styles.assigneeChips}
        title={assigneeLabels.join(", ")}
      >
        {compact ? (
          <span className={styles.assigneeChip}>{assigneeLabels.length}</span>
        ) : (
          <>
            {assigneeLabels.slice(0, 2).map((label, index) => (
              <span key={index} className={styles.assigneeChip}>
                {label}
              </span>
            ))}
            {assigneeLabels.length > 2 && (
              <span className={styles.assigneeChip}>
                +{assigneeLabels.length - 2}
              </span>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div
      className={`${styles.buildField} ${isSelected ? styles.selected : ""} ${isDragging ? styles.isDragging : ""}`}
      style={fieldStyle}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onKeyDown={handleKeyDown}
      onFocus={() => onSelect(field.id)}
      tabIndex={0}
      role="button"
      aria-label={`${field.type} field: ${field.name}${
        field.properties.required ? ", required" : ""
      }`}
      aria-selected={isSelected}
    >
      {renderFieldPreview()}
      {renderAssigneeChips()}

      {field.properties.required && (
        <span
          className={styles.requiredIndicator}
          title="Required"
          aria-hidden="true"
        />
      )}

      {initials && !isSelected && (
        <span
          className={styles.colorBadge}
          style={tintColor ? { background: tintColor } : undefined}
          aria-hidden="true"
        >
          {initials}
        </span>
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
