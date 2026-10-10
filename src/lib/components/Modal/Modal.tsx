import React from "react";
import {
  CloseButton,
  Dialog,
  Drawer,
  Portal,
  Separator,
} from "@chakra-ui/react";
import { XIcon } from "@phosphor-icons/react";
import { useResponsive } from "../../hooks/useResponsive";

export type ModalSize = "sm" | "md" | "lg";

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called on Escape, backdrop click, the close button, or (mobile) drawer dismissal */
  onClose: () => void;
  /** Dialog title, also wired to aria-labelledby */
  title: string;
  /** Dialog content */
  children: React.ReactNode;
  /** Optional footer content, typically action buttons */
  footer?: React.ReactNode;
  /** Desktop dialog width preset */
  size?: ModalSize;
}

/**
 * Desktop widths, kept from 3.x so callers' layouts don't shift. The
 * signature pad's 480px canvas needs the `md` width to render unscaled.
 * Chakra's own dialog sizes are a little narrower at each step.
 */
const MAX_WIDTH: Record<ModalSize, string> = {
  sm: "400px",
  md: "560px",
  lg: "720px",
};

const closeButton = (
  <CloseButton type="button" size="sm">
    <XIcon weight="bold" />
  </CloseButton>
);

/**
 * Modal primitive. A Chakra `Dialog` centred on desktop and tablet, a Chakra
 * `Drawer placement="bottom"` on mobile. Both render inside a `Portal`, so
 * they stack above a host dialog; Chakra provides the focus trap, focus
 * restore, Escape and outside-click dismissal.
 *
 * Mirrors the app's `components/Modal` (title, separators, footer) and
 * `MobileActionsFab` (bottom drawer shell). Domain-agnostic: hosts decide
 * what goes in `children`/`footer`.
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
}) => {
  const { isMobile } = useResponsive();

  const handleOpenChange = (details: { open: boolean }) => {
    if (!details.open) onClose();
  };

  if (isMobile) {
    return (
      <Drawer.Root
        open={isOpen}
        onOpenChange={handleOpenChange}
        placement="bottom"
        lazyMount
        unmountOnExit
      >
        <Portal>
          <Drawer.Backdrop />
          <Drawer.Positioner>
            <Drawer.Content
              bg="bg.panel"
              roundedTop="l3"
              maxH="85dvh"
              data-pdfe-modal="drawer"
            >
              <Drawer.Header>
                <Drawer.Title>{title}</Drawer.Title>
              </Drawer.Header>
              <Drawer.CloseTrigger asChild>{closeButton}</Drawer.CloseTrigger>
              <Drawer.Body
                overflowY="auto"
                pb={
                  footer
                    ? undefined
                    : "calc(var(--chakra-spacing-6) + env(safe-area-inset-bottom))"
                }
              >
                {children}
              </Drawer.Body>
              {footer && (
                <>
                  <Separator />
                  <Drawer.Footer
                    flexWrap="wrap"
                    gap={2}
                    pb="calc(var(--chakra-spacing-4) + env(safe-area-inset-bottom))"
                  >
                    {footer}
                  </Drawer.Footer>
                </>
              )}
            </Drawer.Content>
          </Drawer.Positioner>
        </Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={handleOpenChange}
      placement="center"
      size={size}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW={MAX_WIDTH[size]} data-pdfe-modal="dialog">
            <Dialog.Header>
              <Dialog.Title>{title}</Dialog.Title>
            </Dialog.Header>
            <Dialog.CloseTrigger asChild>{closeButton}</Dialog.CloseTrigger>
            <Separator />
            <Dialog.Body pt={4}>{children}</Dialog.Body>
            {footer && (
              <>
                <Separator />
                <Dialog.Footer flexWrap="wrap" gap={2} pt={4}>
                  {footer}
                </Dialog.Footer>
              </>
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};

export default Modal;
