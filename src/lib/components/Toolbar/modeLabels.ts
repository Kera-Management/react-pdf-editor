import type { PDFEditorMode } from "../../PDFEditor";

// API values (build/edit/view) are unchanged; only the UI-facing labels
// are renamed. Shared by the mode menu and the Prepare tour's copy.
export const modeLabels: Record<PDFEditorMode, string> = {
  build: "Prepare",
  edit: "Fill & Sign",
  view: "View",
};
