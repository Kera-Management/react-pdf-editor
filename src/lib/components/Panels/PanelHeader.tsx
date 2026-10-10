import React from "react";
import { Badge, Box, HStack, Text } from "@chakra-ui/react";

export interface PanelHeaderProps {
  title: React.ReactNode;
  /** Optional count or metadata, rendered as a subtle gray Badge ("2 of 5"). */
  count?: number | string;
  /** Optional trailing actions (`IconButton size="xs" variant="ghost"`). */
  actions?: React.ReactNode;
  /** Id for the title, so a section can point `aria-labelledby` at it. */
  titleId?: string;
}

/**
 * Shared section header for the left and right rails and the panels inside
 * them (C11). Mirrors the SigningProgressCard title row: `md` medium title
 * (spec §2.6), an
 * optional count Badge, optional trailing actions.
 *
 * Re-exported from `shell/RightSidebar.tsx` (the spec's import path). It
 * lives here so the panels can use it without a circular import.
 */
export function PanelHeader({ title, count, actions, titleId }: PanelHeaderProps) {
  return (
    <HStack justify="space-between" gap={2} minH="6">
      <HStack gap={2} minW={0}>
        <Text as="h3" id={titleId} textStyle="md" fontWeight="medium" truncate>
          {title}
        </Text>
        {count !== undefined && (
          <Badge
            size="sm"
            variant="subtle"
            colorPalette="gray"
            // A step darker than the subtle default, so the count still
            // reads on the section header band.
            bg="bg.emphasized"
            color="fg"
            flexShrink={0}
          >
            {count}
          </Badge>
        )}
      </HStack>
      {actions && (
        <HStack gap={1} flexShrink={0}>
          {actions}
        </HStack>
      )}
    </HStack>
  );
}

/**
 * Top-level rail section header (Fields, Pages, Recipients, host panel): a
 * full-width band in a subtle fill instead of a divider, so sections are
 * separated by their headers. Sub-sections inside a panel use the plain
 * `PanelHeader`.
 */
export function RailSectionHeader({
  sticky = false,
  ...props
}: PanelHeaderProps & {
  /** Pin to the top of its scroll container. */
  sticky?: boolean;
}) {
  return (
    <Box
      px={4}
      py={2.5}
      flexShrink={0}
      // bg.subtle matches bg.panel in dark mode, so step up a level there.
      bg={{ base: "bg.subtle", _dark: "bg.muted" }}
      position={sticky ? "sticky" : undefined}
      top={sticky ? 0 : undefined}
      zIndex={sticky ? 1 : undefined}
    >
      <PanelHeader {...props} />
    </Box>
  );
}

export default PanelHeader;
