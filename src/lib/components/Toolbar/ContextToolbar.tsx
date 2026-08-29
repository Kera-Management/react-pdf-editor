import React, { useEffect, useRef, useState } from "react";
import styles from "./ContextToolbar.module.css";
import { Trash, Copy, Asterisk, PencilSimple, CaretDown } from "@phosphor-icons/react";
import { positionFloatingElement } from "../shared/positionFloating";
import { fieldTypeIcons } from "../shared/fieldTypeMeta";
import { BuildModeFieldType } from "../../PDFEditor";

/**
 * Identifies the selected field in the toolbar's context chip -- the icon
 * comes from the shared fieldTypeMeta map, the name is whatever the field is
 * currently called.
 */
export interface ContextToolbarFieldContext {
  fieldName: string;
  fieldType: BuildModeFieldType;
}

export interface ContextToolbarProps {
  /** Position relative to the selected element */
  targetRect: DOMRect | null;
  /** Container element for positioning calculations */
  containerRef?: React.RefObject<HTMLElement>;
  /** Whether the toolbar is visible */
  isVisible: boolean;
  /**
   * The selected field's name + type, shown in the leading context chip.
   * The chip (and its trailing divider) simply doesn't render without it,
   * so a host mid-migration to the new contract still gets a working
   * toolbar -- but every host should pass it: it's how a non-tech-savvy
   * user tells which field they're editing.
   */
  context?: ContextToolbarFieldContext;
  /**
   * Transient confirmation text (e.g. "Added to 4 pages") that temporarily
   * replaces the context chip's field name after an action completes. Pass
   * null/undefined (or omit) to show the field name.
   */
  feedbackText?: string | null;
  /** Whether the field is required */
  isRequired?: boolean;
  /** Callback for required toggle */
  onToggleRequired?: () => void;
  /** Callback to open the field's properties (opens the field Popover) */
  onOpenProperties?: () => void;
  /** Duplicate this field in place, on the current page. */
  onDuplicate?: () => void;
  /** Duplicate this field onto every other page in the document. */
  onDuplicateAllPages?: () => void;
  /** Callback for delete action */
  onDelete?: () => void;
  /**
   * Callback for lock/unlock toggle. Accepted for API stability but not
   * wired to any control yet -- no lock button renders.
   */
  onToggleLock?: () => void;
  /** Whether the field is locked. Same status as onToggleLock -- unwired. */
  isLocked?: boolean;
  /** Additional actions, rendered after Duplicate and before Delete. */
  additionalActions?: React.ReactNode;
}

type Position = "top" | "bottom";

// Gap between the target element and the toolbar, in px.
const GAP = 8;

export const ContextToolbar: React.FC<ContextToolbarProps> = ({
  targetRect,
  containerRef,
  isVisible,
  context,
  feedbackText,
  isRequired = false,
  onToggleRequired,
  onOpenProperties,
  onDuplicate,
  onDuplicateAllPages,
  onDelete,
  additionalActions,
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const duplicateGroupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>("top");
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isDuplicateMenuOpen, setIsDuplicateMenuOpen] = useState(false);

  // Calculate position based on target element
  useEffect(() => {
    if (!isVisible || !targetRect || !toolbarRef.current) return;

    const toolbarRect = toolbarRef.current.getBoundingClientRect();
    const containerRect = containerRef?.current?.getBoundingClientRect();

    const result = positionFloatingElement(
      targetRect,
      toolbarRect,
      containerRect,
      GAP
    );

    setCoords({ x: result.x, y: result.y });
    setPosition(result.placement);
  }, [isVisible, targetRect, containerRef]);

  // The duplicate menu belongs to whichever field is currently selected --
  // close it whenever the toolbar hides or re-anchors to a different field,
  // so it never lingers open over the wrong selection.
  useEffect(() => {
    setIsDuplicateMenuOpen(false);
  }, [isVisible, targetRect]);

  // Click-outside and Escape close the duplicate menu.
  useEffect(() => {
    if (!isDuplicateMenuOpen) return undefined;

    const handlePointerDown = (e: MouseEvent) => {
      if (duplicateGroupRef.current?.contains(e.target as Node)) return;
      setIsDuplicateMenuOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsDuplicateMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDuplicateMenuOpen]);

  if (!isVisible || !targetRect) return null;

  // Two distinct duplicate actions only need a menu when BOTH are wired --
  // with just one, the button performs it directly, same as any other
  // single-purpose action in the bar.
  const hasBothDuplicateActions = !!onDuplicate && !!onDuplicateAllPages;
  const showDuplicate = !!(onDuplicate || onDuplicateAllPages);
  const chipText = feedbackText ?? context?.fieldName;

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
      {/* Context chip: type icon + field name (or transient feedback) */}
      {context && (
        <>
          <div className={styles.chip} aria-live="polite">
            <span className={styles.chipIcon} aria-hidden="true">
              {fieldTypeIcons[context.fieldType]}
            </span>
            <span className={styles.chipText}>{chipText}</span>
          </div>

          <div className={styles.divider} aria-hidden="true" />
        </>
      )}

      {/* Required */}
      {onToggleRequired && (
        <button
          type="button"
          className={`${styles.button} ${isRequired ? styles.active : ""}`}
          onClick={onToggleRequired}
          aria-label="Required"
          aria-pressed={isRequired}
        >
          <span className={styles.requiredDot} aria-hidden="true" />
          <Asterisk weight="bold" size={14} aria-hidden="true" />
          <span className={styles.buttonLabel}>Required</span>
        </button>
      )}

      {/* Field properties */}
      {onOpenProperties && (
        <button
          type="button"
          className={styles.button}
          onClick={onOpenProperties}
          aria-label="Edit"
        >
          <PencilSimple weight="bold" size={14} aria-hidden="true" />
          <span className={styles.buttonLabel}>Edit</span>
        </button>
      )}

      {/* Duplicate -- opens a small labeled menu when BOTH duplicate
          actions are wired (the normal, fully-wired case); with just one
          available, the button performs it directly. */}
      {showDuplicate && hasBothDuplicateActions && (
        <div className={styles.duplicateGroup} ref={duplicateGroupRef}>
          <button
            type="button"
            className={styles.button}
            onClick={() => setIsDuplicateMenuOpen((open) => !open)}
            aria-label="Duplicate"
            aria-haspopup="menu"
            aria-expanded={isDuplicateMenuOpen}
          >
            <Copy weight="bold" size={14} aria-hidden="true" />
            <span className={styles.buttonLabel}>Duplicate</span>
            <CaretDown weight="bold" size={10} aria-hidden="true" />
          </button>

          {isDuplicateMenuOpen && (
            <div
              className={styles.menu}
              role="menu"
              aria-label="Duplicate options"
            >
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => {
                  setIsDuplicateMenuOpen(false);
                  onDuplicate?.();
                }}
              >
                On this page
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => {
                  setIsDuplicateMenuOpen(false);
                  onDuplicateAllPages?.();
                }}
              >
                On every page
              </button>
            </div>
          )}
        </div>
      )}

      {showDuplicate && !hasBothDuplicateActions && (
        <button
          type="button"
          className={styles.button}
          onClick={() => (onDuplicate ?? onDuplicateAllPages)?.()}
          aria-label="Duplicate"
        >
          <Copy weight="bold" size={14} aria-hidden="true" />
          <span className={styles.buttonLabel}>Duplicate</span>
        </button>
      )}

      {/* Additional actions */}
      {additionalActions}

      {/* Delete */}
      {onDelete && (
        <>
          <div className={styles.divider} aria-hidden="true" />
          <button
            type="button"
            className={`${styles.button} ${styles.danger}`}
            onClick={onDelete}
            aria-label="Delete"
          >
            <Trash weight="bold" size={14} aria-hidden="true" />
            <span className={styles.buttonLabel}>Delete</span>
          </button>
        </>
      )}
    </div>
  );
};

export default ContextToolbar;
