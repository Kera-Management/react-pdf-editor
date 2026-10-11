import React from "react";
import { Switch as ChakraSwitch } from "@chakra-ui/react";

export type SwitchSize = "sm" | "md";

export interface SwitchProps {
  /** Current on/off state. */
  checked: boolean;
  /** Called with no arguments whenever the user activates the switch
   * (click or Space). The caller owns the resulting state change. */
  onToggle: () => void;
  disabled?: boolean;
  /** "sm" for compact contexts (panel rows); defaults to "md". */
  size?: SwitchSize;
  /** Full accessible name, e.g. "Assign Olive Ono to Move-in date". Always
   * required: a switch with no visible text label leans entirely on this. */
  ariaLabel: string;
}

/**
 * Thin controlled wrapper over Chakra's `Switch` (the settings-row switch
 * used across the app), keeping this component's small `onToggle` API.
 *
 * The hidden checkbox carries `role="switch"` and the accessible name, so
 * assistive tech and tests see one switch control; the visible track and
 * thumb are Chakra's `Switch.Control` / `Switch.Thumb`, themed by the host.
 */
export const Switch: React.FC<SwitchProps> = ({
  checked,
  onToggle,
  disabled = false,
  size = "md",
  ariaLabel,
}) => (
  <ChakraSwitch.Root
    size={size}
    checked={checked}
    disabled={disabled}
    onCheckedChange={() => {
      if (disabled) return;
      onToggle();
    }}
  >
    <ChakraSwitch.HiddenInput
      role="switch"
      aria-label={ariaLabel}
      // A native checkbox only toggles on Space. The previous button-based
      // switch also toggled on Enter, so keep that for keyboard users.
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        if (!disabled) onToggle();
      }}
    />
    <ChakraSwitch.Control>
      <ChakraSwitch.Thumb />
    </ChakraSwitch.Control>
  </ChakraSwitch.Root>
);

export default Switch;
