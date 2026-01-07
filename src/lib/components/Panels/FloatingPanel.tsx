import React, { useRef, useState, useCallback, useEffect } from "react";
import styles from "./FloatingPanel.module.css";
import { CaretDown, X, DotsSixVertical } from "@phosphor-icons/react";

export interface FloatingPanelProps {
  /** Unique identifier for the panel */
  id: string;
  /** Panel title shown in header */
  title: string;
  /** Panel content */
  children: React.ReactNode;
  /** Whether the panel is open */
  isOpen?: boolean;
  /** Whether the panel is collapsed (header only) */
  isCollapsed?: boolean;
  /** Position: left or right side */
  side?: "left" | "right";
  /** Whether the panel can be closed */
  closable?: boolean;
  /** Whether the panel can be collapsed */
  collapsible?: boolean;
  /** Whether the panel can be dragged to reposition */
  draggable?: boolean;
  /** Custom width */
  width?: number;
  /** Icon to show in header */
  icon?: React.ReactNode;
  /** Badge count to show */
  badge?: number;
  /** Called when close button is clicked */
  onClose?: () => void;
  /** Called when collapse toggle is clicked */
  onToggleCollapse?: () => void;
  /** Called when panel position changes */
  onPositionChange?: (position: { x: number; y: number }) => void;
  /** Additional class name */
  className?: string;
  /** Header actions */
  headerActions?: React.ReactNode;
}

export const FloatingPanel: React.FC<FloatingPanelProps> = ({
  id,
  title,
  children,
  isOpen = true,
  isCollapsed = false,
  side = "left",
  closable = false,
  collapsible = true,
  draggable = false,
  width,
  icon,
  badge,
  onClose,
  onToggleCollapse,
  onPositionChange,
  className,
  headerActions,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null
  );

  // Handle drag start
  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!draggable) return;

      e.preventDefault();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      const rect = panelRef.current?.getBoundingClientRect();
      if (rect) {
        setDragOffset({
          x: clientX - rect.left,
          y: clientY - rect.top,
        });
        setIsDragging(true);
      }
    },
    [draggable]
  );

  // Handle drag move
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      const newPosition = {
        x: clientX - dragOffset.x,
        y: clientY - dragOffset.y,
      };

      setPosition(newPosition);
    };

    const handleEnd = () => {
      setIsDragging(false);
      if (position) {
        onPositionChange?.(position);
      }
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleMove);
    window.addEventListener("touchend", handleEnd);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging, dragOffset, position, onPositionChange]);

  if (!isOpen) return null;

  const panelStyle: React.CSSProperties = {
    ...(width && { width }),
    ...(position && {
      position: "fixed",
      left: position.x,
      top: position.y,
    }),
  };

  return (
    <div
      ref={panelRef}
      id={id}
      className={`
        ${styles.panel}
        ${styles[side]}
        ${isCollapsed ? styles.collapsed : ""}
        ${isDragging ? styles.dragging : ""}
        ${className || ""}
      `}
      style={panelStyle}
      data-panel-id={id}
    >
      {/* Header */}
      <div
        className={styles.header}
        onMouseDown={draggable ? handleDragStart : undefined}
        onTouchStart={draggable ? handleDragStart : undefined}
      >
        <div className={styles.headerLeft}>
          {draggable && (
            <div className={styles.dragHandle}>
              <DotsSixVertical weight="bold" size={14} />
            </div>
          )}
          {icon && <span className={styles.icon}>{icon}</span>}
          <span className={styles.title}>{title}</span>
          {badge !== undefined && badge > 0 && (
            <span className={styles.badge}>{badge}</span>
          )}
        </div>
        <div className={styles.headerRight}>
          {headerActions}
          {collapsible && (
            <button
              type="button"
              className={`${styles.headerButton} ${styles.collapseButton}`}
              onClick={onToggleCollapse}
              aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}
            >
              <CaretDown
                weight="bold"
                size={14}
                className={isCollapsed ? styles.rotated : ""}
              />
            </button>
          )}
          {closable && (
            <button
              type="button"
              className={styles.headerButton}
              onClick={onClose}
              aria-label="Close panel"
            >
              <X weight="bold" size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && <div className={styles.content}>{children}</div>}
    </div>
  );
};

export default FloatingPanel;



