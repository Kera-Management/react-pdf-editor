import { createContext, useContext, useSyncExternalStore } from "react";
import type { SourceOrigin } from "../types";
import type { FieldControlModel, GetFieldControl } from "./fieldControlModel";

/** What every block and control renderer needs from the editor. Provided
 * once by `MobileFriendlyView` instead of being threaded through each
 * nested block. */
export interface MobileViewContextValue {
  /** "view" renders every value read-only. */
  mode: "edit" | "view";
  /** Always reads the editor's latest state (stable identity). */
  getFieldControl: GetFieldControl;
  /** Called after every editor render: controls re-check their own field
   * and re-render only when it changed. */
  subscribe: (onChange: () => void) => () => void;
  /** Opens the editor's shared signature adoption modal for a field. */
  onOpenSignature: (fieldId: string) => void;
  /** A control took focus (guided bar position, place keeping). */
  onFieldFocus: (fieldId: string) => void;
  /** Enter on a single-line input: move to the next control. */
  onAdvance: (fromFieldId: string) => void;
  /** Switch to the original layout at a block's source position. */
  onShowOriginal?: (origin: SourceOrigin | null) => void;
}

export const MobileViewContext = createContext<MobileViewContextValue | null>(
  null
);

export const useMobileViewContext = (): MobileViewContextValue => {
  const value = useContext(MobileViewContext);
  if (!value) {
    throw new Error("Mobile friendly view parts must render inside it");
  }
  return value;
};

/** Everything a control shows, as one comparable string. */
const controlKey = (control: FieldControlModel | null): string =>
  control
    ? [
        control.kind,
        control.value,
        control.checked,
        control.required,
        control.complete,
        control.readOnly,
        control.label,
        control.gated,
        control.gatedLabel ?? "",
        control.note ?? "",
        control.hidden,
        control.choiceGroup ? JSON.stringify(control.choiceGroup) : "",
      ].join("\u0000")
    : "";

/**
 * The field's control model, re-rendering this component (and nothing
 * else) when that field's value, gating or required state changes. The
 * document's text blocks are memoized and never re-render while the signer
 * types.
 */
export const useFieldControl = (fieldId: string): FieldControlModel | null => {
  const { getFieldControl, subscribe } = useMobileViewContext();
  useSyncExternalStore(subscribe, () => controlKey(getFieldControl(fieldId)));
  return getFieldControl(fieldId);
};

/** Re-renders when any of these fields changes (a radio group's legend). */
export const useFieldControls = (fieldIds: string[]): (FieldControlModel | null)[] => {
  const { getFieldControl, subscribe } = useMobileViewContext();
  useSyncExternalStore(subscribe, () =>
    fieldIds.map((id) => controlKey(getFieldControl(id))).join("\u0001")
  );
  return fieldIds.map((id) => getFieldControl(id));
};
