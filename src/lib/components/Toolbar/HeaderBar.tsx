import React from "react";
import styles from "./HeaderBar.module.css";
import {
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  FloppyDisk,
  List,
  Spinner,
  CaretDown,
  X,
} from "@phosphor-icons/react";
import { PDFEditorMode } from "../../PDFEditor";

export interface HeaderBarProps {
  /** Current editor mode */
  mode: PDFEditorMode;
  /** Callback when mode changes */
  onModeChange?: (mode: PDFEditorMode) => void;
  /** Allowed modes to show in the selector. Defaults to all modes. */
  allowedModes?: PDFEditorMode[];
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
  /** Callback for close action */
  onClose?: () => void;
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

const allModes: PDFEditorMode[] = ["build", "edit", "view"];

export const HeaderBar: React.FC<HeaderBarProps> = ({
  mode,
  onModeChange,
  allowedModes = allModes,
  zoomPercentage,
  onZoomIn,
  onZoomOut,
  zoomInDisabled,
  zoomOutDisabled,
  onSave,
  isSaving,
  onClose,
  title,
  currentPage,
  totalPages,
  isMobile,
  onToggleLeftPanel,
}) => {
  const [modeMenuOpen, setModeMenuOpen] = React.useState(false);
  const modeButtonRef = React.useRef<HTMLDivElement>(null);

  // Filter modes to only show allowed ones
  const availableModes = allModes.filter((m) => allowedModes.includes(m));
  const showModeSelector = availableModes.length > 1;

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
        <div className={styles.modeSelector} ref={modeButtonRef}>
          {showModeSelector ? (
            <>
              <button
                type="button"
                className={styles.modeButton}
                onClick={() => setModeMenuOpen(!modeMenuOpen)}
                aria-haspopup="listbox"
                aria-expanded={modeMenuOpen}
              >
                <span className={styles.modeIndicator} data-mode={mode} />
                <span className={styles.modeLabel}>{modeLabels[mode]}</span>
                <CaretDown
                  size={14}
                  weight="bold"
                  className={modeMenuOpen ? styles.rotated : ""}
                />
              </button>
              {modeMenuOpen && (
                <div className={styles.modeMenu} role="listbox">
                  {availableModes.map((m) => (
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
            </>
          ) : (
            /* Single mode - just show the label without dropdown */
            <div className={styles.modeBadge}>
              <span className={styles.modeIndicator} data-mode={mode} />
              <span className={styles.modeLabel}>{modeLabels[mode]}</span>
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

        {/* Close button */}
        {onClose && (
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            <X weight="bold" size={18} />
          </button>
        )}
      </div>
    </header>
  );
};

export default HeaderBar;
