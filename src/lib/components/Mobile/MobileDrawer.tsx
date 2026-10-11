import React from "react";
import { CloseButton, Drawer, Icon, Portal } from "@chakra-ui/react";
import { XIcon } from "@phosphor-icons/react";

export interface MobileDrawerProps {
  open: boolean;
  /** Called when the drawer asks to close (X, backdrop or Esc). */
  onClose: () => void;
  title: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Bottom drawer shell for every mobile panel (spec §3.11). Composition copied
 * from the app's `MobileActionsFab` sheet: bottom placement, `bg.panel`,
 * rounded top, capped at 85dvh, body padded clear of the home indicator.
 * No snap points and no swipe-to-dismiss; Chakra's Dialog machinery gives
 * the focus trap, Esc and focus restore (C13).
 *
 * `lazyMount` + `unmountOnExit`: a closed drawer mounts nothing, so panel
 * bodies (thumbnail canvases, host content) never run while hidden.
 */
export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  open,
  onClose,
  title,
  children,
}) => (
  <Drawer.Root
    open={open}
    placement="bottom"
    lazyMount
    unmountOnExit
    onOpenChange={(event: { open: boolean }) => {
      if (!event.open) onClose();
    }}
  >
    <Portal>
      <Drawer.Backdrop />
      <Drawer.Positioner>
        {/* pdfe-portal-root: portaled outside .pdf-editor-root, so it
            re-scopes the canvas variables (recipient colours) for the
            panels rendered inside (theme.css). */}
        <Drawer.Content
          className="pdfe-portal-root"
          bg="bg.panel"
          roundedTop="l3"
          maxH="85dvh"
        >
          <Drawer.Header>
            <Drawer.Title>{title}</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body
            overflowY="auto"
            pb="calc(var(--chakra-spacing-6) + env(safe-area-inset-bottom))"
          >
            {children}
          </Drawer.Body>
          <Drawer.CloseTrigger asChild>
            <CloseButton type="button" size="sm" aria-label="Close">
              <Icon asChild>
                <XIcon weight="bold" />
              </Icon>
            </CloseButton>
          </Drawer.CloseTrigger>
        </Drawer.Content>
      </Drawer.Positioner>
    </Portal>
  </Drawer.Root>
);

export default MobileDrawer;
