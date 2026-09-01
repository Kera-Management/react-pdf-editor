import React, { useCallback, useId, useState } from "react";
import { Plus, X } from "@phosphor-icons/react";
import styles from "./OptionsEditor.module.css";

/**
 * Mirrors the (currently unexported) `ComboboxItem` shape from `PDFEditor.tsx`.
 * Structurally identical so callers passing `BuildModeField.properties.options`
 * type-check without a runtime dependency between the two modules.
 */
export interface ComboboxItem {
  exportValue: string;
  displayValue: string;
}

export interface OptionsEditorProps {
  /** Current dropdown/radio options for the selected field. */
  options: ComboboxItem[];
  /** Called with the trimmed label when a new option is added (Enter key or Add button). */
  onAddOption: (label: string) => void;
  /** Called with the index of the option to remove. */
  onRemoveOption: (index: number) => void;
}

/**
 * The dropdown/radio "Options" editor: the current option list (each with a
 * remove button) plus an add-option row. Used by `PropertiesPanel` for
 * `dropdown` and `radio` fields, including in its mobile bottom-sheet
 * rendering.
 *
 * Owns only the in-progress "new option" text; the actual mutation (building
 * the `ComboboxItem`, splicing it into `properties.options`, calling
 * `onUpdateField`) is the caller's responsibility via `onAddOption` /
 * `onRemoveOption`.
 */
export const OptionsEditor: React.FC<OptionsEditorProps> = ({
  options,
  onAddOption,
  onRemoveOption,
}) => {
  const [newOption, setNewOption] = useState("");
  const idPrefix = useId();
  const newOptionInputId = `${idPrefix}-new-option`;

  const handleAdd = useCallback(() => {
    if (newOption.trim()) {
      onAddOption(newOption.trim());
      setNewOption("");
    }
  }, [newOption, onAddOption]);

  return (
    <div className={styles.formGroup}>
      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>Options</legend>
        <div className={styles.optionsList}>
          {options.map((option, index) => (
            <div key={index} className={styles.optionItem}>
              <span>{option.displayValue}</span>
              <button
                type="button"
                className={styles.optionRemove}
                onClick={() => onRemoveOption(index)}
                aria-label={`Remove option ${option.displayValue}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <div className={styles.addOption}>
            <label
              htmlFor={newOptionInputId}
              className={styles.visuallyHidden}
            >
              New option
            </label>
            <input
              id={newOptionInputId}
              type="text"
              className={styles.input}
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              placeholder="Add option"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
            <button
              type="button"
              className={styles.addButton}
              onClick={handleAdd}
              disabled={!newOption.trim()}
              aria-label="Add option"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
      </fieldset>
    </div>
  );
};

export default OptionsEditor;
