import React, { useRef, useState } from "react";
import { InputGroup, NumberInput } from "@chakra-ui/react";

/** Smallest field width/height, in PDF points. */
export const MIN_FIELD_SIZE = 20;

export interface FieldSizeInputProps {
  /** Current size in points. */
  value: number;
  /** Receives whole points, never below `MIN_FIELD_SIZE`. */
  onCommit: (value: number) => void;
  /** Extra props for the input (e.g. `rounded`). */
  inputProps?: React.ComponentProps<typeof NumberInput.Input>;
  w?: React.ComponentProps<typeof NumberInput.Root>["w"];
}

/**
 * Width/height box for a Prepare field. Keeps a local draft while typing and
 * only applies values at or above the minimum, so retyping "115" as "50"
 * never resizes (or saves) the field at 5pt on the way. Leaving the box
 * clamps whatever is left to the minimum and applies it.
 */
export const FieldSizeInput: React.FC<FieldSizeInputProps> = ({
  value,
  onCommit,
  inputProps,
  w,
}) => {
  const committed = String(Math.round(value));
  // null: not editing, show the field's real size.
  const [draft, setDraft] = useState<string | null>(null);
  // Last value sent this edit, so leaving the box doesn't send it again
  // (the `value` prop may not have caught up yet).
  const lastSentRef = useRef<number | null>(null);

  const commitIfValid = (next: number) => {
    if (Number.isNaN(next) || next < MIN_FIELD_SIZE) return;
    const rounded = Math.round(next);
    const current = lastSentRef.current ?? Math.round(value);
    if (rounded === current) return;
    lastSentRef.current = rounded;
    onCommit(rounded);
  };

  return (
    <NumberInput.Root
      size="sm"
      w={w}
      min={MIN_FIELD_SIZE}
      value={draft ?? committed}
      formatOptions={{ useGrouping: false, maximumFractionDigits: 0 }}
      onValueChange={({ value: text, valueAsNumber }) => {
        setDraft(text);
        commitIfValid(valueAsNumber);
      }}
      onFocusChange={({ focused, valueAsNumber }) => {
        if (focused) return;
        if (!Number.isNaN(valueAsNumber)) {
          commitIfValid(Math.max(valueAsNumber, MIN_FIELD_SIZE));
        }
        setDraft(null);
        lastSentRef.current = null;
      }}
    >
      <InputGroup endElement="pt">
        <NumberInput.Input {...inputProps} />
      </InputGroup>
    </NumberInput.Root>
  );
};

export default FieldSizeInput;
