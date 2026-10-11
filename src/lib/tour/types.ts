import type { ReactNode } from "react";
import type { TourStepDetails } from "@ark-ui/react/tour";

/** The editor's guided tours (guided tour spec §3). One id per mode. */
export type EditorTourId = "pdf_prepare" | "pdf_sign";

/** "completed": the user reached the last step and chose Done. Everything
 * else (Skip, the close button, Esc, a background click, a mode switch,
 * the Mobile friendly / Original toggle, Finish, a dialog opening, the
 * editor closing) is "dismissed". */
export type EditorTourEndReason = "completed" | "dismissed";

export interface EditorTourEndMeta {
  /** True when the tour was started from "Show tour" in More actions. */
  replay: boolean;
  /** 1-based number of the last step shown, counting only the steps this
   * run actually had (steps whose anchor was missing are skipped). */
  lastStep: number;
}

/**
 * Which tours the host says this person hasn't seen. Keyed by what the tour
 * teaches, never by who the person is: the editor maps its current mode to
 * a tour (`build` -> `prepare`, `edit` -> `sign`, `view` -> none).
 */
export interface PDFEditorTours {
  prepare?: boolean;
  sign?: boolean;
}

/** One step, before it is handed to Ark UI's tour machine. */
export interface EditorTourStep {
  id: string;
  title: string;
  body: ReactNode;
  /** The element to highlight, looked up when the step shows. A step whose
   * target is missing when the tour starts is left out. */
  target: () => HTMLElement | null;
  placement?: TourStepDetails["placement"];
  /** Gets the screen ready before the step shows (the Prepare tour's first
   * step opens the mode menu). Call `show` when ready; the returned undo
   * runs when the step ends, however it ends. */
  prepare?: (show: () => void) => () => void;
}
