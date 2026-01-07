import React, { useRef, useEffect, useState } from "react";
import styles from "./ContextToolbar.module.css";
import {
  Trash,
  Copy,
  User,
  Lock,
  LockOpen,
  DotsThree,
} from "@phosphor-icons/react";

export interface ContextToolbarProps {
  /** Position relative to the selected element */
  targetRect: DOMRect | null;
  /** Container element for positioning calculations */
  containerRef?: React.RefObject<HTMLElement>;
  /** Whether the toolbar is visible */
  isVisible: boolean;
  /** Callback for delete action */
  onDelete?: () => void;
  /** Callback for duplicate action */
  onDuplicate?: () => void;
  /** Callback for assign action */
  onAssign?: () => void;
  /** Callback for lock/unlock toggle */
  onToggleLock?: () => void;
  /** Whether the field is locked */
  isLocked?: boolean;
  /** Additional actions */
  additionalActions?: React.ReactNode;
  /** Participants for assignment */
  participants?: { id: string; label: string }[];
  /** Currently assigned participant */
  assignedParticipant?: string;
}

type Position = "top" | "bottom";

export const ContextToolbar: React.FC<ContextToolbarProps> = ({
  targetRect,
  containerRef,
  isVisible,
  onDelete,
  onDuplicate,
  onAssign,
  onToggleLock,
  isLocked = false,
  additionalActions,
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>("top");
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Calculate position based on target element
  useEffect(() => {
    if (!isVisible || !targetRect || !toolbarRef.current) return;

    const toolbar = toolbarRef.current;
    const toolbarRect = toolbar.getBoundingClientRect();
    const containerRect = containerRef?.current?.getBoundingClientRect();

    // Calculate horizontal center
    let x = targetRect.left + targetRect.width / 2 - toolbarRect.width / 2;

    // Calculate vertical position (prefer top, fallback to bottom)
    const spaceAbove = containerRect
      ? targetRect.top - containerRect.top
      : targetRect.top;
    const spaceBelow = containerRect
      ? containerRect.bottom - targetRect.bottom
      : window.innerHeight - targetRect.bottom;

    const toolbarHeight = toolbarRect.height + 8; // 8px gap

    let y: number;
    let pos: Position;

    if (spaceAbove >= toolbarHeight || spaceAbove > spaceBelow) {
      // Position above
      y = targetRect.top - toolbarHeight;
      pos = "top";
    } else {
      // Position below
      y = targetRect.bottom + 8;
      pos = "bottom";
    }

    // Constrain to viewport/container
    const minX = containerRect ? containerRect.left + 8 : 8;
    const maxX = containerRect
      ? containerRect.right - toolbarRect.width - 8
      : window.innerWidth - toolbarRect.width - 8;
    const minY = containerRect ? containerRect.top + 8 : 8;
    const maxY = containerRect
      ? containerRect.bottom - toolbarRect.height - 8
      : window.innerHeight - toolbarRect.height - 8;

    x = Math.max(minX, Math.min(maxX, x));
    y = Math.max(minY, Math.min(maxY, y));

    setCoords({ x, y });
    setPosition(pos);
  }, [isVisible, targetRect, containerRef]);

  // Close more menu when clicking outside
  useEffect(() => {
    if (!showMoreMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        toolbarRef.current &&
        !toolbarRef.current.contains(e.target as Node)
      ) {
        setShowMoreMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMoreMenu]);

  if (!isVisible || !targetRect) return null;

  return (
    <div
      ref={toolbarRef}
      className={`${styles.toolbar} ${styles[position]}`}
      style={{
        left: coords.x,
        top: coords.y,
      }}
      role="toolbar"
      aria-label="Field actions"
    >
      {/* Duplicate */}
      {onDuplicate && (
        <button
          type="button"
          className={styles.button}
          onClick={onDuplicate}
          title="Duplicate (Ctrl+D)"
        >
          <Copy weight="bold" size={16} />
        </button>
      )}

      {/* Assign */}
      {onAssign && (
        <button
          type="button"
          className={styles.button}
          onClick={onAssign}
          title="Assign to participant"
        >
          <User weight="bold" size={16} />
        </button>
      )}

      {/* Lock/Unlock */}
      {onToggleLock && (
        <button
          type="button"
          className={`${styles.button} ${isLocked ? styles.active : ""}`}
          onClick={onToggleLock}
          title={isLocked ? "Unlock field" : "Lock field"}
        >
          {isLocked ? (
            <Lock weight="bold" size={16} />
          ) : (
            <LockOpen weight="bold" size={16} />
          )}
        </button>
      )}

      {/* Additional actions */}
      {additionalActions}

      {/* Divider */}
      <div className={styles.divider} />

      {/* Delete */}
      {onDelete && (
        <button
          type="button"
          className={`${styles.button} ${styles.danger}`}
          onClick={onDelete}
          title="Delete (Backspace)"
        >
          <Trash weight="bold" size={16} />
        </button>
      )}

      {/* More menu */}
      <div className={styles.moreWrapper}>
        <button
          type="button"
          className={styles.button}
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          aria-expanded={showMoreMenu}
          title="More options"
        >
          <DotsThree weight="bold" size={16} />
        </button>

        {showMoreMenu && (
          <div className={styles.moreMenu}>
            <button type="button" className={styles.menuItem}>
              <span>Bring to front</span>
              <span className={styles.shortcut}>⌘]</span>
            </button>
            <button type="button" className={styles.menuItem}>
              <span>Send to back</span>
              <span className={styles.shortcut}>⌘[</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContextToolbar;


