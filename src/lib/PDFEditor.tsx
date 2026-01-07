import "./theme.css";
import styles from "./PDFEditor.module.css";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  PDFDocumentProxy,
  PDFPageProxy,
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
// New component imports
import { useResponsive } from "./hooks/useResponsive";
import { usePanelState } from "./hooks/usePanelState";
import HeaderBar from "./components/Toolbar/HeaderBar";
import { PageThumbnails } from "./components/Panels/PageThumbnails";
import { FieldPalette } from "./components/Panels/FieldPalette";
import { PropertiesPanel } from "./components/Panels/PropertiesPanel";
import { ProgressPanel } from "./components/Panels/ProgressPanel";
import { ContextToolbar } from "./components/Toolbar/ContextToolbar";
import { BottomSheet, SnapPoint } from "./components/Mobile/BottomSheet";
import { FloatingActionButton } from "./components/Mobile/FloatingActionButton";
import BuildModeFieldRenderer from "./components/BuildModeFieldRenderer";

export interface PDFFormFields {
  [x: string]: string;
}

export interface PDFEditorRef {
  formFields: PDFFormFields;
  save: () => Promise<void>;
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
  type: "text" | "checkbox" | "combobox" | "radio" | "list";
  value: string | "Off" | "On";
  defaultValue: string | "Off" | "On";
  // combobox items
  items?: ComboboxItem[];
  // TBD: actions, charLimit, combo, fillColor, rotation, strokeColor
}

// Extended field type for build mode
export type BuildModeFieldType =
  | "text"
  | "checkbox"
  | "dropdown"
  | "radio"
  | "multiline"
  | "signature";

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

const zoomLevels = [
  0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 3.5, 4.0,
];

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
   * @returns
   */
  onSave?: (pdfBytes: Uint8Array, formFields: PDFFormFields) => void;
  /** Participants that can be assigned to fields in build mode */
  participants?: { id: string; label: string; role?: "landlord" | "tenant" }[];
  /** Active participant in edit mode. If provided, only their assigned fields are editable. */
  activeParticipantId?: string;
  /** Visibility rule for fields not assigned to the active participant in edit mode */
  unassignedVisibility?: "readonly" | "hidden";
  /** Optional callback to receive the built schema along with saved PDF in build mode */
  onBuildSave?: (
    pdfBytes: Uint8Array,
    buildSchema: BuildModeField[],
    fieldAssignments: Record<string, string[]>
  ) => void;
  /** Optional mapping from field name to participant ids for enforcement in edit mode. If not provided, will be automatically extracted from PDF metadata. */
  fieldAssignments?: Record<string, string[]>;
  /** Theme for the editor UI. Defaults to "light". */
  theme?: "light" | "dark";
  /** Optional callback when the close button is clicked */
  onClose?: () => void;
  /** Allowed modes to show in the mode selector. Defaults to all modes. */
  allowedModes?: PDFEditorMode[];
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
      theme = "light",
      onClose,
      allowedModes = ["build", "edit", "view"],
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

    // Build mode state
    const [buildModeFields, setBuildModeFields] = useState<BuildModeField[]>(
      []
    );
    const [selectedField, setSelectedField] = useState<string | null>(null);
    const [draggedFieldType, setDraggedFieldType] =
      useState<BuildModeFieldType | null>(null);
    // Property editing is handled inside FieldPalette now

    // Store extracted field assignments from PDF metadata
    const extractedFieldAssignments = useRef<Record<string, string[]> | null>(
      null
    );

    // Pinch-to-zoom state
    const lastPinchDistance = useRef<number>(0);
    const isPinching = useRef<boolean>(false);

    // New UI state
    const { isMobile } = useResponsive();
    const { openPanel, closePanel, togglePanel, isPanelOpen } = usePanelState();

    // Active page tracking
    const [activePage, setActivePage] = useState(1);

    // Mobile bottom sheet state
    const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
    const [bottomSheetSnap, setBottomSheetSnap] =
      useState<SnapPoint>("collapsed");

    // Context toolbar state
    const [contextToolbarTarget, setContextToolbarTarget] =
      useState<DOMRect | null>(null);

    useEffect(() => {
      // use cdn pdf.worker.min.mjs if not set
      GlobalWorkerOptions.workerSrc = workerSrc || defaultWorkerSrc;
    }, [workerSrc]);

    useEffect(() => {
      const loadDocument = async () => {
        setDocReady(false);
        try {
          const doc = await getDocument(src).promise;
          setPdfDoc(doc);

          // Try to extract field assignments from PDF metadata
          try {
            const pdfBytes = await doc.getData();
            const libDoc = await PDFDocument.load(pdfBytes);
            const title = libDoc.getTitle();

            if (title && title.startsWith("REACT_PDF_EDITOR_ASSIGNMENTS:")) {
              const assignmentsJson = title.replace(
                "REACT_PDF_EDITOR_ASSIGNMENTS:",
                ""
              );
              const extractedAssignments = JSON.parse(assignmentsJson);

              // Store extracted assignments for internal use
              extractedFieldAssignments.current = extractedAssignments;
            }
          } catch (error) {
            console.warn(
              "Failed to extract field assignments from PDF:",
              error
            );
          }

          setDocReady(true);
        } catch (error) {
          console.error("Failed to load PDF document:", error);
          // Set docReady to true even on error to prevent infinite loading
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
    }, [src]);

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
                      rawFields.filter(
                        (rawField) =>
                          rawField.editable &&
                          !rawField.hidden &&
                          // form field page index start from 0
                          // while page proxy pageNumber index start from 1
                          rawField.page === proxy.pageNumber - 1
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
                try {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (page.proxy.render as any)({
                    canvasContext: sourceContext,
                    viewport: page.proxy.getViewport({
                      scale: scale * ratio, // draw ratio pixels into Canvas
                    }),
                  });
                } catch (renderError) {
                  console.error(
                    `Failed to render page ${page.proxy.pageNumber}:`,
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
          pageDivContainer?.querySelectorAll("input, select").forEach((e) => {
            const input = e as HTMLInputElement;
            const field = page.fields?.find(
              (field) => field.id === input.dataset.fieldId
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
              input.style.left = rect[0] + "px";
              /**
               * The coordinate system used in many graphics-related contexts, including PDF,
               * often has the origin (0,0) located at the bottom-left corner, with the y-axis increasing upwards.
               * This convention is known as the Cartesian coordinate system.
               */
              input.style.top = viewport.height - rect[3] + "px";
              input.style.width = rect[2] - rect[0] + "px";
              input.style.height = rect[3] - rect[1] + "px";
            }

            // Enforce assignment in edit mode by disabling or hiding
            if (mode === "edit" && activeParticipantId && field) {
              // Prioritize extracted assignments from PDF metadata, fallback to prop
              const effectiveAssignments =
                extractedFieldAssignments.current || fieldAssignments;
              const assignedIds = effectiveAssignments?.[field.name];
              const isAssigned = assignedIds
                ? assignedIds.includes(activeParticipantId)
                : true; // default allow if no mapping provided

              if (!isAssigned) {
                if (unassignedVisibility === "hidden") {
                  (input as HTMLElement).style.display = "none";
                } else {
                  input.setAttribute("disabled", "true");
                }
              } else {
                (input as HTMLElement).style.display = "";
                input.removeAttribute("disabled");
              }
            }
          });
        });
        if (maxPageWidth === 0) {
          setMaxPageWidth(maxPageActualWidth);
        }
      },
      // intend not include maxPageWidth, once the first loop set the max page width is enough
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [pages]
    );

    useEffect(() => {
      if (pagesReady) {
        renderPages(zoomLevels[zoomLevel]);
      }
    }, [pagesReady, renderPages, zoomLevel]);

    // re-calculate view scale level on window resize event.
    const resetViewScale = useCallback(
      (divWidth: number | undefined) => {
        if (divWidth && maxPageWidth) {
          const scaleValue = divWidth / maxPageWidth;
          let minDifference = Infinity;
          let closestZoomLevel;
          for (let i = 0; i < zoomLevels.length; i++) {
            const difference = Math.abs(scaleValue - zoomLevels[i]);
            if (difference < minDifference) {
              minDifference = difference;
              closestZoomLevel = i;
            }
          }
          setZoomLevel(closestZoomLevel || 6);
        }
      },
      [maxPageWidth]
    );

    useEffect(() => {
      const handleResize = () => {
        resetViewScale(divRef?.current?.offsetWidth);
      };
      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }, [resetViewScale]);

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

    const getAllFieldsValue = () => {
      // Get field values from state instead of DOM elements
      if (!pages) return {};

      const formFields: PDFFormFields = {};

      pages.forEach((page) => {
        page.fields?.forEach((field) => {
          if (field.name) {
            formFields[field.name] = field.value || field.defaultValue || "";
          }
        });
      });

      return formFields;
    };

    // Calculate progress for the active participant
    const getProgressData = () => {
      const formFields = getAllFieldsValue();

      // Get effective field assignments
      const effectiveAssignments =
        extractedFieldAssignments.current || fieldAssignments;

      // Get fields assigned to the active participant
      let assignedFieldNames: string[];
      if (effectiveAssignments && activeParticipantId) {
        assignedFieldNames = Object.entries(effectiveAssignments)
          .filter(([, assignees]) => assignees.includes(activeParticipantId))
          .map(([fieldName]) => fieldName);
      } else {
        // If no assignments, count all fields
        assignedFieldNames = Object.keys(formFields);
      }

      // Count completed fields only for assigned fields
      const totalCompleted = assignedFieldNames.filter((fieldName) => {
        const value = formFields[fieldName];
        return value && value.trim() !== "" && value !== "Off";
      }).length;

      return {
        formFields,
        totalFields: assignedFieldNames.length,
        completedFields: totalCompleted,
      };
    };

    // expose formFields value and save function
    useImperativeHandle(ref, () => ({
      get formFields() {
        return getAllFieldsValue();
      },
      save: onSaveAs,
    }));

    // Build mode field management
    const generateFieldId = () =>
      `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const addBuildModeField = useCallback(
      (type: BuildModeFieldType, x: number, y: number, pageNumber: number) => {
        const defaultDimensions = {
          text: { width: 115, height: 16 },
          multiline: { width: 300, height: 80 },
          checkbox: { width: 16, height: 16 },
          dropdown: { width: 115, height: 16 },
          radio: { width: 100, height: 16 },
          signature: { width: 115, height: 16 },
        };

        const dimensions = defaultDimensions[type];
        const fieldId = generateFieldId();

        const newField: BuildModeField = {
          id: fieldId,
          type,
          name: `${type}_${fieldId}`,
          x,
          y,
          width: dimensions.width,
          height: dimensions.height,
          page: pageNumber,
          origin: "new",
          properties: {
            placeholder: type === "text" ? "Enter text..." : undefined,
            required: false,
            fontSize: 12,
            fontColor: "#000000",
            backgroundColor: "#ffffff",
            borderColor: "#000000",
          },
        };

        setBuildModeFields((prev) => [...prev, newField]);
        setSelectedField(fieldId);
      },
      []
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
        const scale = zoomLevels[zoomLevel];

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
          else if (field.type === "list") mappedType = "dropdown"; // fallback
          else if (field.type === "text" && field.multiline)
            mappedType = "multiline";

          const rect = field.rect; // [llx, lly, urx, ury]
          const x = rect[0];
          const yTopLeft = pageHeight - rect[3];
          const width = rect[2] - rect[0];
          const height = rect[3] - rect[1];

          // Get assignments for this field from extracted metadata
          const fieldAssignments =
            extractedFieldAssignments.current?.[field.name] || [];

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
              required: false,
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
        if (selectedField === fieldId) {
          setSelectedField(null);
        }
      },
      [selectedField]
    );

    const moveBuildModeField = useCallback(
      (fieldId: string, x: number, y: number) => {
        setBuildModeFields((prev) =>
          prev.map((field) =>
            field.id === fieldId
              ? { ...field, x: Math.max(0, x), y: Math.max(0, y) }
              : field
          )
        );
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
      },
      []
    );

    // Handle field selection with single click for property editor
    const handleFieldSelect = useCallback(
      (fieldId: string) => {
        setSelectedField(fieldId);

        // Update context toolbar position
        setTimeout(() => {
          const fieldElement = document.querySelector(
            `[data-field-id="${fieldId}"]`
          );
          if (fieldElement) {
            setContextToolbarTarget(fieldElement.getBoundingClientRect());
          }
        }, 0);

        // Open properties panel on desktop, bottom sheet on mobile
        if (isMobile) {
          setBottomSheetOpen(true);
          setBottomSheetSnap("partial");
        } else {
          openPanel("properties");
        }
      },
      [isMobile, openPanel]
    );

    // Handle field focus from progress panel
    const handleFieldFocus = useCallback((fieldName: string) => {
      // Find the input element with this field name
      const input = document.querySelector(
        `input[name="${fieldName}"], select[name="${fieldName}"]`
      ) as HTMLInputElement | HTMLSelectElement;

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
          // Highlight the input briefly
          input.style.boxShadow = "0 0 0 3px rgba(0, 178, 152, 0.3)";
          setTimeout(() => {
            input.style.boxShadow = "";
          }, 2000);
        }, 300);
      }
    }, []);

    // Handle page navigation from thumbnails
    const handlePageSelect = useCallback((pageNumber: number) => {
      setActivePage(pageNumber);
      const pageContainer = document.querySelector(
        `#page_div_container_${pageNumber}`
      );
      if (pageContainer) {
        pageContainer.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, []);

    // Handle mode change - only allow switching to allowed modes
    const handleModeChange = useCallback(
      (newMode: PDFEditorMode) => {
        if (allowedModes.includes(newMode)) {
          setMode(newMode);
        }
      },
      [allowedModes]
    );

    // Handle field duplication
    const duplicateField = useCallback(
      (fieldId: string) => {
        const field = buildModeFields.find((f) => f.id === fieldId);
        if (field) {
          const newField: BuildModeField = {
            ...field,
            id: `${field.type}_${Date.now()}`,
            x: field.x + 20,
            y: field.y + 20,
            name: `${field.name}_copy`,
          };
          setBuildModeFields((prev) => [...prev, newField]);
          setSelectedField(newField.id);
        }
      },
      [buildModeFields]
    );

    // Close selection when clicking on canvas
    const handleCanvasClick = useCallback(() => {
      setSelectedField(null);
      setContextToolbarTarget(null);
    }, []);

    // Handle FAB field selection (mobile)
    const handleFABFieldSelect = useCallback(
      (fieldType: BuildModeFieldType) => {
        // Add field to center of viewport
        if (divRef.current && pages && pages.length > 0) {
          const container = divRef.current;
          const containerRect = container.getBoundingClientRect();
          const scale = zoomLevels[zoomLevel];

          // Calculate center position
          const centerX =
            (containerRect.width / 2 + container.scrollLeft) / scale;
          const centerY =
            (containerRect.height / 2 + container.scrollTop) / scale;

          addBuildModeField(fieldType, centerX, centerY, activePage - 1);
        }
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
      const originData = await pdfDoc?.getData();
      if (originData) {
        const libDoc = await PDFDocument.load(originData);
        const form = libDoc.getForm();

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

        for (const field of form.getFields()) {
          const fieldName = field.getName();
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
          } else if (field instanceof PDFOptionList) {
            // FIXME...not render the input elements for this part field yet
            // TODO... handle multiple select, choice type in pdf.js
          } else if (field instanceof PDFRadioGroup) {
            // TODO... handle A set of radio buttons where users can select only one option from the group.
            // Specifically, for a radio button in a radio group, the fieldFlags property of the field object may contain the RADIO flag.
          }
        }

        // After build-mode rebuild, set values for all fields
        if (mode === "build") {
          const formFields = getAllFieldsValue();
          for (const field of form.getFields()) {
            const fieldName = field.getName();
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

        const savedData = await libDoc.save();

        if (mode === "build" && onBuildSave) {
          // Create a mapping from field names to assignees for the parent app
          const fieldAssignmentsMap: Record<string, string[]> = {};
          buildModeFields.forEach((field) => {
            if (
              field.properties.assignees &&
              field.properties.assignees.length > 0
            ) {
              fieldAssignmentsMap[field.name] = field.properties.assignees;
            }
          });

          // Store field assignments in PDF metadata
          const assignmentsJson = JSON.stringify(fieldAssignmentsMap);
          const titleWithAssignments = `REACT_PDF_EDITOR_ASSIGNMENTS:${assignmentsJson}`;

          libDoc.setTitle(titleWithAssignments);

          // Re-save with metadata
          const savedDataWithMetadata = await libDoc.save();

          onBuildSave(
            savedDataWithMetadata,
            buildModeFields,
            fieldAssignmentsMap
          );
        } else if (onSave) {
          onSave(savedData, formFields);
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
      }
      setIsSaving(false);
    };

    if (!docReady || !pagesReady) return null;

    // Drag and drop handlers
    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };

    const handleDrop = (e: React.DragEvent, pageNumber: number) => {
      e.preventDefault();

      if (mode !== "build" || !draggedFieldType) return;

      const pageContainer = e.currentTarget as HTMLElement;
      const scale = zoomLevels[zoomLevel];

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

    // Calculate zoom percentage for display
    const zoomPercentage = Math.round(zoomLevels[zoomLevel] * 100);

    // Get selected field data for properties panel
    const selectedFieldData = selectedField
      ? buildModeFields.find((f) => f.id === selectedField) || null
      : null;

    return (
      <div
        className={`${styles.rootContainer} pdf-editor-root`}
        data-theme={theme}
      >
        {/* Header Bar */}
        <HeaderBar
          mode={mode}
          onModeChange={handleModeChange}
          allowedModes={allowedModes}
          zoomPercentage={zoomPercentage}
          onZoomIn={() =>
            setZoomLevel((prev) => Math.min(prev + 1, zoomLevels.length - 1))
          }
          onZoomOut={() => setZoomLevel((prev) => Math.max(prev - 1, 0))}
          zoomInDisabled={zoomLevel >= zoomLevels.length - 1}
          zoomOutDisabled={zoomLevel <= 0}
          onSave={onSaveAs}
          isSaving={isSaving}
          onClose={onClose}
          currentPage={activePage}
          totalPages={pages?.length || 0}
          isMobile={isMobile}
          onToggleLeftPanel={() => togglePanel("thumbnails")}
        />

        {/* Main Layout */}
        <div className={styles.mainLayout}>
          {/* Left Sidebar - Desktop only */}
          {!isMobile && (
            <div
              className={`${styles.leftSidebar} ${
                !isPanelOpen("thumbnails") ? styles.collapsed : ""
              }`}
            >
              {/* Field Palette - Build mode only (shown first) */}
              {mode === "build" && (
                <div className={styles.sidebarSection}>
                  <div className={styles.sidebarHeader}>
                    <span className={styles.sidebarTitle}>Fields</span>
                  </div>
                  <div className={styles.sidebarContent}>
                    <FieldPalette
                      onFieldDragStart={setDraggedFieldType}
                      onFieldDragEnd={() => setDraggedFieldType(null)}
                      onTouchDrop={handleFieldTouchDrop}
                      selectedField={selectedFieldData}
                      onCloseEditor={() => setSelectedField(null)}
                    />
                  </div>
                </div>
              )}

              {/* Page Thumbnails */}
              <div className={styles.sidebarSection}>
                <div className={styles.sidebarHeader}>
                  <span className={styles.sidebarTitle}>Pages</span>
                </div>
                <div className={styles.sidebarContent}>
                  {pages && (
                    <PageThumbnails
                      pages={pages}
                      activePage={activePage}
                      onPageSelect={handlePageSelect}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Canvas Area */}
          <div className={styles.canvasArea}>
            <div
              ref={divRef}
              className={styles.documentContainer}
              onClick={handleCanvasClick}
            >
              <div className={styles.pageWrapper}>
                {pages &&
                  pages.length > 0 &&
                  pages
                    .filter((page) => !page.proxy?.destroyed)
                    .map((page, index) => (
                      <div
                        id={"page_div_container_" + page.proxy.pageNumber}
                        key={"page_" + page.proxy.pageNumber}
                        className={styles.pageContainer}
                        onDragOver={
                          mode === "build" ? handleDragOver : undefined
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

                        {/* Page Number Badge */}
                        <div className={styles.pageNumber}>{index + 1}</div>

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
                                  value={field.value || field.defaultValue}
                                  className={styles.pdfSelect}
                                  style={style}
                                  disabled={mode === "view"}
                                  onChange={(e) => {
                                    if (mode !== "view") {
                                      setPages((prevPages) =>
                                        prevPages?.map((page) => ({
                                          ...page,
                                          fields: page.fields?.map((f) =>
                                            f.id === field.id
                                              ? { ...f, value: e.target.value }
                                              : f
                                          ),
                                        }))
                                      );
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
                            return (
                              <input
                                type={field.type}
                                {...(field.type === "checkbox"
                                  ? {
                                      checked:
                                        (field.value || field.defaultValue) ===
                                        "On",
                                    }
                                  : {
                                      value: field.value || field.defaultValue,
                                    })}
                                name={field.name}
                                key={field.id}
                                data-field-id={field.id}
                                className={styles.pdfInput}
                                style={style}
                                readOnly={mode === "view"}
                                onChange={(e) => {
                                  if (mode !== "view") {
                                    const target = e.target as HTMLInputElement;
                                    let newValue: string;

                                    if (field.type === "checkbox") {
                                      newValue = target.checked ? "On" : "Off";
                                      if (target.checked) {
                                        const sameNameCheckboxes =
                                          document.querySelectorAll(
                                            `input[type="checkbox"][name="${field.name}"]`
                                          ) as NodeListOf<HTMLInputElement>;
                                        sameNameCheckboxes.forEach((cb) => {
                                          if (cb !== target) {
                                            cb.checked = false;
                                          }
                                        });
                                      }
                                    } else {
                                      newValue = target.value;
                                    }

                                    setPages((prevPages) =>
                                      prevPages?.map((page) => ({
                                        ...page,
                                        fields: page.fields?.map((f) =>
                                          f.id === field.id
                                            ? { ...f, value: newValue }
                                            : f
                                        ),
                                      }))
                                    );
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
                                onSelect={handleFieldSelect}
                                onDelete={deleteBuildModeField}
                                onMove={moveBuildModeField}
                                onResize={resizeBuildModeField}
                              />
                            ))}
                      </div>
                    ))}
              </div>
            </div>

            {/* Context Toolbar - Desktop */}
            {!isMobile && mode === "build" && selectedField && (
              <ContextToolbar
                targetRect={contextToolbarTarget}
                containerRef={divRef}
                isVisible={!!selectedField}
                onDelete={() => deleteBuildModeField(selectedField)}
                onDuplicate={() => duplicateField(selectedField)}
              />
            )}
          </div>

          {/* Right Sidebar - Desktop only */}
          {!isMobile && (
            <div
              className={`${styles.rightSidebar} ${
                !isPanelOpen("properties") && !isPanelOpen("progress")
                  ? styles.collapsed
                  : ""
              }`}
            >
              {/* Properties Panel - Build mode */}
              {mode === "build" && isPanelOpen("properties") && (
                <div className={styles.sidebarSection}>
                  <div className={styles.sidebarHeader}>
                    <span className={styles.sidebarTitle}>Properties</span>
                  </div>
                  <div className={styles.sidebarContent}>
                    <PropertiesPanel
                      selectedField={selectedFieldData}
                      onUpdateField={updateBuildModeField}
                      onDeleteField={deleteBuildModeField}
                      onClose={() => closePanel("properties")}
                      participants={participants}
                    />
                  </div>
                </div>
              )}

              {/* Progress Panel - Edit mode */}
              {mode === "edit" && (
                <div className={styles.sidebarSection}>
                  <div className={styles.sidebarHeader}>
                    <span className={styles.sidebarTitle}>Progress</span>
                  </div>
                  <div className={styles.sidebarContent}>
                    <ProgressPanel
                      activeParticipantId={activeParticipantId}
                      participants={participants}
                      fieldAssignments={
                        extractedFieldAssignments.current ||
                        fieldAssignments ||
                        undefined
                      }
                      formFields={progressData.formFields}
                      totalFields={progressData.totalFields}
                      completedFields={progressData.completedFields}
                      mode={mode}
                      onFieldFocus={handleFieldFocus}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile Page Indicator */}
        {isMobile && pages && pages.length > 1 && (
          <div className={styles.pageIndicator}>
            {activePage} / {pages.length}
          </div>
        )}

        {/* Mobile Bottom Sheet */}
        {isMobile && (
          <BottomSheet
            isOpen={bottomSheetOpen}
            onClose={() => setBottomSheetOpen(false)}
            snapPoint={bottomSheetSnap}
            onSnapChange={setBottomSheetSnap}
            title={mode === "build" ? "Properties" : "Progress"}
          >
            {mode === "build" ? (
              <PropertiesPanel
                selectedField={selectedFieldData}
                onUpdateField={updateBuildModeField}
                onDeleteField={deleteBuildModeField}
                onClose={() => setBottomSheetOpen(false)}
                participants={participants}
              />
            ) : (
              <ProgressPanel
                activeParticipantId={activeParticipantId}
                participants={participants}
                fieldAssignments={
                  extractedFieldAssignments.current ||
                  fieldAssignments ||
                  undefined
                }
                formFields={progressData.formFields}
                totalFields={progressData.totalFields}
                completedFields={progressData.completedFields}
                mode={mode}
                onFieldFocus={handleFieldFocus}
              />
            )}
          </BottomSheet>
        )}

        {/* Mobile FAB - Build mode only */}
        {isMobile && mode === "build" && (
          <FloatingActionButton
            onFieldSelect={handleFABFieldSelect}
            bottomOffset={bottomSheetOpen ? 100 : 24}
          />
        )}
      </div>
    );
  }
);

export default PDFEditor;
