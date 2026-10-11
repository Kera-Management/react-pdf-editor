import React from "react";
import { Box, HStack, SegmentGroup, Spinner } from "@chakra-ui/react";
import { Tooltip } from "../components/Toolbar/Tooltip";

export type MobileViewChoice = "mobileFriendly" | "original";

export interface MobileViewToggleProps {
  value: MobileViewChoice;
  onChange: (value: MobileViewChoice) => void;
  /** The document is converting: a spinner on the Mobile friendly segment. */
  loading?: boolean;
  /** The document fell back: Mobile friendly is disabled (spec §8.5). */
  unavailable?: boolean;
  /** A tap on the disabled Mobile friendly segment. Touch never opens the
   * tooltip, so the editor shows the fallback notice again instead. */
  onUnavailableTap?: () => void;
}

/**
 * "Mobile friendly | Original" (spec §8.1, S1). Sits in the canvas banner
 * slot, above the scroller, so it stays visible however far the document
 * scrolls and whatever the on-screen keyboard does.
 */
export const MobileViewToggle: React.FC<MobileViewToggleProps> = ({
  value,
  onChange,
  loading,
  unavailable,
  onUnavailableTap,
}) => (
  <Box
    px="4"
    py="2"
    bg="bg.panel"
    borderBottomWidth="1px"
    borderColor="border"
    flexShrink={0}
    // Above the canvas grid pseudo-element.
    position="relative"
    zIndex={1}
    data-part="mobile-view-toggle"
  >
    <SegmentGroup.Root
      size="sm"
      w="full"
      value={value}
      aria-label="Document view"
      // Its radios never join a host <form> (the editor is often inside
      // one): no name, and dissociated from any form owner.
      form=""
      onValueChange={(details: { value: string | null }) => {
        if (details.value === "mobileFriendly" || details.value === "original") {
          onChange(details.value);
        }
      }}
    >
      <SegmentGroup.Indicator />
      <Tooltip
        content={unavailable ? "Not available for this document" : ""}
        // Disabled segments don't get hover; a tap should still explain.
        openDelay={0}
      >
        <SegmentGroup.Item
          value="mobileFriendly"
          flex="1"
          justifyContent="center"
          disabled={unavailable}
          onClick={unavailable ? onUnavailableTap : undefined}
        >
          <SegmentGroup.ItemText>
            <HStack gap="2" as="span">
              {loading && <Spinner size="xs" aria-hidden="true" />}
              Mobile friendly
            </HStack>
          </SegmentGroup.ItemText>
          <SegmentGroup.ItemHiddenInput />
        </SegmentGroup.Item>
      </Tooltip>
      <SegmentGroup.Item value="original" flex="1" justifyContent="center">
        <SegmentGroup.ItemText>Original</SegmentGroup.ItemText>
        <SegmentGroup.ItemHiddenInput />
      </SegmentGroup.Item>
    </SegmentGroup.Root>
  </Box>
);

export default MobileViewToggle;
