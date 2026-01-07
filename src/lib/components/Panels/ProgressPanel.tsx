import React from "react";
import styles from "./ProgressPanel.module.css";
import { CheckCircle, Circle, Warning } from "@phosphor-icons/react";

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
}) => {
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

  // Get remaining (incomplete) fields
  const remainingFields = React.useMemo(() => {
    return assignedFields.filter((name) => {
      const value = formFields[name];
      return !value || value.trim() === "" || value === "Off";
    });
  }, [assignedFields, formFields]);

  // Check if all fields are complete
  const isComplete = completedFields === totalFields && totalFields > 0;

  if (mode !== "edit") return null;

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

      {/* Remaining Fields */}
      {remainingFields.length > 0 && (
        <div className={styles.remainingSection}>
          <div className={styles.remainingHeader}>
            <Warning weight="fill" size={14} />
            <span>{remainingFields.length} fields remaining</span>
          </div>
          <div className={styles.remainingList}>
            {remainingFields.slice(0, 5).map((fieldName) => (
              <button
                key={fieldName}
                type="button"
                className={styles.remainingItem}
                onClick={() => onFieldFocus?.(fieldName)}
              >
                <Circle weight="regular" size={14} />
                <span>{fieldName}</span>
              </button>
            ))}
            {remainingFields.length > 5 && (
              <span className={styles.moreFields}>
                +{remainingFields.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Complete State */}
      {isComplete && (
        <div className={styles.completeState}>
          <div className={styles.completeIcon}>
            <CheckCircle weight="fill" size={32} />
          </div>
          <p>You've completed all your fields!</p>
          <p className={styles.completeHint}>
            Review your entries before submitting.
          </p>
        </div>
      )}
    </div>
  );
};

export default ProgressPanel;



