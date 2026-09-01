import React from "react";
import styles from "./HeaderBar.module.css";
import {
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  FrameCorners,
  ArrowCounterClockwise,
  FloppyDisk,
  DownloadSimple,
  List,
  SidebarSimple,
  Spinner,
  CaretDown,
  Users,
  ListChecks,
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
  /** Callback to fit the document to the available width. */
  onFitZoom?: () => void;
  /** Callback to reset zoom back to 100%. */
  onResetZoom?: () => void;
  /** Callback for save action */
  onSave: () => void;
  /** Whether save is in progress */
  isSaving?: boolean;
  /** Label for the Save button (and its aria-label). Defaults to "Save". */
  saveLabel?: string;
  /**
   * Whether there are unsaved changes. Reflected on the Save button (a
   * small indicator dot) so it's visible before a close/beforeunload guard
   * would otherwise be the first the user hears of it.
   */
  isDirty?: boolean;
  /**
   * Optional callback for a download action. When provided, a Download button
   * is rendered to the left of the Save button.
   */
  onDownload?: () => void;
  /** Whether a download is in progress */
  isDownloading?: boolean;
  /**
   * When provided, a quiet secondary "decline to sign" button renders
   * before Save, edit mode only. The click just opens PDFEditor's built-in
   * confirm -- this callback has no arguments and no busy state of its own.
   */
  onDecline?: () => void;
  /** Label for the decline button. Defaults to "I can't sign this". */
  declineLabel?: string;
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
  /**
   * Mobile-only toggle for the host-injected sidebarPanel's bottom sheet.
   * Rendered only when both are provided — the desktop right sidebar shows
   * that panel unconditionally, so mobile needs its own explicit entry point
   * rather than relying on a mode-specific gesture (e.g. selecting a field).
   */
  onToggleHostPanel?: () => void;
  /** Title of the host-injected panel, used for the toggle button's label. */
  hostPanelTitle?: string;
  /**
   * Mobile-only toggle for the parties/recipients bottom sheet. Rendered
   * only when provided -- own entry point, separate from onToggleHostPanel,
   * so the two mobile sheets never share a single button.
   */
  onToggleParties?: () => void;
  /**
   * Signer's field-completion count, e.g. { completed: 2, total: 5 }. Paired
   * with `onOpenProgress` to render a labeled "2/5" entry point into the
   * progress UI on mobile, edit mode only -- edit-mode signers otherwise
   * have no mobile route into that panel (it's desktop-sidebar-only).
   * Rendered only when both this and `onOpenProgress` are provided.
   */
  progressSummary?: { completed: number; total: number };
  /** Opens the progress panel (its mobile bottom sheet). See `progressSummary`. */
  onOpenProgress?: () => void;
}

// API values (build/edit/view) are unchanged -- only the UI-facing labels
// are renamed, matching the terms recipients actually recognize: DocuSign/
// Documenso's "Prepare"/"Add Fields" for placing fields, and Adobe's
// "Fill & Sign" for filling one out (plain "Edit" wrongly implied editing
// the document text itself).
const modeLabels: Record<PDFEditorMode, string> = {
  build: "Prepare",
  edit: "Fill & Sign",
  view: "View",
};

const modeDescriptions: Record<PDFEditorMode, string> = {
  build: "Place fields and choose who signs",
  edit: "Fill in and sign your fields",
  view: "Read-only",
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
  onFitZoom,
  onResetZoom,
  onSave,
  isSaving,
  isDirty,
  saveLabel = "Save",
  onDownload,
  isDownloading,
  onDecline,
  declineLabel = "I can't sign this",
  onClose,
  title,
  currentPage,
  totalPages,
  isMobile,
  onToggleLeftPanel,
  onToggleHostPanel,
  hostPanelTitle,
  onToggleParties,
  progressSummary,
  onOpenProgress,
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
          {onFitZoom && (
            <button
              type="button"
              className={styles.iconButton}
              onClick={onFitZoom}
              aria-label="Fit to width"
              title="Fit to width"
            >
              <FrameCorners weight="bold" size={18} />
            </button>
          )}
          {onResetZoom && (
            <button
              type="button"
              className={styles.iconButton}
              onClick={onResetZoom}
              aria-label="Reset zoom to 100%"
              title="Reset zoom to 100%"
            >
              <ArrowCounterClockwise weight="bold" size={18} />
            </button>
          )}
        </div>

        {/* Host panel toggle (mobile) */}
        {isMobile && onToggleHostPanel && (
          <button
            type="button"
            className={styles.iconButton}
            onClick={onToggleHostPanel}
            aria-label={hostPanelTitle || "Open panel"}
          >
            <SidebarSimple weight="bold" size={20} />
          </button>
        )}

        {/* Parties/recipients panel toggle (mobile) */}
        {isMobile && onToggleParties && (
          <button
            type="button"
            className={styles.iconButton}
            onClick={onToggleParties}
            aria-label="Recipients"
          >
            <Users weight="bold" size={20} />
          </button>
        )}

        {/* Signing progress entry (mobile, edit mode only) -- edit-mode
            signers have no other mobile route into the progress panel, so
            this is a labeled button ("2/5" + checklist icon), not a
            mystery icon alone. */}
        {isMobile && mode === "edit" && progressSummary && onOpenProgress && (
          <button
            type="button"
            className={styles.progressButton}
            onClick={onOpenProgress}
            aria-label="Signing progress"
          >
            <ListChecks weight="bold" size={18} />
            <span>
              {progressSummary.completed}/{progressSummary.total}
            </span>
          </button>
        )}

        {/* Download button */}
        {onDownload && (
          <button
            type="button"
            className={styles.downloadButton}
            onClick={onDownload}
            disabled={isDownloading}
            aria-label={isDownloading ? "Downloading" : "Download"}
          >
            {isDownloading ? (
              <Spinner size={18} className={styles.spinning} />
            ) : (
              <DownloadSimple weight="bold" size={18} />
            )}
            {!isMobile && <span>Download</span>}
          </button>
        )}

        {/* Decline to sign -- quiet secondary button, edit mode only, and
            only when the host wired a handler. Clicking just opens
            PDFEditor's own confirm; this button carries no busy state. */}
        {mode === "edit" && onDecline && (
          <button
            type="button"
            className={styles.declineButton}
            onClick={onDecline}
          >
            {declineLabel}
          </button>
        )}

        {/* Save button -- a small dot marks unsaved changes so dirtiness is
            visible before any close-guard prompt would otherwise be the
            first sign of it. */}
        <button
          type="button"
          className={styles.saveButton}
          onClick={onSave}
          disabled={isSaving}
          aria-label={isDirty ? `${saveLabel} (unsaved changes)` : saveLabel}
        >
          {isSaving ? (
            <Spinner size={18} className={styles.spinning} />
          ) : (
            <span className={styles.saveIconWrap}>
              <FloppyDisk weight="bold" size={18} />
              {isDirty && (
                <span className={styles.dirtyDot} aria-hidden="true" />
              )}
            </span>
          )}
          {!isMobile && <span>{saveLabel}</span>}
        </button>
          {/* Announces save lifecycle to screen readers; the spinner and
              dirty dot are purely visual. */}
          <span className="visually-hidden" role="status" aria-live="polite">
            {isSaving ? "Saving" : isDirty ? "Unsaved changes" : "All changes saved"}
          </span>

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
