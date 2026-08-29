export * from "./lib/PDFEditor";
export * from "./lib/participantCompletion";
// BREAKING (3.0.0): this used to re-export a legacy, unused ProgressPanel
// implementation that the editor never actually renders. It now points at
// the component `PDFEditor.tsx` really uses, under `components/Panels/`.
export { ProgressPanel } from "./lib/components/Panels/ProgressPanel";
export type { ProgressPanelProps } from "./lib/components/Panels/ProgressPanel";
export type {
  PartyRole,
  PartiesInitial,
  PartiesSelection,
  PartiesConfig,
} from "./lib/components/Panels/PartiesPanel/types";
