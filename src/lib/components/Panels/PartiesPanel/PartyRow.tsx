import React from "react";
import { ArrowsDownUp, DotsSixVertical } from "@phosphor-icons/react";

import { recipientColorVar } from "../../../colors";
import { Switch } from "../../Switch";
import styles from "./PartiesPanel.module.css";
import { PartyRole } from "./types";
import {
  RoleSegmentedControl,
  RoleSegmentedControlOption,
} from "./RoleSegmentedControl";

export interface PartyRowProps {
  /** Party id, used only for the drag-reorder data attribute. */
  id: string;
  /** Full display name. Never truncated -- wraps instead. */
  label: string;
  /**
   * This party's position in the roster order (the `participants` array
   * the host passed to the panel), used to pick a stable recipient color.
   * Omit to render the row without a color dot (e.g. hosts not yet on the
   * roster-order contract).
   */
  colorIndex?: number;
  /** Host-supplied display tag (e.g. a relationship or delivery note). */
  badge?: string;
  /** Current role. `undefined` renders the segmented control undecided. */
  role: PartyRole | undefined;
  roleOptions: RoleSegmentedControlOption[];
  onRoleChange: (role: PartyRole) => void;
  /**
   * The same-time toggle's full label, composed by the panel from real
   * names ("Sign at the same time as Olive Ono" / "Sign after Olive Ono").
   * Structural copy like "Join the step above" tested as meaning nothing
   * to everyday users, so the row never invents its own wording here.
   */
  groupToggleLabel?: string;
  /** Present only on non-first signer rows -- renders the same-time toggle. */
  onToggleGrouped?: () => void;
  /** Quiet hint shown for undecided rows, e.g. "Choose a role". */
  hint?: string;
  /** Drag reorder via the grip handle, signer rows only. */
  draggable?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onPointerDown?: (event: React.PointerEvent) => void;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  /**
   * Assign-mode switch state. Only meaningful alongside `onAssignToggle`
   * -- both come from the panel's `assignMode` prop.
   */
  assignChecked?: boolean;
  /** Presence renders the assign-mode switch as the row's first element. */
  onAssignToggle?: () => void;
  /**
   * Full accessible label for the assign switch, e.g. "Assign Olive Ono
   * to Move-in date" -- composed by the panel from real names, the same
   * idiom as `groupToggleLabel`: the row never invents its own wording.
   */
  assignAriaLabel?: string;
}

export const PartyRow: React.FC<PartyRowProps> = ({
  id,
  label,
  colorIndex,
  badge,
  role,
  roleOptions,
  onRoleChange,
  groupToggleLabel,
  onToggleGrouped,
  hint,
  draggable = false,
  isDragging = false,
  isDropTarget = false,
  onPointerDown,
  onKeyDown,
  assignChecked,
  onAssignToggle,
  assignAriaLabel,
}) => {
  const initials = label.trim().slice(0, 2).toUpperCase();

  const rowClassName = [
    styles.row,
    draggable ? styles.rowDraggable : "",
    isDragging ? styles.rowDragging : "",
    isDropTarget && !isDragging ? styles.rowDropTarget : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rowClassName}
      data-reorder-id={draggable ? id : undefined}
      tabIndex={draggable ? 0 : undefined}
      onKeyDown={draggable ? onKeyDown : undefined}
    >
      {/* Grip on the LEFT edge, full-row height -- the reorderable-list
          convention. It was on the right, where it floated in whitespace
          beside multi-line content and read as detached (user feedback).
          Pointer-only drag surface; keyboard reorder stays on the row. */}
      {draggable && (
        <span
          className={styles.dragHandle}
          data-drag-handle={id}
          aria-hidden="true"
          onPointerDown={onPointerDown}
        >
          <DotsSixVertical weight="bold" size={14} />
        </span>
      )}

      <div className={styles.rowBody}>
        <div className={styles.nameLine}>
          {colorIndex !== undefined && (
            <span
              className={styles.avatar}
              style={{ backgroundColor: recipientColorVar(colorIndex) }}
              aria-hidden="true"
            >
              {initials}
            </span>
          )}
          <span className={styles.name}>{label}</span>

          {/* Assign switch on the name line's RIGHT edge -- reads as a
              settings row: "this person, on/off for the field". Leading
              placement orphaned it visually above multi-line content (user
              feedback). Still strictly additive: no assignMode, no switch,
              nothing else shifts. The wrapper stops pointer/keyboard events
              so toggling never starts a drag, mirroring roleControl. */}
          {onAssignToggle && (
            <span
              className={styles.assignToggleWrap}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Switch
                size="sm"
                checked={!!assignChecked}
                onToggle={onAssignToggle}
                ariaLabel={assignAriaLabel ?? `Assign ${label}`}
              />
            </span>
          )}
        </div>

        {badge && <span className={styles.badge}>{badge}</span>}
        {hint && <span className={styles.hint}>{hint}</span>}

        {/* Role changes must never be read as the start of a drag gesture,
            and arrow keys here must switch roles, not reorder the row. */}
        <div
          className={styles.roleControl}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <RoleSegmentedControl
            options={roleOptions}
            value={role}
            onChange={(value) => onRoleChange(value as PartyRole)}
            aria-label={`Role for ${label}`}
          />
        </div>

        {onToggleGrouped && groupToggleLabel && (
          // A real button, not a quiet text link: this is the mechanism for
          // building same-time groups, and it failed discoverability as an
          // underlined line of text.
          <button
            type="button"
            className={styles.groupToggle}
            onClick={(event) => {
              event.stopPropagation();
              onToggleGrouped();
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <ArrowsDownUp size={12} weight="bold" aria-hidden="true" />
            {groupToggleLabel}
          </button>
        )}
      </div>

    </div>
  );
};

export default PartyRow;
