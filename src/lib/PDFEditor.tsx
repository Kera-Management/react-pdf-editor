import styles from "./PDFEditor.module.css";

import {
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

import ZoomOutIcon from "./icons/ZoomOutIcon";
import ZoomInIcon from "./icons/ZoomInIcon";
import PrintIcon from "./icons/PrintIcon";
import usePrint from "./hooks/usePring";
import SaveAsIcon from "./icons/SaveAsIcon";
import FieldPalette from "./components/FieldPalette";
import BuildModeFieldRenderer from "./components/BuildModeFieldRenderer";
import FieldPropertyEditor from "./components/FieldPropertyEditor";

export interface PDFFormFields {
  [x: string]: string;
}

export interface PDFEditorRef {
  formFields: PDFFormFields;
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
export type BuildModeFieldType = "text" | "checkbox" | "dropdown" | "radio" | "multiline" | "signature";

export interface BuildModeField {
  id: string;
  type: BuildModeFieldType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
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
}

const cdnworker = "https://unpkg.com/pdfjs-dist/build/pdf.worker.min.mjs";
GlobalWorkerOptions.workerSrc = cdnworker;

export const PDFEditor = forwardRef<PDFEditorRef, PDFEditorProps>(
  (props, ref) => {
    const { src, workerSrc, onSave, mode = "edit" } = props;
    const divRef = useRef<HTMLDivElement>(null);
    const [maxPageWidth, setMaxPageWidth] = useState(0);
    const [zoomLevel, setZoomLevel] = useState(6);
    const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy>();
    const [docReady, setDocReady] = useState(false);
    const [pages, setPages] = useState<PDFPageAndFormFields[]>();
    const [pagesReady, setPagesReady] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    // Build mode state
    const [buildModeFields, setBuildModeFields] = useState<BuildModeField[]>([]);
    const [selectedField, setSelectedField] = useState<string | null>(null);
    const [draggedFieldType, setDraggedFieldType] = useState<BuildModeFieldType | null>(null);
    const [showPropertyEditor, setShowPropertyEditor] = useState(false);

    useEffect(() => {
      // use cdn pdf.worker.min.mjs if not set
      GlobalWorkerOptions.workerSrc = workerSrc || cdnworker;
    }, [workerSrc]);

    useEffect(() => {
      const loadDocument = async () => {
        setDocReady(false);
        setPdfDoc(await getDocument(src).promise);
        setDocReady(true);
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
          const rawFormFields =
            (await pdfDoc.getFieldObjects()) as PDFFormRawFields;
          const rawPages: PDFPageAndFormFields[] = [];
          setPagesReady(false);
          for (let i = 1; i <= pdfDoc?.numPages; i++) {
            const proxy = await pdfDoc.getPage(i);
            const fields = Object.values(rawFormFields).flatMap((rawFields) =>
              rawFields.filter(
                (rawField) =>
                  rawField.editable &&
                  !rawField.hidden &&
                  // form field page index start from 0
                  // while page proxy pageNumber index start from 1
                  rawField.page === proxy.pageNumber - 1
              )
            );
            rawPages.push({ proxy, fields });
          }
          setPages(rawPages);
          setPagesReady(true);
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
          const viewport = page.proxy.getViewport({ scale });
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
              page.proxy.render({
                canvasContext: sourceContext,
                viewport: page.proxy.getViewport({
                  scale: scale * ratio, // draw ratio pixels into Canvas
                }),
              });
            }
          }
          const pageDivContainer = divRef.current?.querySelector(
            "div#page_div_container_" + page.proxy.pageNumber
          ) as HTMLDivElement;
          pageDivContainer?.querySelectorAll("input, select").forEach((e) => {
            const input = e as HTMLInputElement;
            const field = page.fields?.find((field) => field.id === input.dataset.fieldId);
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

    const getAllFieldsValue = () => {
      const fieldElements = divRef?.current?.querySelectorAll("input, select");
      return fieldElements
        ? Array.from(fieldElements)
            .map((e) => {
              const field = e as HTMLInputElement;
              const selectElement = e as HTMLSelectElement;
              let value = field.value;
              switch (field.type) {
                case "checkbox":
                  value = field.checked ? "On" : "Off";
                  break;
                case "combobox":
                  value =
                    selectElement.options[selectElement.selectedIndex].value;
                  break;
                default:
                  break;
              }
              return {
                [field.name]: value,
              } as PDFFormFields;
            })
            .reduce((result, currentObject) => {
              return { ...result, ...currentObject };
            }, {})
        : {};
    };

    // expose formFields value
    useImperativeHandle(ref, () => ({
      formFields: getAllFieldsValue(),
    }));

    // Build mode field management
    const generateFieldId = () => `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const addBuildModeField = useCallback((
      type: BuildModeFieldType,
      x: number,
      y: number,
      pageNumber: number
    ) => {
      const defaultDimensions = {
        text: { width: 200, height: 16 },
        multiline: { width: 300, height: 80 },
        checkbox: { width: 16, height: 16 },
        dropdown: { width: 200, height: 16 },
        radio: { width: 100, height: 16 },
        signature: { width: 300, height: 16 }
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
        properties: {
          placeholder: type === "text" ? "Enter text..." : undefined,
          required: false,
          fontSize: 12,
          fontColor: "#000000",
          backgroundColor: "#ffffff",
          borderColor: "#000000"
        }
      };

      setBuildModeFields(prev => [...prev, newField]);
      setSelectedField(fieldId);
    }, []);

    const deleteBuildModeField = useCallback((fieldId: string) => {
      setBuildModeFields(prev => prev.filter(f => f.id !== fieldId));
      if (selectedField === fieldId) {
        setSelectedField(null);
      }
    }, [selectedField]);

    const moveBuildModeField = useCallback((fieldId: string, x: number, y: number) => {
      setBuildModeFields(prev =>
        prev.map(field =>
          field.id === fieldId ? { ...field, x: Math.max(0, x), y: Math.max(0, y) } : field
        )
      );
    }, []);

    const resizeBuildModeField = useCallback((fieldId: string, width: number, height: number) => {
      setBuildModeFields(prev =>
        prev.map(field =>
          field.id === fieldId ? { ...field, width: Math.max(20, width), height: Math.max(20, height) } : field
        )
      );
    }, []);

    const updateBuildModeField = useCallback((fieldId: string, updates: Partial<BuildModeField>) => {
      setBuildModeFields(prev =>
        prev.map(field =>
          field.id === fieldId ? { ...field, ...updates } : field
        )
      );
    }, []);

    // Handle field selection with single click for property editor
    const handleFieldSelect = useCallback((fieldId: string) => {
      setSelectedField(fieldId);
      setShowPropertyEditor(true);
    }, []);

    // use react-print for the pdf print
    const onPrint = usePrint(divRef);

    const onPrintClicked = () => {
      onPrint();
    };

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
        
        // Add build mode fields to the PDF
        if (mode === "build" && buildModeFields.length > 0) {
          for (const buildField of buildModeFields) {
            const pdfPages = libDoc.getPages();
            const page = pdfPages[buildField.page];
            
            if (page) {
              const { height: pageHeight } = page.getSize();
              
              // Convert coordinates (PDF uses bottom-left origin, we use top-left)
              const pdfX = buildField.x;
              const pdfY = pageHeight - buildField.y - buildField.height;
              const pdfWidth = buildField.width;
              const pdfHeight = buildField.height;

              try {
                switch (buildField.type) {
                  case "text":
                    form.createTextField(buildField.name)
                      .addToPage(page, { x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight })
                      .setText(buildField.properties.defaultValue || "")
                      .setFontSize(buildField.properties.fontSize || 12);
                    break;
                    
                  case "multiline":
                    form.createTextField(buildField.name)
                      .addToPage(page, { x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight })
                      .setText(buildField.properties.defaultValue || "")
                      .setFontSize(buildField.properties.fontSize || 12)
                      .enableMultiline();
                    break;
                    
                  case "checkbox":
                    form.createCheckBox(buildField.name)
                      .addToPage(page, { x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight });
                    break;
                    
                  case "dropdown": {
                    const dropdown = form.createDropdown(buildField.name)
                      .addToPage(page, { x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight });
                    
                    if (buildField.properties.options) {
                      const options = buildField.properties.options.map(opt => opt.exportValue);
                      dropdown.setOptions(options);
                      if (buildField.properties.defaultValue) {
                        dropdown.select(buildField.properties.defaultValue);
                      }
                    }
                    break;
                  }
                    
                  case "radio":
                    // For radio buttons, we create a radio group
                    form.createRadioGroup(buildField.name)
                      .addOptionToPage(buildField.name + "_option", page, { x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight });
                    break;
                    
                  case "signature":
                    // For signature fields, we create a text field that can be marked for signatures
                    form.createTextField(buildField.name)
                      .addToPage(page, { x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight })
                      .setText("")
                      .setFontSize(buildField.properties.fontSize || 12);
                    break;
                }
              } catch (error) {
                console.warn(`Failed to add field ${buildField.name}:`, error);
              }
            }
          }
        }
        
        // Handle existing form fields
        const formFields = getAllFieldsValue();
        for (const field of form.getFields()) {
          const value = formFields[field.getName()];
          if (field instanceof PDFTextField) {
            (field as PDFTextField).setText(value);
          } else if (field instanceof PDFCheckBox) {
            if (value === "On") {
              (field as PDFCheckBox).check();
            } else {
              (field as PDFCheckBox).uncheck();
            }
          } else if (field instanceof PDFDropdown) {
            (field as PDFDropdown).select(value);
          } else if (field instanceof PDFOptionList) {
            // FIXME...not render the input elements for this part field yet
            // TODO... handle multiple select, choice type in pdf.js
          } else if (field instanceof PDFRadioGroup) {
            // TODO... handle A set of radio buttons where users can select only one option from the group.
            // Specifically, for a radio button in a radio group, the fieldFlags property of the field object may contain the RADIO flag.
          }
        }
        
        const savedData = await libDoc.save();
        if (onSave) {
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
          await saveFileUsingFilePicker(
            savedData,
            fileName || "download.pdf"
          );
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
      const canvas = pageContainer.querySelector('canvas');
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

    return (
      <div className={styles.rootContainer}>
        {mode === "build" && (
          <FieldPalette
            onFieldDragStart={setDraggedFieldType}
            onFieldDragEnd={() => setDraggedFieldType(null)}
          />
        )}
        <div className={styles.mainContent}>
          <div className={styles.toolbarContainer}>
            <button
              className={styles.toolbarButton}
              title="Zoom Out"
              onClick={() => setZoomLevel(zoomLevel - 1)}
              disabled={zoomLevel <= 0}
              type="button"
            >
              <ZoomOutIcon className={styles.svgIcon} />
            </button>
            <button
              title="Zoom In"
              className={styles.toolbarButton}
              onClick={() => setZoomLevel(zoomLevel + 1)}
              disabled={zoomLevel >= zoomLevels.length - 1}
              type="button"
            >
              <ZoomInIcon className={styles.svgIcon} />
            </button>
            <button
              title="Print"
              className={styles.toolbarButton}
              onClick={onPrintClicked}
              type="button"
            >
              <PrintIcon className={styles.svgMediumIcon} />
            </button>
            {mode !== "view" && (
              <button
                title="Save as"
                className={styles.toolbarButton}
                onClick={onSaveAs}
                type="button"
                disabled={isSaving}
              >
                <SaveAsIcon className={styles.svgMediumIcon} />
              </button>
            )}
          </div>
          <div ref={divRef} className={styles.pdfContainer}>
          {pages &&
            pages.length > 0 &&
            pages
              .filter((page) => !page.proxy?.destroyed)
              .map((page) => (
                <div
                  id={"page_div_container_" + page.proxy.pageNumber}
                  key={"page_" + page.proxy.pageNumber}
                  className={styles.pdfPageContainer}
                  onDragOver={mode === "build" ? handleDragOver : undefined}
                  onDrop={mode === "build" ? (e) => handleDrop(e, page.proxy.pageNumber) : undefined}
                  onClick={mode === "build" ? () => setSelectedField(null) : undefined}
                >
                  <canvas id={"page_canvas_" + page.proxy.pageNumber} />
                  
                  {/* Existing form fields */}
                  {page.fields &&
                    page.fields.map((field) => {
                      if (field.type === "combobox")
                        return (
                          <select
                            name={field.name}
                            title={field.name}
                            key={field.id}
                            data-field-id={field.id}
                            defaultValue={field.defaultValue}
                            className={styles.pdfSelect}
                            disabled={mode === "view"}
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
                          defaultValue={field.defaultValue}
                          name={field.name}
                          key={field.id}
                          data-field-id={field.id}
                          className={styles.pdfInput}
                          readOnly={mode === "view"}
                          onChange={field.type === "checkbox" && mode !== "view" ? (e) => {
                            const checkbox = e.target as HTMLInputElement;
                            if (checkbox.checked) {
                              // For radio-like behavior, uncheck other checkboxes with same name
                              const sameNameCheckboxes = document.querySelectorAll(
                                `input[type="checkbox"][name="${field.name}"]`
                              ) as NodeListOf<HTMLInputElement>;
                              sameNameCheckboxes.forEach((cb) => {
                                if (cb !== checkbox) {
                                  cb.checked = false;
                                }
                              });
                            }
                          } : undefined}
                        />
                      );
                    })}
                  
                  {/* Build mode fields */}
                  {mode === "build" && buildModeFields
                    .filter((field) => field.page === page.proxy.pageNumber - 1)
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
        
        {/* Property Editor Modal */}
        {mode === "build" && showPropertyEditor && selectedField && (
          <FieldPropertyEditor
            field={buildModeFields.find(f => f.id === selectedField) || null}
            onUpdateField={updateBuildModeField}
            onClose={() => setShowPropertyEditor(false)}
          />
        )}
      </div>
    );
  }
);

export default PDFEditor;
