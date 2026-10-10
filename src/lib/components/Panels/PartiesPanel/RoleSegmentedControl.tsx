import React from "react";
import { SegmentGroup } from "@chakra-ui/react";

export interface RoleSegmentedControlOption {
  value: string;
  label: string;
}

export interface RoleSegmentedControlProps {
  /** Options rendered left to right as connected segments. */
  options: RoleSegmentedControlOption[];
  /** Selected option value. Undefined renders with no segment active (undecided). */
  value: string | undefined;
  /** Called with the newly selected option's value. */
  onChange: (value: string) => void;
  /** Accessible name for the radiogroup, e.g. "Role for Jane Doe". */
  "aria-label"?: string;
  /** Segment size. Party rows use "xs" (the panel is narrow). */
  size?: "xs" | "sm" | "md";
}

/**
 * Chakra `SegmentGroup` (a radiogroup of native radios) with the same API
 * the panel used before. `value={null}` while undecided, so no segment is
 * highlighted until the manager picks one.
 */
export const RoleSegmentedControl: React.FC<RoleSegmentedControlProps> = ({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
  size = "xs",
}) => (
  <SegmentGroup.Root
    size={size}
    value={value ?? null}
    onValueChange={(details: { value: string | null }) => {
      if (details.value !== null) onChange(details.value);
    }}
    aria-label={ariaLabel}
  >
    <SegmentGroup.Indicator />
    <SegmentGroup.Items items={options} />
  </SegmentGroup.Root>
);

export default RoleSegmentedControl;
