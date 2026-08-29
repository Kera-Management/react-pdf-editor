import { useCallback, useRef, useState } from "react";

/** Current form field values, keyed by the field's own id (not its name --
 * radio groups have one id per option sharing a single name). */
export type FieldValueMap = Record<string, string>;

export interface UseFieldValuesResult {
  /** Current values, keyed by field id. A field with no entry hasn't been
   * touched yet -- callers fall back to the field's PDF default at read time. */
  values: FieldValueMap;
  /** Read a single field's value, falling back to `fallback` when unset. */
  getValue: (fieldId: string, fallback?: string) => string;
  /** Set a single field's value by id (text, checkbox, combobox). */
  setValue: (fieldId: string, value: string) => void;
  /** Set the same value on every id in `fieldIds` in one update -- radio
   * groups share a name across several widget ids, and selecting one option
   * needs the whole group's shared value to move together. */
  setValueForIds: (fieldIds: string[], value: string) => void;
  /**
   * Fill in values for ids that have no entry yet -- e.g. host-supplied
   * `initialFieldValues` (an earlier signer's already-submitted fields)
   * applied once a document's field ids are known. Never overwrites an id
   * that already has an entry, so a live edit (or an earlier seed) already
   * in this session is never clobbered by calling this again.
   */
  seed: (entries: FieldValueMap) => void;
  /**
   * True when `fieldId`'s current value is an UNTOUCHED seed -- another
   * signer's context value supplied via `initialFieldValues`, not something
   * this session entered. Save paths that rebuild the document (Prepare
   * mode) must skip these: baking another signer's values into the rebuilt
   * AcroForm as defaults would forge content this signer never wrote.
   */
  isSeededValue: (fieldId: string, currentValue: string) => boolean;
  /** Clear all values, e.g. when a new document loads. */
  reset: () => void;
}

/**
 * Owns form field VALUES only -- never field structure (geometry, type,
 * name, id), which stays in the editor's `pages` state. Keeping the two
 * separate means typing, checkbox/radio toggles, select changes, and browser
 * autofill only ever update this hook's state, never `pages`, so they never
 * change `renderPages`'s identity and never re-trigger a canvas render. See
 * the invariant comment on `renderPages` in PDFEditor.tsx for why that
 * matters.
 */
export function useFieldValues(): UseFieldValuesResult {
  const [values, setValues] = useState<FieldValueMap>({});

  const getValue = useCallback(
    (fieldId: string, fallback = "") => values[fieldId] ?? fallback,
    [values]
  );

  // Ids whose CURRENT value came from seed() and has not been touched by
  // the user since -- see isSeededValue's doc comment.
  const seededRef = useRef<FieldValueMap>({});

  const setValue = useCallback((fieldId: string, value: string) => {
    delete seededRef.current[fieldId];
    setValues((prev) =>
      prev[fieldId] === value ? prev : { ...prev, [fieldId]: value }
    );
  }, []);

  const setValueForIds = useCallback((fieldIds: string[], value: string) => {
    fieldIds.forEach((id) => {
      delete seededRef.current[id];
    });
    setValues((prev) => {
      const changed = fieldIds.some((id) => prev[id] !== value);
      if (!changed) return prev;
      const next = { ...prev };
      fieldIds.forEach((id) => {
        next[id] = value;
      });
      return next;
    });
  }, []);

  const seed = useCallback((entries: FieldValueMap) => {
    setValues((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [id, value] of Object.entries(entries)) {
        if (!(id in prev)) {
          next[id] = value;
          seededRef.current[id] = value;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const reset = useCallback(() => {
    seededRef.current = {};
    setValues({});
  }, []);

  const isSeededValue = useCallback(
    (fieldId: string, currentValue: string): boolean =>
      fieldId in seededRef.current &&
      seededRef.current[fieldId] === currentValue,
    []
  );

  return {
    values,
    getValue,
    setValue,
    setValueForIds,
    seed,
    isSeededValue,
    reset,
  };
}

export default useFieldValues;
