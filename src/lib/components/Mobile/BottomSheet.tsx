import React, { useRef, useState, useCallback, useEffect } from "react";
import styles from "./BottomSheet.module.css";

export type SnapPoint = "collapsed" | "partial" | "full";

export interface BottomSheetProps {
  /** Sheet content */
  children: React.ReactNode;
  /** Whether the sheet is open */
  isOpen: boolean;
  /** Callback when sheet is closed */
  onClose: () => void;
  /** Current snap point */
  snapPoint?: SnapPoint;
  /** Callback when snap point changes */
  onSnapChange?: (snap: SnapPoint) => void;
  /** Title shown in header */
  title?: string;
  /** Whether to show backdrop */
  showBackdrop?: boolean;
  /** Whether the sheet can be dismissed by dragging */
  dismissible?: boolean;
}

const SNAP_HEIGHTS: Record<SnapPoint, string> = {
  collapsed: "var(--bottom-sheet-snap-collapsed)",
  partial: "var(--bottom-sheet-snap-partial)",
  full: "var(--bottom-sheet-snap-full)",
};

const VELOCITY_THRESHOLD = 0.5;
const DRAG_THRESHOLD = 50;

export const BottomSheet: React.FC<BottomSheetProps> = ({
  children,
  isOpen,
  onClose,
  snapPoint = "partial",
  onSnapChange,
  title,
  showBackdrop = true,
  dismissible = true,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [startY, setStartY] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [, setCurrentHeight] = useState<number | null>(null);

  // Handle drag start
  const handleDragStart = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      setStartY(clientY);
      setStartTime(Date.now());
      setIsDragging(true);
      setCurrentHeight(sheetRef.current?.offsetHeight || null);
    },
    []
  );

  // Handle drag move
  const handleDragMove = useCallback(
    (e: TouchEvent | MouseEvent) => {
      if (!isDragging) return;

      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const delta = clientY - startY;
      setDragY(delta);
    },
    [isDragging, startY]
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;

    const elapsed = Date.now() - startTime;
    const velocity = dragY / elapsed;

    // Determine new snap point based on drag distance and velocity
    let newSnap: SnapPoint = snapPoint;

    if (Math.abs(velocity) > VELOCITY_THRESHOLD) {
      // Fast swipe
      if (velocity > 0) {
        // Swipe down
        if (snapPoint === "full") newSnap = "partial";
        else if (snapPoint === "partial") newSnap = dismissible ? "collapsed" : "partial";
        else if (dismissible) onClose();
      } else {
        // Swipe up
        if (snapPoint === "collapsed") newSnap = "partial";
        else if (snapPoint === "partial") newSnap = "full";
      }
    } else if (Math.abs(dragY) > DRAG_THRESHOLD) {
      // Slow drag
      if (dragY > 0) {
        // Drag down
        if (snapPoint === "full") newSnap = "partial";
        else if (snapPoint === "partial" && dismissible) newSnap = "collapsed";
        else if (snapPoint === "collapsed" && dismissible) onClose();
      } else {
        // Drag up
        if (snapPoint === "collapsed") newSnap = "partial";
        else if (snapPoint === "partial") newSnap = "full";
      }
    }

    if (newSnap !== snapPoint) {
      onSnapChange?.(newSnap);
    }

    setIsDragging(false);
    setDragY(0);
    setCurrentHeight(null);
  }, [isDragging, dragY, snapPoint, startTime, dismissible, onClose, onSnapChange]);

  // Add/remove event listeners
  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleDragMove);
      window.addEventListener("mouseup", handleDragEnd);
      window.addEventListener("touchmove", handleDragMove);
      window.addEventListener("touchend", handleDragEnd);
    }

    return () => {
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchmove", handleDragMove);
      window.removeEventListener("touchend", handleDragEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (isOpen && snapPoint !== "collapsed") {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, snapPoint]);

  if (!isOpen) return null;

  const sheetStyle: React.CSSProperties = {
    height: SNAP_HEIGHTS[snapPoint],
    transform: isDragging ? `translateY(${Math.max(0, dragY)}px)` : undefined,
    transition: isDragging ? "none" : undefined,
  };

  return (
    <>
      {/* Backdrop */}
      {showBackdrop && snapPoint !== "collapsed" && (
        <div
          className={styles.backdrop}
          onClick={dismissible ? onClose : undefined}
          aria-hidden="true"
        />
      )}

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`${styles.sheet} ${styles[snapPoint]}`}
        style={sheetStyle}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Bottom sheet"}
      >
        {/* Handle */}
        <div
          className={styles.handleArea}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          <div className={styles.handle} />
        </div>

        {/* Header */}
        {title && (
          <div className={styles.header}>
            <span className={styles.title}>{title}</span>
          </div>
        )}

        {/* Content */}
        <div className={styles.content}>{children}</div>
      </div>
    </>
  );
};

export default BottomSheet;

