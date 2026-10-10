import React from "react";
import { Box, Flex, Stack } from "@chakra-ui/react";
import {
  ProgressPanel,
  type ProgressPanelProps,
} from "../components/Panels/ProgressPanel";
import {
  PartiesPanel,
  type PartiesPanelParticipant,
} from "../components/Panels/PartiesPanel";
import type {
  PartiesConfig,
  PartiesPanelAssignMode,
} from "../components/Panels/PartiesPanel/types";
import {
  PanelHeader,
  RailSectionHeader,
} from "../components/Panels/PanelHeader";

// Shared section header (C11). Lives in Panels/ to avoid an import cycle
// with ProgressPanel; this is the spec's import path.
export { PanelHeader };
export type { PanelHeaderProps } from "../components/Panels/PanelHeader";

export interface RightSidebarParties {
  title: string;
  config: PartiesConfig;
  participants: PartiesPanelParticipant[];
  /** Desktop "who fills this field" assign mode (build, field selected). */
  assignMode?: PartiesPanelAssignMode;
}

export interface RightSidebarHostPanel {
  title: string;
  content: React.ReactNode;
}

export interface RightSidebarProps {
  /** Edit mode + progress panel open. */
  progress?: ProgressPanelProps;
  /** Host `sidebarPanel` slot, when shown for this mode and open. */
  hostPanel?: RightSidebarHostPanel;
  /** Parties panel, when shown for this mode and open. */
  parties?: RightSidebarParties;
  /**
   * Forces the sidebar closed. It also doesn't render when no section is
   * passed (spec §3.4), whatever this says.
   */
  collapsed?: boolean;
  /**
   * "rail" (default): the 320px desktop column with its own border.
   * "drawer": fills its parent with no border or width, for the tablet
   * `Drawer placement="end"` (C9), whose content supplies the surface.
   */
  variant?: "rail" | "drawer";
}

/**
 * Right rail: progress, host panel and parties sections (spec §3.4).
 * Progress and the host panel share one scroll container; Parties keeps its
 * own scroll so drag-reorder can auto-scroll it.
 */
export const RightSidebar: React.FC<RightSidebarProps> = ({
  progress,
  hostPanel,
  parties,
  collapsed = false,
  variant = "rail",
}) => {
  const hostTitleId = React.useId();
  const partiesTitleId = React.useId();

  const hasTop = !!progress || !!hostPanel;
  if (collapsed || (!hasTop && !parties)) return null;

  const isRail = variant === "rail";

  return (
    <Flex
      direction="column"
      data-pdfe-sidebar="right"
      w={isRail ? "320px" : "full"}
      flexShrink={0}
      h="full"
      minH={0}
      bg={isRail ? "bg.panel" : undefined}
      borderLeftWidth={isRail ? "1px" : undefined}
      borderColor="border"
      overflow="hidden"
    >
      {hasTop && (
        <Box
          data-pdfe-scroll="main"
          flex={parties ? "0 1 auto" : "1"}
          maxH={parties ? "50%" : undefined}
          minH={0}
          overflowY="auto"
        >
          {/* Progress (edit mode). ProgressPanel renders its own
              "Progress" header with the count badge. */}
          {progress && (
            <Stack as="section" aria-label="Progress" gap={4} p={4}>
              <ProgressPanel {...progress} />
            </Stack>
          )}

          {/* Host panel slot: title from the host, body untouched. */}
          {hostPanel && (
            <Box as="section" aria-labelledby={hostTitleId}>
              <RailSectionHeader
                title={hostPanel.title}
                titleId={hostTitleId}
              />
              <Box p={4}>{hostPanel.content}</Box>
            </Box>
          )}
        </Box>
      )}

      {/* Parties: own scroll container (drag-reorder auto-scroll). */}
      {parties && (
        <Stack
          as="section"
          aria-labelledby={partiesTitleId}
          data-pdfe-scroll="parties"
          gap={0}
          flex="1"
          minH={0}
          overflowY="auto"
        >
          <RailSectionHeader
            title={parties.title}
            titleId={partiesTitleId}
            sticky
          />
          <Box p={4}>
            <PartiesPanel
              config={parties.config}
              participants={parties.participants}
              assignMode={parties.assignMode}
            />
          </Box>
        </Stack>
      )}
    </Flex>
  );
};

export default RightSidebar;
