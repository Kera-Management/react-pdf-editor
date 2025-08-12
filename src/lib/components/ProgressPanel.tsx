import React from "react";
import styles from "./ProgressPanel.module.css";

interface ProgressPanelProps {
  activeParticipantId?: string;
  participants?: { id: string; label: string; role?: "landlord" | "tenant" }[];
  fieldAssignments?: Record<string, string[]>;
  formFields: Record<string, string>;
  totalFields: number;
  completedFields: number;
  mode: "view" | "edit" | "build";
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
  if (mode !== "edit" || !activeParticipantId) {
    return null;
  }

  // Debug: Log what assignments we're working with
  console.log("ProgressPanel - fieldAssignments:", fieldAssignments);
  console.log("ProgressPanel - activeParticipantId:", activeParticipantId);

  const activeParticipant = participants?.find(
    (p) => p.id === activeParticipantId
  );
  const progressPercentage =
    totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0;

  // Get fields assigned to the active participant
  const assignedFields = fieldAssignments
    ? Object.entries(fieldAssignments)
        .filter(([_, assignees]) => assignees.includes(activeParticipantId))
        .map(([fieldName]) => fieldName)
    : []; // If no fieldAssignments provided, show no assigned fields

  // Count completed fields for this participant
  const participantCompletedFields = assignedFields.filter((fieldName) => {
    const value = formFields[fieldName];
    return value && value.trim() !== "" && value !== "Off";
  }).length;

  const participantTotalFields = assignedFields.length;
  const participantProgressPercentage =
    participantTotalFields > 0
      ? Math.round((participantCompletedFields / participantTotalFields) * 100)
      : 0;

  // If no fields are assigned to this participant, show a message
  if (participantTotalFields === 0) {
    return (
      <div className={styles.progressPanel}>
        <div className={styles.header}>
          <h3>Progress</h3>
          {activeParticipant && (
            <div className={styles.participantInfo}>
              <span className={styles.participantName}>
                {activeParticipant.label}
              </span>
              {activeParticipant.role && (
                <span className={styles.participantRole}>
                  ({activeParticipant.role})
                </span>
              )}
            </div>
          )}
        </div>
        <div className={styles.noAssignmentMessage}>
          No fields are assigned to you. Please contact the form administrator.
        </div>
      </div>
    );
  }

  // Get remaining fields
  const remainingFields = assignedFields.filter((fieldName) => {
    const value = formFields[fieldName];
    return !value || value.trim() === "" || value === "Off";
  });

  return (
    <div className={styles.progressPanel}>
      <div className={styles.header}>
        <h3>Progress</h3>
        {activeParticipant && (
          <div className={styles.participantInfo}>
            <span className={styles.participantName}>
              {activeParticipant.label}
            </span>
            {activeParticipant.role && (
              <span className={styles.participantRole}>
                ({activeParticipant.role})
              </span>
            )}
          </div>
        )}
      </div>

      <div className={styles.progressSection}>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${participantProgressPercentage}%` }}
          />
        </div>
        <div className={styles.progressText}>
          {participantCompletedFields} of {participantTotalFields} fields
          completed
          <span className={styles.percentage}>
            ({participantProgressPercentage}%)
          </span>
        </div>
      </div>

      {remainingFields.length > 0 && (
        <div className={styles.remainingSection}>
          <h4>Remaining Fields ({remainingFields.length})</h4>
          <div className={styles.remainingList}>
            {remainingFields.slice(0, 5).map((fieldName) => (
              <div
                key={fieldName}
                className={styles.remainingField}
                onClick={() => onFieldFocus?.(fieldName)}
                title={`Click to focus on ${fieldName.replace(/_/g, " ")}`}
              >
                {fieldName
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (l) => l.toUpperCase())}
              </div>
            ))}
            {remainingFields.length > 5 && (
              <div className={styles.moreFields}>
                +{remainingFields.length - 5} more fields
              </div>
            )}
          </div>
        </div>
      )}

      {participantCompletedFields === participantTotalFields &&
        participantTotalFields > 0 && (
          <div className={styles.completionPanel}>
            <div className={styles.completionIcon}>✅</div>
            <div className={styles.completionTitle}>All Done!</div>
            <div className={styles.completionMessage}>
              You have completed all fields assigned to you. No other fields are
              assigned to you.
            </div>
          </div>
        )}
    </div>
  );
};

export default ProgressPanel;
