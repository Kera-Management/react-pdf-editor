import React from "react";
import { X } from "@phosphor-icons/react";

import styles from "./PartiesPanel.module.css";
import { PartiesConfig, PartiesPanelAssignMode, PartyRole } from "./types";
import { usePartiesState } from "./usePartiesState";
import { useDragReorder } from "./useDragReorder";
import { PartyRow } from "./PartyRow";
import { RoleSegmentedControlOption } from "./RoleSegmentedControl";
import { resolveAssignRows } from "./assignResolution";

/** The roster this panel renders rows for -- keyed by `PartiesConfig`'s ids. */
export interface PartiesPanelParticipant {
  id: string;
  label: string;
  /** Host-supplied display tag, e.g. "Signs by email link". Optional. */
  badge?: string;
}

export interface PartiesPanelProps {
  config: PartiesConfig;
  participants: PartiesPanelParticipant[];
  /**
   * Opts the panel into selection-aware assign mode: a banner names the
   * field being assigned, and rows grow a checkbox for "assign this field
   * to this person". Omitted (the default) renders byte-identical to the
   * panel with no assign mode at all -- zero new DOM.
   */
  assignMode?: PartiesPanelAssignMode;
}

/** "Signs first" / "Signs second"... spelled out while it reads naturally. */
const stepHeading = (step: number): string => {
  const ordinals = ["first", "second", "third", "fourth", "fifth", "sixth"];
  return "Signs " + (ordinals[step] || String(step + 1) + "th");
};

const ROLE_OPTIONS: RoleSegmentedControlOption[] = [
  { value: "signer", label: "Signs" },
  { value: "viewer", label: "Copy" },
  { value: "excluded", label: "None" },
];

/** "A" / "A and B" / "A, B and C" -- no Oxford comma, no em dash. */
const joinNames = (names: string[]): string => {
  if (names.length === 1) {
    return names[0];
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

/**
 * Plain-language summary composed purely from labels + steps -- no domain
 * words. `orderedSigners` steps are always contiguous starting at 0, so
 * grouping by step index alone (no sparse-array handling) is safe.
 */
const composeSummary = (
  orderedSigners: { id: string; step: number }[],
  labelFor: (id: string) => string
): string | null => {
  if (orderedSigners.length === 0) {
    return null;
  }
  const groups: string[][] = [];
  orderedSigners.forEach(({ id, step }) => {
    if (!groups[step]) {
      groups[step] = [];
    }
    groups[step].push(labelFor(id));
  });
  if (groups.length === 1) {
    return "Everyone signs at the same time.";
  }
  const [firstGroup, ...restGroups] = groups;
  const verb = firstGroup.length === 1 ? "signs" : "sign";
  const restText = restGroups.map(joinNames).join(", then ");
  return `${joinNames(firstGroup)} ${verb} first, then ${restText}.`;
};

export const PartiesPanel: React.FC<PartiesPanelProps> = ({
  config,
  participants,
  assignMode,
}) => {
  // The banner needs a LEAVE animation, but it unmounts the instant
  // assignMode clears -- so keep the last value alive while a closing
  // animation plays, then unmount on animationend (with a timer fallback
  // for reduced-motion, where the animation never fires).
  const [visibleAssign, setVisibleAssign] =
    React.useState<PartiesPanelAssignMode | undefined>(assignMode);
  const [assignClosing, setAssignClosing] = React.useState(false);
  React.useEffect(() => {
    if (assignMode) {
      setVisibleAssign(assignMode);
      setAssignClosing(false);
      return;
    }
    if (!visibleAssign) return;
    setAssignClosing(true);
    const fallback = window.setTimeout(() => {
      setVisibleAssign(undefined);
      setAssignClosing(false);
    }, 250);
    return () => window.clearTimeout(fallback);
    // visibleAssign intentionally omitted: this effect reacts to assignMode
    // transitions only; including it would re-arm the close timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignMode]);
  const handleAssignBannerAnimationEnd = (
    event: React.AnimationEvent<HTMLDivElement>
  ) => {
    if (assignClosing && event.animationName.includes("assignBannerOut")) {
      setVisibleAssign(undefined);
      setAssignClosing(false);
    }
  };

  const partyIds = React.useMemo(
    () => participants.map((p) => p.id),
    [participants]
  );
  const labelById = React.useMemo(
    () => new Map(participants.map((p) => [p.id, p.label])),
    [participants]
  );
  const badgeById = React.useMemo(
    () => new Map(participants.map((p) => [p.id, p.badge])),
    [participants]
  );
  const labelFor = React.useCallback(
    (id: string) => labelById.get(id) ?? id,
    [labelById]
  );
  // Roster order, not role-grouped order, so a party's color stays put as
  // it moves between the signer list / undecided / viewer / excluded
  // sections.
  const colorIndexById = React.useMemo(
    () => new Map(participants.map((p, index) => [p.id, index])),
    [participants]
  );

  const {
    roleFor,
    setRole,
    reorder,
    joinStepOf,
    toggleGroupedWithPrevious,
    groupAll,
    sequenceAll,
    setExpiryDays,
    orderedSigners,
    viewers,
    undecided,
    selection,
  } = usePartiesState(config, partyIds);

  const signerIds = React.useMemo(
    () => orderedSigners.map((s) => s.id),
    [orderedSigners]
  );
  // Dragging over a row's edges reorders (live, as before); over its middle
  // arms "drop onto this person" -- releasing there joins their step, so a
  // signer can be dragged INTO a step box, not just next to it.
  const { onPointerDown, onKeyDown, isDragging, dropTargetId, joinTargetId } =
    useDragReorder({ ids: signerIds, onReorder: reorder, onJoin: joinStepOf });

  const excluded = partyIds.filter((id) => roleFor(id) === "excluded");
  const summary = composeSummary(orderedSigners, labelFor);

  // Assign mode: reuse the same stale/excluded resolution PropertiesPanel's
  // "Assign to" list uses, so an excluded party who was assigned before
  // being excluded still gets a checkbox instead of silently losing it.
  const assignRows = assignMode
    ? resolveAssignRows(
        assignMode.assignedIds,
        assignMode.participants,
        assignMode.allParticipants
      )
    : [];
  const staleAssignedIds = new Set(
    assignRows.filter((row) => row.excluded).map((row) => row.id)
  );

  /** Signer/undecided/viewer rows: always checkable while assign mode is on. */
  const assignPropsFor = (partyId: string) => {
    if (!assignMode) {
      return {};
    }
    const checked = assignMode.assignedIds.includes(partyId);
    return {
      assignChecked: checked,
      onAssignToggle: () => assignMode.onToggle(partyId, !checked),
      assignAriaLabel: `Assign ${labelFor(partyId)} to ${assignMode.fieldLabel}`,
    };
  };

  /** Excluded rows: checkable ONLY when stale-assigned (assigned but not on the assignable list). */
  const assignPropsForExcluded = (partyId: string) => {
    if (!assignMode || !staleAssignedIds.has(partyId)) {
      return {};
    }
    return {
      assignChecked: true,
      onAssignToggle: () => assignMode.onToggle(partyId, false),
      assignAriaLabel: `Assign ${labelFor(partyId)} to ${assignMode.fieldLabel}`,
    };
  };

  const handleRoleChange = (id: string) => (next: PartyRole) => setRole(id, next);

  const expiryValue = selection.expiryDays;
  const expiryDisplay =
    expiryValue === null || expiryValue === undefined ? "" : String(expiryValue);

  const handleExpiryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (raw === "") {
      setExpiryDays(null);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isNaN(parsed)) {
      setExpiryDays(parsed);
    }
  };

  return (
    <div className={styles.panel}>
      {/* The panel's host-facing title says WHO ("Recipients"); this section
          is about WHEN, and needs to say so. */}
      <h3 className={styles.sectionHeading}>Signing order</h3>
      {summary ? (
        <p className={styles.summary}>{summary}</p>
      ) : (
        <p className={styles.validation}>At least one person needs to sign.</p>
      )}

      {/* Order is expressed as VISIBLE step groups: everyone in one box signs
          at the same time; boxes run top to bottom with a "then" between. The
          previous design encoded groups as a muted number prefix plus a quiet
          per-row text toggle, and the person it was built for could not tell
          how to put two people on the same step -- so the structure itself now
          carries the meaning, with one-click poles for the two common cases. */}
      {orderedSigners.length > 1 && (
        <div className={styles.orderActions}>
          <button
            type="button"
            className={styles.orderActionButton}
            onClick={groupAll}
          >
            All at once
          </button>
          <button
            type="button"
            className={styles.orderActionButton}
            onClick={sequenceAll}
          >
            One after another
          </button>
        </div>
      )}

      {/* Directly above the ROWS it explains, not above the panel's order
          chrome (user feedback: at the panel top, the heading/summary sat
          between the question and the switches it teaches). Animates in;
          the list below rides the height transition down instead of
          jumping. */}
      {visibleAssign && (
        <div
          className={`${styles.assignBanner} ${
            assignClosing ? styles.assignBannerClosing : ""
          }`}
          role="status"
          onAnimationEnd={handleAssignBannerAnimationEnd}
        >
          <div className={styles.assignBannerBody}>
            <span className={styles.assignBannerText}>
              Who fills "{visibleAssign.fieldLabel}"?
            </span>
            <span className={styles.assignBannerHint}>
              Turn on each person who should complete this field.
            </span>
          </div>
          <button
            type="button"
            className={styles.assignBannerClose}
            onClick={visibleAssign.onDeselect}
            aria-label="Stop assigning"
          >
            <X weight="bold" size={14} />
          </button>
        </div>
      )}

      {orderedSigners.length > 0 && (
        <div className={styles.list}>
          {(() => {
            const groups: { step: number; ids: string[] }[] = [];
            orderedSigners.forEach(({ id, step }) => {
              const last = groups[groups.length - 1];
              if (last && last.step === step) last.ids.push(id);
              else groups.push({ step, ids: [id] });
            });
            const multiStep = groups.length > 1;
            return groups.map((group, groupIndex) => {
              // A drop right now would pull the dragged signer into this box.
              const isJoinTarget =
                joinTargetId !== null && group.ids.includes(joinTargetId);
              return (
              <div key={group.step} className={styles.stepGroupWrap}>
                {groupIndex > 0 && (
                  <div className={styles.thenConnector} aria-hidden="true">
                    then
                  </div>
                )}
                <div
                  className={
                    isJoinTarget
                      ? `${styles.stepGroup} ${styles.stepGroupJoinTarget}`
                      : styles.stepGroup
                  }
                  data-testid={"step-group-" + groupIndex}
                >
                  {isJoinTarget && (
                    <span className={styles.joinHint}>Drop to sign together</span>
                  )}
                  {multiStep && (
                    <div className={styles.stepGroupHeading}>
                      {stepHeading(groupIndex)}
                      {group.ids.length > 1 ? " · together" : ""}
                    </div>
                  )}
                  {group.ids.map((id, memberIndex) => {
                    const index = orderedSigners.findIndex((s) => s.id === id);
                    // The toggle states its OUTCOME with real names, not the
                    // step machinery ("Join the step above" meant nothing to
                    // the people this is for). Grouped rows offer to break
                    // out below their step-mates; ungrouped rows offer to
                    // sign alongside the step above.
                    const toggleLabel =
                      memberIndex > 0
                        ? `Sign after ${joinNames(
                            group.ids
                              .filter((other) => other !== id)
                              .map(labelFor)
                          )}`
                        : groupIndex > 0
                          ? `Sign at the same time as ${joinNames(
                              groups[groupIndex - 1].ids.map(labelFor)
                            )}`
                          : undefined;
                    return (
                      <PartyRow
                        key={id}
                        id={id}
                        label={labelFor(id)}
                        colorIndex={colorIndexById.get(id)}
                        badge={badgeById.get(id)}
                        role="signer"
                        roleOptions={ROLE_OPTIONS}
                        onRoleChange={handleRoleChange(id)}
                        groupToggleLabel={toggleLabel}
                        onToggleGrouped={
                          index > 0
                            ? () => toggleGroupedWithPrevious(id)
                            : undefined
                        }
                        draggable
                        isDragging={isDragging(id)}
                        isDropTarget={dropTargetId === id}
                        onPointerDown={(e) => onPointerDown(id, e)}
                        onKeyDown={(e) => onKeyDown(id, e)}
                        {...assignPropsFor(id)}
                      />
                    );
                  })}
                </div>
              </div>
              );
            });
          })()}
        </div>
      )}

      {undecided.length > 0 && (
        <div className={styles.section}>
          {undecided.map((id) => (
            <PartyRow
              key={id}
              id={id}
              label={labelFor(id)}
              colorIndex={colorIndexById.get(id)}
              badge={badgeById.get(id)}
              role={undefined}
              roleOptions={ROLE_OPTIONS}
              onRoleChange={handleRoleChange(id)}
              hint="Choose a role"
              {...assignPropsFor(id)}
            />
          ))}
        </div>
      )}

      <div className={styles.section}>
        <h3 className={styles.sectionHeading}>Also gets a copy</h3>
        {viewers.length === 0 ? (
          <p className={styles.sectionEmpty}>No one yet.</p>
        ) : (
          viewers.map((id) => (
            <PartyRow
              key={id}
              id={id}
              label={labelFor(id)}
              colorIndex={colorIndexById.get(id)}
              badge={badgeById.get(id)}
              role="viewer"
              roleOptions={ROLE_OPTIONS}
              onRoleChange={handleRoleChange(id)}
              {...assignPropsFor(id)}
            />
          ))
        )}
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionHeading}>Not included</h3>
        {excluded.length === 0 ? (
          <p className={styles.sectionEmpty}>No one yet.</p>
        ) : (
          excluded.map((id) => (
            <PartyRow
              key={id}
              id={id}
              label={labelFor(id)}
              colorIndex={colorIndexById.get(id)}
              badge={badgeById.get(id)}
              role="excluded"
              roleOptions={ROLE_OPTIONS}
              onRoleChange={handleRoleChange(id)}
              {...assignPropsForExcluded(id)}
            />
          ))
        )}
      </div>

      {config.expiry && (
        <div className={styles.expiryRow}>
          <label className={styles.label} htmlFor="parties-panel-expiry">
            This offer expires in
          </label>
          <div className={styles.expiryInputWrap}>
            <input
              id="parties-panel-expiry"
              type="number"
              min={0}
              className={styles.expiryInput}
              value={expiryDisplay}
              onChange={handleExpiryChange}
            />
            <span className={styles.expirySuffix}>days</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartiesPanel;
