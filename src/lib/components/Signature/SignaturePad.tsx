import React from "react";
import { Tabs } from "@chakra-ui/react";

import { DrawSignatureCanvas } from "./DrawSignatureCanvas";
import { TypeSignature } from "./TypeSignature";

export type SignatureTab = "draw" | "type";

export interface SignaturePadProps {
  /**
   * Which capture mode is showing. Controlled by the parent so a host (the
   * adoption modal) can remember and restore whichever tab produced the
   * current signature.
   */
  activeTab: SignatureTab;
  onTabChange: (tab: SignatureTab) => void;
  /** Pre-fills the Type tab's input. */
  signerName?: string;
  /**
   * Fires whenever the active tab's content becomes valid (a fresh PNG data
   * URL) or invalid (`null` -- blank, or below the Draw tab's near-blank
   * threshold).
   */
  onChange: (dataUrl: string | null) => void;
}

/**
 * Draw + Type signature capture in Chakra `Tabs` (line variant). Only the
 * active tab is mounted (`lazyMount` + `unmountOnExit`), so switching tabs
 * resets the other one's in-progress content, and each tab reports its own
 * current state via `onChange` as soon as it mounts.
 */
export const SignaturePad: React.FC<SignaturePadProps> = ({
  activeTab,
  onTabChange,
  signerName,
  onChange,
}) => {
  return (
    <Tabs.Root
      value={activeTab}
      onValueChange={(details) => onTabChange(details.value as SignatureTab)}
      variant="line"
      size="sm"
      lazyMount
      unmountOnExit
    >
      <Tabs.List aria-label="Signature style">
        <Tabs.Trigger value="draw" type="button">
          Draw
        </Tabs.Trigger>
        <Tabs.Trigger value="type" type="button">
          Type
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="draw">
        <DrawSignatureCanvas onChange={onChange} />
      </Tabs.Content>
      <Tabs.Content value="type">
        <TypeSignature signerName={signerName} onChange={onChange} />
      </Tabs.Content>
    </Tabs.Root>
  );
};
