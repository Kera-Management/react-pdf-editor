import { dataPart, findShown, tourAnchor } from "./anchors";
import type { EditorTourStep } from "./types";

/**
 * Which layout the sign tour describes (guided tour spec §3.2). Picked from
 * what is on screen when the tour starts: "mobileFriendly" while the
 * reflowed view is showing (phones, by default), "original" everywhere else
 * (desktop, tablets, and phones on Original or after a fallback).
 */
export type SignTourVariant = "original" | "mobileFriendly";

export interface SignTourContext {
  variant: SignTourVariant;
  /** The host's Save button label (e.g. "Submit signature"). */
  saveLabel: string;
  /** Whether the header offers decline (`onDecline` passed). */
  canDecline: boolean;
  /** Whether the host passed a saved signature to reuse. Guests never get
   * one, so on the guest page step 3 always says "draw". */
  hasSavedSignature: boolean;
  /** The editor's root element; anchors are looked up inside it first. */
  root: ParentNode | null;
}

// A field overlay on the original pages that the signer can fill: the
// gating loop disables and marks every field that isn't theirs.
const ASSIGNED_FIELD =
  '[id^="page_div_container_"] [data-field-id]:not([disabled]):not([data-pdfe-gated])';
// Signature fields render as click-to-sign buttons carrying their name.
const ASSIGNED_SIGNATURE_FIELD =
  '[id^="page_div_container_"] button[data-field-name][data-field-id]:not([disabled]):not([data-pdfe-gated])';

const originalSteps = ({
  saveLabel,
  canDecline,
  hasSavedSignature,
  root,
}: SignTourContext): EditorTourStep[] => [
  {
    id: "sign-fields",
    title: "Your fields are highlighted",
    body: "Only highlighted fields are yours. Other parties' entries are shown but locked.",
    // The first field the signer can fill, else the document itself.
    target: () =>
      findShown(root, ASSIGNED_FIELD) ?? findShown(root, tourAnchor("canvas")),
    placement: "bottom",
  },
  {
    id: "sign-progress",
    title: "Go field by field",
    body: (
      <>
        Use <strong>Start</strong> and <strong>Next</strong> to jump to each
        field you still need to fill.
      </>
    ),
    target: () => findShown(root, tourAnchor("progress")),
    placement: "left",
  },
  {
    id: "sign-signature",
    title: "Tap to sign",
    body: hasSavedSignature
      ? "Tap a signature field to add your saved signature or draw a new one."
      : "Tap a signature field to draw your signature.",
    target: () => findShown(root, ASSIGNED_SIGNATURE_FIELD),
    placement: "top",
  },
  {
    id: "sign-finish",
    title: "Finish",
    body: (
      <>
        Select <strong>{saveLabel}</strong> when you're done.
        {canDecline && " You can also decline to sign here."}
      </>
    ),
    target: () => findShown(root, tourAnchor("save")),
    placement: "bottom-end",
  },
];

const mobileFriendlySteps = ({
  saveLabel,
  root,
}: SignTourContext): EditorTourStep[] => [
  {
    id: "sign-mobile-view",
    title: "An easier-to-read version",
    body: (
      <>
        This is your document reformatted for your phone. Tap{" "}
        <strong>Original</strong> anytime to see the exact layout.
      </>
    ),
    target: () => findShown(root, dataPart("mobile-view-toggle")),
    placement: "bottom",
  },
  {
    id: "sign-guided-bar",
    title: "Go field by field",
    body: (
      <>
        <strong>Next</strong> takes you to each field you still need to fill.
        Signature fields open a pad to sign.
      </>
    ),
    target: () => findShown(root, dataPart("mobile-guided-bar")),
    placement: "top",
  },
  {
    id: "sign-review",
    title: "Review, then submit",
    body: (
      <>
        <strong>Finish</strong> shows the original with your entries so you
        can check them, then select <strong>{saveLabel}</strong>.
      </>
    ),
    target: () => findShown(root, tourAnchor("finish")),
    placement: "top-end",
  },
];

/** The sign tour's steps for the layout on screen. Steps whose anchor
 * isn't showing are left to the caller to drop (see `presentSteps`). */
export const signTourSteps = (context: SignTourContext): EditorTourStep[] =>
  context.variant === "mobileFriendly"
    ? mobileFriendlySteps(context)
    : originalSteps(context);
