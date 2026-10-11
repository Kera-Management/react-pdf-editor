import React, { useEffect, useRef } from "react";
import { Box, Button, HStack, Text } from "@chakra-ui/react";

export interface ReviewBarProps {
  /** The host's `saveLabel`, else "Finish". */
  saveLabel?: string;
  isSaving?: boolean;
  /** Runs the editor's existing save (incomplete-fields gate included). */
  onSave: () => void;
  /** Back to the mobile friendly view, at the last field. */
  onBack: () => void;
}

/**
 * Review the original before finishing (spec §8.4, S3). Shown in place of
 * the guided bar while the signer looks over the original layout with
 * their values; the save runs only from here.
 */
export const ReviewBar: React.FC<ReviewBarProps> = ({
  saveLabel,
  isSaving,
  onSave,
  onBack,
}) => {
  const headingRef = useRef<HTMLParagraphElement>(null);
  // Finish in the guided bar unmounts with the bar, dropping focus on the
  // page body: move it here so keyboard and screen reader users land on
  // the review (focus that is still somewhere useful is left alone).
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) headingRef.current?.focus();
  }, []);
  return (
    <Box
      role="region"
      aria-label="Review the original document"
      data-part="mobile-review-bar"
      flexShrink={0}
      position="relative"
      zIndex={1}
      bg="bg.panel"
      borderTopWidth="1px"
      borderColor="border"
      px="4"
      pt="3"
      pb="calc(var(--chakra-spacing-3) + env(safe-area-inset-bottom))"
    >
      <Text ref={headingRef} tabIndex={-1} fontWeight="semibold" outline="none">
        Review the original document
      </Text>
      <Text fontSize="14px" color="fg.muted" mt="1" mb="3">
        Check your entries before you finish. This is the version that will be
        signed.
      </Text>
      <HStack gap="2" justify="flex-end">
        <Button type="button" variant="outline" size="md" onClick={onBack}>
          Back to edit
        </Button>
        <Button
          type="button"
          size="md"
          onClick={onSave}
          loading={isSaving}
          loadingText="Saving"
        >
          {saveLabel ?? "Finish"}
        </Button>
      </HStack>
    </Box>
  );
};

export default ReviewBar;
