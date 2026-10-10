import React, { useEffect, useRef } from "react";
import { Drawer, Flex, Portal } from "@chakra-ui/react";

export type EditorLayoutKind = "mobile" | "tablet" | "desktop";

export interface EditorLayoutProps {
  header: React.ReactNode;
  /**
   * Already gated by PDFEditor (mode, open state). Desktop: an inline rail.
   * Tablet: shown in a start Drawer while `leftOpen`. Mobile: not rendered.
   */
  leftSidebar?: React.ReactNode;
  /**
   * Desktop: an inline rail. Tablet: shown in an end Drawer while
   * `rightOpen`. Mobile: not rendered.
   */
  rightSidebar?: React.ReactNode;
  /**
   * The document scroller PDFEditor renders (`divRef`). It MUST remain the
   * IntersectionObserver root and the scroll container (C1): the canvas area
   * around it never scrolls.
   */
  canvas: React.ReactNode;
  /** In-canvas banner rendered above the scroller (spec §3.14). */
  canvasBanner?: React.ReactNode;
  /**
   * Floating chrome anchored to the canvas area (context toolbar, field
   * settings popover). Rendered inside the canvas area, after the scroller.
   */
  canvasOverlays?: React.ReactNode;
  /** Mobile page pill, "Add field" pill and drawers. */
  mobileChrome?: React.ReactNode;
  /** Dialogs and the signature modal. */
  overlays?: React.ReactNode;
  layout: EditorLayoutKind;
  /** Tablet: whether the left (pages) drawer is open. */
  leftOpen: boolean;
  onLeftOpenChange: (open: boolean) => void;
  /** Tablet: whether the right (progress / panels) drawer is open. */
  rightOpen: boolean;
  onRightOpenChange: (open: boolean) => void;
}

interface SideDrawerProps {
  placement: "start" | "end";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: string;
  label: string;
  /**
   * Non-modal drawers have no backdrop and let pointer and drag events
   * through to the canvas outside the panel. The pages drawer needs this:
   * it holds the field palette, and HTML5 drag-to-place must reach the
   * page's onDragOver/onDrop while the drawer is open.
   */
  modal?: boolean;
  children: React.ReactNode;
}

/** Tablet overlay for a sidebar (spec §3.13, C9). */
const SideDrawer: React.FC<SideDrawerProps> = ({
  placement,
  open,
  onOpenChange,
  width,
  label,
  modal = true,
  children,
}) => (
  <Drawer.Root
    open={open}
    placement={placement}
    size="xs"
    modal={modal}
    lazyMount
    unmountOnExit
    onOpenChange={(event: { open: boolean }) => onOpenChange(event.open)}
  >
    <Portal>
      {modal && <Drawer.Backdrop />}
      {/* Non-modal: the full-viewport positioner must not swallow the
          canvas's pointer/drag events; only the panel itself is live. */}
      <Drawer.Positioner pointerEvents={modal ? undefined : "none"}>
        {/* Portaled outside .pdf-editor-root: pdfe-portal-root re-scopes
            the canvas variables (recipient colours) for the panels. */}
        <Drawer.Content
          className="pdfe-portal-root"
          aria-label={label}
          bg="bg.panel"
          pointerEvents="auto"
          w={width}
          maxW="100vw"
          overflow="hidden"
        >
          {/* The sidebar owns its own sections and scrolling; it just
              needs the full drawer height. */}
          <Flex flex="1" minH={0} position="relative">
            {children}
          </Flex>
        </Drawer.Content>
      </Drawer.Positioner>
    </Portal>
  </Drawer.Root>
);

/**
 * The editor frame: root, header, main row (left rail, canvas area, right
 * rail), mobile chrome and overlays. Presentational: open state lives in
 * PDFEditor.
 *
 * - Desktop (>= 1024): rails inline beside the canvas.
 * - Tablet (640-1023): canvas full width; rails are overlay Drawers
 *   (start 240px, end 320px), collapsed when the layout is entered.
 * - Mobile (< 640): canvas only; panels live in `mobileChrome`.
 */
export const EditorLayout: React.FC<EditorLayoutProps> = ({
  header,
  leftSidebar,
  rightSidebar,
  canvas,
  canvasBanner,
  canvasOverlays,
  mobileChrome,
  overlays,
  layout,
  leftOpen,
  onLeftOpenChange,
  rightOpen,
  onRightOpenChange,
}) => {
  const isDesktop = layout === "desktop";
  const isTablet = layout === "tablet";

  // Tablet starts with both rails collapsed (C9). PDFEditor's panel state
  // defaults the rails open (they are inline on desktop), so on entering the
  // tablet layout ask it to close them once. Later toggles are the user's.
  const latest = useRef({ leftOpen, rightOpen, onLeftOpenChange, onRightOpenChange });
  latest.current = { leftOpen, rightOpen, onLeftOpenChange, onRightOpenChange };
  useEffect(() => {
    if (layout !== "tablet") return;
    const current = latest.current;
    if (current.leftOpen) current.onLeftOpenChange(false);
    if (current.rightOpen) current.onRightOpenChange(false);
  }, [layout]);

  return (
    <Flex
      className="pdf-editor-root"
      data-layout={layout}
      direction="column"
      w="full"
      h={layout === "mobile" ? "100dvh" : "100vh"}
      maxH={layout === "mobile" ? "100dvh" : "100vh"}
      bg="var(--pdfe-canvas-bg)"
      color="fg"
      overflow="hidden"
    >
      {header}

      <Flex flex="1" minH={0} overflow="hidden" position="relative">
        {isDesktop && leftSidebar}

        <Flex
          data-part="canvas-area"
          direction="column"
          flex="1"
          minW={0}
          overflow="hidden"
          position="relative"
          bg="var(--pdfe-canvas-bg)"
          _before={{
            content: '""',
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(var(--pdfe-canvas-grid) 1px, transparent 1px), linear-gradient(90deg, var(--pdfe-canvas-grid) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            pointerEvents: "none",
            opacity: 0.5,
          }}
        >
          {canvasBanner}
          {canvas}
          {canvasOverlays}
        </Flex>

        {isDesktop && rightSidebar}
      </Flex>

      {isTablet && leftSidebar && (
        <SideDrawer
          placement="start"
          open={leftOpen}
          onOpenChange={onLeftOpenChange}
          width="240px"
          label="Pages panel"
          modal={false}
        >
          {leftSidebar}
        </SideDrawer>
      )}
      {isTablet && rightSidebar && (
        <SideDrawer
          placement="end"
          open={rightOpen}
          onOpenChange={onRightOpenChange}
          width="320px"
          label="Side panel"
        >
          {rightSidebar}
        </SideDrawer>
      )}

      {/* PDFEditor only passes this on mobile; guard anyway. */}
      {layout === "mobile" && mobileChrome}
      {overlays}
    </Flex>
  );
};

export default EditorLayout;
