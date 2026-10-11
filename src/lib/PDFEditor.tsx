import "./theme.css";
import { signatureStampGeometry } from "./signatureStamp";
import styles from "./PDFEditor.module.css";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AnnotationMode,
  getDocument,
  GlobalWorkerOptions,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderingCancelledException,
  RenderTask,
  version as pdfjsVersion,
} from "pdfjs-dist";
import {
  DocumentInitParameters,
  TypedArray,
} from "pdfjs-dist/types/src/display/api";
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from "pdf-lib";
import {
  assigneesIncludeParticipant,
  calculateParticipantCompletion,
  createEditorMetadata,
  extractEditorMetadata,
  normalizeParticipantId,
  resolveEffectiveFieldAssignments,
  serializeEditorMetadata,
} from "./participantCompletion";
// New component imports
import { useResponsive } from "./hooks/useResponsive";
import { usePanelState } from "./hooks/usePanelState";
import { useFieldValues, type FieldValueMap } from "./hooks/useFieldValues";
import HeaderBar from "./components/Toolbar/HeaderBar";
import type { ProgressPanelProps } from "./components/Panels/ProgressPanel";
import {
  type PartiesConfig,
  type PartiesSelection,
  type PartyRole,
} from "./components/Panels/PartiesPanel";
import type { PartiesPanelAssignMode } from "./components/Panels/PartiesPanel/types";
import { ContextToolbar } from "./components/Toolbar/ContextToolbar";
import {
  fieldTypeLabels,
  isFieldMissingOptions,
} from "./components/shared/fieldTypeMeta";
import BuildModeFieldRenderer from "./components/BuildModeFieldRenderer";
import { SignatureAdoptionModal } from "./components/Signature/SignatureAdoptionModal";
import { SignatureIcon, WarningIcon } from "@phosphor-icons/react";
import { Alert } from "@chakra-ui/react";
import { EditorLayout, type EditorLayoutKind } from "./shell/EditorLayout";
import {
  LeftSidebar,
  RAIL_EASING,
  RAIL_TRANSITION_MS,
  RAIL_WIDTH,
} from "./shell/LeftSidebar";
import { RightSidebar } from "./shell/RightSidebar";
import { FieldSettingsPopover } from "./shell/FieldSettingsPopover";
import { ConfirmDialogs, OptionsEditorDialog } from "./shell/ConfirmDialogs";
import { MobileChrome, type MobileDrawer } from "./shell/MobileChrome";
import { FIELD_ACTION_BAR_CLEARANCE } from "./components/Mobile/FieldActionBar";
import { StatusStates } from "./shell/StatusStates";

export interface PDFFormFields {
  [x: string]: string;
}

export interface PDFEditorRef {
  formFields: PDFFormFields;
  save: () => Promise<void>;
  /**
   * Ask the editor to close, honouring the unsaved-changes guard: when the
   * session is dirty this shows "Save your changes?" instead of closing.
   * EVERY host-owned close path (a wrapping dialog's Escape key, backdrop
   * click, its own X button) must call this instead of unmounting the editor
   * directly -- the guard cannot intercept a close it never sees. The
   * library's own close affordance already routes through it.
   */
  requestClose: () => void;
}

interface ComboboxItem {
  exportValue: string;
  displayValue: string;
}

interface PDFFormRawField {
  editable: boolean;
  hidden: boolean;
  id: string;
  multiline: boolean;
  name: string;
  page: number;
  password: boolean;
  rect: number[];
  // pdf.js emits "radiobutton" for radio widgets; we normalize it to "radio" at
  // ingestion so the rest of the component's `=== "radio"` checks match.
  type: "text" | "checkbox" | "combobox" | "radio" | "radiobutton" | "list";
  value: string | "Off" | "On";
  defaultValue: string | "Off" | "On";
  // combobox items
  items?: ComboboxItem[];
  /** Button's "on" value (checkbox/radio) — the value stored when selected. */
  exportValues?: string;
  /** Max characters for a text field (AcroForm /MaxLen), 0/undefined = no cap. */
  charLimit?: number;
  // TBD: actions, combo, fillColor, rotation, strokeColor
}

// Extended field type for build mode
export type BuildModeFieldType =
  "text" | "checkbox" | "dropdown" | "radio" | "multiline" | "signature";

export interface BuildModeField {
  id: string;
  type: BuildModeFieldType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  // Track whether the field came from the original PDF or was created in build mode
  origin: "existing" | "new";
  // For existing fields, keep a reference to their original identifier
  originalId?: string;
  properties: {
    placeholder?: string;
    required?: boolean;
    defaultValue?: string;
    options?: ComboboxItem[]; // for dropdown and radio
    multiline?: boolean;
    fontSize?: number;
    fontColor?: string;
    backgroundColor?: string;
    borderColor?: string;
    // Assignment metadata: participant ids allowed to edit this field
    assignees?: string[];
  };
}

interface PDFFormRawFields {
  [x: string]: PDFFormRawField[];
}

interface PDFPageAndFormFields {
  proxy: PDFPageProxy;
  fields?: PDFFormRawField[];
}

/** How long a guided-navigation target keeps `data-flash` (C6). */
const FIELD_FLASH_MS = 1200;

/** Index of 100% in `zoomLevels`. */
const DEFAULT_ZOOM_INDEX = 4;

/** Default size (PDF points) of a newly placed field, per type. */
const DEFAULT_FIELD_DIMENSIONS: Record<
  BuildModeFieldType,
  { width: number; height: number }
> = {
  text: { width: 115, height: 16 },
  multiline: { width: 300, height: 80 },
  checkbox: { width: 16, height: 16 },
  dropdown: { width: 115, height: 16 },
  radio: { width: 100, height: 16 },
  signature: { width: 115, height: 16 },
};

// Layout effects warn during SSR; the editor only lays out in the browser.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * The rail slide's in-flight `scale()` on the page wrapper (1 when none).
 * Anything turning a screen rect into PDF units must multiply the zoom by
 * this, or a click/drop during the 220ms slide lands in the wrong place.
 */
const railTransformScale = (wrapper: HTMLElement | null): number => {
  if (!wrapper || !wrapper.style.transform) return 1;
  if (typeof DOMMatrixReadOnly === "undefined") return 1;
  const transform = window.getComputedStyle(wrapper).transform;
  if (!transform || transform === "none") return 1;
  return new DOMMatrixReadOnly(transform).a || 1;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Fit-to-width (B7/C4): index of the LARGEST zoom step that still fits
 * `availableWidth`, or 0 when even the smallest is too wide. The one rule
 * shared by the fit button, resize re-fit and the rail slide's prediction.
 */
const fitZoomIndex = (availableWidth: number, maxPageWidth: number) => {
  const fitScale = availableWidth / maxPageWidth;
  let fitIndex = 0;
  for (let i = 0; i < zoomLevels.length; i++) {
    if (zoomLevels[i] <= fitScale) fitIndex = i;
  }
  return fitIndex;
};

const zoomLevels = [
  0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 3.5, 4.0,
];

/** Build-mode selection (A6): the primary field plus every selected id. */
interface FieldSelection {
  primary: string | null;
  ids: string[];
}

const EMPTY_SELECTION: FieldSelection = { primary: null, ids: [] };

/**
 * Drops one field from a selection. If it was the primary, the primary
 * falls back to the most recently added remaining field. The one rule for
 * both Shift-click deselect and deleting a selected field.
 */
const removeFromSelection = (
  prev: FieldSelection,
  fieldId: string
): FieldSelection => {
  const ids = prev.ids.filter((id) => id !== fieldId);
  const primary =
    prev.primary === fieldId ? (ids[ids.length - 1] ?? null) : prev.primary;
  return { primary, ids };
};

/** Party ids whose role is currently "excluded", read out of a roles record. */
const computeExcludedFromRoles = (
  roles: Record<string, PartyRole | undefined> | undefined
): Set<string> => {
  if (!roles) return new Set();
  return new Set(
    Object.entries(roles)
      .filter(([, role]) => role === "excluded")
      .map(([id]) => id)
  );
};

export type PDFEditorMode = "build" | "edit" | "view";

export interface PDFEditorProps {
  /**
   * src - Can be a URL where a PDF file is located, a typed array (Uint8Array)
   *       already populated with data, or a parameter object.
   */
  src: string | URL | TypedArray | ArrayBuffer | DocumentInitParameters;
  /**
   * - A string containing the path and filename
   * of the worker file.
   *
   * NOTE: The `workerSrc` option should always be set, in order to prevent any
   * issues when using the PDF.js library.
   */
  workerSrc?: string;
  /**
   * Mode determines the PDF editor behavior:
   * - "view": Read-only mode, displays PDF content without allowing changes
   * - "edit": Allows editing of form fields (default behavior)
   * - "build": Full editing capabilities (future implementation)
   */
  mode?: PDFEditorMode;
  /**
   * This callback is triggered when the user initiates a save action.
   * If the onSave prop is not set, the save button will function similarly to the 'Save as' button in a browser's internal PDF extension.
   * The default behavior is to trigger the browser's download functionality, allowing the user to save the PDF file to their local machine.
   *
   * @param pdfBytes A Uint8Array representing the binary data of the PDF file.
   * @param formFields An object of type PDFFormFields containing information about the form fields within the PDF.
   *
   * May return a Promise: the editor AWAITS it, keeping the header's
   * "Saving" spinner up and the save button disabled until the host's own
   * persistence (upload, API call) settles -- without this, the spinner
   * stopped the moment bytes were handed over and a multi-second host save
   * looked like nothing was happening. A rejected promise clears the
   * spinner and leaves the document marked dirty (the save did not land).
   * @returns
   */
  onSave?: (
    pdfBytes: Uint8Array,
    formFields: PDFFormFields
  ) => void | Promise<void>;
  /**
   * Participants that can be assigned to fields in build mode.
   *
   * `role` is a free-form display tag rendered beside the name in the
   * "Assign to" list -- it is presentation only and nothing keys behaviour off
   * it. It used to be a closed two-value literal union, which silently made
   * any third kind of party untaggable
   * even though the panel has always rendered whatever string it is given.
   *
   * `badge` is a second, independent host-supplied display string (e.g.
   * "Signs by email link") rendered alongside a party in the parties panel.
   * Also presentation only.
   */
  participants?: {
    id: string;
    label: string;
    role?: string;
    badge?: string;
  }[];
  /** Active participant in edit mode. If provided, only their assigned fields are editable. */
  activeParticipantId?: string;
  /** Visibility rule for fields not assigned to the active participant in edit mode */
  unassignedVisibility?: "readonly" | "hidden";
  /** Optional callback to receive the built schema along with saved PDF in build mode */
  /** Same awaitable contract as `onSave` -- see its doc comment. */
  onBuildSave?: (
    pdfBytes: Uint8Array,
    buildSchema: BuildModeField[],
    fieldAssignments: Record<string, string[]>
  ) => void | Promise<void>;
  /** Optional mapping from field name to participant ids for enforcement in edit mode. If not provided, will be automatically extracted from PDF metadata. */
  fieldAssignments?: Record<string, string[]>;
  /**
   * @deprecated Since 4.0.0 this is ignored. The editor's chrome is Chakra
   * UI and follows the host's colour mode (the `.dark` class set by
   * next-themes); the canvas variables in `theme.css` key off the same
   * class. Kept only so existing hosts still type-check.
   */
  theme?: "light" | "dark";
  /** Optional callback when the close button is clicked */
  onClose?: () => void;
  /**
   * Modes offered in the header's mode menu. Defaults to `[mode]` (since
   * 3.0.0), so the menu only renders when a host passes two or more.
   */
  allowedModes?: PDFEditorMode[];
  /**
   * Optional callback for a download action. When provided, a Download button
   * is rendered in the header bar, to the left of the Save button.
   */
  onDownload?: () => void;
  /** Whether a download is in progress (drives the Download button spinner). */
  isDownloading?: boolean;
  /**
   * Generic slot for a host application to inject its own panel into the
   * editor's side panel (desktop right sidebar, tablet side drawer, mobile
   * drawer), alongside the built-in Properties/Progress panels. The editor renders only the
   * chrome (title + section) — it has no opinion on what `content` is, so
   * host apps can put anything here without this library knowing about it.
   * Omitting this prop leaves every existing consumer pixel-identical.
   */
  sidebarPanel?: {
    title: string;
    content: React.ReactNode;
    /** Editor modes in which to show the panel. Defaults to all modes. */
    modes?: PDFEditorMode[];
  };
  /**
   * Native recipients/parties panel -- who signs, in what order, who just
   * gets a copy, who's excluded, and (optionally) an offer expiry. Rendered
   * in the editor's own design system, alongside sidebarPanel/Properties/
   * Progress. Omitting this prop leaves every existing consumer pixel
   * identical: no parties section renders, and `participants` flows to
   * every existing consumer (assign-to list, on-canvas chips, progress
   * panel) completely unfiltered.
   */
  parties?: PartiesConfig;
  /**
   * A previously adopted signature (PNG data URL), offered as a one-click
   * reuse option the first time a signature field is clicked. Storage is
   * entirely the host's responsibility -- this library never persists it.
   */
  savedSignature?: string;
  /**
   * Fires with a PNG data URL whenever the signer adopts a signature
   * (drawn or typed), whether or not it came from `savedSignature`. Hosts
   * that want to remember it for next time persist it here.
   */
  onSignatureAdopted?: (dataUrl: string) => void;
  /**
   * Values to seed into the editor once a document finishes loading, keyed
   * by FIELD NAME (as in `fieldAssignments`, not the per-widget field id
   * `useFieldValues` keys by internally -- the editor translates). Typical
   * use: a later signer should SEE an earlier signer's already-submitted
   * values. Seeded fields still respect the normal assignment gating --
   * an unassigned field renders readonly (see `unassignedVisibility`), an
   * assigned one is editable and simply starts pre-filled.
   *
   * Applied once per document load (including the internal reload after a
   * Prepare-mode save): a live edit already in the session always wins, and
   * a host passing a new object reference on a later render does NOT
   * re-seed or clobber in-progress typing.
   */
  initialFieldValues?: Record<string, string>;
  /**
   * Label for the Save button (and its aria-label/dirty-state announcement).
   * Defaults to "Save". Per-mount, not per-mode -- a host that wants
   * "Submit signature" in Fill & Sign but "Save" in Prepare passes it based
   * on the current `mode` itself.
   */
  saveLabel?: string;
  /**
   * Offers the signer a way out of signing. When set, a quiet secondary
   * button reading `declineLabel` (default "I can't sign this") renders in
   * the header, edit mode only, before Save. Clicking opens a built-in
   * confirm ("Decline to sign?" / Cancel / Decline); confirming awaits the
   * returned promise (if any) with the Decline button showing busy, then
   * closes the dialog. A rejection is caught and the dialog still closes --
   * this library has no toast surface of its own, so surfacing the failure
   * to the signer is left entirely to the host.
   */
  onDecline?: () => Promise<void> | void;
  /** Label for the decline button. Defaults to "I can't sign this". */
  declineLabel?: string;
  /**
   * Field names the host declares as signature fields, for documents whose
   * signature slots the library can't otherwise identify -- either because
   * the PDF carries no editor title metadata at all (e.g. a government
   * notice form the host prefilled itself) or because that metadata predates
   * `signatureFields` (e.g. an inspection report saved before v3). In edit
   * mode the effective signature-field set is the UNION of this prop and
   * whatever `extractedMetadata.current.signatureFields` parses from the
   * PDF's title -- this only ever ADDS names, never removes one the
   * metadata already declared, so every existing lease/Prepare-mode
   * document keeps working untouched with this prop omitted. Named fields
   * get the same click-to-sign control (draw/adopt), the same stamp-on-save
   * geometry, and the same guided-navigation stop as metadata-declared
   * signature fields. Build mode is unaffected -- its signature fields come
   * from `buildModeFields`, set by dragging a Signature field onto the page.
   */
  signatureFieldNames?: string[];
  /**
   * Friendly-label overrides for the Progress panel's remaining-fields
   * list, keyed by field NAME (as in `fieldAssignments`). When a field's
   * name has an entry here, that string is shown instead of the library's
   * best-effort `humanizeFieldName` guess (e.g. "tenant_full_name" ->
   * "Tenant Full Name") -- useful when the host already has real labels
   * (from its own form-builder metadata) and wants those shown verbatim.
   * Omitting this prop leaves every existing consumer unchanged.
   */
  fieldLabels?: Record<string, string>;
}

// Use worker from the installed pdfjs-dist package to ensure version matching
// Get the version dynamically from the imported pdfjs-dist to ensure they match
// This prevents version mismatch errors between the API and worker
const getWorkerSrc = (version: string) => {
  // Extract major.minor.patch from version string (e.g., "4.10.38" or "5.4.54")
  const versionMatch = version.match(/^(\d+\.\d+\.\d+)/);
  const workerVersion = versionMatch ? versionMatch[1] : "5.4.54";
  return `https://unpkg.com/pdfjs-dist@${workerVersion}/build/pdf.worker.min.mjs`;
};

const defaultWorkerSrc = getWorkerSrc(pdfjsVersion);
GlobalWorkerOptions.workerSrc = defaultWorkerSrc;

/**
 * Decodes a PNG data URL (from the Signature capture components) into raw
 * bytes for `PDFDocument.embedPng`. Plain `atob`/browser APIs -- no new
 * dependency needed for something this small.
 */
const dataUrlToUint8Array = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const PDFEditor = forwardRef<PDFEditorRef, PDFEditorProps>(
  (props, ref) => {
    const {
      src,
      workerSrc,
      onSave,
      mode: initialMode = "edit",
      participants,
      activeParticipantId,
      unassignedVisibility = "readonly",
      onBuildSave,
      fieldAssignments,
      onClose,
      // Defaults to JUST the initial mode, not every mode -- a host that
      // wants the mode switcher must opt in explicitly by passing
      // `allowedModes`. `initialMode` is already bound above (destructuring
      // defaults may reference earlier bindings in the same pattern), so
      // this always reflects whatever `mode` the host actually passed (or
      // its own "edit" default).
      allowedModes = [initialMode],
      onDownload,
      isDownloading,
      sidebarPanel,
      parties,
      savedSignature,
      onSignatureAdopted,
      initialFieldValues,
      saveLabel,
      onDecline,
      declineLabel,
      // Renamed on destructure: a local `const signatureFieldNames = new
      // Set(...)` already exists further down (the merged set used at save
      // time) -- keeping the prop under its own name here avoids that const
      // shadowing it (and the TDZ error a `new Set(signatureFieldNames)`
      // referencing itself before assignment would throw).
      signatureFieldNames: signatureFieldNamesProp,
      fieldLabels,
    } = props;

    // Determine the effective initial mode - must be in allowedModes
    const effectiveInitialMode = allowedModes.includes(initialMode)
      ? initialMode
      : allowedModes[0];

    // Internal mode state
    const [mode, setMode] = useState<PDFEditorMode>(effectiveInitialMode);
    const divRef = useRef<HTMLDivElement>(null);
    const [maxPageWidth, setMaxPageWidth] = useState(0);
    const [zoomLevel, setZoomLevel] = useState(6);
    const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy>();
    const [docReady, setDocReady] = useState(false);
    const [pages, setPages] = useState<PDFPageAndFormFields[]>();
    const [pagesReady, setPagesReady] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    // Set when getDocument() rejects -- distinguishes "failed to load" from
    // "still loading" so the failure renders an error panel instead of the
    // null-forever state this used to be indistinguishable from.
    const [loadError, setLoadError] = useState<Error | null>(null);
    // Bumped by the error state's "Try again" (C7). A dependency of the
    // document-load effect, so a retry re-runs getDocument() for the same
    // `src` without the host having to remount the editor.
    const [retryNonce, setRetryNonce] = useState(0);

    // Field VALUES (typed text, checked/selected state) live here, entirely
    // separate from `pages` (which holds field STRUCTURE: geometry, type,
    // name, id). See useFieldValues.ts and the invariant comment on
    // `renderPages` below for why the split matters.
    const fieldValues = useFieldValues();

    // Read (not depended-on) by the seed effect below, so a host that
    // rebuilds the `initialFieldValues` object on every render never causes
    // a re-seed -- seeding is a document-load-boundary event, not a
    // prop-identity event. See that effect's comment for the full reasoning.
    const initialFieldValuesRef = useRef(initialFieldValues);
    initialFieldValuesRef.current = initialFieldValues;

    // In-flight pdf.js RenderTask per page number. A canvas can only run one
    // render() at a time; without cancelling the previous task before
    // starting a new one, rapid zoom changes throw "Cannot use the same
    // canvas during multiple render() operations." Mirrors
    // PageThumbnails.tsx's identical cancel-before-render pattern.
    const renderTasksRef = useRef<Map<number, RenderTask>>(new Map());

    // Build mode state
    const [buildModeFields, setBuildModeFields] = useState<BuildModeField[]>(
      []
    );
    // Selection model (A6). `primary` is the field the context toolbar,
    // popover, drag/resize handles and keyboard nudge act on; `ids` is the
    // whole selection (primary included). Shift-click toggles a field in or
    // out; everything else is a single selection. Batch actions (Required,
    // Delete) apply to every id; geometry edits stay single-field.
    const [selection, setSelection] = useState<FieldSelection>(EMPTY_SELECTION);
    const selectedField = selection.primary;
    const selectedFieldIds = selection.ids;
    // Single-select (or clear) -- every pre-A6 call site keeps this exact
    // signature, so they all collapse a multi-selection back to one field.
    const setSelectedField = useCallback((fieldId: string | null) => {
      setSelection((prev) =>
        fieldId === null
          ? prev.primary === null && prev.ids.length === 0
            ? prev
            : EMPTY_SELECTION
          : prev.primary === fieldId && prev.ids.length === 1
            ? prev
            : { primary: fieldId, ids: [fieldId] }
      );
    }, []);
    // Shift-click: add the field (and make it primary, so the toolbar
    // follows the last click) or remove it (primary falls back to the most
    // recently added remaining field).
    const toggleFieldInSelection = useCallback((fieldId: string) => {
      setSelection((prev) => {
        if (prev.ids.includes(fieldId)) {
          return removeFromSelection(prev, fieldId);
        }
        return { primary: fieldId, ids: [...prev.ids, fieldId] };
      });
    }, []);
    const [draggedFieldType, setDraggedFieldType] =
      useState<BuildModeFieldType | null>(null);
    // Property editing is handled inside FieldPalette now

    // The currently-selected build-mode field's data, or null. Declared up
    // here (rather than inline in the render body, where it used to live)
    // so the LIVE ANCHOR effect and the field Popover below can both depend
    // on its geometry without a forward reference.
    const selectedFieldData = selectedField
      ? (buildModeFields.find((f) => f.id === selectedField) ?? null)
      : null;

    // Desktop field Popover (name/size/placeholder/options) anchored to the
    // selected field, opened from the ContextToolbar's gear button. Local
    // state, not usePanelState -- this is a lightweight anchored panel, not
    // a sidebar/sheet slot.
    const [propertiesPopoverOpen, setPropertiesPopoverOpen] = useState(false);
    // "Edit options" dialog, opened from inside the field Popover for
    // dropdown/radio fields only. Kept separate from propertiesPopoverOpen
    // so the popover can step aside while the dialog is up and reopen when
    // it closes (existing flow; Chakra handles the stacking).
    const [optionsModalOpen, setOptionsModalOpen] = useState(false);

    // Id of the signature field currently being signed (edit mode
    // click-to-sign), or null when the adoption modal is closed. A single
    // modal instance shared by every signature field on the document.
    const [signingFieldId, setSigningFieldId] = useState<string | null>(null);

    // Session-only signature cache: the most recently adopted signature
    // this mount, offered as the one-click "Use this signature" option for
    // every OTHER signature field on the same document -- so a signer who
    // just drew/typed their signature isn't asked to redo it for field #2.
    // Falls back behind the host's own `savedSignature` prop (persisted
    // across sessions); this is purely in-memory and never persisted by
    // the library itself.
    const [lastAdoptedSignature, setLastAdoptedSignature] = useState<
      string | null
    >(null);

    // Whether anything has changed since the last successful save: build
    // mode counts structural field changes (add/move/resize/delete/
    // reassign), edit mode counts value changes (typing, checking, signing).
    // Reset on save and on a fresh document load; never touched by mode
    // switches, which must never prompt for unsaved changes.
    const [isDirty, setIsDirty] = useState(false);
    // True while Prepare-mode field changes (add/move/resize/delete/
    // reassign) have not been saved. Distinct from `isDirty` because ONLY a
    // Prepare-mode save writes fields into the PDF, and Fill & Sign renders
    // fields FROM the PDF -- so unsaved prepared fields are invisible
    // there, which reads as "my fields disappeared" without a notice.
    const [hasUnsavedBuildChanges, setHasUnsavedBuildChanges] = useState(false);
    // The blocking dialog shown when switching Prepare -> Fill & Sign while
    // prepared fields are unsaved (see handleModeChange).
    const [showUnsavedPrepareDialog, setShowUnsavedPrepareDialog] =
      useState(false);
    // Bytes produced by the last Prepare-mode save. The editor reloads
    // ITSELF from these: rendered pages/fields come from the loaded PDF,
    // and hosts often keep `src` stable across saves -- without this,
    // fields saved in Prepare still wouldn't exist in Fill & Sign until
    // the host happened to reload the document.
    const [reloadBytes, setReloadBytes] = useState<Uint8Array | null>(null);
    // Controls the "Save your changes?" close guard, shown instead of
    // calling `onClose` directly whenever the editor is dirty.
    const [showUnsavedGuard, setShowUnsavedGuard] = useState(false);
    // Controls the "Decline to sign?" confirm opened by the header's
    // decline button (rendered only when `onDecline` is provided).
    const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);
    // True while the host's onDecline promise is in flight -- drives the
    // Decline button's busy state and disables it against a double-click.
    const [isDeclining, setIsDeclining] = useState(false);
    // Save-gate confirm: opened instead of saving straight away when the
    // active participant still has incomplete required fields. "Save
    // anyway" proceeds; "Keep signing" just closes it.
    const [showIncompleteSaveDialog, setShowIncompleteSaveDialog] =
      useState(false);

    // Store extracted metadata from the PDF so edit mode can enforce
    // assignees and required-field completion without extra host app state.
    const extractedMetadata = useRef(
      createEditorMetadata({
        fieldAssignments: {},
        requiredFields: [],
      })
    );

    // Single construction point for "which field names are signature
    // fields" outside build mode: the union of the host-declared
    // `signatureFieldNames` prop and whatever the PDF's own title metadata
    // parsed to. Every edit/view-mode consumer (the click-to-sign button
    // render check, the save-time skip-setText/stamp-image logic) reads
    // through this rather than `extractedMetadata.current.signatureFields`
    // directly, so a prop-declared name gets identical treatment -- draw/
    // adopt control, PNG stamp geometry, guided-nav stop (guided nav finds
    // the button generically via its `data-field-name` attribute, so once
    // the button renders it needs no changes of its own). Recomputed on
    // each call rather than memoized: `extractedMetadata` is a ref mutated
    // outside React's render cycle (after async metadata extraction on
    // document load), so a memo keyed on it would miss that update.
    const getEffectiveSignatureFieldNames = (): Set<string> =>
      new Set([
        ...extractedMetadata.current.signatureFields,
        ...(signatureFieldNamesProp ?? []),
      ]);

    // Pinch-to-zoom state
    const lastPinchDistance = useRef<number>(0);
    const isPinching = useRef<boolean>(false);

    // New UI state
    const { isMobile, isTablet } = useResponsive();
    const { togglePanel, isPanelOpen } = usePanelState();

    // Active page tracking
    const [activePage, setActivePage] = useState(1);
    // Page a thumbnail click is smooth-scrolling to. While set, the live
    // page tracker ignores the pages scrolled past on the way, so the
    // highlight doesn't jump back and forth before landing.
    const pageJumpTargetRef = useRef<number | null>(null);
    const pageJumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Mobile drawers (spec §3.11): exactly one open at a time, so a single
    // value replaces 3.x's three independent sheet open/snap pairs (which
    // had to close each other by hand). Opening one drawer closes the rest.
    const [openDrawer, setOpenDrawer] = useState<MobileDrawer>(null);

    // Tablet (C9): both sidebars are overlay Drawers, collapsed by default.
    // Kept apart from the persisted desktop panel state so collapsing them
    // on a tablet never hides the desktop rails next time.
    const [tabletLeftOpen, setTabletLeftOpen] = useState(false);
    const [tabletRightOpen, setTabletRightOpen] = useState(false);

    // Live view of which parties are currently "excluded", used below to
    // derive assignableParticipants. Rather than lifting usePartiesState up
    // to this level (which would mean PartiesPanel stops owning its own
    // state) or adding a new callback to the pinned PartiesConfig contract,
    // this wraps the host's own `parties.onSelectionChange` -- already part
    // of the contract, already reports every decided party's role
    // (including "excluded") on every change -- and mirrors just the
    // excluded set into local state before forwarding the untouched
    // selection to the host. Seeded eagerly from `parties.initial.roles` so
    // there's no render where an already-excluded party briefly still
    // counts as assignable.
    const [excludedPartyIds, setExcludedPartyIds] = useState<Set<string>>(() =>
      computeExcludedFromRoles(parties?.initial.roles)
    );

    useEffect(() => {
      if (!parties) return;
      setExcludedPartyIds(computeExcludedFromRoles(parties.initial.roles));
      // Keyed on seedKey only, mirroring usePartiesState's own reseed guard:
      // a new `initial` object on every render (common when a host builds
      // the config inline) must not stomp live exclusions back to the seed.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parties?.seedKey]);

    // Host callbacks read through a ref so this handler stays referentially
    // stable even though hosts rebuild the `parties` config every render.
    const partiesOnSelectionChangeRef = useRef(parties?.onSelectionChange);
    partiesOnSelectionChangeRef.current = parties?.onSelectionChange;

    const handlePartiesSelectionChange = useCallback(
      (selection: PartiesSelection) => {
        const next = new Set(
          selection.parties
            .filter((p) => p.role === "excluded")
            .map((p) => p.id)
        );
        // Bail out when the excluded set is unchanged: returning the previous
        // reference lets React skip the re-render entirely. Without this, the
        // unconditional fresh Set on every report closed an infinite loop with
        // the panel's own reporting effect (caught in review with a live
        // 100%-CPU repro).
        setExcludedPartyIds((prev) => {
          if (prev.size === next.size) {
            let same = true;
            next.forEach((id) => {
              if (!prev.has(id)) same = false;
            });
            if (same) return prev;
          }
          return next;
        });
        partiesOnSelectionChangeRef.current?.(selection);
      },
      []
    );

    // Context toolbar state
    const [contextToolbarTarget, setContextToolbarTarget] =
      useState<DOMRect | null>(null);
    // Transient confirmation text ("Added to N pages") that temporarily
    // replaces the toolbar's context chip after "Duplicate on every page".
    // Cleared on unmount, on a fresh selection, and by any OTHER toolbar
    // action taken on the same field (see clearToolbarFeedback below).
    const [toolbarFeedbackText, setToolbarFeedbackText] = useState<
      string | null
    >(null);
    const toolbarFeedbackTimeoutRef = useRef<ReturnType<
      typeof setTimeout
    > | null>(null);
    const clearToolbarFeedback = useCallback(() => {
      if (toolbarFeedbackTimeoutRef.current) {
        clearTimeout(toolbarFeedbackTimeoutRef.current);
        toolbarFeedbackTimeoutRef.current = null;
      }
      setToolbarFeedbackText(null);
    }, []);
    // A newly-selected (or deselected) field's toolbar starts clean --
    // feedback belongs to whichever field it fired on.
    useEffect(() => {
      clearToolbarFeedback();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedField]);
    // Belt-and-suspenders unmount cleanup for the timeout itself.
    useEffect(() => clearToolbarFeedback, [clearToolbarFeedback]);

    // FIT-WIDTH ON OPEN: fires resetViewScale (defined below) exactly once
    // per document, the first time maxPageWidth is measured -- so a freshly
    // opened document lands fit-to-width instead of whatever zoom level was
    // last used. Reset alongside the other per-document-load state in the
    // src/reloadBytes effect below. Manual zoom/fit/pinch afterward are
    // untouched -- this only ever fires once.
    const hasFitOnOpenRef = useRef(false);

    // B7/C4: true once the user picks a zoom themselves (zoom buttons,
    // reset, pinch, Ctrl/Cmd+wheel, Ctrl/Cmd +/-/0). While false, container
    // resizes (window resize, sidebar open/close) re-fit to width; once
    // true, the user's zoom survives them. "Fit to width" clears it again.
    // Reset per document load.
    const userZoomedRef = useRef(false);

    // RAIL SLIDE: while the desktop pages rail animates open/shut, the
    // canvas is pre-scaled with a CSS transform toward the zoom it will fit
    // at, then re-rendered sharp at that zoom when the slide ends.
    // `railAnimatingRef` keeps the resize re-fit from stepping the zoom on
    // every frame of the slide. `railSwapRef` carries the hand-off from the
    // transform to the real zoom (see the layout effect after renderPages).
    const pageWrapperRef = useRef<HTMLDivElement>(null);
    const railAnimatingRef = useRef(false);
    const railTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // The pending end-of-slide step. Run once, by whichever comes first:
    // the rail's own transitionend (the real end; on open the rail starts
    // a frame late) or the backup timer.
    const railSettleRef = useRef<(() => void) | null>(null);
    const railSwapRef = useRef<{
      scrollShift: number;
      snapshots: Map<number, HTMLCanvasElement>;
    } | null>(null);
    // Every snapshot still on a page, with its safety timer, so a new slide
    // or unmount can lift them all and free their pixels at once.
    // Latest zoom for the slide's end-of-slide timer (its closure is stale).
    const zoomLevelRef = useRef(zoomLevel);
    zoomLevelRef.current = zoomLevel;
    const railSnapshotsRef = useRef(
      new Map<HTMLCanvasElement, ReturnType<typeof setTimeout> | null>()
    );
    const clearRailSnapshots = () => {
      railSnapshotsRef.current.forEach((timer, node) => {
        if (timer) clearTimeout(timer);
        node.remove();
      });
      railSnapshotsRef.current.clear();
    };
    useEffect(
      () => () => {
        if (railTimerRef.current) clearTimeout(railTimerRef.current);
        clearRailSnapshots();
      },
      []
    );

    // SIGNER COMPLETION auto-scroll: guards the guided jump-to-first-
    // incomplete-field effect (see below) so it only ever fires once per
    // document load, not on every re-render while pagesReady stays true.
    const autoScrolledRef = useRef(false);

    useEffect(() => {
      // use cdn pdf.worker.min.mjs if not set
      GlobalWorkerOptions.workerSrc = workerSrc || defaultWorkerSrc;
    }, [workerSrc]);

    // A genuinely new host document supersedes any internal post-save copy.
    const lastSrcRef = useRef(src);

    useEffect(() => {
      if (lastSrcRef.current !== src) {
        lastSrcRef.current = src;
        if (reloadBytes) {
          setReloadBytes(null);
          // Effect reruns with the copy cleared and loads `src` itself.
          return undefined;
        }
      }
      const loadDocument = async () => {
        setDocReady(false);
        setLoadError(null);
        // A new document is loading -- clear any values left over from a
        // previously loaded one before its field ids can be reused.
        fieldValues.reset();
        setIsDirty(false);
        setHasUnsavedBuildChanges(false);
        // Prepared-field overlays are derived from the loaded document;
        // stale ones from a previous load would shadow the fresh fields.
        setBuildModeFields([]);
        setSelectedField(null);
        // Per-document-load one-shot guards: a fresh document should get
        // its own fit-to-width and its own auto-scroll-to-first-incomplete
        // pass, not silently skip them because a PREVIOUS document already
        // used them up.
        hasFitOnOpenRef.current = false;
        userZoomedRef.current = false;
        autoScrolledRef.current = false;
        try {
          const doc = await getDocument(
            // pdf.js may transfer the buffer to its worker -- hand it a
            // copy so strict-mode double-invocation and later reloads
            // never see a detached buffer.
            reloadBytes ? { data: reloadBytes.slice(0) } : src
          ).promise;
          setPdfDoc(doc);

          // Try to extract editor metadata from the PDF.
          try {
            const pdfBytes = await doc.getData();
            extractedMetadata.current = await extractEditorMetadata(pdfBytes);
          } catch (error) {
            console.warn("Failed to extract editor metadata from PDF:", error);
          }

          setDocReady(true);
        } catch (error) {
          console.error("Failed to load PDF document:", error);
          setLoadError(
            error instanceof Error ? error : new Error(String(error))
          );
          // Set docReady to true even on error -- pagesReady never follows
          // (loadFormFieldsAndPages below is a no-op without a pdfDoc), so
          // the render gate below checks loadError first and shows the
          // failure instead of hanging on a permanent loading state.
          setDocReady(true);
        }
      };
      loadDocument();
      return () => {
        if (pdfDoc) {
          pdfDoc.destroy();
          setPdfDoc(undefined);
          setDocReady(false);
        }
      };
      // since getDocument is async api
      // pdfDoc is keeping change while loading the pdf
      // intend not include pdfDoc as dep to avoid endless loop in this effect hook
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src, reloadBytes, retryNonce]);

    useEffect(() => {
      const loadFormFieldsAndPages = async () => {
        if (pdfDoc) {
          try {
            const rawFormFields =
              (await pdfDoc.getFieldObjects()) as PDFFormRawFields;
            const rawPages: PDFPageAndFormFields[] = [];
            setPagesReady(false);
            for (let i = 1; i <= pdfDoc?.numPages; i++) {
              try {
                const proxy = await pdfDoc.getPage(i);
                const fields = rawFormFields
                  ? Object.values(rawFormFields).flatMap((rawFields) =>
                      rawFields
                        .filter(
                          (rawField) =>
                            rawField.editable &&
                            !rawField.hidden &&
                            // Acrobat ACTION buttons (Reset Form, Submit,
                            // JS triggers) report as editable but are not
                            // fillable content. Rendering one as a text
                            // input put its value into the submission,
                            // which the signing backend rightly rejected:
                            // Field "Reset Form" is not assigned to this
                            // recipient. (Checkboxes/radios have their own
                            // pdf.js types; only pushbuttons are "button".)
                            // (String cast: our narrowed field-type union
                            // doesn't declare "button", but pdf.js emits it
                            // for pushbuttons at runtime.)
                            (rawField.type as string) !== "button" &&
                            // form field page index start from 0
                            // while page proxy pageNumber index start from 1
                            rawField.page === proxy.pageNumber - 1
                        )
                        // Normalize pdf.js's "radiobutton" → "radio".
                        .map((rawField) =>
                          rawField.type === "radiobutton"
                            ? { ...rawField, type: "radio" as const }
                            : rawField
                        )
                    )
                  : [];
                rawPages.push({ proxy, fields });
              } catch (pageError) {
                console.error(`Failed to load page ${i}:`, pageError);
              }
            }
            setPages(rawPages);
            setPagesReady(true);
          } catch (error) {
            console.error("Failed to load form fields and pages:", error);
            setPagesReady(true);
          }
        }
      };
      loadFormFieldsAndPages();
      // intend not include pdfDoc, since it is a proxy
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [docReady]);

    // Seed host-supplied initialFieldValues into useFieldValues once the
    // freshly-loaded document's field ids are known. `initialFieldValues`
    // is keyed by field NAME (assignments/host-facing); useFieldValues is
    // keyed by field ID (a radio group shares one name across several
    // widget ids) -- this is the translation layer between the two.
    //
    // Deliberately keyed on [pagesReady] only, not `pages` or
    // `initialFieldValues`: pagesReady is set false then true exactly once
    // per document load (including the internal reload after a Prepare-mode
    // save, since that reload re-runs the doc-load effect above), so this
    // fires exactly at document-load boundaries -- never on a later render
    // where the host passes a new initialFieldValues reference (which must
    // NOT clobber in-progress typing) or where `pages` changes for an
    // unrelated reason. `pages` is read from the closure rather than
    // awaited as a dep for the same reason the build-mode-field-init effect
    // below does the same with `pagesReady`. `fieldValues.seed` itself only
    // fills ids with no existing entry, so even a spurious re-run is safe.
    useEffect(() => {
      if (!pagesReady || !pages) return;
      const initial = initialFieldValuesRef.current;
      if (!initial) return;
      const entries: FieldValueMap = {};
      pages.forEach((page) => {
        page.fields?.forEach((field) => {
          const value = initial[field.name];
          if (value !== undefined) {
            entries[field.id] = value;
          }
        });
      });
      if (Object.keys(entries).length > 0) {
        fieldValues.seed(entries);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pagesReady]);

    // Assignment gating for one edit-mode overlay: null when the active
    // participant may fill it (or gating doesn't apply), else the label
    // explaining whose it is. Shared by the DOM gating (title/aria-label/
    // disabled, applied by renderPages and re-applied by the gating effect
    // below whenever the labels change) and the visible B6 chip, so the two
    // agree after every commit.
    // The per-document assignment inputs, resolved once per change rather
    // than per field per render (a 120-field lease re-resolved the whole
    // mapping 240 times a keystroke). Shared by gating, the Progress panel,
    // completion and the save gate, so they can never disagree.
    // `pagesReady` stands in for extractedMetadata, a ref filled on every
    // document load before pagesReady turns true.
    //
    // Keyed on the CONTENT of `participants` and `fieldAssignments`, not
    // their identity: hosts usually pass both inline, so an identity key
    // recomputed this (and gatingSignature after it) on every keystroke.
    // Serialising them is linear and far cheaper than what it guards.
    const participantsKey = useMemo(
      () => JSON.stringify(participants?.map((p) => [p.id, p.label]) ?? null),
      [participants]
    );
    const fieldAssignmentsKey = useMemo(
      () => JSON.stringify(fieldAssignments ?? null),
      [fieldAssignments]
    );
    const gatingInputs = useMemo(() => {
      const effectiveAssignments = resolveEffectiveFieldAssignments(
        fieldAssignments,
        extractedMetadata.current.fieldAssignments
      );
      // First roster entry wins, as `participants.find` did.
      const labelById = new Map<string, string>();
      participants?.forEach((p) => {
        const id = normalizeParticipantId(p.id);
        if (!labelById.has(id)) labelById.set(id, p.label);
      });
      return {
        effectiveAssignments,
        hasAssignmentMapping: Object.keys(effectiveAssignments).length > 0,
        labelById,
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fieldAssignmentsKey, participantsKey, pagesReady]);

    const getGatedLabel = (field: PDFFormRawField): string | null => {
      if (mode !== "edit" || !activeParticipantId) return null;
      // The HOST'S assignments win over the PDF's embedded metadata:
      // a host passing the prop is asserting live source-of-truth
      // data (e.g. a signing request's field->recipient pairs), and
      // baked-in metadata can be stale or keyed in a different
      // identity vocabulary (seen live: an inspection PDF keyed the
      // landlord field to the ORG id while the request and the
      // active participant used the signer's uid, so the metadata
      // priority made every field read as someone else's).
      // Embedded metadata remains the fallback for hosts that pass
      // nothing, which is how lease PDFs built in Prepare work.
      // (Shared with the progress counter and completion math via
      // resolveEffectiveFieldAssignments -- see its doc comment for
      // why they must never resolve this differently.)
      const { effectiveAssignments, hasAssignmentMapping, labelById } =
        gatingInputs;
      // Whether a mapping exists AT ALL, not just whether THIS field
      // has an entry -- see resolveEffectiveFieldAssignments's doc
      // comment for the full rule. A lease with 120 AcroForm fields
      // but only 6 explicit assignments is exactly the case this
      // guards: without it, every one of the other 114 defaulted to
      // "allow", so any signer could fill any field the app never
      // meant for them (the server's field-write allowlist, e.g.
      // Kera's submitSignerFields, rejects those submissions
      // anyway -- but the client let the signer fill them first).
      const assignedIds = effectiveAssignments?.[field.name];
      const isAssigned = assignedIds
        ? assigneesIncludeParticipant(assignedIds, activeParticipantId)
        : !hasAssignmentMapping; // unmapped: "not yours" once ANY mapping exists, unrestricted only when none does
      if (isAssigned) return null;

      // Readonly-but-visible: tell the viewer WHY, rather than
      // leaving a disabled field with no explanation. Resolved
      // from the same full `participants` roster
      // assignableParticipants/allParticipants derive from, so
      // it names the assignee even if that party has since been
      // excluded from the assignable list. A field with NO
      // assignee entry at all gets its own distinct label --
      // "assigned to someone else" and "assigned to no one in
      // particular" are different anomalies, and conflating them
      // as one generic message would hide which one this is.
      const firstAssigneeId = assignedIds?.[0];
      const assigneeLabel = firstAssigneeId
        ? labelById.get(normalizeParticipantId(firstAssigneeId))
        : undefined;
      const gatedLabel = assignedIds
        ? `Assigned to ${assigneeLabel || "another signer"}`
        : "Not assigned to a signer";
      return gatedLabel;
    };

    // renderPages is memoised on [pages] (see its deps note), so it reads the
    // gating inputs through this ref rather than a stale closure: a zoom
    // re-render must apply the CURRENT labels, not the ones from the render
    // where `pages` last changed.
    const gatingRef = useRef({
      mode,
      activeParticipantId,
      unassignedVisibility,
      getGatedLabel,
    });
    gatingRef.current = {
      mode,
      activeParticipantId,
      unassignedVisibility,
      getGatedLabel,
    };

    // Enforce assignment on one overlay element in edit mode by disabling or
    // hiding it (rules and labels: getGatedLabel above). Stable identity:
    // reads everything through gatingRef.
    const applyAssignmentGating = useCallback(
      (el: HTMLElement, field: PDFFormRawField | undefined) => {
        if (!field) return;
        const gating = gatingRef.current;
        const applies = gating.mode === "edit" && !!gating.activeParticipantId;
        const gatedLabel = applies ? gating.getGatedLabel(field) : null;
        if (gatedLabel) {
          // Marks what this loop changed, so it can undo exactly that.
          el.dataset.pdfeGated = "";
          if (gating.unassignedVisibility === "hidden") {
            el.style.display = "none";
          } else {
            el.style.display = "";
            el.setAttribute("disabled", "true");
            el.setAttribute("title", gatedLabel);
            el.setAttribute("aria-label", gatedLabel);
          }
        } else {
          // Only undo an element this loop gated: leave anything it never
          // touched (e.g. a view-mode overlay's own `disabled`) alone.
          if (!("pdfeGated" in el.dataset)) return;
          delete el.dataset.pdfeGated;
          el.style.display = "";
          // View mode overlays are disabled by their own JSX
          // (`disabled={mode === "view"}`); keep that.
          if (gating.mode !== "view") el.removeAttribute("disabled");
          // Only clear a title/aria-label THIS gating loop added --
          // never strips a combobox's own JSX-managed
          // `title={field.name}`.
          const isGatedLabel = (value: string | null) =>
            !!value &&
            (value.startsWith("Assigned to ") ||
              value === "Not assigned to a signer");
          if (isGatedLabel(el.getAttribute("title"))) {
            el.removeAttribute("title");
          }
          if (isGatedLabel(el.getAttribute("aria-label"))) {
            el.removeAttribute("aria-label");
          }
        }
      },
      []
    );

    const renderPages = useCallback(
      (scale: number) => {
        let maxPageActualWidth = 0;
        pages?.forEach((page) => {
          let viewport: ReturnType<typeof page.proxy.getViewport> | null = null;
          try {
            viewport = page.proxy.getViewport({ scale });
            const actualWidth = page.proxy.getViewport({ scale: 1.0 }).width;
            if (actualWidth > maxPageActualWidth) {
              maxPageActualWidth = actualWidth;
            }
            const sourceCanvas = divRef.current?.querySelector(
              "canvas#page_canvas_" + page.proxy.pageNumber
            ) as HTMLCanvasElement;
            if (sourceCanvas) {
              const sourceContext = sourceCanvas.getContext("2d");
              /**
               * The devicePixelRatio property in JavaScript provides the ratio of physical pixels to CSS pixels on a device.
               * A value of 2 on your Mac likely means that your display has a high-resolution, also known as a "Retina" display.
               */
              const ratio = window.devicePixelRatio || 1;
              /**
               * Canvas Sizing: The width and height attributes determine the actual pixel dimensions of the canvas.
               */
              sourceCanvas.height = viewport.height * ratio;
              sourceCanvas.width = viewport.width * ratio;
              /**
               * The style.width and style.height properties control the size of the canvas as it is rendered on the page.
               */
              sourceCanvas.style.width = viewport.width + "px";
              sourceCanvas.style.height = viewport.height + "px";
              /**
               * for "Retina" display, 2 phsyical pixels equal to 1 CSS pixels
               */
              if (sourceContext) {
                const pageNumber = page.proxy.pageNumber;
                // Cancel any render still in flight for this page before
                // starting a new one. pdf.js throws "Cannot use the same
                // canvas during multiple render() operations" if two
                // overlap on the same canvas -- this is what makes
                // zoom-spamming safe. Mirrors PageThumbnails.tsx:28-78.
                const existingTask = renderTasksRef.current.get(pageNumber);
                if (existingTask) {
                  existingTask.cancel();
                  renderTasksRef.current.delete(pageNumber);
                }
                try {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const renderTask = (page.proxy.render as any)({
                    canvasContext: sourceContext,
                    viewport: page.proxy.getViewport({
                      scale: scale * ratio, // draw ratio pixels into Canvas
                    }),
                    // Don't paint form-field appearances onto the canvas — the
                    // editor overlays its own inputs for them. Otherwise a
                    // pre-filled AcroForm (e.g. the N1) double-renders: the baked
                    // field text ghosts behind our inputs.
                    annotationMode: AnnotationMode.ENABLE_FORMS,
                  }) as RenderTask;
                  renderTasksRef.current.set(pageNumber, renderTask);
                  renderTask.promise
                    .then(() => {
                      if (
                        renderTasksRef.current.get(pageNumber) === renderTask
                      ) {
                        renderTasksRef.current.delete(pageNumber);
                      }
                    })
                    .catch((renderError) => {
                      if (
                        renderTasksRef.current.get(pageNumber) === renderTask
                      ) {
                        renderTasksRef.current.delete(pageNumber);
                      }
                      // Expected whenever a newer render (another zoom
                      // click, a fresh document) superseded this one via
                      // the cancel() above -- not a real failure.
                      if (renderError instanceof RenderingCancelledException) {
                        return;
                      }
                      console.error(
                        `Failed to render page ${pageNumber}:`,
                        renderError
                      );
                    });
                } catch (renderError) {
                  console.error(
                    `Failed to render page ${pageNumber}:`,
                    renderError
                  );
                }
              }
            }
          } catch (pageError) {
            console.error(
              `Error processing page ${page.proxy?.pageNumber || "unknown"}:`,
              pageError
            );
          }

          if (!viewport) return; // Skip field positioning if viewport couldn't be calculated

          const pageDivContainer = divRef.current?.querySelector(
            "div#page_div_container_" + page.proxy.pageNumber
          ) as HTMLDivElement;
          // Every overlay element for a field -- text/select/textarea inputs
          // AND the click-to-sign button for signature fields -- carries
          // data-field-id, so a single selector covers positioning and
          // assignment gating identically for all of them. This used to be
          // "input, select, textarea", which meant a signature field's
          // button silently bypassed activeParticipantId/unassignedVisibility
          // gating entirely (it's a <button>, not a form control) --
          // broadening the selector is what makes the gating apply
          // uniformly again.
          pageDivContainer
            ?.querySelectorAll<HTMLElement>("[data-field-id]")
            .forEach((el) => {
              const field = page.fields?.find(
                (field) => field.id === el.dataset.fieldId
              );
              const rect = field?.rect?.map((x) => x * scale);
              if (rect) {
                // rect are [llx, lly, urx, ury]
                /**
                 * llx: Lower-left x-coordinate (horizontal position of the lower-left corner).
                 * lly: Lower-left y-coordinate (vertical position of the lower-left corner).
                 * urx: Upper-right x-coordinate (horizontal position of the upper-right corner).
                 * ury: Upper-right y-coordinate (vertical position of the upper-right corner).
                 */
                el.style.left = rect[0] + "px";
                /**
                 * The coordinate system used in many graphics-related contexts, including PDF,
                 * often has the origin (0,0) located at the bottom-left corner, with the y-axis increasing upwards.
                 * This convention is known as the Cartesian coordinate system.
                 */
                el.style.top = viewport.height - rect[3] + "px";
                el.style.width = rect[2] - rect[0] + "px";
                el.style.height = rect[3] - rect[1] + "px";
              }

              // Enforce assignment in edit mode by disabling or hiding.
              applyAssignmentGating(el, field);

              // Required-field indicator: a single data attribute, read by a
              // CSS rule keyed off it, covers every overlay type (text
              // input, select, checkbox/radio, the signature button)
              // uniformly rather than special-casing each one's JSX.
              if (
                field &&
                extractedMetadata.current.requiredFields.includes(field.name)
              ) {
                el.setAttribute("data-required", "true");
              } else {
                el.removeAttribute("data-required");
              }
            });
        });
        if (maxPageWidth === 0) {
          setMaxPageWidth(maxPageActualWidth);
        }
      },
      // intend not include maxPageWidth, once the first loop set the max page width is enough
      //
      // WHY [pages] IS ENOUGH, AND WHY THAT'S NOW SAFE (the render-bug fix):
      // `pages` holds field STRUCTURE only -- geometry, type, name, id --
      // extracted once when a document loads. Field VALUES (what the user
      // typed, checked, selected, including browser autofill) live entirely
      // in the separate `useFieldValues` hook and never touch `pages`. That
      // split is deliberate: this callback's identity depends on `pages`,
      // and the effect below re-invokes it (and re-renders every canvas)
      // whenever that identity changes. Before the split, every keystroke
      // rewrote `pages` too, which produced a fresh `renderPages` on every
      // keystroke and re-triggered a full-document canvas render while the
      // previous one could still be in flight -- pdf.js's "Cannot use the
      // same canvas during multiple render() operations." Now `pages` only
      // changes when a new document is loaded, so typing/autofill/checkbox/
      // radio/select changes never reach here at all, and the per-page
      // RenderTask cancel-then-render above (see its comment) covers the
      // remaining case where a re-render *is* legitimate: zoom changes.
      //
      // NOTE: also deliberately excludes activeParticipantId/unassignedVisibility/
      // fieldAssignments/participants, which the assignment gating reads.
      // Gating reads them through gatingRef (always current), and the
      // separate gating effect below re-applies it whenever the computed
      // labels change, so post-mount changes (async assignments, switching
      // the active signer) re-gate the DOM without re-rendering any canvas.
      // Don't add those deps here: doing so changes this callback's identity
      // and reruns the full canvas render, which risks re-render regressions
      // across all 13 consumers of this library.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [pages]
    );

    // A layout effect so the canvases take their new size in the same frame
    // as the field overlays (which React positions at commit). Before, a
    // zoom change could paint one frame of overlays at the new scale over
    // canvases at the old one.
    useIsomorphicLayoutEffect(() => {
      if (pagesReady) {
        renderPages(zoomLevels[zoomLevel]);
      }
    }, [pagesReady, renderPages, zoomLevel]);

    // RAIL SLIDE hand-off, in the same frame the pages took their new size:
    // drop the transform, keep the anchored point where it was, and lift
    // each snapshot once its page has re-rendered underneath it.
    useIsomorphicLayoutEffect(() => {
      const swap = railSwapRef.current;
      if (!swap) return;
      railSwapRef.current = null;
      const wrapper = pageWrapperRef.current;
      if (wrapper) {
        wrapper.style.transition = "";
        wrapper.style.transform = "";
        wrapper.style.transformOrigin = "";
      }
      if (divRef.current) divRef.current.scrollTop += swap.scrollShift;
      swap.snapshots.forEach((snapshot, pageNumber) => {
        const remove = () => {
          const timer = railSnapshotsRef.current.get(snapshot);
          if (timer) clearTimeout(timer);
          railSnapshotsRef.current.delete(snapshot);
          snapshot.remove();
        };
        const task = renderTasksRef.current.get(pageNumber);
        if (!task) {
          remove();
          return;
        }
        task.promise.then(remove, remove);
        // Never leave a stale snapshot over the page.
        railSnapshotsRef.current.set(snapshot, setTimeout(remove, 2000));
      });
    }, [zoomLevel]);

    // Signature of the current gating decision for every field (edit mode
    // with an active participant only). The effect below keys off it, so the
    // DOM is re-gated exactly when a label or the visibility mode changes,
    // never on value keystrokes.
    // field id -> gated label, for every gated field (edit mode with an
    // active participant only). Built once per change of its inputs; the
    // B6 chips read it instead of re-running getGatedLabel per render.
    const gatedLabelById = useMemo(() => {
      const labels = new Map<string, string>();
      if (!pages || mode !== "edit" || !activeParticipantId) return labels;
      pages.forEach((page) => {
        page.fields?.forEach((field) => {
          const label = getGatedLabel(field);
          if (label) labels.set(field.id, label);
        });
      });
      return labels;
      // getGatedLabel is recreated every render; these are its inputs.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, activeParticipantId, gatingInputs, pages]);

    const gatingSignature = useMemo(() => {
      if (!pages) return "";
      // Not empty when gating is off: the effect must still run once to
      // undo gating left over from when it applied.
      if (mode !== "edit" || !activeParticipantId) return "off";
      const parts: string[] = [unassignedVisibility];
      gatedLabelById.forEach((label, id) => parts.push(`${id}:${label}`));
      return parts.join("\u0000");
    }, [
      mode,
      activeParticipantId,
      unassignedVisibility,
      gatedLabelById,
      pages,
    ]);

    // Re-apply assignment gating when its inputs change after the canvas
    // rendered (renderPages only runs on `pages`/zoom changes), so the
    // overlays' disabled/title/aria-label always match the B6 chips.
    useEffect(() => {
      if (!pagesReady || !gatingSignature || !pages) return;
      const container = divRef.current;
      if (!container) return;
      pages.forEach((page) => {
        const pageDivContainer = container.querySelector(
          "div#page_div_container_" + page.proxy.pageNumber
        );
        pageDivContainer
          ?.querySelectorAll<HTMLElement>("[data-field-id]")
          .forEach((el) => {
            const field = page.fields?.find((f) => f.id === el.dataset.fieldId);
            applyAssignmentGating(el, field);
          });
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gatingSignature, pagesReady, applyAssignmentGating]);

    // Cancel any still-in-flight page renders on unmount so a resolving/
    // rejecting RenderTask never touches a canvas that's gone.
    useEffect(() => {
      const renderTasks = renderTasksRef.current;
      return () => {
        renderTasks.forEach((task) => task.cancel());
        renderTasks.clear();
      };
    }, []);

    // LIVE PAGE TRACKING: drives activePage from what's actually visible in
    // the scroll container -- "most visible" = the page with the highest
    // intersection ratio among the ones currently intersecting -- instead
    // of only ever updating on a thumbnail click. This is what keeps the
    // header page indicator, the thumbnail highlight, the mobile pill, AND
    // the click-to-add placement math (handleFABFieldSelect, which reads
    // activePage) honest as the user scrolls. Thumbnail clicks keep their
    // own scroll+set below; the observer simply agrees once the smooth
    // scroll settles. Re-observes whenever `pages` changes (a new document,
    // or the internal Prepare-mode reload) and disconnects on unmount.
    useEffect(() => {
      if (!pages || pages.length === 0) return undefined;
      const container = divRef.current;
      if (!container) return undefined;

      const ratios = new Map<number, number>();

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const pageNumber = Number(
              (entry.target as HTMLElement).id.replace(
                "page_div_container_",
                ""
              )
            );
            if (!pageNumber) return;
            ratios.set(
              pageNumber,
              entry.isIntersecting ? entry.intersectionRatio : 0
            );
          });

          let bestPage: number | null = null;
          let bestRatio = 0;
          ratios.forEach((ratio, pageNumber) => {
            if (ratio > bestRatio) {
              bestRatio = ratio;
              bestPage = pageNumber;
            }
          });
          if (bestPage === null) return;
          const target = pageJumpTargetRef.current;
          if (target !== null) {
            if (bestPage !== target) return;
            pageJumpTargetRef.current = null;
          }
          setActivePage(bestPage);
        },
        {
          root: container,
          threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
        }
      );

      const pageElements = container.querySelectorAll<HTMLElement>(
        '[id^="page_div_container_"]'
      );
      pageElements.forEach((el) => observer.observe(el));

      return () => observer.disconnect();
    }, [pages]);

    // Fit-to-width (B7/C4): the LARGEST predefined zoom step that still
    // fits the available width, falling back to the smallest step when even
    // that is too wide. The old "closest step" logic could round UP past the
    // container (a 360px phone landed at 125%), and its `|| 6` fallback
    // turned a legitimate index 0 into 125% as well.
    const resetViewScale = useCallback(
      (availableWidth: number | undefined) => {
        if (!availableWidth || !maxPageWidth) return;
        setZoomLevel(fitZoomIndex(availableWidth, maxPageWidth));
      },
      [maxPageWidth]
    );

    // Width the pages can actually use: the scroller's inner width minus
    // its horizontal padding. Falls back to offsetWidth where clientWidth
    // isn't laid out (jsdom).
    const getAvailableCanvasWidth = useCallback((): number | undefined => {
      const el = divRef.current;
      if (!el) return undefined;
      const inner = el.clientWidth || el.offsetWidth;
      if (!inner) return undefined;
      let padding = 0;
      if (typeof window !== "undefined" && window.getComputedStyle) {
        const cs = window.getComputedStyle(el);
        padding =
          (parseFloat(cs.paddingLeft) || 0) +
          (parseFloat(cs.paddingRight) || 0);
      }
      return Math.max(inner - padding, 0);
    }, []);

    // FIT-WIDTH ON OPEN: the moment maxPageWidth is first measured for this
    // document, fit it to the container's width -- exactly once, guarded by
    // hasFitOnOpenRef (reset per document load above) so later re-measures
    // never get silently overridden by this running again.
    useEffect(() => {
      if (maxPageWidth > 0 && !hasFitOnOpenRef.current) {
        hasFitOnOpenRef.current = true;
        resetViewScale(getAvailableCanvasWidth());
      }
    }, [maxPageWidth, resetViewScale, getAvailableCanvasWidth]);

    // Re-fit when the canvas width changes -- window resizes AND layout
    // changes such as the pages sidebar opening/closing -- but only while
    // the user hasn't chosen a zoom themselves (userZoomedRef). Keyed on the
    // scroller's OUTER width (offsetWidth includes the scrollbar), so a
    // scrollbar appearing after a zoom change can't feed back into another
    // re-fit.
    useEffect(() => {
      const el = divRef.current;
      let lastOuterWidth = el?.offsetWidth ?? 0;
      const refit = () => {
        const outer = divRef.current?.offsetWidth ?? 0;
        if (outer === lastOuterWidth) return;
        lastOuterWidth = outer;
        // The rail slide sets the zoom itself when it ends.
        if (railAnimatingRef.current) return;
        if (userZoomedRef.current) return;
        resetViewScale(getAvailableCanvasWidth());
      };
      const handleWindowResize = () => {
        // Window resizes always count, even if the observer below already
        // recorded the width (it may not exist in this environment).
        // The rail slide sets the zoom itself when it ends.
        if (railAnimatingRef.current) return;
        if (userZoomedRef.current) return;
        lastOuterWidth = divRef.current?.offsetWidth ?? 0;
        resetViewScale(getAvailableCanvasWidth());
      };
      window.addEventListener("resize", handleWindowResize);
      let observer: ResizeObserver | undefined;
      if (el && typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(refit);
        observer.observe(el);
      }
      return () => {
        window.removeEventListener("resize", handleWindowResize);
        observer?.disconnect();
      };
      // docReady/pagesReady: divRef only exists once the editor (not the
      // loading state) has rendered.
    }, [resetViewScale, getAvailableCanvasWidth, docReady, pagesReady]);

    // HeaderBar's fit-to-width button: an explicit fit, so later resizes
    // follow the container again.
    const handleFitZoom = useCallback(() => {
      userZoomedRef.current = false;
      resetViewScale(getAvailableCanvasWidth());
    }, [resetViewScale, getAvailableCanvasWidth]);

    // HeaderBar's reset-zoom button: back to 100%, regardless of how far a
    // fit or manual zoom drifted from it.
    const handleResetZoom = useCallback(() => {
      userZoomedRef.current = true;
      const defaultIndex = zoomLevels.indexOf(1.0);
      setZoomLevel(defaultIndex >= 0 ? defaultIndex : DEFAULT_ZOOM_INDEX);
    }, []);

    // Manual zoom steps shared by the header buttons, Ctrl/Cmd+wheel and
    // the Ctrl/Cmd +/- keys (C5).
    const handleZoomIn = useCallback(() => {
      userZoomedRef.current = true;
      setZoomLevel((prev) => Math.min(prev + 1, zoomLevels.length - 1));
    }, []);

    const handleZoomOut = useCallback(() => {
      userZoomedRef.current = true;
      setZoomLevel((prev) => Math.max(prev - 1, 0));
    }, []);

    // Pinch-to-zoom handlers
    const handlePinchZoom = useCallback(
      (e: TouchEvent) => {
        if (e.touches.length !== 2) {
          isPinching.current = false;
          return;
        }

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );

        if (!isPinching.current) {
          isPinching.current = true;
          lastPinchDistance.current = distance;
          return;
        }

        const delta = distance - lastPinchDistance.current;
        const threshold = 30; // Pixels needed to trigger zoom change

        if (Math.abs(delta) > threshold) {
          userZoomedRef.current = true;
          if (delta > 0 && zoomLevel < zoomLevels.length - 1) {
            setZoomLevel((prev) => Math.min(prev + 1, zoomLevels.length - 1));
          } else if (delta < 0 && zoomLevel > 0) {
            setZoomLevel((prev) => Math.max(prev - 1, 0));
          }
          lastPinchDistance.current = distance;
        }
      },
      [zoomLevel]
    );

    const handlePinchEnd = useCallback(() => {
      isPinching.current = false;
      lastPinchDistance.current = 0;
    }, []);

    // Add pinch-to-zoom event listeners
    useEffect(() => {
      const container = divRef.current;
      if (!container) return;

      const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          handlePinchZoom(e);
        }
      };

      const handleTouchEnd = () => {
        handlePinchEnd();
      };

      container.addEventListener("touchmove", handleTouchMove, {
        passive: false,
      });
      container.addEventListener("touchend", handleTouchEnd);

      return () => {
        container.removeEventListener("touchmove", handleTouchMove);
        container.removeEventListener("touchend", handleTouchEnd);
      };
    }, [handlePinchZoom, handlePinchEnd]);

    // C5: Ctrl/Cmd + wheel zooms the document instead of the browser page.
    // Non-passive so preventDefault() actually stops the browser zoom.
    // Deltas accumulate and step one zoom level per WHEEL_ZOOM_THRESHOLD
    // pixels: a mouse notch (~100px) is one step, like the header buttons,
    // while a trackpad pinch (a stream of small ctrlKey deltas) zooms
    // gradually instead of racing through every level (and re-rendering
    // every canvas) in a fraction of a second.
    useEffect(() => {
      const container = divRef.current;
      if (!container) return undefined;
      const WHEEL_ZOOM_THRESHOLD = 50;
      // A pause this long ends a gesture, so a leftover partial delta can't
      // join a later, unrelated one.
      const WHEEL_GESTURE_GAP_MS = 300;
      let accumulated = 0;
      let lastWheelAt = -Infinity;
      const handleWheel = (e: WheelEvent) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        if (e.deltaY === 0) return;
        // deltaMode 1 = lines (Firefox mouse wheel), 2 = pages: each event
        // is a whole notch, so it is one step however few px it reports
        // (Firefox's 3 lines x 16px = 48 fell under the threshold).
        if (e.deltaMode !== 0) {
          accumulated = 0;
          if (e.deltaY < 0) handleZoomIn();
          else handleZoomOut();
          return;
        }
        const delta = e.deltaY;
        if (e.timeStamp - lastWheelAt > WHEEL_GESTURE_GAP_MS) accumulated = 0;
        lastWheelAt = e.timeStamp;
        // A change of direction starts a fresh gesture.
        if (Math.sign(delta) !== Math.sign(accumulated)) accumulated = 0;
        accumulated += delta;
        if (Math.abs(accumulated) < WHEEL_ZOOM_THRESHOLD) return;
        if (accumulated < 0) handleZoomIn();
        else handleZoomOut();
        accumulated = 0;
      };
      container.addEventListener("wheel", handleWheel, { passive: false });
      return () => container.removeEventListener("wheel", handleWheel);
    }, [handleZoomIn, handleZoomOut, docReady, pagesReady]);

    // Whether the most recent pointer press landed inside this editor. Key
    // handlers that also accept events aimed at <body> (where focus falls
    // after clicking a non-focusable spot) check it, so a click elsewhere
    // on the host page hands those keys (Esc, browser zoom) back to it.
    const lastPressInEditorRef = useRef(false);
    useEffect(() => {
      const handlePointerDown = (e: PointerEvent) => {
        const root = divRef.current?.closest(".pdf-editor-root");
        lastPressInEditorRef.current =
          !!root && e.target instanceof Node && root.contains(e.target);
      };
      window.addEventListener("pointerdown", handlePointerDown, {
        capture: true,
      });
      return () =>
        window.removeEventListener("pointerdown", handlePointerDown, {
          capture: true,
        });
    }, []);

    // C5: Ctrl/Cmd + "=" / "+" zooms in, "-" zooms out, "0" resets to 100%.
    // Only while focus is inside this editor, or nowhere (<body>) when the
    // user's last click was inside it. Never while typing in a field, so
    // host-page shortcuts, browser zoom and native text editing keep
    // working everywhere else on the page.
    useEffect(() => {
      const isEditableTarget = (target: EventTarget | null) => {
        if (!(target instanceof HTMLElement)) return false;
        const tag = target.tagName;
        return (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        );
      };
      const handleKeyDown = (e: KeyboardEvent) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
        if (isEditableTarget(e.target)) return;
        const root = divRef.current?.closest(".pdf-editor-root");
        if (!root) return;
        const target = e.target as Node | null;
        const inEditor =
          !!target &&
          (root.contains(target) ||
            (target === document.body && lastPressInEditorRef.current));
        if (!inEditor) return;
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          handleZoomIn();
        } else if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          handleZoomOut();
        } else if (e.key === "0") {
          e.preventDefault();
          handleResetZoom();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleZoomIn, handleZoomOut, handleResetZoom]);

    const getAllFieldsValue = () => {
      // Get field values from the fieldValues map (keyed by field id), not
      // from `pages` -- `pages` no longer carries runtime values, only
      // structure. Fall back to the field's value/defaultValue as loaded
      // from the PDF for any field the user hasn't touched yet.
      if (!pages) return {};

      const formFields: PDFFormFields = {};

      pages.forEach((page) => {
        page.fields?.forEach((field) => {
          if (field.name) {
            formFields[field.name] = fieldValues.getValue(
              field.id,
              field.value || field.defaultValue || ""
            );
          }
        });
      });

      return formFields;
    };

    // Field NAMES that actually rendered -- i.e. survived the
    // editable/hidden/button pre-render filter in the pages-load effect
    // above, so `pages[].fields` already IS that filtered set. A field can
    // be assigned or required in metadata yet fail that filter entirely
    // (e.g. a server bug left it read-only in the AcroForm), in which case
    // it never got a DOM node at all. Fed into completion math and
    // ProgressPanel so neither ever counts such a field as "remaining" --
    // see calculateParticipantCompletion's `renderedFieldNames` doc comment
    // for the full semantics.
    const getRenderedFieldNames = (): Set<string> | undefined => {
      if (!pages) return undefined;
      const names = new Set<string>();
      pages.forEach((page) => {
        page.fields?.forEach((field) => names.add(field.name));
      });
      return names;
    };

    // Field NAMES whose current value is an untouched seed (another
    // signer's context value from `initialFieldValues`). A Prepare-mode
    // save flattens the original form after writing values into it -- an
    // untouched seed written there would paint another signer's content
    // permanently into the rebuilt document. Kera's flows never combine
    // build mode with seeds today, but the library must not depend on any
    // host's control flow for that guarantee.
    const getSeededFieldNames = (): Set<string> => {
      const seeded = new Set<string>();
      if (!pages) return seeded;
      pages.forEach((page) => {
        page.fields?.forEach((field) => {
          if (!field.name) return;
          const current = fieldValues.getValue(
            field.id,
            field.value || field.defaultValue || ""
          );
          if (fieldValues.isSeededValue(field.id, current)) {
            seeded.add(field.name);
          }
        });
      });
      return seeded;
    };

    // Calculate progress for the active participant
    const getProgressData = () => {
      const formFields = getAllFieldsValue();
      const completion = calculateParticipantCompletion({
        metadata: {
          ...extractedMetadata.current,
          fieldAssignments: gatingInputs.effectiveAssignments,
        },
        formFields,
        participantId: activeParticipantId,
        renderedFieldNames: getRenderedFieldNames(),
      });

      return {
        formFields,
        totalFields: completion.requiredAssignedCount,
        completedFields: completion.completedRequiredCount,
      };
    };

    // expose formFields value and save function
    useImperativeHandle(ref, () => ({
      get formFields() {
        return getAllFieldsValue();
      },
      save: onSaveAs,
      // The factory re-runs each render (no deps array), so this always
      // captures the current requestClose/isDirty pair.
      requestClose: () => requestClose(),
    }));

    // Build mode field management
    const generateFieldId = () =>
      `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // FRIENDLY NAMES: the displayed/AcroForm NAME for a new field, e.g.
    // "Signature 1" -- distinct from its machine-generated `id` (React
    // key, DOM wiring, dedupe), which is untouched. Scans `existingFields`
    // for the lowest free counter for this type, so deleting "Signature 1"
    // and adding another signature field reuses "Signature 1" rather than
    // climbing straight to "Signature 2".
    const generateFriendlyFieldName = (
      type: BuildModeFieldType,
      existingFields: BuildModeField[]
    ): string => {
      const label = fieldTypeLabels[type];
      const existingNames = new Set(existingFields.map((f) => f.name));
      let counter = 1;
      while (existingNames.has(`${label} ${counter}`)) {
        counter += 1;
      }
      return `${label} ${counter}`;
    };

    // Duplicate name, e.g. "Signature 1 copy" -- and, on a second duplicate
    // of the same source field, "Signature 1 copy 2", "Signature 1 copy 3",
    // etc., so repeated duplication never collides with an earlier copy.
    const generateDuplicateFieldName = (
      sourceName: string,
      existingFields: BuildModeField[]
    ): string => {
      const base = `${sourceName} copy`;
      const existingNames = new Set(existingFields.map((f) => f.name));
      if (!existingNames.has(base)) return base;
      let counter = 2;
      while (existingNames.has(`${base} ${counter}`)) {
        counter += 1;
      }
      return `${base} ${counter}`;
    };

    const addBuildModeField = useCallback(
      (type: BuildModeFieldType, x: number, y: number, pageNumber: number) => {
        const dimensions = DEFAULT_FIELD_DIMENSIONS[type];
        const fieldId = generateFieldId();

        setBuildModeFields((prev) => [
          ...prev,
          {
            id: fieldId,
            type,
            name: generateFriendlyFieldName(type, prev),
            x,
            y,
            width: dimensions.width,
            height: dimensions.height,
            page: pageNumber,
            origin: "new",
            properties: {
              placeholder: type === "text" ? "Enter text..." : undefined,
              // Signatures exist to be collected — default them to required so
              // completion checks block until they are signed.
              required: type === "signature",
              fontSize: 12,
              fontColor: "#000000",
              backgroundColor: "#ffffff",
              borderColor: "#000000",
            },
          },
        ]);
        setSelectedField(fieldId);
        setIsDirty(true);
        setHasUnsavedBuildChanges(true);
      },
      [setSelectedField]
    );

    // Handle touch drop for mobile build mode
    const handleTouchDrop = useCallback(
      (
        fieldType: BuildModeFieldType,
        pageNumber: number,
        clientX: number,
        clientY: number
      ) => {
        if (mode !== "build") return;

        const pageContainer = document.querySelector(
          `#page_div_container_${pageNumber}`
        );
        if (!pageContainer) return;

        const canvas = pageContainer.querySelector("canvas");
        if (!canvas) return;

        const canvasRect = canvas.getBoundingClientRect();
        // On-screen scale: the zoom, times any rail-slide transform.
        const scale =
          zoomLevels[zoomLevel] * railTransformScale(pageWrapperRef.current);

        const relativeX = clientX - canvasRect.left;
        const relativeY = clientY - canvasRect.top;

        // Check if touch is within canvas bounds
        if (
          relativeX >= 0 &&
          relativeY >= 0 &&
          relativeX <= canvasRect.width &&
          relativeY <= canvasRect.height
        ) {
          const pdfX = relativeX / scale;
          const pdfY = relativeY / scale;
          addBuildModeField(fieldType, pdfX, pdfY, pageNumber - 1);
        }
      },
      [mode, zoomLevel, addBuildModeField]
    );

    // Expose touch drop handler to FieldPalette
    const handleFieldTouchDrop = useCallback(
      (fieldType: BuildModeFieldType, clientX: number, clientY: number) => {
        // Find which page the touch is over
        const pageContainers = document.querySelectorAll(
          '[id^="page_div_container_"]'
        );

        for (const container of pageContainers) {
          const rect = container.getBoundingClientRect();
          if (
            clientX >= rect.left &&
            clientX <= rect.right &&
            clientY >= rect.top &&
            clientY <= rect.bottom
          ) {
            const pageNumber = parseInt(
              container.id.replace("page_div_container_", ""),
              10
            );
            handleTouchDrop(fieldType, pageNumber, clientX, clientY);
            return true;
          }
        }
        return false;
      },
      [handleTouchDrop]
    );

    // Initialize build mode fields from existing PDF form fields
    useEffect(() => {
      if (mode !== "build") return;
      if (!pagesReady || !pages) return;
      // Only initialize once to avoid overwriting user's added fields
      if (buildModeFields.length > 0) return;

      const initial: BuildModeField[] = [];

      pages.forEach((page) => {
        const viewport = page.proxy.getViewport({ scale: 1.0 });
        const pageHeight = viewport.height;
        page.fields?.forEach((field) => {
          // Map pdf.js field type to build field type
          let mappedType: BuildModeFieldType = "text";
          if (field.type === "checkbox") mappedType = "checkbox";
          else if (field.type === "combobox") mappedType = "dropdown";
          else if (field.type === "radio") mappedType = "radio";
          else if (field.type === "list")
            mappedType = "dropdown"; // fallback
          // A signature field is a plain PDFTextField on disk (see
          // onSaveAs) -- extracted metadata is the only record that it's a
          // signature, not ordinary text. Check it before the multiline
          // fallback so re-entering build mode round-trips the type.
          else if (
            field.type === "text" &&
            extractedMetadata.current.signatureFields.includes(field.name)
          )
            mappedType = "signature";
          else if (field.type === "text" && field.multiline)
            mappedType = "multiline";

          const rect = field.rect; // [llx, lly, urx, ury]
          const x = rect[0];
          const yTopLeft = pageHeight - rect[3];
          const width = rect[2] - rect[0];
          const height = rect[3] - rect[1];

          // Get assignments for this field from extracted metadata
          const fieldAssignments =
            extractedMetadata.current.fieldAssignments[field.name] || [];
          const isRequired = extractedMetadata.current.requiredFields.includes(
            field.name
          );

          initial.push({
            id: `existing_${field.id}`,
            originalId: field.id,
            origin: "existing",
            type: mappedType,
            name: field.name,
            x,
            y: yTopLeft,
            width,
            height,
            page: page.proxy.pageNumber - 1,
            properties: {
              placeholder: field.type === "text" ? field.name : undefined,
              required: isRequired,
              defaultValue:
                typeof field.value === "string"
                  ? field.value
                  : typeof field.defaultValue === "string"
                    ? field.defaultValue
                    : undefined,
              options: field.items,
              multiline: field.multiline,
              fontSize: 12,
              assignees: fieldAssignments, // Set the extracted assignments
            },
          });
        });
      });

      if (initial.length > 0) {
        setBuildModeFields(initial);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, pagesReady]);

    const deleteBuildModeField = useCallback(
      (fieldId: string) => {
        setBuildModeFields((prev) => prev.filter((f) => f.id !== fieldId));
        // A member of a multi-selection just drops out of it; if it was the
        // primary, the primary falls back to the most recently added
        // remaining field (the same rule as Shift-click deselect).
        if (selectedFieldIds.length > 1 && selectedFieldIds.includes(fieldId)) {
          setSelection((prev) => removeFromSelection(prev, fieldId));
          if (selectedField === fieldId) {
            setPropertiesPopoverOpen(false);
            setOptionsModalOpen(false);
          }
        } else if (selectedField === fieldId) {
          setSelectedField(null);
          // The field being edited/assigned just vanished -- close both the
          // properties popover and the options modal it can open.
          setPropertiesPopoverOpen(false);
          setOptionsModalOpen(false);
        }
        setIsDirty(true);
        setHasUnsavedBuildChanges(true);
      },
      [selectedField, selectedFieldIds, setSelectedField]
    );

    // A6 batch actions from the context toolbar: apply to EVERY selected
    // field. (Drag, resize and nudge stay single-field by design.)
    const handleBatchRequired = useCallback(
      (required: boolean) => {
        if (selectedFieldIds.length === 0) return;
        const ids = new Set(selectedFieldIds);
        setBuildModeFields((prev) =>
          prev.map((field) =>
            ids.has(field.id)
              ? { ...field, properties: { ...field.properties, required } }
              : field
          )
        );
        setIsDirty(true);
        setHasUnsavedBuildChanges(true);
      },
      [selectedFieldIds]
    );

    // Field keyboard shortcuts (Delete/Backspace, Cmd/Ctrl+D) follow the
    // toolbar: with several fields selected, Delete removes all of them and
    // Duplicate does nothing (the toolbar disables it).
    const isInMultiSelection = (fieldId: string) =>
      selectedFieldIds.length > 1 && selectedFieldIds.includes(fieldId);

    const handleBatchDelete = useCallback(() => {
      if (selectedFieldIds.length === 0) return;
      const ids = new Set(selectedFieldIds);
      setBuildModeFields((prev) => prev.filter((field) => !ids.has(field.id)));
      setSelectedField(null);
      setPropertiesPopoverOpen(false);
      setOptionsModalOpen(false);
      setIsDirty(true);
      setHasUnsavedBuildChanges(true);
    }, [selectedFieldIds, setSelectedField]);

    const moveBuildModeField = useCallback(
      (fieldId: string, x: number, y: number) => {
        setBuildModeFields((prev) =>
          prev.map((field) =>
            field.id === fieldId
              ? { ...field, x: Math.max(0, x), y: Math.max(0, y) }
              : field
          )
        );
        setIsDirty(true);
        setHasUnsavedBuildChanges(true);
      },
      []
    );

    const resizeBuildModeField = useCallback(
      (fieldId: string, width: number, height: number) => {
        setBuildModeFields((prev) =>
          prev.map((field) =>
            field.id === fieldId
              ? {
                  ...field,
                  width: Math.max(20, width),
                  height: Math.max(20, height),
                }
              : field
          )
        );
        setIsDirty(true);
        setHasUnsavedBuildChanges(true);
      },
      []
    );

    const updateBuildModeField = useCallback(
      (fieldId: string, updates: Partial<BuildModeField>) => {
        setBuildModeFields((prev) =>
          prev.map((field) =>
            field.id === fieldId ? { ...field, ...updates } : field
          )
        );
        setIsDirty(true);
        setHasUnsavedBuildChanges(true);
      },
      []
    );

    // Handle field selection with single click for property editor
    const handleFieldSelect = useCallback(
      (fieldId: string, options?: { additive?: boolean }) => {
        // Shift-click (desktop): toggle in the multi-selection, no sheet.
        if (options?.additive && !isMobile) {
          toggleFieldInSelection(fieldId);
          // The settings popover edits ONE field and follows the primary;
          // a shift-click changes the primary (or makes a multi-selection,
          // where Edit is disabled), so close it rather than let it jump.
          setPropertiesPopoverOpen(false);
          setOptionsModalOpen(false);
          return;
        }
        setSelectedField(fieldId);
        // A tap only selects, on every layout: the field keeps its live
        // drag and resize handles. Settings open from an explicit Edit (the
        // desktop toolbar's gear, or the mobile action bar), never as a
        // side effect of selecting -- a modal sheet on every tap blocked
        // moving the field the user had just tapped.
      },
      [isMobile, setSelectedField, toggleFieldInSelection]
    );

    // Mobile Prepare: when a field is selected, make sure the docked action
    // bar isn't covering it. Only on a change of selection, never mid-drag.
    useEffect(() => {
      if (!isMobile || mode !== "build" || !selectedField) return;
      const el = divRef.current?.querySelector<HTMLElement>(
        `[data-build-field-id="${selectedField}"]`
      );
      if (!el) return;
      const barTop = window.innerHeight - parseFloat(FIELD_ACTION_BAR_CLEARANCE);
      if (el.getBoundingClientRect().bottom > barTop) {
        el.scrollIntoView?.({ behavior: "smooth", block: "center" });
      }
    }, [isMobile, mode, selectedField]);

    // Computes the on-canvas rect for the field currently selected in build
    // mode. Deliberately geometry-based (the field's PDF-space x/y/width/
    // height, scaled and offset by its page container's current position)
    // rather than a DOM lookup keyed by field id -- BuildModeFieldRenderer's
    // rendered element carries no such attribute (only the non-build-mode
    // field overlays do), and a geometry-based measurement is exactly what
    // lets this stay correct through drag/resize/zoom without depending on
    // any other component's markup. Shared by both the ContextToolbar and
    // the field Popover via the single contextToolbarTarget state below.
    const measureSelectedFieldRect = useCallback((): DOMRect | null => {
      if (!selectedFieldData) return null;
      const pageContainer = document.querySelector(
        `#page_div_container_${selectedFieldData.page + 1}`
      );
      if (!pageContainer) return null;
      const containerRect = pageContainer.getBoundingClientRect();
      // On-screen scale: the zoom, times any rail-slide transform.
      const scale =
        zoomLevels[zoomLevel] * railTransformScale(pageWrapperRef.current);
      return new DOMRect(
        containerRect.left + selectedFieldData.x * scale,
        containerRect.top + selectedFieldData.y * scale,
        selectedFieldData.width * scale,
        selectedFieldData.height * scale
      );
    }, [selectedFieldData, zoomLevel]);

    // LIVE ANCHOR: keeps contextToolbarTarget in sync with the selected
    // field's actual on-canvas position for as long as it stays selected,
    // re-measuring on container scroll (rAF-throttled), zoom changes, and
    // the field's own geometry changing (drag/resize/duplicate-in-place).
    // Replaces the old one-shot setTimeout+querySelector, which went stale
    // the moment the user scrolled or zoomed after selecting a field.
    const contextToolbarRafPending = useRef(false);

    useEffect(() => {
      if (!selectedField) {
        setContextToolbarTarget(null);
        return undefined;
      }

      setContextToolbarTarget(measureSelectedFieldRect());

      const container = divRef.current;
      if (!container) return undefined;

      const handleScroll = () => {
        if (contextToolbarRafPending.current) return;
        contextToolbarRafPending.current = true;
        requestAnimationFrame(() => {
          contextToolbarRafPending.current = false;
          setContextToolbarTarget(measureSelectedFieldRect());
        });
      };

      container.addEventListener("scroll", handleScroll, { passive: true });
      return () => container.removeEventListener("scroll", handleScroll);
      // measureSelectedFieldRect already carries selectedFieldData/zoomLevel
      // in its own deps; re-listed narrowly here (rather than the whole
      // selectedFieldData object or the function reference) so this effect
      // re-runs on the field's actual geometry changing, not on every
      // unrelated property edit (name, placeholder, assignees, ...).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      selectedField,
      zoomLevel,
      selectedFieldData?.x,
      selectedFieldData?.y,
      selectedFieldData?.width,
      selectedFieldData?.height,
    ]);

    // Handle field focus from progress panel
    const handleFieldFocus = useCallback((fieldName: string) => {
      // Every renderable field kind must be findable here: text/checkbox/
      // radio inputs, dropdown selects, multiline textareas, and signature
      // fields, which render as a BUTTON with data-field-name (no `name`
      // attribute) -- the original input/select-only selector made guided
      // navigation silently no-op on exactly those.
      const escaped = CSS.escape(fieldName);
      const input = document.querySelector(
        `input[name="${escaped}"], select[name="${escaped}"], textarea[name="${escaped}"], button[data-field-name="${escaped}"]`
      ) as HTMLElement | null;

      if (input && divRef.current) {
        // Get the PDF container
        const pdfContainer = divRef.current;
        const inputRect = input.getBoundingClientRect();
        const containerRect = pdfContainer.getBoundingClientRect();

        // Calculate the scroll position to center the input in the PDF container
        const scrollTop =
          pdfContainer.scrollTop +
          (inputRect.top - containerRect.top) -
          containerRect.height / 2 +
          inputRect.height / 2;

        // Smooth scroll within the PDF container
        pdfContainer.scrollTo({
          top: scrollTop,
          behavior: "smooth",
        });

        // Focus on the input after a short delay to ensure scroll completes
        setTimeout(() => {
          input.focus();
          // Flash it briefly (C6): a data attribute read by token CSS
          // (`[data-flash]` in PDFEditor.module.css), not an inline colour.
          input.setAttribute("data-flash", "true");
          setTimeout(() => {
            input.removeAttribute("data-flash");
          }, FIELD_FLASH_MS);
        }, 300);
      }
    }, []);

    // SIGNER COMPLETION auto-scroll: once per document load, land an
    // edit-mode signer directly on their first incomplete required field
    // instead of leaving them to find the Start button themselves. Uses
    // the same focus/highlight jump ProgressPanel's "Start" button drives,
    // but its own target: the first remaining REQUIRED field, where Start
    // walks every remaining ASSIGNED field. On a document whose assigned
    // set is wider than its required set the two can land differently --
    // deliberate, since the point of the auto-jump is the work the signer
    // cannot skip.
    useEffect(() => {
      if (mode !== "edit" || !pagesReady || !activeParticipantId) return;
      if (autoScrolledRef.current) return;
      autoScrolledRef.current = true;
      const completion = calculateParticipantCompletion({
        metadata: {
          ...extractedMetadata.current,
          fieldAssignments: gatingInputs.effectiveAssignments,
        },
        formFields: getAllFieldsValue(),
        participantId: activeParticipantId,
        renderedFieldNames: getRenderedFieldNames(),
      });
      const firstIncomplete = completion.remainingRequiredFields[0];
      if (firstIncomplete) {
        handleFieldFocus(firstIncomplete);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, pagesReady, activeParticipantId]);

    // Handle page navigation from thumbnails
    const handlePageSelect = useCallback((pageNumber: number) => {
      setActivePage(pageNumber);
      // Hold the highlight on the target until the scroll lands. The timer
      // releases it if the target can never be the most visible page
      // (e.g. a short last page).
      pageJumpTargetRef.current = pageNumber;
      if (pageJumpTimerRef.current) clearTimeout(pageJumpTimerRef.current);
      pageJumpTimerRef.current = setTimeout(() => {
        pageJumpTargetRef.current = null;
        pageJumpTimerRef.current = null;
      }, 1000);
      const pageContainer = document.querySelector(
        `#page_div_container_${pageNumber}`
      );
      if (pageContainer) {
        pageContainer.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, []);

    useEffect(
      () => () => {
        if (pageJumpTimerRef.current) clearTimeout(pageJumpTimerRef.current);
      },
      []
    );

    // Handle mode change - only allow switching to allowed modes.
    // Leaving Prepare for Fill & Sign with unsaved prepared fields gets a
    // blocking dialog rather than only the passive notice: fields render
    // FROM the PDF, so unsaved ones are invisible in Fill & Sign, and a
    // banner the user doesn't read leaves them thinking their fields
    // vanished (user feedback). The dialog can also just do the save.
    const handleModeChange = useCallback(
      (newMode: PDFEditorMode) => {
        if (!allowedModes.includes(newMode)) {
          return;
        }
        if (mode === "build" && newMode === "edit" && hasUnsavedBuildChanges) {
          setShowUnsavedPrepareDialog(true);
          return;
        }
        setMode(newMode);
      },
      [allowedModes, mode, hasUnsavedBuildChanges]
    );

    // Handle field duplication
    const duplicateField = useCallback(
      (fieldId: string) => {
        const field = buildModeFields.find((f) => f.id === fieldId);
        if (field) {
          const newField: BuildModeField = {
            ...field,
            id: generateFieldId(),
            x: field.x + 20,
            y: field.y + 20,
            name: generateDuplicateFieldName(field.name, buildModeFields),
          };
          setBuildModeFields((prev) => [...prev, newField]);
          setSelectedField(newField.id);
          setIsDirty(true);
          setHasUnsavedBuildChanges(true);
        }
      },
      [buildModeFields, setSelectedField]
    );

    // "Duplicate on all pages" -- the per-page-initials pain point: place
    // one field, then stamp a copy at the same x/y/size onto every OTHER
    // page in the document in one action, instead of placing it by hand N
    // times. Skips the source field's own page.
    const duplicateFieldOnAllPages = useCallback(
      (fieldId: string) => {
        const field = buildModeFields.find((f) => f.id === fieldId);
        if (!field || !pages || pages.length === 0) return;

        const newFields: BuildModeField[] = [];
        for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
          if (pageIndex === field.page) continue;
          newFields.push({
            ...field,
            id: generateFieldId(),
            page: pageIndex,
            name: `${field.name} (page ${pageIndex + 1})`,
          });
        }
        if (newFields.length === 0) return;

        setBuildModeFields((prev) => [...prev, ...newFields]);
        setIsDirty(true);
        setHasUnsavedBuildChanges(true);
      },
      [buildModeFields, pages]
    );

    // ContextToolbar's "Duplicate" -> "On every page" menu item: runs the
    // duplication above, then shows "Added to N pages" in the toolbar's
    // context chip for ~2s (cleared sooner by a fresh selection or any
    // other toolbar action -- see clearToolbarFeedback).
    const handleDuplicateFieldOnAllPages = useCallback(
      (fieldId: string) => {
        const pageCount = pages?.length ?? 0;
        duplicateFieldOnAllPages(fieldId);
        if (pageCount > 1) {
          clearToolbarFeedback();
          setToolbarFeedbackText(`Added to ${pageCount - 1} pages`);
          toolbarFeedbackTimeoutRef.current = setTimeout(() => {
            setToolbarFeedbackText(null);
            toolbarFeedbackTimeoutRef.current = null;
          }, 2000);
        }
      },
      [pages, duplicateFieldOnAllPages, clearToolbarFeedback]
    );

    // Close selection when clicking on canvas
    const handleCanvasClick = useCallback(() => {
      setSelectedField(null);
      setContextToolbarTarget(null);
      setPropertiesPopoverOpen(false);
      setOptionsModalOpen(false);
    }, [setSelectedField]);

    // Esc on the canvas clears the build-mode selection (A6). Registered as
    // a native WINDOW capture listener, not a React onKeyDown: a host Chakra
    // Dialog's close-on-Esc (zag's dismissable layer) listens on `document`
    // in the capture phase, which runs before React ever dispatches, so
    // stopPropagation there could not stop the host dialog closing. Window
    // capture runs first, and preventDefault() makes zag skip its dismiss.
    // Only intercepts when there is a selection to clear, so an Esc with
    // nothing selected still reaches the host (its Dialog's close-on-Esc,
    // which routes through requestClose). Focus elsewhere (an editor
    // popover, a host input) is left alone so those layers close normally.
    const canvasEscapeRef = useRef({
      mode,
      hasSelection: false,
      clear: handleCanvasClick,
    });
    canvasEscapeRef.current = {
      mode,
      hasSelection: selectedField !== null || selectedFieldIds.length > 0,
      clear: handleCanvasClick,
    };
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key !== "Escape" || e.isComposing) return;
        const {
          mode: currentMode,
          hasSelection,
          clear,
        } = canvasEscapeRef.current;
        if (currentMode !== "build" || !hasSelection) return;
        const scroller = divRef.current;
        if (!scroller) return;
        const target = e.target as Node | null;
        const onCanvas =
          !!target &&
          (scroller.contains(target) ||
            (target === document.body && lastPressInEditorRef.current));
        if (!onCanvas) return;
        e.preventDefault();
        clear();
      };
      window.addEventListener("keydown", handleKeyDown, { capture: true });
      return () =>
        window.removeEventListener("keydown", handleKeyDown, { capture: true });
    }, []);

    // Click-to-add (mobile "Add field" and the desktop palette's click /
    // Enter), A5: place the new field at the centre of what the user can
    // SEE, on the active page. Uses the same viewport -> page-canvas -> PDF
    // conversion as drop (handleDrop: client point minus the page canvas's
    // rect, divided by scale), then centres the field on that point and
    // clamps it inside the page so it can never land off-page. The old
    // math divided the scroller's scroll offsets by scale, which ignored
    // where the active page actually sits in the scroll content and put
    // fields on page 3 at page-1 coordinates (often below the page).
    const handleFABFieldSelect = useCallback(
      (fieldType: BuildModeFieldType) => {
        const container = divRef.current;
        if (!container || !pages || pages.length === 0) return;
        const pageIndex = Math.min(Math.max(activePage, 1), pages.length) - 1;
        const pageContainer = container.querySelector(
          `#page_div_container_${pageIndex + 1}`
        );
        const canvas = pageContainer?.querySelector("canvas");
        if (!canvas) return;

        // On-screen scale: the zoom, times any rail-slide transform.
        const scale =
          zoomLevels[zoomLevel] * railTransformScale(pageWrapperRef.current);
        const containerRect = container.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const { width: fieldWidth, height: fieldHeight } =
          DEFAULT_FIELD_DIMENSIONS[fieldType];

        // Page size in PDF units. The rendered canvas rect is authoritative
        // (it reflects the current scale); the pdf.js viewport is the
        // fallback when layout hasn't produced a size yet.
        const pageViewport = pages[pageIndex].proxy.getViewport({ scale: 1 });
        const pageWidth = canvasRect.width
          ? canvasRect.width / scale
          : pageViewport.width;
        const pageHeight = canvasRect.height
          ? canvasRect.height / scale
          : pageViewport.height;

        // Viewport centre, canvas-relative, in PDF units (same as drop).
        const centreX = containerRect.left + containerRect.width / 2;
        const centreY = containerRect.top + containerRect.height / 2;
        const pdfCentreX = (centreX - canvasRect.left) / scale;
        const pdfCentreY = (centreY - canvasRect.top) / scale;

        const clamp = (value: number, max: number) =>
          Math.min(Math.max(value, 0), Math.max(max, 0));
        const x = clamp(pdfCentreX - fieldWidth / 2, pageWidth - fieldWidth);
        const y = clamp(pdfCentreY - fieldHeight / 2, pageHeight - fieldHeight);

        addBuildModeField(fieldType, x, y, pageIndex);
      },
      [pages, zoomLevel, activePage, addBuildModeField]
    );

    const downloadPDF = (data: Blob, fileName: string) => {
      // Create a temporary anchor element
      const downloadLink = document.createElement("a");
      downloadLink.href = window.URL.createObjectURL(data);
      downloadLink.download = fileName || "download.pdf";

      // Append the anchor to the body and trigger a click
      document.body.appendChild(downloadLink);
      downloadLink.click();

      // Clean up: Remove the anchor after the click event
      document.body.removeChild(downloadLink);

      // Release the blob URL
      window.URL.revokeObjectURL(downloadLink.href);
    };

    const saveFileUsingFilePicker = async (
      data: Uint8Array,
      fileName: string
    ) => {
      try {
        const blob = new Blob([data as BlobPart], { type: "application/pdf" });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { showSaveFilePicker } = window as any;
        if (showSaveFilePicker) {
          // Request a file handle using showSaveFilePicker
          const fileHandle = await showSaveFilePicker({
            suggestedName: fileName,
            types: [
              {
                description: "PDF Documents",
                accept: {
                  "application/pdf": [".pdf"],
                },
              },
            ],
          });

          // Create a writable stream from the file handle
          const writable = await fileHandle.createWritable();

          // Write the blob data to the stream
          await writable.write(blob);

          // Close the stream to finish writing
          await writable.close();
        } else {
          downloadPDF(blob, fileName);
        }
      } catch (e: unknown) {
        console.error(e);
      }
    };

    const onSaveAs = async () => {
      setIsSaving(true);
      try {
        await runSaveAs();
      } finally {
        // The awaited host handler (onSave/onBuildSave) may reject; the
        // spinner must never survive a failed save. Dirty state is only
        // cleared inside runSaveAs AFTER the handler settles successfully,
        // so a failed save stays "Unsaved changes" -- accurate on both
        // counts.
        setIsSaving(false);
      }
    };

    const runSaveAs = async () => {
      const originData = await pdfDoc?.getData();
      if (originData) {
        const libDoc = await PDFDocument.load(originData);
        const form = libDoc.getForm();

        // Names of every signature field on this document. A signature
        // field is a plain PDFTextField underneath (see the "signature"
        // case below) -- its VALUE is a PNG data URL, never real form
        // text, so both value-application loops below skip setText() for
        // these names, and the adopted image is drawn onto the page
        // directly afterwards instead.
        const signatureFieldNames = new Set(
          mode === "build"
            ? buildModeFields
                .filter((field) => field.type === "signature")
                .map((field) => field.name)
            : getEffectiveSignatureFieldNames()
        );

        // Rect (pdf-lib bottom-left coordinates) for every signature field,
        // used below to stamp its adopted PNG at the right spot. Build mode
        // rebuilds every field from scratch below, so its rects are
        // captured there as they're computed; edit mode fields already
        // exist in the loaded PDF, so pdf.js's already-parsed rect (same
        // coordinate space pdf-lib expects) is used directly.
        const signatureFieldRects = new Map<
          string,
          {
            pageIndex: number;
            x: number;
            y: number;
            width: number;
            height: number;
          }
        >();
        if (mode !== "build") {
          pages?.forEach((p) => {
            p.fields?.forEach((f) => {
              if (!signatureFieldNames.has(f.name)) return;
              signatureFieldRects.set(f.name, {
                pageIndex: p.proxy.pageNumber - 1,
                x: f.rect[0],
                y: f.rect[1],
                width: f.rect[2] - f.rect[0],
                height: f.rect[3] - f.rect[1],
              });
            });
          });
        }

        // Build mode: rebuild all fields (existing + new) to persist geometry changes
        if (mode === "build" && buildModeFields.length > 0) {
          // Capture current values keyed by field name
          // Values will be re-applied after rebuilding fields

          // Flatten original AcroForm (removes existing widgets/fields)
          try {
            form.flatten();
          } catch (e) {
            console.warn("Failed to flatten form; continuing with rebuild.", e);
          }

          const allToCreate = buildModeFields;
          const pdfPages = libDoc.getPages();

          for (const buildField of allToCreate) {
            const page = pdfPages[buildField.page];
            if (!page) continue;

            const { height: pageHeight } = page.getSize();
            const pdfX = Math.round(buildField.x);
            const pdfY = Math.round(
              pageHeight - buildField.y - buildField.height
            );
            const pdfWidth = Math.round(buildField.width);
            const pdfHeight = Math.round(buildField.height);

            try {
              switch (buildField.type) {
                case "text": {
                  const textField = form.createTextField(buildField.name);
                  textField.addToPage(page, {
                    x: pdfX,
                    y: pdfY,
                    width: pdfWidth,
                    height: pdfHeight,
                    borderWidth: 0,
                  });
                  textField.setFontSize(buildField.properties.fontSize || 12);
                  break;
                }
                case "multiline": {
                  const multilineField = form.createTextField(buildField.name);
                  multilineField.addToPage(page, {
                    x: pdfX,
                    y: pdfY,
                    width: pdfWidth,
                    height: pdfHeight,
                    borderWidth: 0,
                  });
                  multilineField.setFontSize(
                    buildField.properties.fontSize || 12
                  );
                  multilineField.enableMultiline();
                  break;
                }
                case "checkbox": {
                  const checkbox = form.createCheckBox(buildField.name);
                  checkbox.addToPage(page, {
                    x: pdfX,
                    y: pdfY,
                    width: pdfWidth,
                    height: pdfHeight,
                    borderWidth: 0,
                  });
                  break;
                }
                case "dropdown": {
                  const dropdown = form.createDropdown(buildField.name);
                  dropdown.addToPage(page, {
                    x: pdfX,
                    y: pdfY,
                    width: pdfWidth,
                    height: pdfHeight,
                    borderWidth: 0,
                  });
                  if (buildField.properties.options) {
                    dropdown.setOptions(
                      buildField.properties.options.map((o) => o.exportValue)
                    );
                  }
                  break;
                }
                case "radio": {
                  const radioGroup = form.createRadioGroup(buildField.name);
                  radioGroup.addOptionToPage(
                    buildField.name + "_option",
                    page,
                    {
                      x: pdfX,
                      y: pdfY,
                      width: pdfWidth,
                      height: pdfHeight,
                      borderWidth: 0,
                    }
                  );
                  break;
                }
                case "signature": {
                  const signatureField = form.createTextField(buildField.name);
                  signatureField.addToPage(page, {
                    x: pdfX,
                    y: pdfY,
                    width: pdfWidth,
                    height: pdfHeight,
                    borderWidth: 0,
                  });
                  signatureField.setFontSize(
                    buildField.properties.fontSize || 12
                  );
                  signatureFieldRects.set(buildField.name, {
                    pageIndex: buildField.page,
                    x: pdfX,
                    y: pdfY,
                    width: pdfWidth,
                    height: pdfHeight,
                  });
                  break;
                }
              }
            } catch (error) {
              console.warn(`Failed to add field ${buildField.name}:`, error);
            }
          }
        }

        // Handle existing form fields
        const formFields = getAllFieldsValue();
        const seededNames = mode === "build" ? getSeededFieldNames() : null;

        for (const field of form.getFields()) {
          const fieldName = field.getName();
          // A signature field's "value" is a PNG data URL, not real form
          // text -- never write it into the AcroForm. It's drawn onto the
          // page as an image below instead.
          if (signatureFieldNames.has(fieldName)) continue;
          // Prepare-mode saves flatten this form afterwards: never write an
          // untouched seeded value (another signer's content) into it.
          if (seededNames?.has(fieldName)) continue;
          const value = formFields[fieldName];

          if (field instanceof PDFTextField) {
            (field as PDFTextField).setText(value || "");
          } else if (field instanceof PDFCheckBox) {
            // "Off" is a truthy string, so guard on it explicitly.
            if (value && value !== "Off") {
              (field as PDFCheckBox).check();
            } else {
              (field as PDFCheckBox).uncheck();
            }
          } else if (field instanceof PDFDropdown) {
            if (value) {
              (field as PDFDropdown).select(value);
            }
          } else if (field instanceof PDFOptionList) {
            if (value) {
              try {
                (field as PDFOptionList).select(value);
              } catch {
                // value not a valid option in this list — skip
              }
            }
          } else if (field instanceof PDFRadioGroup) {
            // Persist the selected radio option. This was a no-op before, so
            // radio-group edits (e.g. the N1's "shade one of the following" and
            // per month/week options, which are radio groups) were silently
            // dropped on save and lost on reopen.
            if (value && value !== "Off") {
              try {
                (field as PDFRadioGroup).select(value);
              } catch {
                // value not a valid option in this group — leave unchanged
              }
            } else {
              (field as PDFRadioGroup).clear();
            }
          }
        }

        // After build-mode rebuild, set values for all fields
        if (mode === "build") {
          const formFields = getAllFieldsValue();
          for (const field of form.getFields()) {
            const fieldName = field.getName();
            if (signatureFieldNames.has(fieldName)) continue;
            const value = formFields[fieldName];
            if (field instanceof PDFTextField) {
              (field as PDFTextField).setText(value || "");
            } else if (field instanceof PDFCheckBox) {
              if (value === "On" || value) {
                (field as PDFCheckBox).check();
              } else {
                (field as PDFCheckBox).uncheck();
              }
            } else if (field instanceof PDFDropdown) {
              if (value) {
                (field as PDFDropdown).select(value);
              }
            }
          }
        }

        // Stamp every adopted signature as a flattened image at its field's
        // rect. This is the only place the actual signature pixels reach
        // the saved PDF -- setText() was skipped for these fields above.
        for (const [fieldName, rect] of signatureFieldRects) {
          const dataUrl = formFields[fieldName];
          if (!dataUrl || !dataUrl.startsWith("data:image/png")) continue;
          const pdfPage = libDoc.getPages()[rect.pageIndex];
          if (!pdfPage) continue;
          try {
            const pngImage = await libDoc.embedPng(
              dataUrlToUint8Array(dataUrl)
            );
            // Sizing contract (min legible height, rise above short line
            // fields) lives in signatureStampGeometry with its own tests.
            pdfPage.drawImage(
              pngImage,
              signatureStampGeometry(rect, (w, h) => pngImage.scaleToFit(w, h))
            );
          } catch (error) {
            console.error(`Failed to stamp signature for ${fieldName}:`, error);
          }
        }

        const savedData = await libDoc.save();

        if (mode === "build" && onBuildSave) {
          // Create a mapping from field names to assignees for the parent app
          const fieldAssignmentsMap: Record<string, string[]> = {};
          const requiredFields: string[] = [];
          buildModeFields.forEach((field) => {
            if (
              field.properties.assignees &&
              field.properties.assignees.length > 0
            ) {
              fieldAssignmentsMap[field.name] = field.properties.assignees;
            }
            if (field.properties.required) {
              requiredFields.push(field.name);
            }
          });

          libDoc.setTitle(
            serializeEditorMetadata(
              createEditorMetadata({
                fieldAssignments: fieldAssignmentsMap,
                requiredFields,
                signatureFields: Array.from(signatureFieldNames),
              })
            )
          );

          // Re-save with metadata
          const savedDataWithMetadata = await libDoc.save();

          // AWAITED: a host returning a promise keeps the "Saving" spinner
          // up until its own persistence lands -- see the onSave doc
          // comment. A void-returning host resolves immediately (unchanged).
          await onBuildSave(
            savedDataWithMetadata,
            buildModeFields,
            fieldAssignmentsMap
          );

          // Reload the editor's own document from what was just saved, so
          // the prepared fields exist in the rendered PDF immediately --
          // switching to Fill & Sign after a Prepare save must show them
          // without waiting for the host to hand back a new `src`.
          setReloadBytes(savedDataWithMetadata);
        } else if (onSave) {
          // AWAITED -- same contract as onBuildSave above.
          await onSave(savedData, formFields);
        } else {
          // default behavior, save to local machine
          // Trigger the save-as dialog
          let fileName = "download.pdf";
          if (typeof src === "string") {
            const url = src as string;
            if (url.lastIndexOf("/") >= 0) {
              fileName = url.substring(url.lastIndexOf("/") + 1);
            }
          } else if (src instanceof URL) {
            const url = src.href;
            if (url.lastIndexOf("/") >= 0) {
              fileName = url.substring(url.lastIndexOf("/") + 1);
            }
          }
          await saveFileUsingFilePicker(savedData, fileName || "download.pdf");
        }
        // Everything up to this point either saved successfully or threw
        // (caught by the caller) -- either way, a save attempt that got
        // this far reflects the current state, so nothing is "unsaved"
        // anymore.
        setIsDirty(false);
        // Only a Prepare-mode save writes prepared fields into the PDF; a
        // Fill & Sign save persists values but leaves prepared fields
        // pending, so the notice must survive it.
        if (mode === "build") {
          setHasUnsavedBuildChanges(false);
        }
      }
    };

    // SIGNER COMPLETION save gate: the header Save button (and the
    // Finish-and-save action once every field IS complete) route through
    // this rather than calling onSaveAs directly. Deliberately NOT
    // memoized -- same reasoning as onSaveAs itself just above: it closes
    // over the current mode/activeParticipantId/extractedMetadata, and a
    // frozen useCallback here risks the exact stale-closure bug that
    // comment documents.
    const handleSaveClick = () => {
      if (mode === "edit") {
        const completion = calculateParticipantCompletion({
          metadata: {
            ...extractedMetadata.current,
            fieldAssignments: gatingInputs.effectiveAssignments,
          },
          formFields: getAllFieldsValue(),
          participantId: activeParticipantId,
          renderedFieldNames: getRenderedFieldNames(),
        });
        if (completion.requiredAssignedCount > 0 && !completion.isComplete) {
          setShowIncompleteSaveDialog(true);
          return;
        }
      }
      onSaveAs();
    };

    const handleKeepSigning = useCallback(() => {
      setShowIncompleteSaveDialog(false);
    }, []);

    const handleSaveAnyway = async () => {
      setShowIncompleteSaveDialog(false);
      await onSaveAs();
    };

    // The library's own close affordance intercepts itself when dirty,
    // rather than calling `onClose` straight through -- this is what makes
    // the guard apply to every host regardless of how their close button is
    // wired, per the design decision that the guard lives in the library.
    // Mode switches never go through this path, so they never prompt.
    const requestClose = useCallback(() => {
      if (isDirty) {
        setShowUnsavedGuard(true);
      } else {
        onClose?.();
      }
    }, [isDirty, onClose]);

    const handleKeepEditing = useCallback(() => {
      setShowUnsavedGuard(false);
    }, []);

    const handleDiscardAndClose = useCallback(() => {
      setShowUnsavedGuard(false);
      setIsDirty(false);
      onClose?.();
    }, [onClose]);

    // Header's decline button -- opens the confirm, nothing else. Only
    // reachable when `onDecline` is provided (HeaderBar hides the button
    // otherwise).
    const handleDeclineClick = useCallback(() => {
      setShowDeclineConfirm(true);
    }, []);

    const handleCancelDecline = useCallback(() => {
      setShowDeclineConfirm(false);
    }, []);

    // Confirming decline: awaits the host's promise (if any) with the
    // Decline button busy, then closes the dialog either way. A rejection
    // is caught and swallowed here -- this library has no toast surface, so
    // surfacing the failure to the signer is entirely the host's job.
    const handleConfirmDecline = async () => {
      setIsDeclining(true);
      try {
        await onDecline?.();
      } catch (error) {
        console.error("onDecline handler failed:", error);
      } finally {
        setIsDeclining(false);
        setShowDeclineConfirm(false);
      }
    };

    // Both save-then-act handlers are deliberately NOT memoized: onSaveAs
    // is a plain function rebuilt every render whose closure holds the
    // CURRENT pdfDoc/fields/mode, so a useCallback here either churns every
    // render (pointless) or -- with frozen deps -- captures a first-render
    // onSaveAs that closes over pdfDoc === undefined and silently saves
    // NOTHING before performing the action anyway. That was a live bug for
    // Save-and-continue, pinned by a regression test.
    /**
     * Runs the save for a "save, then do X" guard action and reports
     * whether it landed. Both callers are onClick handlers, so a rejection
     * allowed to escape becomes an unhandled promise rejection in the
     * console -- the HOST already knows its own onSave/onBuildSave threw
     * (and owns surfacing it; this library has no toast of its own), so
     * the only thing left to decide here is whether to proceed with X.
     */
    const trySaveForGuardAction = async (): Promise<boolean> => {
      try {
        await onSaveAs();
        return true;
      } catch {
        return false;
      }
    };

    const handleSaveAndClose = async () => {
      if (!(await trySaveForGuardAction())) return;
      setShowUnsavedGuard(false);
      onClose?.();
    };

    // Prepare -> Fill & Sign guard actions. The save runs while still in
    // Prepare mode (that's the save path that writes fields into the PDF);
    // only a save that didn't throw proceeds to the switch.
    const handleSavePreparedAndFill = async () => {
      // Only a save that actually landed closes the dialog and switches
      // modes. A `finally` here dismissed the guard even when onSaveAs
      // threw, dropping the signer back into Prepare with unsaved fields
      // and no indication anything failed -- same reasoning as
      // handleSaveAndClose, which also leaves its guard open on failure.
      if (!(await trySaveForGuardAction())) return;
      setMode("edit");
      setShowUnsavedPrepareDialog(false);
    };

    const handleFillWithoutSaving = useCallback(() => {
      // The in-canvas notice stays up in Fill & Sign as the reminder.
      setShowUnsavedPrepareDialog(false);
      setMode("edit");
    }, []);

    const handleStayInPrepare = useCallback(() => {
      setShowUnsavedPrepareDialog(false);
    }, []);

    // Native "close the tab/window while dirty" guard. Browsers ignore the
    // custom message text and show their own generic prompt, but a
    // non-empty returnValue is still required to trigger it at all.
    useEffect(() => {
      if (!isDirty) return undefined;
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = "";
      };
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () =>
        window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [isDirty]);

    // Load failed, or still loading the document or its pages.
    if (loadError) {
      return (
        <StatusStates
          kind="error"
          error={loadError}
          onClose={onClose}
          onRetry={() => {
            // Drop readiness in the same render as the error: the error
            // path leaves docReady true and pagesReady may be left over
            // from a previous document, which would otherwise render the
            // editor over stale, destroyed pages for a frame.
            setDocReady(false);
            setPagesReady(false);
            setLoadError(null);
            setRetryNonce((n) => n + 1);
          }}
        />
      );
    }
    if (!docReady || !pagesReady) {
      return <StatusStates kind="loading" onClose={onClose} />;
    }

    // Drag and drop handlers
    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      // Drop-target outline (spec §4). Set imperatively: no re-render per
      // dragover event.
      e.currentTarget.setAttribute("data-drop-target", "true");
    };

    const handleDragLeave = (e: React.DragEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && e.currentTarget.contains(next)) return;
      e.currentTarget.removeAttribute("data-drop-target");
    };

    const handleDrop = (e: React.DragEvent, pageNumber: number) => {
      e.preventDefault();
      e.currentTarget.removeAttribute("data-drop-target");

      if (mode !== "build" || !draggedFieldType) return;

      const pageContainer = e.currentTarget as HTMLElement;
      // On-screen scale: the zoom, times any rail-slide transform.
      const scale =
        zoomLevels[zoomLevel] * railTransformScale(pageWrapperRef.current);

      // Calculate position relative to page container, accounting for the canvas
      const canvas = pageContainer.querySelector("canvas");
      if (!canvas) return;

      const canvasRect = canvas.getBoundingClientRect();
      const relativeX = e.clientX - canvasRect.left;
      const relativeY = e.clientY - canvasRect.top;

      // Convert to PDF coordinates (scale down and convert to PDF coordinate system)
      const pdfX = relativeX / scale;
      const pdfY = relativeY / scale; // Keep as top-left for internal storage

      addBuildModeField(draggedFieldType, pdfX, pdfY, pageNumber - 1);
      setDraggedFieldType(null);
    };

    const progressData = getProgressData();
    // "You still have N field(s) to complete" -- computed fresh every
    // render straight from progressData, so it always reflects whatever
    // was true the instant the incomplete-save dialog opened.
    const incompleteFieldCount = Math.max(
      progressData.totalFields - progressData.completedFields,
      0
    );

    // Whether the host's sidebarPanel should show for the current mode. No
    // `modes` means "show in all modes" so the common case (one panel, no
    // decisions) needs no config from the host.
    const showSidebarPanel =
      !!sidebarPanel &&
      (!sidebarPanel.modes || sidebarPanel.modes.includes(mode));

    // Whether the parties panel should show for the current mode. Defaults
    // to build (Prepare) only: who signs and in what order is a preparation
    // decision, and in Fill & Sign the panel just crowded the progress
    // panel out (user feedback). Hosts opt other modes in via
    // `parties.modes`; NEVER view by default, per the panel's contract.
    const showPartiesPanel =
      !!parties && (parties.modes ?? ["build"]).includes(mode);

    // Config handed to <PartiesPanel>: identical to the host's `parties`
    // prop except onSelectionChange is wrapped (see
    // handlePartiesSelectionChange above) to also mirror the live excluded
    // set into this component's state.
    const partiesConfigForPanel: PartiesConfig | undefined = parties
      ? { ...parties, onSelectionChange: handlePartiesSelectionChange }
      : undefined;

    // The ONE derived participant list: participants minus any party whose
    // CURRENT role is "excluded". Fed everywhere `participants` flows today
    // -- on-canvas assignee chips, the Properties panel's Assign-to list,
    // both ProgressPanel call sites, and completion math -- so excluding a
    // party in the parties panel actually removes them from assignment
    // everywhere, with zero changes inside those components themselves.
    // Omitting `parties` leaves this identical to `participants` (same
    // reference), matching "omitting the prop changes nothing".
    const assignableParticipants = !parties
      ? participants
      : participants?.filter((p) => !excludedPartyIds.has(p.id));

    // Turns the desktop PartiesPanel into a "who gets this field" picker
    // while a build-mode field is selected -- the assign-to control used to
    // live inside the (now-removed) desktop Properties sidebar section;
    // this is its replacement home. Mobile keeps its own separate parties
    // sheet with no assign mode (see the mobile PartiesPanel call below),
    // since there's no field Popover on mobile to assign FROM.
    const assignModeForParties: PartiesPanelAssignMode | undefined =
      !isMobile && mode === "build" && selectedFieldData
        ? {
            fieldId: selectedFieldData.id,
            fieldLabel:
              selectedFieldData.name || fieldTypeLabels[selectedFieldData.type],
            assignedIds: selectedFieldData.properties.assignees ?? [],
            onToggle: (participantId, checked) => {
              const current = selectedFieldData.properties.assignees || [];
              const next = checked
                ? [...current, participantId]
                : current.filter((id) => id !== participantId);
              updateBuildModeField(selectedFieldData.id, {
                properties: {
                  ...selectedFieldData.properties,
                  assignees: next,
                },
              });
            },
            participants: assignableParticipants ?? [],
            allParticipants: participants,
            onDeselect: () => {
              setSelectedField(null);
              setContextToolbarTarget(null);
              setPropertiesPopoverOpen(false);
              setOptionsModalOpen(false);
            },
          }
        : undefined;

    // Field Popover mutations -- same updateBuildModeField shapes
    // PropertiesPanel's own handleAddOption/handleRemoveOption use, so
    // options added/removed here round-trip identically to the mobile
    // bottom sheet's OptionsEditor.
    const handleFieldPopoverAddOption = (label: string) => {
      if (!selectedFieldData) return;
      const currentOptions = selectedFieldData.properties.options || [];
      const newOptionItem = {
        exportValue: label.trim().toLowerCase().replace(/\s+/g, "_"),
        displayValue: label.trim(),
      };
      updateBuildModeField(selectedFieldData.id, {
        properties: {
          ...selectedFieldData.properties,
          options: [...currentOptions, newOptionItem],
        },
      });
    };

    const handleFieldPopoverRemoveOption = (index: number) => {
      if (!selectedFieldData) return;
      const currentOptions = selectedFieldData.properties.options || [];
      updateBuildModeField(selectedFieldData.id, {
        properties: {
          ...selectedFieldData.properties,
          options: currentOptions.filter((_, i) => i !== index),
        },
      });
    };

    // A6: the toolbar's Required toggle reads "on" only when every selected
    // field is required (a single selection: just that field).
    const selectionAllRequired =
      selectedFieldIds.length > 1
        ? selectedFieldIds.every(
            (id) =>
              buildModeFields.find((f) => f.id === id)?.properties.required
          )
        : !!selectedFieldData?.properties.required;

    // Calculate zoom percentage for display
    const zoomPercentage = Math.round(zoomLevels[zoomLevel] * 100);

    // selectedFieldData is computed earlier (see the Build mode state
    // section) so the LIVE ANCHOR effect and field Popover can depend on
    // its geometry without a forward reference.

    // Computed once per render (rather than per field inside the map below)
    // -- see getEffectiveSignatureFieldNames's own comment for why it isn't
    // memoized across renders.
    const effectiveSignatureFieldNames = getEffectiveSignatureFieldNames();

    // REQUIRED RING RESOLVES: companion to the `data-required` attribute
    // the renderPages gating loop sets (structural, from metadata, so it
    // doesn't need to be value-aware). This one DOES need to react to every
    // keystroke, which the imperative renderPages loop deliberately never
    // reruns on -- so it's set here, in the JSX itself, which DOES
    // re-render on every value change. Mirrors participantCompletion's own
    // isFieldComplete semantics: non-empty and not the checkbox/radio "Off"
    // sentinel.
    const isFieldValueComplete = (value?: string): boolean =>
      !!value && value.trim() !== "" && value !== "Off";

    // Lazily built: only computed for the surface that renders it.
    const buildProgressPanelProps = (): ProgressPanelProps => ({
      activeParticipantId,
      participants: assignableParticipants,
      fieldAssignments: gatingInputs.effectiveAssignments,
      formFields: progressData.formFields,
      totalFields: progressData.totalFields,
      completedFields: progressData.completedFields,
      mode,
      onFieldFocus: handleFieldFocus,
      onFinish: handleSaveClick,
      renderedFieldNames: getRenderedFieldNames(),
      fieldLabels,
    });

    const layout: EditorLayoutKind = isMobile
      ? "mobile"
      : isTablet
        ? "tablet"
        : "desktop";
    const isTabletLayout = layout === "tablet";
    const leftOpen = isTabletLayout
      ? tabletLeftOpen
      : isPanelOpen("thumbnails");
    // The tablet drawer always shows every right-hand section it has: its
    // open/closed state is tabletRightOpen alone, never the persisted
    // desktop panel state (C9).
    const isRightSectionOpen = (panel: "progress" | "parties" | "hostPanel") =>
      isTabletLayout || isPanelOpen(panel);
    const partiesSectionOpen =
      showPartiesPanel && isRightSectionOpen("parties");
    const hostPanelSectionOpen =
      showSidebarPanel && isRightSectionOpen("hostPanel");
    const desktopRightOpen =
      isPanelOpen("progress") || hostPanelSectionOpen || partiesSectionOpen;
    const rightOpen = isTabletLayout ? tabletRightOpen : desktopRightOpen;
    const partiesTitle = parties?.title ?? "Recipients";
    const sidebarVariant = isTabletLayout ? "drawer" : "rail";

    // RAIL SLIDE: animate the canvas alongside the desktop rail. The pages
    // re-centre on their own as the canvas area's width animates; this
    // adds the zoom. It scales the page stack with a transform (cheap, no
    // pdf.js work per frame) toward the zoom the new width will fit, then
    // swaps in the real zoom when the slide ends. Snapshots of the visible
    // pages cover the blank canvases while pdf.js re-renders them.
    const settleRailSlide = () => {
      const settle = railSettleRef.current;
      railSettleRef.current = null;
      if (railTimerRef.current) clearTimeout(railTimerRef.current);
      railTimerRef.current = null;
      settle?.();
    };

    const finishRailSlide = () => {
      if (railTimerRef.current) clearTimeout(railTimerRef.current);
      railTimerRef.current = null;
      railSettleRef.current = null;
      railAnimatingRef.current = false;
      railSwapRef.current = null;
      clearRailSnapshots();
      const wrapper = pageWrapperRef.current;
      if (wrapper) {
        wrapper.style.transition = "";
        wrapper.style.transform = "";
        wrapper.style.transformOrigin = "";
      }
    };

    const slideCanvasWithRail = (opening: boolean) => {
      finishRailSlide();
      const scroller = divRef.current;
      const wrapper = pageWrapperRef.current;
      const available = getAvailableCanvasWidth();
      if (!scroller || !wrapper || !available || !maxPageWidth) return;
      if (prefersReducedMotion()) return; // the resize re-fit handles it

      const fromIndex = zoomLevel;
      const predicted = userZoomedRef.current
        ? fromIndex
        : fitZoomIndex(
            available + (opening ? -RAIL_WIDTH : RAIL_WIDTH),
            maxPageWidth
          );
      const ratio = zoomLevels[predicted] / zoomLevels[fromIndex];

      // Scale about the point in the middle of the viewport, so what the
      // user is looking at stays put.
      const anchorY =
        scroller.scrollTop + scroller.clientHeight / 2 - wrapper.offsetTop;
      railAnimatingRef.current = true;
      if (ratio !== 1) {
        wrapper.style.transformOrigin = `50% ${anchorY}px`;
        wrapper.style.transition = "";
        wrapper.style.transform = "scale(1)";
        void wrapper.offsetWidth; // commit the start state
        wrapper.style.transition = `transform ${RAIL_TRANSITION_MS}ms ${RAIL_EASING}`;
        wrapper.style.transform = `scale(${ratio})`;
      }

      railSettleRef.current = () => {
        railAnimatingRef.current = false;
        // Fit to the width the canvas actually ended at.
        const finalAvailable = getAvailableCanvasWidth();
        const target =
          userZoomedRef.current || !finalAvailable
            ? fromIndex
            : fitZoomIndex(finalAvailable, maxPageWidth);
        // The zoom moved during the slide (a zoom key, a pinch): the
        // transform no longer describes the pages, so just settle. And if
        // the zoom is already right, setZoomLevel would be a no-op and the
        // hand-off effect would never run, so never take the swap path then.
        if (zoomLevelRef.current !== fromIndex || target === fromIndex) {
          finishRailSlide();
          if (target !== zoomLevelRef.current && !userZoomedRef.current) {
            setZoomLevel(target);
          }
          return;
        }
        // Cover the visible pages with a copy of their current pixels: the
        // re-render clears each canvas before pdf.js repaints it.
        const snapshots = new Map<number, HTMLCanvasElement>();
        const view = scroller.getBoundingClientRect();
        scroller
          .querySelectorAll<HTMLCanvasElement>('canvas[id^="page_canvas_"]')
          .forEach((canvas) => {
            const rect = canvas.getBoundingClientRect();
            if (rect.bottom < view.top || rect.top > view.bottom) return;
            if (!canvas.width || !canvas.height) return;
            const copy = document.createElement("canvas");
            copy.width = canvas.width;
            copy.height = canvas.height;
            const ctx = copy.getContext("2d");
            if (!ctx) return;
            ctx.drawImage(canvas, 0, 0);
            copy.setAttribute("aria-hidden", "true");
            copy.dataset.pdfeSnapshot = "";
            Object.assign(copy.style, {
              position: "absolute",
              inset: "0",
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            });
            canvas.after(copy);
            const n = Number(canvas.id.replace("page_canvas_", ""));
            snapshots.set(n, copy);
          });
        const realRatio = zoomLevels[target] / zoomLevels[fromIndex];
        railSwapRef.current = {
          scrollShift: anchorY * (realRatio - 1),
          snapshots,
        };
        setZoomLevel(target);
      };
      // Backup only: the rail's transitionend normally settles first.
      railTimerRef.current = setTimeout(
        settleRailSlide,
        RAIL_TRANSITION_MS + 150
      );
    };

    const toggleDesktopRail = () => {
      slideCanvasWithRail(!leftOpen);
      togglePanel("thumbnails");
    };

    // A8 sidebar toggle: the tablet overlay drawer, or the desktop rail.
    const handleToggleLeftSidebar = () => {
      if (isTabletLayout) setTabletLeftOpen((open) => !open);
      else toggleDesktopRail();
    };

    // Opens one right-hand panel: a bottom drawer on mobile, the end drawer
    // (showing every section) on tablet. Desktop shows the rail
    // inline, so these entry points only exist off desktop.
    const openRightPanel = (panel: "progress" | "parties" | "hostPanel") => {
      if (isMobile) {
        setOpenDrawer(panel);
        return;
      }
      setTabletRightOpen(true);
    };

    return (
      <EditorLayout
        layout={layout}
        leftOpen={leftOpen}
        onLeftOpenChange={(open) => {
          if (isTabletLayout) setTabletLeftOpen(open);
          else if (open !== leftOpen) toggleDesktopRail();
        }}
        rightOpen={rightOpen}
        onRightOpenChange={(open) => {
          // Only the tablet end drawer is driven from here; the desktop
          // rail follows its sections' own open state.
          if (isTabletLayout) setTabletRightOpen(open);
        }}
        header={
          <HeaderBar
            mode={mode}
            onModeChange={handleModeChange}
            allowedModes={allowedModes}
            zoomPercentage={zoomPercentage}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            zoomInDisabled={zoomLevel >= zoomLevels.length - 1}
            zoomOutDisabled={zoomLevel <= 0}
            onFitZoom={handleFitZoom}
            onResetZoom={handleResetZoom}
            onSave={handleSaveClick}
            isSaving={isSaving}
            isDirty={isDirty}
            saveLabel={saveLabel}
            onDownload={onDownload}
            isDownloading={isDownloading}
            onClose={onClose ? requestClose : undefined}
            onDecline={onDecline ? handleDeclineClick : undefined}
            declineLabel={declineLabel}
            currentPage={activePage}
            totalPages={pages?.length || 0}
            layout={layout}
            isMobile={isMobile}
            leftSidebarOpen={leftOpen}
            onToggleLeftSidebar={handleToggleLeftSidebar}
            onOpenHostPanel={
              showSidebarPanel && layout !== "desktop"
                ? () => openRightPanel("hostPanel")
                : undefined
            }
            hostPanelTitle={sidebarPanel?.title}
            onOpenParties={
              showPartiesPanel && layout !== "desktop"
                ? () => openRightPanel("parties")
                : undefined
            }
            progressSummary={
              mode === "edit"
                ? {
                    completed: progressData.completedFields,
                    total: progressData.totalFields,
                  }
                : undefined
            }
            onOpenProgress={
              mode === "edit" && layout !== "desktop"
                ? () => openRightPanel("progress")
                : undefined
            }
          />
        }
        leftSidebar={
          !isMobile ? (
            <LeftSidebar
              // The tablet drawer owns visibility; the rail hides itself.
              isOpen={isTabletLayout ? true : leftOpen}
              variant={sidebarVariant}
              onSlideEnd={settleRailSlide}
              showFieldPalette={mode === "build"}
              fieldPaletteProps={{
                onFieldDragStart: setDraggedFieldType,
                onFieldDragEnd: () => setDraggedFieldType(null),
                onTouchDrop: handleFieldTouchDrop,
                onFieldAdd: handleFABFieldSelect,
                selectedField: selectedFieldData,
                onCloseEditor: () => setSelectedField(null),
              }}
              pageThumbnailsProps={
                pages
                  ? { pages, activePage, onPageSelect: handlePageSelect }
                  : undefined
              }
            />
          ) : undefined
        }
        canvasBanner={
          /* Prepared-but-unsaved fields are invisible in Fill & Sign
             (fields render from the PDF; only a Prepare save writes them
             in). Without this, they look like they vanished. */
          mode === "edit" && hasUnsavedBuildChanges ? (
            <Alert.Root
              status="warning"
              size="sm"
              role="status"
              mx={4}
              mt={3}
              w="auto"
              flexShrink={0}
              // Above the canvas grid pseudo-element.
              position="relative"
              zIndex={1}
            >
              <Alert.Indicator>
                <WarningIcon weight="bold" />
              </Alert.Indicator>
              <Alert.Content>
                <Alert.Description>
                  Fields added in Prepare are not saved yet, so they cannot be
                  filled here. Switch back to Prepare and select Save first.
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
          ) : undefined
        }
        canvas={
          <div
            ref={divRef}
            className={styles.documentContainer}
            data-part="document-scroller"
            // Mobile Prepare: room below the last page so any field can
            // scroll clear of the docked field action bar.
            style={
              isMobile && mode === "build" && selectedField
                ? { paddingBottom: FIELD_ACTION_BAR_CLEARANCE }
                : undefined
            }
            // Focusable (not tabbable) so a click on the canvas gives it
            // focus: Ctrl/Cmd zoom keys (C5) and Esc-to-clear (A6) then
            // reach the editor, and arrow keys scroll the document.
            tabIndex={-1}
            onClick={handleCanvasClick}
          >
            <div ref={pageWrapperRef} className={styles.pageWrapper}>
              {pages &&
                pages.length > 0 &&
                pages
                  .filter((page) => !page.proxy?.destroyed)
                  .map((page, index) => (
                    <div
                      key={"page_" + page.proxy.pageNumber}
                      className={styles.pageFrame}
                    >
                      <div
                        id={"page_div_container_" + page.proxy.pageNumber}
                        className={styles.pageContainer}
                        onDragOver={
                          mode === "build" ? handleDragOver : undefined
                        }
                        onDragLeave={
                          mode === "build" ? handleDragLeave : undefined
                        }
                        onDrop={
                          mode === "build"
                            ? (e) => handleDrop(e, page.proxy.pageNumber)
                            : undefined
                        }
                      >
                        <canvas
                          id={"page_canvas_" + page.proxy.pageNumber}
                          className={styles.pageCanvas}
                        />

                        {/* Existing form fields (hidden in build mode) */}
                        {mode !== "build" &&
                          page.fields &&
                          page.fields.map((field) => {
                            const scale = zoomLevels[zoomLevel];
                            const vp = page.proxy.getViewport({ scale });
                            const rectScaled = field.rect.map((x) => x * scale);
                            const style: React.CSSProperties = {
                              left: rectScaled[0],
                              top: vp.height - rectScaled[3],
                              width: rectScaled[2] - rectScaled[0],
                              height: rectScaled[3] - rectScaled[1],
                            };
                            if (field.type === "combobox")
                              return (
                                <select
                                  name={field.name}
                                  title={field.name}
                                  key={field.id}
                                  data-field-id={field.id}
                                  data-complete={isFieldValueComplete(
                                    fieldValues.getValue(
                                      field.id,
                                      field.value || field.defaultValue
                                    )
                                  )}
                                  value={fieldValues.getValue(
                                    field.id,
                                    field.value || field.defaultValue
                                  )}
                                  className={styles.pdfSelect}
                                  style={style}
                                  disabled={mode === "view"}
                                  onChange={(e) => {
                                    if (mode !== "view") {
                                      fieldValues.setValue(
                                        field.id,
                                        e.target.value
                                      );
                                      setIsDirty(true);
                                    }
                                  }}
                                >
                                  {field.items?.map((item) => (
                                    <option
                                      key={item.exportValue}
                                      value={item.exportValue}
                                    >
                                      {item.displayValue}
                                    </option>
                                  ))}
                                </select>
                              );
                            // Update this field's value in the fieldValues
                            // map -- never `pages` (see the invariant comment
                            // on renderPages above for why). `byName` also
                            // updates every field sharing the name — needed
                            // for radio groups, where selecting one option
                            // deselects the rest, spanning every page since a
                            // radio group's options aren't guaranteed to sit
                            // on the same page.
                            const updateFieldValue = (
                              newValue: string,
                              byName: boolean
                            ) => {
                              setIsDirty(true);
                              if (!byName) {
                                fieldValues.setValue(field.id, newValue);
                                return;
                              }
                              const idsWithSameName: string[] = [];
                              pages?.forEach((p) =>
                                p.fields?.forEach((f) => {
                                  if (f.name === field.name) {
                                    idsWithSameName.push(f.id);
                                  }
                                })
                              );
                              fieldValues.setValueForIds(
                                idsWithSameName,
                                newValue
                              );
                            };
                            const currentValue = fieldValues.getValue(
                              field.id,
                              field.value || field.defaultValue
                            );

                            // Signature fields are plain PDFTextFields under
                            // the hood (see onSaveAs) -- the only way to
                            // know one is a signature field, rather than an
                            // ordinary text field, is extracted metadata
                            // plus any host-declared `signatureFieldNames`
                            // (see effectiveSignatureFieldNames above).
                            // Rendered as a click-to-sign button instead of
                            // a text input; data-field-id keeps it inside
                            // the exact same gating loop above.
                            if (effectiveSignatureFieldNames.has(field.name)) {
                              const isSigned =
                                !!currentValue &&
                                currentValue.startsWith("data:image");
                              return (
                                <button
                                  type="button"
                                  key={field.id}
                                  data-field-id={field.id}
                                  data-complete={isSigned}
                                  // Guided navigation looks fields up by
                                  // NAME; buttons have no `name` attribute,
                                  // so carry it as a data attribute.
                                  data-field-name={field.name}
                                  className={styles.signatureFieldButton}
                                  style={style}
                                  disabled={mode === "view"}
                                  onClick={() => {
                                    if (mode !== "view") {
                                      setSigningFieldId(field.id);
                                    }
                                  }}
                                >
                                  {isSigned ? (
                                    <img
                                      src={currentValue}
                                      alt="Your signature"
                                      className={styles.signatureFieldImage}
                                    />
                                  ) : (
                                    <span
                                      className={styles.signatureFieldPrompt}
                                    >
                                      <SignatureIcon weight="bold" size={14} />
                                      Sign
                                    </span>
                                  )}
                                </button>
                              );
                            }

                            if (field.type === "checkbox") {
                              const onValue = field.exportValues || "On";
                              return (
                                <input
                                  type="checkbox"
                                  name={field.name}
                                  key={field.id}
                                  data-field-id={field.id}
                                  data-complete={isFieldValueComplete(
                                    currentValue
                                  )}
                                  className={styles.pdfInput}
                                  style={style}
                                  disabled={mode === "view"}
                                  checked={
                                    !!currentValue && currentValue !== "Off"
                                  }
                                  onChange={(e) => {
                                    if (mode !== "view") {
                                      updateFieldValue(
                                        e.target.checked ? onValue : "Off",
                                        false
                                      );
                                    }
                                  }}
                                />
                              );
                            }

                            if (field.type === "radio") {
                              return (
                                <input
                                  type="radio"
                                  name={field.name}
                                  key={field.id}
                                  data-field-id={field.id}
                                  data-complete={isFieldValueComplete(
                                    currentValue
                                  )}
                                  className={styles.pdfInput}
                                  style={style}
                                  disabled={mode === "view"}
                                  checked={currentValue === field.exportValues}
                                  onChange={() => {
                                    if (mode !== "view") {
                                      updateFieldValue(
                                        field.exportValues || "",
                                        true
                                      );
                                    }
                                  }}
                                />
                              );
                            }

                            const maxLength =
                              field.charLimit && field.charLimit > 0
                                ? field.charLimit
                                : undefined;

                            // Multiline text field → <textarea> so line breaks
                            // and wrapping render like Acrobat.
                            if (field.multiline) {
                              return (
                                <textarea
                                  name={field.name}
                                  key={field.id}
                                  data-field-id={field.id}
                                  data-complete={isFieldValueComplete(
                                    currentValue
                                  )}
                                  className={styles.pdfInput}
                                  style={style}
                                  readOnly={mode === "view"}
                                  maxLength={maxLength}
                                  value={currentValue}
                                  onChange={(e) => {
                                    if (mode !== "view") {
                                      updateFieldValue(e.target.value, false);
                                    }
                                  }}
                                />
                              );
                            }

                            return (
                              <input
                                type="text"
                                name={field.name}
                                key={field.id}
                                data-field-id={field.id}
                                data-complete={isFieldValueComplete(
                                  currentValue
                                )}
                                className={styles.pdfInput}
                                style={style}
                                readOnly={mode === "view"}
                                maxLength={maxLength}
                                value={currentValue}
                                onChange={(e) => {
                                  if (mode !== "view") {
                                    updateFieldValue(e.target.value, false);
                                  }
                                }}
                              />
                            );
                          })}

                        {/* Build mode fields */}
                        {mode === "build" &&
                          buildModeFields
                            .filter(
                              (field) =>
                                field.page === page.proxy.pageNumber - 1
                            )
                            .map((field) => (
                              <BuildModeFieldRenderer
                                key={field.id}
                                field={field}
                                scale={zoomLevels[zoomLevel]}
                                isSelected={selectedField === field.id}
                                isMultiSelected={
                                  selectedFieldIds.length > 1 &&
                                  selectedFieldIds.includes(field.id)
                                }
                                onSelect={handleFieldSelect}
                                onDelete={(fieldId) =>
                                  isInMultiSelection(fieldId)
                                    ? handleBatchDelete()
                                    : deleteBuildModeField(fieldId)
                                }
                                onMove={moveBuildModeField}
                                onResize={resizeBuildModeField}
                                onDuplicate={(fieldId) => {
                                  if (!isInMultiSelection(fieldId)) {
                                    duplicateField(fieldId);
                                  }
                                }}
                                onDuplicateOnAllPages={duplicateFieldOnAllPages}
                                onOpenProperties={(fieldId) => {
                                  handleFieldSelect(fieldId);
                                  setPropertiesPopoverOpen(true);
                                }}
                                participants={assignableParticipants}
                                allParticipants={participants}
                              />
                            ))}

                        {/* B6: visible "Assigned to X" chip inside each gated
                          (not-yours) overlay, edit mode only. Same label as
                          the overlay's title/aria-label (getGatedLabel, kept
                          in sync by the gating effect), so the chip itself
                          is aria-hidden. Positioned from
                          the same scaled rect as its input, so it tracks
                          zoom with it. */}
                        {mode === "edit" &&
                          unassignedVisibility === "readonly" &&
                          (() => {
                            // One viewport per page, not per field.
                            const scale = zoomLevels[zoomLevel];
                            const pageHeight = page.proxy.getViewport({
                              scale,
                            }).height;
                            return page.fields?.map((field) => {
                              const gatedLabel = gatedLabelById.get(field.id);
                              if (!gatedLabel) return null;
                              return (
                                <span
                                  key={`gated_${field.id}`}
                                  className={styles.gatedChipSlot}
                                  data-gated-chip={field.id}
                                  aria-hidden="true"
                                  style={{
                                    left: field.rect[0] * scale,
                                    top: pageHeight - field.rect[3] * scale,
                                    width:
                                      (field.rect[2] - field.rect[0]) * scale,
                                    height:
                                      (field.rect[3] - field.rect[1]) * scale,
                                  }}
                                >
                                  <span className={styles.gatedChip}>
                                    {gatedLabel}
                                  </span>
                                </span>
                              );
                            });
                          })()}
                      </div>

                      {/* Page number, below the page */}
                      <div className={styles.pageNumber}>{index + 1}</div>
                    </div>
                  ))}
            </div>
          </div>
        }
        canvasOverlays={
          <>
            {/* Context Toolbar - Desktop */}
            {!isMobile && mode === "build" && selectedField && (
              <ContextToolbar
                targetRect={contextToolbarTarget}
                containerRef={divRef}
                isVisible={!!selectedField}
                context={
                  selectedFieldData
                    ? {
                        fieldName: selectedFieldData.name,
                        fieldType: selectedFieldData.type,
                      }
                    : undefined
                }
                feedbackText={toolbarFeedbackText}
                // Single-field handlers only: ContextToolbar routes to the
                // onBatch* handlers itself while selectionCount > 1.
                onDelete={() => {
                  clearToolbarFeedback();
                  deleteBuildModeField(selectedField);
                }}
                onDuplicate={() => {
                  clearToolbarFeedback();
                  duplicateField(selectedField);
                }}
                onDuplicateAllPages={() =>
                  handleDuplicateFieldOnAllPages(selectedField)
                }
                isRequired={selectionAllRequired}
                // A6: "N selected" state. Required and Delete apply to the
                // whole selection; Edit and Duplicate act on one field, so
                // the toolbar disables them while count > 1.
                selectionCount={selectedFieldIds.length}
                onBatchRequired={(required: boolean) => {
                  clearToolbarFeedback();
                  handleBatchRequired(required);
                }}
                onBatchDelete={() => {
                  clearToolbarFeedback();
                  handleBatchDelete();
                }}
                onToggleRequired={() => {
                  clearToolbarFeedback();
                  if (!selectedFieldData) return;
                  updateBuildModeField(selectedFieldData.id, {
                    properties: {
                      ...selectedFieldData.properties,
                      required: !selectedFieldData.properties.required,
                    },
                  });
                }}
                onOpenProperties={() => {
                  clearToolbarFeedback();
                  setPropertiesPopoverOpen(true);
                }}
              />
            )}

            {/* Field settings popover - Desktop, build mode. Anchored to
                the same contextToolbarTarget the ContextToolbar uses, so
                it tracks the field through the same LIVE ANCHOR effect. */}
            {!isMobile && mode === "build" && selectedFieldData && (
              <FieldSettingsPopover
                open={propertiesPopoverOpen}
                onOpenChange={setPropertiesPopoverOpen}
                field={selectedFieldData}
                getAnchorRect={measureSelectedFieldRect}
                onUpdateField={updateBuildModeField}
                onEditOptions={() => {
                  // Step the popover aside while the options dialog is
                  // up (Chakra stacks the portaled dialog above it; this
                  // just keeps one panel in focus). Reopened by the
                  // options dialog's onClose below.
                  setPropertiesPopoverOpen(false);
                  setOptionsModalOpen(true);
                }}
                anchorRect={contextToolbarTarget}
              />
            )}
          </>
        }
        rightSidebar={
          !isMobile ? (
            <RightSidebar
              variant={sidebarVariant}
              collapsed={isTabletLayout ? false : !desktopRightOpen}
              progress={
                mode === "edit" && isRightSectionOpen("progress")
                  ? buildProgressPanelProps()
                  : undefined
              }
              hostPanel={
                hostPanelSectionOpen
                  ? {
                      title: sidebarPanel!.title,
                      content: sidebarPanel!.content,
                    }
                  : undefined
              }
              parties={
                partiesSectionOpen && partiesConfigForPanel
                  ? {
                      title: partiesTitle,
                      config: partiesConfigForPanel,
                      participants: participants ?? [],
                      assignMode: assignModeForParties,
                    }
                  : undefined
              }
            />
          ) : undefined
        }
        mobileChrome={
          isMobile ? (
            <MobileChrome
              openDrawer={openDrawer}
              onOpenDrawerChange={setOpenDrawer}
              activePage={activePage}
              totalPages={pages?.length ?? 0}
              onPageSelect={handlePageSelect}
              pageThumbnailsProps={
                pages
                  ? { pages, activePage, onPageSelect: handlePageSelect }
                  : undefined
              }
              properties={
                mode === "build"
                  ? {
                      selectedField: selectedFieldData,
                      onUpdateField: updateBuildModeField,
                      onDeleteField: deleteBuildModeField,
                      onClose: () => setOpenDrawer(null),
                      participants: assignableParticipants,
                      allParticipants: participants,
                    }
                  : undefined
              }
              progress={
                mode !== "build" ? buildProgressPanelProps() : undefined
              }
              hostPanel={
                showSidebarPanel
                  ? {
                      title: sidebarPanel!.title,
                      content: sidebarPanel!.content,
                    }
                  : undefined
              }
              parties={
                showPartiesPanel && partiesConfigForPanel
                  ? {
                      title: partiesTitle,
                      config: partiesConfigForPanel,
                      participants: participants ?? [],
                    }
                  : undefined
              }
              fieldActions={
                mode === "build" && selectedFieldData
                  ? {
                      fieldName: selectedFieldData.name,
                      fieldType: selectedFieldData.type,
                      isRequired: !!selectedFieldData.properties.required,
                      onToggleRequired: () =>
                        updateBuildModeField(selectedFieldData.id, {
                          properties: {
                            ...selectedFieldData.properties,
                            required: !selectedFieldData.properties.required,
                          },
                        }),
                      onEdit: () => setOpenDrawer("properties"),
                      onDuplicate: () => duplicateField(selectedFieldData.id),
                      onDelete: () =>
                        deleteBuildModeField(selectedFieldData.id),
                      onDismiss: () => setSelectedField(null),
                    }
                  : undefined
              }
              showAddField={mode === "build"}
              onAddField={handleFABFieldSelect}
            />
          ) : undefined
        }
        overlays={
          <>
            {/* Signature adoption -- one shared modal instance for every
                signature field's click-to-sign button (see the fields render
                above). savedSignature/onSignatureAdopted are the pinned host
                props; storage is entirely the host's responsibility. The host
                prop wins when present; `lastAdoptedSignature` (this session's
                own cache, see its declaration) fills in for hosts that don't
                persist one, so signing field #2 offers field #1's signature
                as a one-click reuse without asking the signer to redo it. */}
            <SignatureAdoptionModal
              isOpen={!!signingFieldId}
              onClose={() => setSigningFieldId(null)}
              signerName={
                participants?.find((p) => p.id === activeParticipantId)?.label
              }
              savedSignature={
                savedSignature || lastAdoptedSignature || undefined
              }
              onAdopt={(dataUrl) => {
                if (signingFieldId) {
                  fieldValues.setValue(signingFieldId, dataUrl);
                  setIsDirty(true);
                }
                setLastAdoptedSignature(dataUrl);
                onSignatureAdopted?.(dataUrl);
                setSigningFieldId(null);
              }}
            />

            <ConfirmDialogs
              unsaved={{
                open: showUnsavedGuard,
                isSaving,
                onKeepEditing: handleKeepEditing,
                onDiscard: handleDiscardAndClose,
                onSave: handleSaveAndClose,
              }}
              prepare={{
                open: showUnsavedPrepareDialog,
                isSaving,
                onStay: handleStayInPrepare,
                onContinueWithoutSaving: handleFillWithoutSaving,
                onSaveAndContinue: handleSavePreparedAndFill,
              }}
              decline={{
                open: showDeclineConfirm,
                isDeclining,
                onCancel: handleCancelDecline,
                onConfirm: handleConfirmDecline,
              }}
              incomplete={{
                open: showIncompleteSaveDialog,
                count: incompleteFieldCount,
                isSaving,
                onKeepSigning: handleKeepSigning,
                onSaveAnyway: handleSaveAnyway,
              }}
            />

            {/* Edit options - desktop, build mode: opened from the field
                settings popover for dropdown/radio fields. Mobile keeps
                its options editor inline in the Properties sheet. */}
            {!isMobile && mode === "build" && selectedFieldData && (
              <OptionsEditorDialog
                open={optionsModalOpen}
                onClose={() => {
                  setOptionsModalOpen(false);
                  // Return to the field settings popover the options
                  // dialog was opened from (see onEditOptions above).
                  setPropertiesPopoverOpen(true);
                }}
                options={selectedFieldData.properties.options || []}
                onAddOption={handleFieldPopoverAddOption}
                onRemoveOption={handleFieldPopoverRemoveOption}
                showEmptyWarning={isFieldMissingOptions(selectedFieldData)}
              />
            )}
          </>
        }
      />
    );
  }
);

export default PDFEditor;
