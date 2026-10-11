import type { PDFEditorMode } from "../PDFEditor";
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
}

type StepBuilder = (context: EditorTourContext) => EditorTourStep[];

// A tour exists for a mode only once it has a builder here. The Prepare
// tour (`pdf_prepare`) slots in next to the sign tour.
const STEP_BUILDERS: Partial<Record<EditorTourId, StepBuilder>> = {
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
