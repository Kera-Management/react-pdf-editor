import React from "react";
import {
  AbsoluteCenter,
  Box,
  Button,
  HStack,
  Icon,
  ProgressCircle,
  Text,
} from "@chakra-ui/react";
import {
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
} from "@phosphor-icons/react";

export interface GuidedBarProps {
  /** 1-based position of the current field among the required fields. */
  position: number;
  /** Required fields for the active participant (progress's total). */
  total: number;
  /** Required fields still incomplete. */
  remaining: number;
  onPrevious: () => void;
  onNext: () => void;
  /** Starts the review-the-original step (spec §8.4). */
  onFinish: () => void;
  previousDisabled?: boolean;
}

/**
 * Fill & Sign guided bar for the mobile friendly view (spec §8.4): a filling
 * progress circle (the app's billing seat circle) with the completed count
 * inside, "9 left" and "Field 3 of 12", then Previous / Next and Finish.
 * Flush at the bottom of the canvas area, clear of the home indicator. Finish is always enabled: the
 * review step and the existing save gate decide what happens next.
 */
export const GuidedBar: React.FC<GuidedBarProps> = ({
  position,
  total,
  remaining,
  onPrevious,
  onNext,
  onFinish,
  previousDisabled,
}) => {
  const done = remaining === 0;
  return (
    <Box
      role="region"
      aria-label="Guided signing"
      data-part="mobile-guided-bar"
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
      <HStack gap="3" mb="3">
        <ProgressCircle.Root
          size="md"
          value={total > 0 ? ((total - remaining) / total) * 100 : 100}
          aria-label="Required fields completed"
          flexShrink={0}
        >
          <ProgressCircle.Circle>
            <ProgressCircle.Track />
            <ProgressCircle.Range />
          </ProgressCircle.Circle>
          <AbsoluteCenter>
            {done ? (
              <Icon boxSize="4">
                <CheckIcon weight="bold" />
              </Icon>
            ) : (
              <Text fontSize="xs" fontWeight="semibold">
                {total - remaining}
              </Text>
            )}
          </AbsoluteCenter>
        </ProgressCircle.Root>
        <Box minW={0} role="status" aria-live="polite">
          <Text fontWeight="medium">
            {done ? "All fields complete" : `${remaining} left`}
          </Text>
          <Text color="fg.muted">
            {done
              ? `${total} of ${total} filled`
              : `Field ${position} of ${total}`}
          </Text>
        </Box>
      </HStack>
      <HStack gap="2">
        <Button
          type="button"
          variant="outline"
          size="md"
          onClick={onPrevious}
          disabled={previousDisabled}
        >
          <Icon boxSize="4">
            <CaretLeftIcon weight="bold" />
          </Icon>
          Previous
        </Button>
        {!done && (
          <Button type="button" variant="outline" size="md" onClick={onNext}>
            Next
            <Icon boxSize="4">
              <CaretRightIcon weight="bold" />
            </Icon>
          </Button>
        )}
        <Button
          type="button"
          size="md"
          ms="auto"
          onClick={onFinish}
          data-pdfe-tour="finish"
        >
          Finish
        </Button>
      </HStack>
    </Box>
  );
};

export default GuidedBar;
