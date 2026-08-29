import React, { useEffect, useState } from "react";
import styles from "./ProgressPanel.module.css";
import { CheckCircle, Circle, PlayCircle, Warning } from "@phosphor-icons/react";
import { humanizeFieldName } from "../../utils/fieldLabels";

export interface ProgressPanelProps {
  /** Active participant ID */
  activeParticipantId?: string;
  /** Available participants */
  participants?: { id: string; label: string; role?: string }[];
  /** Field assignments map */
  fieldAssignments?: Record<string, string[]>;
  /** Current form field values */
  formFields: Record<string, string>;
  /** Total number of fields */
  totalFields: number;
  /** Number of completed fields */
  completedFields: number;
  /** Current mode */
  mode: "build" | "edit" | "view";
  /** Callback when a field is focused */
  onFieldFocus?: (fieldName: string) => void;
  /**
   * Called when the signer clicks Finish once every required field is
   * complete. Omit to leave the finished state purely informational (no
   * button rendered) -- additive, so existing hosts see no change.
   */
  onFinish?: () => void;
}

export const ProgressPanel: React.FC<ProgressPanelProps> = ({
  activeParticipantId,
  participants,
  fieldAssignments,
  formFields,
  totalFields,
  completedFields,
  mode,
  onFieldFocus,
  onFinish,
}) => {
  // Which remaining field guided navigation ("Start"/"Next") last sent the
  // signer to. Tracked by name, not list position -- the remaining list
  // shrinks as fields get completed, so a field's *index* is not stable
  // across a Next click, but its *name* unambiguously identifies "where we
  // were" even after the list reshuffles.
  const [activeFieldName, setActiveFieldName] = useState<string | null>(null);

  // A new signer (or a document with no signer at all) starts guided
  // navigation over from scratch.
  useEffect(() => {
    setActiveFieldName(null);
  }, [activeParticipantId]);

  // Get active participant
  const activeParticipant = participants?.find(
    (p) => p.id === activeParticipantId
  );

  // Calculate progress percentage
  const progressPercentage =
    totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0;

  // Get assigned fields for active participant
  const assignedFields = React.useMemo(() => {
    if (!fieldAssignments || !activeParticipantId) return [];
    return Object.entries(fieldAssignments)
      .filter(([, ids]) => ids.includes(activeParticipantId))
      .map(([fieldName]) => fieldName);
  }, [fieldAssignments, activeParticipantId]);

  // Get remaining (incomplete) fields, in document order (the order
  // fieldAssignments/formFields were built in) -- this is also the order
  // Start/Next walk through.
  const remainingFields = React.useMemo(() => {
    return assignedFields.filter((name) => {
      const value = formFields[name];
      return !value || value.trim() === "" || value === "Off";
    });
  }, [assignedFields, formFields]);

  // Check if all fields are complete
  const isComplete = completedFields === totalFields && totalFields > 0;

  const goToField = (fieldName: string) => {
    setActiveFieldName(fieldName);
    onFieldFocus?.(fieldName);
  };

  const handleStart = () => {
    if (remainingFields.length > 0) {
      goToField(remainingFields[0]);
    }
  };

  const handleNext = () => {
    if (remainingFields.length === 0) return;
    const currentIndex = activeFieldName
      ? remainingFields.indexOf(activeFieldName)
      : -1;
    // The active field either advanced to the next one in the list, or (far
    // more often) it was just completed and dropped out of `remainingFields`
    // entirely -- in which case index 0 IS the next one to do, since
    // everything before it in document order is already done.
    const next =
      currentIndex >= 0 && currentIndex + 1 < remainingFields.length
        ? remainingFields[currentIndex + 1]
        : remainingFields[0];
    goToField(next);
  };

  if (mode !== "edit") return null;

  const hasStarted = activeFieldName !== null;

  return (
    <div className={styles.panel}>
      {/* Participant Info */}
      {activeParticipant && (
        <div className={styles.participant}>
          <div className={styles.avatar}>
            {activeParticipant.label.charAt(0).toUpperCase()}
          </div>
          <div className={styles.participantInfo}>
            <span className={styles.participantName}>
              {activeParticipant.label}
            </span>
            {activeParticipant.role && (
              <span className={styles.participantRole}>
                {activeParticipant.role}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Progress Section */}
      <div className={styles.progress}>
        <div className={styles.progressHeader}>
          <span className={styles.progressLabel}>Progress</span>
          <span className={styles.progressValue}>
            {completedFields} / {totalFields}
          </span>
        </div>
        <div className={styles.progressBar}>
          <div
            className={`${styles.progressFill} ${isComplete ? styles.complete : ""}`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <div className={styles.progressPercent}>
          {isComplete ? (
            <span className={styles.completeLabel}>
              <CheckCircle weight="fill" size={14} />
              All fields complete
            </span>
          ) : (
            `${progressPercentage}% complete`
          )}
        </div>
      </div>

      {/* Guided navigation: Start jumps to the first remaining required
          field; Next advances from wherever guided navigation last sent
          the signer. Not shown once everything is complete -- the Finish
          affordance below takes over. */}
      {!isComplete && remainingFields.length > 0 && (
        <button
          type="button"
          className={styles.guidedButton}
          onClick={hasStarted ? handleNext : handleStart}
        >
          <PlayCircle weight="fill" size={16} />
          {hasStarted ? "Next field" : "Start"}
        </button>
      )}

      {/* Remaining Fields -- the full list, not a truncated preview. There's
          no virtualization anywhere in this library, and a form's field
          count is small enough that plain DOM + `overflow-y: auto` (see
          .remainingList) is all scrolling ever needs here. */}
      {remainingFields.length > 0 && (
        <div className={styles.remainingSection}>
          <div className={styles.remainingHeader}>
            <Warning weight="fill" size={14} />
            <span>{remainingFields.length} fields remaining</span>
          </div>
          <div className={styles.remainingList}>
            {remainingFields.map((fieldName) => (
              <button
                key={fieldName}
                type="button"
                className={`${styles.remainingItem} ${
                  fieldName === activeFieldName ? styles.active : ""
                }`}
                onClick={() => goToField(fieldName)}
              >
                <Circle weight="regular" size={14} />
                <span>{humanizeFieldName(fieldName)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Complete State -- the Finish affordance. Always shown once
          isComplete; the button itself only appears when the host gave us
          somewhere to send it (onFinish is additive/optional). */}
      {isComplete && (
        <div className={styles.completeState}>
          <div className={styles.completeIcon}>
            <CheckCircle weight="fill" size={32} />
          </div>
          <p>You've completed all your fields!</p>
          <p className={styles.completeHint}>
            Review your entries before submitting.
          </p>
          {onFinish && (
            <button
              type="button"
              className={styles.finishButton}
              onClick={onFinish}
            >
              <CheckCircle weight="bold" size={18} />
              Finish and save
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ProgressPanel;
