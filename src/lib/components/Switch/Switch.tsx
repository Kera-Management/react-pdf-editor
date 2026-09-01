import React from "react";
import styles from "./Switch.module.css";

export type SwitchSize = "sm" | "md";

export interface SwitchProps {
  /** Current on/off state. */
  checked: boolean;
  /** Called with no arguments whenever the user activates the switch --
   * click, Space, or Enter. The caller owns the resulting state change. */
  onToggle: () => void;
  disabled?: boolean;
  /** "sm" for compact contexts (panel rows); defaults to "md". */
  size?: SwitchSize;
  /** Full accessible name, e.g. "Assign Olive Ono to Move-in date". Always
   * required -- a switch with no visible text label leans entirely on this. */
  ariaLabel: string;
}

/**
 * Visible on/off control, styled as a track + thumb rather than a checkbox
 * glyph so its state reads at a glance without hovering: state is always
 * on screen, never revealed only on interaction. `role="switch"` (not a
 * native checkbox) because the on/off semantics -- and the animated
 * track/thumb -- match ARIA's switch pattern, not a form checkbox.
 *
 * A real `<button>` so Enter/Space activation, disabled inertness, and
 * focus handling all come from the platform for free; the explicit
 * `onKeyDown` below additionally calls `preventDefault()`, which cancels
 * the button's own native "activate on Enter/Space" default action so
 * `onToggle` never fires twice for one key press.
 */
export const Switch: React.FC<SwitchProps> = ({
  checked,
  onToggle,
  disabled = false,
  size = "md",
  ariaLabel,
}) => {
  const handleClick = () => {
    if (disabled) return;
    onToggle();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === " " || event.key === "Spacebar" || event.key === "Enter") {
      event.preventDefault();
      onToggle();
    }
  };

  const className = [styles.root, styles[size]].join(" ");

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={className}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
    </button>
  );
};

export default Switch;
