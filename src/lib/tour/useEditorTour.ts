import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFEditorMode } from "../PDFEditor";
import {
  TOUR_FOR_MODE,
  TOUR_PROP_KEY,
  hasTour,
  presentSteps,
  type EditorTourContext,
} from "./steps";
import type {
  EditorTourEndMeta,
  EditorTourEndReason,
  EditorTourId,
  EditorTourStep,
  PDFEditorTours,
} from "./types";

export interface UseEditorTourOptions {
  mode: PDFEditorMode;
  tours?: PDFEditorTours;
  onTourEnd?: (
    tourId: EditorTourId,
    reason: EditorTourEndReason,
    meta: EditorTourEndMeta
  ) => void;
  /** The document has rendered and, when the mobile friendly view was
   * requested, its conversion has settled (ok or fallback). */
  ready: boolean;
  /** The review step, a confirm dialog or a drawer is showing. A tour
   * never starts then, and one that is running ends as dismissed. */
  blocked: boolean;
  /** Read when a tour starts, so steps match what is on screen then. */
  getContext: () => EditorTourContext;
  /** Called after any run ends, with the run that ended. */
  onEnded?: (run: ActiveTour) => void;
}

export interface ActiveTour {
  tourId: EditorTourId;
  steps: EditorTourStep[];
  replay: boolean;
  /** Mode the run started in; leaving it ends the run. */
  mode: PDFEditorMode;
  context: EditorTourContext;
  /** Distinct per run, so each run mounts a fresh tour machine. */
  key: number;
}

/**
 * When the editor's tours start and stop (guided tour spec §5.3). The host
 * says which tours are unseen (`tours`); this decides when: the mode's
 * tour, once per mounted editor, after the document has rendered, never
 * over the review step, a dialog or a drawer. The library never stores
 * who has seen a tour; it reports each end through `onTourEnd` and the
 * host remembers.
 */
export const useEditorTour = ({
  mode,
  tours,
  onTourEnd,
  ready,
  blocked,
  getContext,
  onEnded,
}: UseEditorTourOptions) => {
  const [active, setActive] = useState<ActiveTour | null>(null);
  // Tours that already started in this mounted editor: an automatic start
  // happens at most once each, whatever the host keeps passing.
  const [started, setStarted] = useState<ReadonlySet<EditorTourId>>(
    () => new Set()
  );
  // A run ended as dismissed (Skip, close, Esc, a background click): the
  // user has said no to tours for now, so no other tour starts on its own
  // in this mounted editor. "Show tour" still works.
  const [declined, setDeclined] = useState(false);
  const [replayRequested, setReplayRequested] = useState(false);
  const lastStepRef = useRef(0);
  const keyRef = useRef(0);

  const latest = useRef({ onTourEnd, onEnded, getContext, active });
  latest.current = { onTourEnd, onEnded, getContext, active };

  const modeTour = TOUR_FOR_MODE[mode];
  const tourAvailable = hasTour(modeTour);

  const begin = useCallback((tourId: EditorTourId, replay: boolean) => {
    const context = latest.current.getContext();
    const steps = presentSteps(tourId, context);
    setStarted((prev) => (prev.has(tourId) ? prev : new Set(prev).add(tourId)));
    // Nothing on screen to point at: no tour, and nothing to report.
    if (steps.length === 0) return;
    keyRef.current += 1;
    // Every run opens on the intro card, step 0.
    lastStepRef.current = 0;
    setActive({ tourId, steps, replay, mode, context, key: keyRef.current });
  }, [mode]);

  /** Ends the running tour, if any, and reports it. */
  const end = useCallback((reason: EditorTourEndReason) => {
    const run = latest.current.active;
    if (!run) return;
    latest.current.active = null;
    setActive(null);
    if (reason === "dismissed") setDeclined(true);
    latest.current.onTourEnd?.(run.tourId, reason, {
      replay: run.replay,
      lastStep: lastStepRef.current,
    });
    latest.current.onEnded?.(run);
  }, []);

  /** Ends a running tour as dismissed: the user did something else. */
  const dismiss = useCallback(() => end("dismissed"), [end]);

  const onStepChange = useCallback((stepNumber: number) => {
    lastStepRef.current = stepNumber;
  }, []);

  // Automatic start: the host says this mode's tour is unseen, it hasn't
  // run in this mounted editor, no tour was skipped here, and the editor
  // is ready and unobstructed.
  const eligible =
    tourAvailable &&
    !declined &&
    !!tours?.[TOUR_PROP_KEY[modeTour]] &&
    !started.has(modeTour);
  useEffect(() => {
    if (active || !eligible || !ready || blocked) return;
    begin(modeTour as EditorTourId, false);
  }, [active, eligible, ready, blocked, begin, modeTour]);

  // "Show tour": replays the current mode's tour (never written as seen by
  // the host, see `meta.replay`). Started on the next render, once the
  // More actions menu has closed.
  useEffect(() => {
    if (!replayRequested) return;
    setReplayRequested(false);
    if (active || !tourAvailable || !ready || blocked) return;
    begin(modeTour as EditorTourId, true);
  }, [replayRequested, active, tourAvailable, ready, blocked, begin, modeTour]);

  // Leaving the mode, or a dialog, drawer or the review taking over, ends
  // the run as dismissed.
  useEffect(() => {
    if (active && (active.mode !== mode || blocked)) end("dismissed");
  }, [active, mode, blocked, end]);

  // The editor closing mid-tour still ends the run like any other end: the
  // host hears about it (and records it as seen), and the editor's own
  // end-of-run work (the mobile friendly hint hand-off) still happens.
  useEffect(
    () => () => {
      const run = latest.current.active;
      if (!run) return;
      latest.current.active = null;
      latest.current.onTourEnd?.(run.tourId, "dismissed", {
        replay: run.replay,
        lastStep: lastStepRef.current,
      });
      latest.current.onEnded?.(run);
    },
    []
  );

  const replay = useCallback(() => setReplayRequested(true), []);

  return {
    active,
    /** The tour for the current mode exists and `tours` was passed: the
     * host has opted in, so "Show tour" is offered. */
    canReplay: tourAvailable && tours !== undefined && !active,
    /** This tour may still start automatically in this mounted editor. */
    isPending: (tourId: EditorTourId) =>
      !declined && !!tours?.[TOUR_PROP_KEY[tourId]] && !started.has(tourId),
    end,
    dismiss,
    replay,
    onStepChange,
  };
};
