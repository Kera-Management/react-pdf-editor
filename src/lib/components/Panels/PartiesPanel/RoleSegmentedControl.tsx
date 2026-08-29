import React, { useId, useRef } from "react";
import styles from "./RoleSegmentedControl.module.css";

export interface RoleSegmentedControlOption {
  value: string;
  label: string;
}

interface RoleSegmentedControlProps {
  /** Options rendered left to right as connected segments. */
  options: RoleSegmentedControlOption[];
  /** Selected option value. Undefined renders with no segment active (undecided). */
  value: string | undefined;
  /** Called with the newly selected option's value. */
  onChange: (value: string) => void;
  /** Accessible name for the radiogroup, e.g. "Role for Jane Doe". */
  "aria-label"?: string;
}

export const RoleSegmentedControl: React.FC<RoleSegmentedControlProps> = ({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
}) => {
  const name = useId();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const selectedIndex = options.findIndex((option) => option.value === value);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let direction = 0;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      direction = 1;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      direction = -1;
    } else {
      return;
    }

    if (options.length === 0) {
      return;
    }

    e.preventDefault();

    const currentIndex = selectedIndex === -1 ? 0 : selectedIndex;
    const nextIndex =
      (currentIndex + direction + options.length) % options.length;

    onChange(options[nextIndex].value);
    inputRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      className={styles.control}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {options.map((option, index) => {
        const isSelected = option.value === value;
        // Roving tabindex: the selected segment is the tab stop; when
        // nothing is selected yet, the first segment is the tab stop.
        const isTabStop = selectedIndex === -1 ? index === 0 : isSelected;

        return (
          <label key={option.value} className={styles.segment}>
            <input
              ref={(el) => {
                inputRefs.current[index] = el;
              }}
              type="radio"
              name={name}
              className={styles.input}
              value={option.value}
              checked={isSelected}
              tabIndex={isTabStop ? 0 : -1}
              onChange={() => onChange(option.value)}
            />
            <span className={styles.segmentLabel}>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
};
