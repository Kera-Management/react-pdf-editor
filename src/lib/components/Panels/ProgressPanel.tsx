import React, { useEffect, useState } from "react";
import styles from "./ProgressPanel.module.css";
import { CheckCircle, Circle, PlayCircle, Warning } from "@phosphor-icons/react";
import { humanizeFieldName } from "../../utils/fieldLabels";
import { assigneesIncludeParticipant } from "../../utils/participantMatching";

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
  /**
   * Field names that actually rendered in the editor (survived the
   * host's editable/hidden pre-render filter). A field can be assigned to
   * the active participant yet never render at all -- e.g. a server bug
   * left it read-only in the AcroForm -- in which case there is no way for
   * the signer to ever complete it.
   *
   * SEMANTICS: when provided, such a field is EXCLUDED from `remainingFields`
   * (and therefore from guided Start/Next navigation) rather than shown as
   * a checklist item the signer can never check off, and is instead
   * surfaced as its own warning line below the remaining list. This
   * unblocks a signer who has completed every field they can actually see,
   * while still making the anomaly visible rather than silently dropping
   * it. Omitted entirely: every assigned field is treated as renderable,
   * i.e. unchanged from this panel's behavior before this concept existed.
   */
  renderedFieldNames?: Set<string>;
  /**
   * Friendly-label overrides, keyed by field NAME (as in
   * `fieldAssignments`). When a field's name has an entry here, that string
   * is shown in place of `humanizeFieldName(name)` -- lets a host that
   * already has real labels (e.g. from its own form-builder metadata) show
   * those instead of a best-effort guess.
   */
  fieldLabels?: Record<string, string>;
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
  renderedFieldNames,
  fieldLabels,
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

  // Get assigned fields for active participant. Matched via the same
  // normalized comparator every other assignment check in this library
  // uses (trimmed + case-folded) -- a raw `.includes()` here used to let a
  // whitespace/casing drift between the id baked into a field and the
  // `activeParticipantId` the host supplies silently exclude a signer's own
  // field from their list.
  const assignedFields = React.useMemo(() => {
    if (!fieldAssignments || !activeParticipantId) return [];
    return Object.entries(fieldAssignments)
      .filter(([, ids]) => assigneesIncludeParticipant(ids, activeParticipantId))
      .map(([fieldName]) => fieldName);
  }, [fieldAssignments, activeParticipantId]);

  // Split assigned fields into ones that actually rendered vs ones that
  // didn't (see `renderedFieldNames` doc comment). Unrendered fields are
  // dropped out of the remaining-fields/guided-navigation flow entirely --
  // a signer can never complete a field with no DOM node to fill in -- and
  // surfaced separately as a warning below instead.
  const { renderableAssignedFields, unrenderedAssignedFields } =
    React.useMemo(() => {
      if (!renderedFieldNames) {
        return {
          renderableAssignedFields: assignedFields,
          unrenderedAssignedFields: [] as string[],
        };
      }
      const renderable: string[] = [];
      const unrendered: string[] = [];
      assignedFields.forEach((name) => {
        (renderedFieldNames.has(name) ? renderable : unrendered).push(name);
      });
      return { renderableAssignedFields: renderable, unrenderedAssignedFields: unrendered };
    }, [assignedFields, renderedFieldNames]);

  // Get remaining (incomplete) fields, in document order (the order
  // fieldAssignments/formFields were built in) -- this is also the order
  // Start/Next walk through.
  const remainingFields = React.useMemo(() => {
    return renderableAssignedFields.filter((name) => {
      const value = formFields[name];
      return !value || value.trim() === "" || value === "Off";
    });
  }, [renderableAssignedFields, formFields]);

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
                <span>{fieldLabels?.[fieldName] ?? humanizeFieldName(fieldName)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Unrendered-but-assigned fields -- couldn't be shown at all (e.g. a
          server bug locked one read-only in the AcroForm), so they're never
          part of remainingFields/guided navigation above. Surfaced here
          purely as a heads-up: the signer isn't blocked by them, but
          something is wrong and the sender needs to know. */}
      {unrenderedAssignedFields.length > 0 && (
        <div className={styles.unrenderedWarning}>
          <Warning weight="fill" size={14} />
          <span>
            {unrenderedAssignedFields.length}{" "}
            {unrenderedAssignedFields.length === 1 ? "field" : "fields"}{" "}
            couldn't be shown. Contact the sender.
          </span>
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
