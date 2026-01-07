import React, { useCallback, useEffect, useRef, useState } from "react";
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
  mode,
  onFieldFocus,
}) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const touchCurrentY = useRef<number>(0);
  const isDragging = useRef(false);

  // Check for mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Handle touch gestures for swipe to close
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchCurrentY.current = e.touches[0].clientY;
    const deltaY = touchCurrentY.current - touchStartY.current;
    
    if (deltaY > 10) {
      isDragging.current = true;
    }

    if (isDragging.current && panelRef.current) {
      const translateY = Math.max(0, deltaY);
      panelRef.current.style.transform = `translateY(calc(100% - 80px + ${translateY}px))`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!panelRef.current) return;

    const deltaY = touchCurrentY.current - touchStartY.current;
    panelRef.current.style.transform = "";

    if (isDragging.current && deltaY > 100) {
      setIsMobileOpen(false);
    }

    isDragging.current = false;
  }, []);

  if (mode !== "edit" || !activeParticipantId) {
    return null;
  }

  const activeParticipant = participants?.find(
    (p) => p.id === activeParticipantId
  );

  // Get fields assigned to the active participant
  const assignedFields = fieldAssignments
    ? Object.entries(fieldAssignments)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // Get remaining fields
  const remainingFields = assignedFields.filter((fieldName) => {
    const value = formFields[fieldName];
    return !value || value.trim() === "" || value === "Off";
  });

  // Get initials from participant name
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Format field name for display
  const formatFieldName = (fieldName: string) => {
    return fieldName
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  // Calculate progress ring values for mobile
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (participantProgressPercentage / 100) * circumference;

  const toggleMobileDrawer = () => {
    setIsMobileOpen(!isMobileOpen);
  };

  // If no fields are assigned to this participant, show a message
  if (participantTotalFields === 0) {
    return (
      <div
        ref={panelRef}
        className={`${styles.progressPanel} ${isMobileOpen ? styles.open : ""}`}
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchMove={isMobile ? handleTouchMove : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
      >
        {/* Mobile drag handle */}
        <div className={styles.dragHandle} onClick={toggleMobileDrawer}>
          <div className={styles.dragBar} />
        </div>

        {/* Mobile compact header */}
        <div className={styles.mobileCompactHeader} onClick={toggleMobileDrawer}>
          <div className={styles.mobileCompactInfo}>
            <div className={styles.mobileProgressRing}>
              <svg width="44" height="44">
                <circle className={styles.ringBg} cx="22" cy="22" r={radius} />
              </svg>
              <span className={styles.mobileProgressText}>—</span>
            </div>
            <span className={styles.mobileCompactLabel}>No fields assigned</span>
          </div>
          <div className={styles.mobileExpandIcon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </div>
        </div>

        <div className={styles.header}>
          <h3>Progress</h3>
          {activeParticipant && (
            <div className={styles.participantInfo}>
              <div className={styles.participantAvatar}>
                {getInitials(activeParticipant.label)}
              </div>
              <div>
                <div className={styles.participantName}>
                  {activeParticipant.label}
                </div>
                {activeParticipant.role && (
                  <div className={styles.participantRole}>
                    {activeParticipant.role}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className={styles.noAssignmentMessage}>
          <div className={styles.noAssignmentIcon}>📋</div>
          <p>No fields are assigned to you. Please contact the form administrator.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className={`${styles.progressPanel} ${isMobileOpen ? styles.open : ""}`}
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchMove={isMobile ? handleTouchMove : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}
    >
      {/* Mobile drag handle */}
      <div className={styles.dragHandle} onClick={toggleMobileDrawer}>
        <div className={styles.dragBar} />
      </div>

      {/* Mobile compact header */}
      <div className={styles.mobileCompactHeader} onClick={toggleMobileDrawer}>
        <div className={styles.mobileCompactInfo}>
          <div className={styles.mobileProgressRing}>
            <svg width="44" height="44">
              <circle className={styles.ringBg} cx="22" cy="22" r={radius} />
              <circle
                className={styles.ringFill}
                cx="22"
                cy="22"
                r={radius}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            <span className={styles.mobileProgressText}>{participantProgressPercentage}%</span>
          </div>
          <span className={styles.mobileCompactLabel}>
            {remainingFields.length > 0
              ? `${remainingFields.length} field${remainingFields.length > 1 ? "s" : ""} remaining`
              : "All done!"}
          </span>
        </div>
        <div className={styles.mobileExpandIcon}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </div>
      </div>

      <div className={styles.header}>
        <h3>Progress</h3>
        {activeParticipant && (
          <div className={styles.participantInfo}>
            <div className={styles.participantAvatar}>
              {getInitials(activeParticipant.label)}
            </div>
            <div>
              <div className={styles.participantName}>
                {activeParticipant.label}
              </div>
              {activeParticipant.role && (
                <div className={styles.participantRole}>
                  {activeParticipant.role}
                </div>
              )}
            </div>
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
          <span>
            {participantCompletedFields} of {participantTotalFields} fields
          </span>
          <span className={styles.percentage}>
            {participantProgressPercentage}%
          </span>
        </div>
      </div>

      {remainingFields.length > 0 && (
        <div className={styles.remainingSection}>
          <h4>
            Remaining Fields
            <span className={styles.remainingCount}>{remainingFields.length}</span>
          </h4>
          <div className={styles.remainingList}>
            {remainingFields.slice(0, 5).map((fieldName) => (
              <div
                key={fieldName}
                className={styles.remainingField}
                onClick={() => onFieldFocus?.(fieldName)}
                title={`Click to focus on ${formatFieldName(fieldName)}`}
              >
                <div className={styles.fieldIcon}>✏️</div>
                <span>{formatFieldName(fieldName)}</span>
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
            <div className={styles.completionIcon}>✓</div>
            <div className={styles.completionTitle}>All Done!</div>
            <div className={styles.completionMessage}>
              You have completed all fields assigned to you.
            </div>
          </div>
        )}
    </div>
  );
};

export default ProgressPanel;
