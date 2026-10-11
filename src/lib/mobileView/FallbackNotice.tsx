import React from "react";
import { Alert, Button, CloseButton } from "@chakra-ui/react";
import { InfoIcon, XIcon } from "@phosphor-icons/react";

const bannerProps = {
  status: "info" as const,
  size: "sm" as const,
  mx: 4,
  mt: 3,
  w: "auto",
  flexShrink: 0,
  // Above the canvas grid pseudo-element.
  position: "relative" as const,
  zIndex: 1,
  bg: "bg.muted",
};

/**
 * Shown over the original layout when a document can't be converted
 * faithfully (spec §8.5, S2). The reasons go to the console for
 * developers, never to the signer.
 */
export const FallbackNotice: React.FC<{ onDismiss: () => void }> = ({
  onDismiss,
}) => (
  <Alert.Root {...bannerProps} role="status" data-part="mobile-view-fallback">
    <Alert.Indicator>
      <InfoIcon weight="bold" />
    </Alert.Indicator>
    <Alert.Content>
      <Alert.Description>
        This document can&apos;t be shown in mobile-friendly view.
      </Alert.Description>
    </Alert.Content>
    <CloseButton
      type="button"
      size="xs"
      variant="outline"
      aria-label="Dismiss"
      alignSelf="flex-start"
      onClick={onDismiss}
    >
      <XIcon weight="bold" />
    </CloseButton>
  </Alert.Root>
);

/** First-run hint while the mobile friendly view shows (spec §8.1). */
export const MobileViewHint: React.FC<{ onDismiss: () => void }> = ({
  onDismiss,
}) => (
  <Alert.Root {...bannerProps} role="status" data-part="mobile-view-hint">
    <Alert.Indicator>
      <InfoIcon weight="bold" />
    </Alert.Indicator>
    <Alert.Content>
      <Alert.Description>
        Showing a mobile friendly version of this document. Switch to
        Original anytime.
      </Alert.Description>
    </Alert.Content>
    <Button
      type="button"
      size="xs"
      variant="outline"
      alignSelf="center"
      onClick={onDismiss}
    >
      Got it
    </Button>
  </Alert.Root>
);
