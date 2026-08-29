import React, { useCallback, useId } from "react";
import { BuildModeField } from "../../PDFEditor";
import styles from "./PropertiesPanel.module.css";
import { OptionsEditor } from "./OptionsEditor";
import { Trash, X } from "@phosphor-icons/react";
import { fieldTypeIcons, fieldTypeLabels } from "../shared/fieldTypeMeta";

export interface PropertiesPanelParticipant {
  id: string;
  label: string;
  role?: string;
}

interface PropertiesPanelProps {
  /**
   * Currently selected field. The panel renders nothing (returns `null`) when this is
   * `null` -- a host gates its own sidebar section on this same value rather than
   * duplicating the empty state.
   */
  selectedField: BuildModeField | null;
  /** Callback when field is updated */
  onUpdateField: (fieldId: string, updates: Partial<BuildModeField>) => void;
  /** Callback when field is deleted */
  onDeleteField: (fieldId: string) => void;
  /** Callback to close the panel */
  onClose: () => void;
  /**
   * Participants assignable to fields -- typically the host's ASSIGNABLE list
   * (participants minus anyone currently excluded). Drives which rows appear as
   * freshly-checkable in "Assign to".
   */
  participants?: PropertiesPanelParticipant[];
  /**
   * The FULL, unfiltered participant list. Used only to resolve a display name for an
   * id already present in `selectedField.properties.assignees` that no longer appears
   * in `participants` (e.g. a party was excluded after fields were assigned to them),
   * so that row keeps showing their name instead of a raw id. Falls back to
   * `participants` when omitted, and to the raw id if the name isn't found in either
   * list.
   */
  allParticipants?: PropertiesPanelParticipant[];
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedField,
  onUpdateField,
  onDeleteField,
  onClose,
  participants = [],
  allParticipants,
}) => {
  const idPrefix = useId();

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (selectedField) {
        onUpdateField(selectedField.id, { name: e.target.value });
      }
    },
    [selectedField, onUpdateField]
  );

  const handleRequiredChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (selectedField) {
        onUpdateField(selectedField.id, {
          properties: {
            ...selectedField.properties,
            required: e.target.checked,
          },
        });
      }
    },
    [selectedField, onUpdateField]
  );

  const handlePlaceholderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (selectedField) {
        onUpdateField(selectedField.id, {
          properties: {
            ...selectedField.properties,
            placeholder: e.target.value,
          },
        });
      }
    },
    [selectedField, onUpdateField]
  );

  const handleSizeChange = useCallback(
    (dimension: "width" | "height", value: string) => {
      if (selectedField) {
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue) && numValue > 0) {
          onUpdateField(selectedField.id, { [dimension]: numValue });
        }
      }
    },
    [selectedField, onUpdateField]
  );

  const handleAssignmentChange = useCallback(
    (participantId: string, checked: boolean) => {
      if (selectedField) {
        const currentAssignments = selectedField.properties.assignees || [];
        const newAssignments = checked
          ? [...currentAssignments, participantId]
          : currentAssignments.filter((id: string) => id !== participantId);
        onUpdateField(selectedField.id, {
          properties: {
            ...selectedField.properties,
            assignees: newAssignments,
          },
        });
      }
    },
    [selectedField, onUpdateField]
  );

  const handleAddOption = useCallback(
    (label: string) => {
      if (selectedField && label.trim()) {
        const currentOptions = selectedField.properties.options || [];
        const newOptionItem = {
          exportValue: label.trim().toLowerCase().replace(/\s+/g, "_"),
          displayValue: label.trim(),
        };
        onUpdateField(selectedField.id, {
          properties: {
            ...selectedField.properties,
            options: [...currentOptions, newOptionItem],
          },
        });
      }
    },
    [selectedField, onUpdateField]
  );

  const handleRemoveOption = useCallback(
    (index: number) => {
      if (selectedField) {
        const currentOptions = selectedField.properties.options || [];
        onUpdateField(selectedField.id, {
          properties: {
            ...selectedField.properties,
            options: currentOptions.filter((_, i) => i !== index),
          },
        });
      }
    },
    [selectedField, onUpdateField]
  );

  if (!selectedField) {
    return null;
  }

  const needsOptions =
    selectedField.type === "dropdown" || selectedField.type === "radio";

  const nameInputId = `${idPrefix}-name`;
  const placeholderInputId = `${idPrefix}-placeholder`;
  const widthInputId = `${idPrefix}-width`;
  const heightInputId = `${idPrefix}-height`;
  const assignHeadingId = `${idPrefix}-assign-to`;

  // Assign-to keeps rendering the ASSIGNABLE list (`participants`) for freshly-checkable
  // rows, but any id already in `assignees` that has fallen out of that list (e.g. the
  // party was excluded after being assigned) still gets a row so the assignment stays
  // visible -- its label is resolved from the FULL participant list, never the raw id.
  const assignedIds = selectedField.properties.assignees || [];
  const labelSource = allParticipants ?? participants;
  const staleAssignedRows = assignedIds
    .filter((id) => !participants.some((p) => p.id === id))
    .map((id) => ({
      id,
      label: labelSource.find((p) => p.id === id)?.label ?? id,
      role: undefined as string | undefined,
      excluded: true,
    }));
  const assignRows = [
    ...participants.map((p) => ({ ...p, excluded: false })),
    ...staleAssignedRows,
  ];

  return (
    <div className={styles.panel}>
      {/* Field Type Header */}
      <div className={styles.header}>
        <div className={styles.fieldType}>
          <span className={styles.fieldTypeIcon}>
            {fieldTypeIcons[selectedField.type]}
          </span>
          <span>{fieldTypeLabels[selectedField.type]}</span>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.deleteButton}
            onClick={() => onDeleteField(selectedField.id)}
            title="Delete field"
            aria-label="Delete field"
          >
            <Trash weight="bold" size={16} />
          </button>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >
            <X weight="bold" size={16} />
          </button>
        </div>
      </div>

      {/* Properties Form */}
      <div className={styles.form}>
        {/* Structure: what the field is made of */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Structure</h3>

          <div className={styles.formGroup}>
            <label htmlFor={nameInputId} className={styles.label}>
              Field Name
            </label>
            <input
              id={nameInputId}
              type="text"
              className={styles.input}
              value={selectedField.name}
              onChange={handleNameChange}
              placeholder="Enter field name"
            />
          </div>

          {(selectedField.type === "text" ||
            selectedField.type === "multiline") && (
            <div className={styles.formGroup}>
              <label htmlFor={placeholderInputId} className={styles.label}>
                Placeholder
              </label>
              <input
                id={placeholderInputId}
                type="text"
                className={styles.input}
                value={selectedField.properties.placeholder || ""}
                onChange={handlePlaceholderChange}
                placeholder="Enter placeholder text"
              />
            </div>
          )}

          {needsOptions && (
            <OptionsEditor
              options={selectedField.properties.options || []}
              onAddOption={handleAddOption}
              onRemoveOption={handleRemoveOption}
            />
          )}

          <div className={styles.formGroup}>
            <fieldset className={styles.fieldset}>
              <legend className={styles.label}>Size</legend>
              <div className={styles.sizeInputs}>
                <div className={styles.sizeField}>
                  <label htmlFor={widthInputId} className={styles.sizeLabel}>
                    W
                  </label>
                  <input
                    id={widthInputId}
                    type="number"
                    className={styles.sizeInput}
                    value={Math.round(selectedField.width)}
                    onChange={(e) => handleSizeChange("width", e.target.value)}
                    min={20}
                  />
                </div>
                <div className={styles.sizeField}>
                  <label htmlFor={heightInputId} className={styles.sizeLabel}>
                    H
                  </label>
                  <input
                    id={heightInputId}
                    type="number"
                    className={styles.sizeInput}
                    value={Math.round(selectedField.height)}
                    onChange={(e) =>
                      handleSizeChange("height", e.target.value)
                    }
                    min={20}
                  />
                </div>
              </div>
            </fieldset>
          </div>
        </div>

        {/* Behaviour: how the field acts */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Behaviour</h3>
          <div className={styles.formGroup}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={selectedField.properties.required || false}
                onChange={handleRequiredChange}
              />
              <span className={styles.checkmark} />
              <span>Required field</span>
            </label>
          </div>
        </div>

        {/* Assign to */}
        {assignRows.length > 0 && (
          <div className={styles.section}>
            <fieldset className={styles.fieldset}>
              <legend id={assignHeadingId} className={styles.sectionTitle}>
                Assign to
              </legend>
              <div className={styles.participantList}>
                {assignRows.map((participant) => {
                  const isAssigned = assignedIds.includes(participant.id);
                  return (
                    <label key={participant.id} className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={isAssigned}
                        onChange={(e) =>
                          handleAssignmentChange(
                            participant.id,
                            e.target.checked
                          )
                        }
                      />
                      <span className={styles.checkmark} />
                      <span>{participant.label}</span>
                      {participant.excluded ? (
                        <span className={styles.excludedTag}>Excluded</span>
                      ) : (
                        participant.role && (
                          <span className={styles.role}>
                            {participant.role}
                          </span>
                        )
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>
        )}
      </div>
    </div>
  );
};

export default PropertiesPanel;
