import type { ReactNode } from "react";
import type { PDFEditorMode } from "../PDFEditor";
import { modeLabels } from "../components/Toolbar/modeLabels";
import { findShown, tourAnchor, whenSettled } from "./anchors";
import type { EditorTourStep } from "./types";

export interface PrepareTourContext {
  /** The mode the editor is in when the tour starts (step 1 names it). */
  mode: PDFEditorMode;
  /** The modes the header's mode switcher offers, in menu order. */
  modes: PDFEditorMode[];
  /** Opens (true) or closes (false) the header's real mode menu. */
  openModeMenu: (open: boolean) => void;
  /** The editor's root element; anchors are looked up inside it first. */
  root: ParentNode | null;
}

// Step 1's one-line summary of each mode, in the menu's order.
const MODE_SUMMARIES: Record<PDFEditorMode, ReactNode> = {
  build: (
    <>
      <strong>{modeLabels.build}</strong> places fields and picks signers.
    </>
  ),
  edit: (
    <>
      <strong>{modeLabels.edit}</strong> completes your own fields.
    </>
  ),
  view: (
    <>
      <strong>{modeLabels.view}</strong> is read-only.
    </>
  ),
  // Never offered alongside the others (the tour's mode list leaves it
  // out); here so every mode has a line.
  defaults: (
    <>
      <strong>{modeLabels.defaults}</strong> keeps values for future
      documents.
    </>
  ),
};

const COUNT_WORDS = ["", "One", "Two", "Three"];

// "Fill & Sign and View", "Fill & Sign" or "View": the modes that read
// fields from the saved PDF, among the ones offered.
const otherModesText = (modes: PDFEditorMode[]): string => {
  const others = modes.filter((m) => m !== "build").map((m) => modeLabels[m]);
  return others.length > 0
    ? others.join(" and ")
    : `${modeLabels.edit} and ${modeLabels.view}`;
};

/**
 * The Prepare tour (guided tour spec §3.1). Steps 1 and 5 are about the
 * mode switcher, so they only exist when it does (more than one mode).
 * Step 1 opens the real mode menu, so the user sees the actual mode cards,
 * and closes it when the step ends. Steps whose anchor isn't on screen
 * (the parties rail on a phone, the palette in a closed tablet drawer)
 * are left to the caller to drop (see `presentSteps`).
 */
export const prepareTourSteps = ({
  mode,
  modes,
  openModeMenu,
  root,
}: PrepareTourContext): EditorTourStep[] => {
  const hasSwitcher = modes.length > 1;
  const modeMenu = () => findShown(root, tourAnchor("mode-menu"));
  const modeMenuContent = () =>
    findShown(root, tourAnchor("mode-menu-content"));
  // Desktop: the Fields rail section. Phones: the "Add field" pill.
  const palette = findShown(root, tourAnchor("field-palette"));
  const steps: EditorTourStep[] = [];

  if (hasSwitcher) {
    steps.push({
      id: "prepare-modes",
      title: `${COUNT_WORDS[modes.length] ?? modes.length} modes`,
      body: (
        <>
          You're in <strong>{modeLabels[mode]}</strong>.{" "}
          {modes.map((m, i) => (
            <span key={m}>
              {i > 0 && " "}
              {MODE_SUMMARIES[m]}
            </span>
          ))}{" "}
          Switch here.
        </>
      ),
      // The open menu's cards, or the button if the menu didn't open.
      target: () => modeMenuContent() ?? modeMenu(),
      placement: "right-start",
      prepare: (show) => {
        openModeMenu(true);
        const cancel = whenSettled(modeMenuContent, show);
        return () => {
          cancel();
          openModeMenu(false);
        };
      },
    });
  }

  steps.push(
    {
      id: "prepare-fields",
      title: "Add fields",
      body: "Drag a field onto the page. Click a placed field to change its settings.",
      target: () =>
        findShown(root, tourAnchor("field-palette")) ??
        findShown(root, tourAnchor("add-field")),
      placement: palette ? "right-start" : "top",
    },
    {
      id: "prepare-parties",
      title: "Choose who fills each field",
      body: "Select a field, then pick the party who completes it.",
      target: () => findShown(root, tourAnchor("parties")),
      placement: "left-start",
    },
    {
      id: "prepare-save",
      title: "Save before switching",
      body: `New fields only appear in ${otherModesText(modes)} after you save. Watch the status here.`,
      target: () => findShown(root, tourAnchor("save")),
      placement: "bottom-end",
    }
  );

  // Step 5 sends the user on to Fill & Sign, so it needs that mode.
  if (hasSwitcher && modes.includes("edit")) {
    steps.push({
      id: "prepare-fill-sign",
      title: "Then fill and sign",
      body: (
        <>
          Once saved, switch to <strong>{modeLabels.edit}</strong> to complete
          your own fields.
        </>
      ),
      target: modeMenu,
      placement: "bottom-start",
    });
  }

  return steps;
};
