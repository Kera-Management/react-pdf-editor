import type { PDFEditorMode } from "../PDFEditor";
import { prepareTourSteps } from "./prepareTour";
import { signTourSteps, type SignTourVariant } from "./signTour";
import type { EditorTourId, EditorTourStep, PDFEditorTours } from "./types";

/**
 * The only thing that picks a tour: the editor's current mode (guided tour
 * spec §3, §5.3). Whoever can open a mode gets its tour; nothing here (or
 * anywhere in the tour code) knows about user types, plans or roles.
 */
export const TOUR_FOR_MODE: Record<PDFEditorMode, EditorTourId | null> = {
  build: "pdf_prepare",
  edit: "pdf_sign",
  view: null,
};

/** The `tours` prop key that says a tour is still unseen. */
export const TOUR_PROP_KEY: Record<EditorTourId, keyof PDFEditorTours> = {
  pdf_prepare: "prepare",
  pdf_sign: "sign",
};

/** What the step builders read from the editor when a tour starts. */
export interface EditorTourContext {
  root: ParentNode | null;
  saveLabel: string;
  canDecline: boolean;
  hasSavedSignature: boolean;
  /** The sign tour's layout: the mobile friendly view, or the original. */
  signVariant: SignTourVariant;
  /** The mode the editor is in (the Prepare tour's first step names it). */
  mode: PDFEditorMode;
  /** The modes the header's mode switcher offers, in menu order. */
  modes: PDFEditorMode[];
  /** Opens or closes the header's mode menu (Prepare tour step 1). */
  openModeMenu: (open: boolean) => void;
}

type StepBuilder = (context: EditorTourContext) => EditorTourStep[];

// A tour exists for a mode only once it has a builder here.
const STEP_BUILDERS: Partial<Record<EditorTourId, StepBuilder>> = {
  pdf_prepare: ({ mode, modes, openModeMenu, root }) =>
    prepareTourSteps({ mode, modes, openModeMenu, root }),
  pdf_sign: ({ signVariant, ...context }) =>
    signTourSteps({ ...context, variant: signVariant }),
};

export const hasTour = (tourId: EditorTourId | null): tourId is EditorTourId =>
  tourId !== null && tourId in STEP_BUILDERS;

/** The tour's steps for what is on screen right now: a step whose anchor
 * is missing (one party, no signature field, the progress rail closed) is
 * skipped silently, so a step never points at nothing. */
export const presentSteps = (
  tourId: EditorTourId,
  context: EditorTourContext
): EditorTourStep[] =>
  (STEP_BUILDERS[tourId]?.(context) ?? []).filter(
    (step) => step.target() !== null
  );
