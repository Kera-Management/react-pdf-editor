import React, { useEffect, useState } from "react";
import { Box, Flex } from "@chakra-ui/react";
import {
  FieldPalette,
  type FieldPaletteProps,
} from "../components/Panels/FieldPalette";
import {
  PageThumbnails,
  type PageThumbnailsProps,
} from "../components/Panels/PageThumbnails";
import { RailSectionHeader } from "../components/Panels/PanelHeader";

/** Desktop rail width, border included. PDFEditor uses it to pre-scale the canvas. */
export const RAIL_WIDTH = 240;
/** Rail slide duration. PDFEditor runs the canvas scale over the same time. */
export const RAIL_TRANSITION_MS = 220;
export const RAIL_EASING = "cubic-bezier(0.2, 0, 0, 1)";

export interface LeftSidebarProps {
  /** Pages panel open state (`isPanelOpen("thumbnails")`). Closed = not rendered (A8). */
  isOpen: boolean;
  /** `mode === "build"`. */
  showFieldPalette: boolean;
  fieldPaletteProps: FieldPaletteProps;
  /** Omitted until pages exist; the Pages section then renders empty. */
  pageThumbnailsProps?: PageThumbnailsProps;
  /**
   * "rail" (default): the 240px desktop column with its own border.
   * "drawer": fills its parent with no border or width, for the tablet
   * `Drawer placement="start"` (C9), whose content supplies the surface.
   */
  variant?: "rail" | "drawer";
  /** Rail only: the width slide (open or shut) has finished. */
  onSlideEnd?: () => void;
}

/** Left rail: field palette (Prepare) and page thumbnails (spec §3.3). */
export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  isOpen,
  showFieldPalette,
  fieldPaletteProps,
  pageThumbnailsProps,
  variant = "rail",
  onSlideEnd,
}) => {
  const fieldsTitleId = React.useId();
  const pagesTitleId = React.useId();

  const isRail = variant === "rail";

  // The rail slides its width open and shut. It stays mounted through the
  // closing slide, then unmounts: a hidden rail is not rendered at all (A8).
  const [mounted, setMounted] = useState(isOpen);
  const [expanded, setExpanded] = useState(isOpen);
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // Mount at width 0 first, then expand on the next frame so the
      // width change is animated.
      const frame = requestAnimationFrame(() => setExpanded(true));
      return () => cancelAnimationFrame(frame);
    }
    setExpanded(false);
    const timer = setTimeout(() => setMounted(false), RAIL_TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [isOpen]);

  if (!isOpen && !mounted) return null;
  const pageCount = pageThumbnailsProps?.pages.length;

  const panel = (
    <Flex
      direction="column"
      data-pdfe-sidebar="left"
      w={isRail ? `${RAIL_WIDTH}px` : "full"}
      flexShrink={0}
      h="full"
      minH={0}
      bg={isRail ? "bg.panel" : undefined}
      borderRightWidth={isRail ? "1px" : undefined}
      borderColor="border"
      overflow="hidden"
    >
      {/* A4: the palette is a fixed six-row list, so it sizes to its content
          and the remaining height goes to Pages, which grows with the
          document. */}
      {showFieldPalette && (
        <Box as="section" aria-labelledby={fieldsTitleId} flex="none">
          <RailSectionHeader title="Fields" titleId={fieldsTitleId} />
          <Box p={3}>
            <FieldPalette {...fieldPaletteProps} />
          </Box>
        </Box>
      )}

      <Flex
        as="section"
        aria-labelledby={pagesTitleId}
        direction="column"
        flex="1"
        minH={0}
      >
        <RailSectionHeader
          title="Pages"
          titleId={pagesTitleId}
          count={pageCount !== undefined ? pageCount : undefined}
        />
        {pageThumbnailsProps && <PageThumbnails {...pageThumbnailsProps} />}
      </Flex>
    </Flex>
  );

  if (!isRail) return panel;

  return (
    <Box
      data-part="rail-slot"
      data-state={expanded ? "open" : "closed"}
      w={expanded ? `${RAIL_WIDTH}px` : "0px"}
      flexShrink={0}
      h="full"
      overflow="hidden"
      transition={`width ${RAIL_TRANSITION_MS}ms ${RAIL_EASING}`}
      _motionReduce={{ transition: "none" }}
      onTransitionEnd={(e: React.TransitionEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && e.propertyName === "width") {
          onSlideEnd?.();
        }
      }}
      // Closing: out of the tab order and the accessibility tree at once.
      // (React 18 doesn't type `inert`; "" is its "on" value.)
      {...({ inert: !isOpen ? "" : undefined } as Record<string, unknown>)}
      aria-hidden={!isOpen ? true : undefined}
    >
      {panel}
    </Box>
  );
};

export default LeftSidebar;
