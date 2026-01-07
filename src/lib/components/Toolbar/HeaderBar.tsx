import React from "react";
import styles from "./HeaderBar.module.css";
import {
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  FloppyDisk,
  List,
  Spinner,
} from "@phosphor-icons/react";
import { PDFEditorMode } from "../../PDFEditor";

export interface HeaderBarProps {
  /** Current editor mode */
  mode: PDFEditorMode;
  /** Callback when mode changes */
  onModeChange?: (mode: PDFEditorMode) => void;
  /** Current zoom percentage */
  zoomPercentage: number;
  /** Callback for zoom in */
  onZoomIn: () => void;
  /** Callback for zoom out */
  onZoomOut: () => void;
  /** Whether zoom in is disabled */
  zoomInDisabled?: boolean;
  /** Whether zoom out is disabled */
  zoomOutDisabled?: boolean;
  /** Callback for save action */
  onSave: () => void;
  /** Whether save is in progress */
  isSaving?: boolean;
  /** Document title */
  title?: string;
  /** Current page number */
  currentPage?: number;
  /** Total pages */
  totalPages?: number;
  /** Whether on mobile */
  isMobile?: boolean;
  /** Toggle left panel (mobile) */
  onToggleLeftPanel?: () => void;
}

const modeLabels: Record<PDFEditorMode, string> = {
  build: "Build",
  edit: "Edit",
  view: "View",
};

const modeDescriptions: Record<PDFEditorMode, string> = {
  build: "Add and arrange form fields",
  edit: "Fill out and sign the document",
  view: "Read-only preview",
};

export const HeaderBar: React.FC<HeaderBarProps> = ({
  mode,
  onModeChange,
  zoomPercentage,
  onZoomIn,
  onZoomOut,
  zoomInDisabled,
  zoomOutDisabled,
  onSave,
  isSaving,
  title,
  currentPage,
  totalPages,
  isMobile,
  onToggleLeftPanel,
}) => {
  const [modeMenuOpen, setModeMenuOpen] = React.useState(false);
  const modeButtonRef = React.useRef<HTMLButtonElement>(null);

  const handleModeSelect = (newMode: PDFEditorMode) => {
    onModeChange?.(newMode);
    setModeMenuOpen(false);
  };

  // Close mode menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        modeMenuOpen &&
        modeButtonRef.current &&
        !modeButtonRef.current.contains(e.target as Node)
      ) {
        setModeMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [modeMenuOpen]);

  return (
    <header className={styles.header}>
      {/* Left section */}
      <div className={styles.left}>
        {isMobile && onToggleLeftPanel && (
          <button
            type="button"
            className={styles.iconButton}
            onClick={onToggleLeftPanel}
            aria-label="Toggle menu"
          >
            <List weight="bold" size={20} />
          </button>
        )}

        {/* Mode Selector */}
        <div className={styles.modeSelector}>
          {modeMenuOpen && (
            <div className={styles.modeMenu} role="listbox">
              {(Object.keys(modeLabels) as PDFEditorMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`${styles.modeOption} ${
                    m === mode ? styles.active : ""
                  }`}
                  onClick={() => handleModeSelect(m)}
                  role="option"
                  aria-selected={m === mode}
                >
                  <span className={styles.modeIndicator} data-mode={m} />
                  <div className={styles.modeOptionText}>
                    <span className={styles.modeOptionLabel}>
                      {modeLabels[m]}
                    </span>
                    <span className={styles.modeOptionDesc}>
                      {modeDescriptions[m]}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Document title */}
        {title && !isMobile && <span className={styles.title}>{title}</span>}
      </div>

      {/* Center section - Page indicator */}
      <div className={styles.center}>
        {currentPage !== undefined && totalPages !== undefined && (
          <span className={styles.pageIndicator}>
            {currentPage} / {totalPages}
          </span>
        )}
      </div>

      {/* Right section */}
      <div className={styles.right}>
        {/* Zoom controls */}
        <div className={styles.zoomControls}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onZoomOut}
            disabled={zoomOutDisabled}
            aria-label="Zoom out"
          >
            <MagnifyingGlassMinus weight="bold" size={18} />
          </button>
          <span className={styles.zoomValue}>{zoomPercentage}%</span>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onZoomIn}
            disabled={zoomInDisabled}
            aria-label="Zoom in"
          >
            <MagnifyingGlassPlus weight="bold" size={18} />
          </button>
        </div>

        {/* Save button */}
        <button
          type="button"
          className={styles.saveButton}
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <Spinner size={18} className={styles.spinning} />
          ) : (
            <FloppyDisk weight="bold" size={18} />
          )}
          {!isMobile && <span>Save</span>}
        </button>
      </div>
    </header>
  );
};

export default HeaderBar;
