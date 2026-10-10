import React from "react";
import {
  Box,
  Button,
  Center,
  Flex,
  Heading,
  Icon,
  IconButton,
  Progress,
  Stack,
  Text,
} from "@chakra-ui/react";
import { WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { Tooltip } from "../components/Toolbar/Tooltip";

export interface StatusStatesProps {
  kind: "loading" | "error";
  /** The load failure; required for `kind="error"`. */
  error?: Error;
  /**
   * Host close callback. Rendered as the header's Close button. Called
   * directly (not through the unsaved-changes guard): nothing can be dirty
   * before the document has loaded.
   */
  onClose?: () => void;
  /** Error state only: re-runs the document load ("Try again"). */
  onRetry?: () => void;
}

/**
 * Full-editor loading and error states (spec §3.9, audit C7), rendered in
 * place of the editor before the document and its pages are ready.
 *
 * Mirrors the app's LoadingWrapper (indeterminate progress bar + label),
 * FlowHeader (outline rounded Close) and the error-with-retry pattern.
 */
export const StatusStates: React.FC<StatusStatesProps> = ({
  kind,
  error,
  onClose,
  onRetry,
}) => (
  <Flex
    className="pdf-editor-root"
    direction="column"
    w="full"
    h="100vh"
    maxH="100vh"
    bg="bg"
    color="fg"
    data-state={kind}
  >
    {onClose && (
      <Flex
        as="header"
        justify="flex-end"
        px={4}
        py={2}
        borderBottomWidth="1px"
        borderColor="border"
        flexShrink={0}
      >
        <Tooltip content="Close">
          <IconButton
            type="button"
            aria-label="Close"
            size="sm"
            variant="outline"
            rounded="full"
            onClick={onClose}
          >
            <XIcon />
          </IconButton>
        </Tooltip>
      </Flex>
    )}

    <Center flex="1" minH={0} p={6}>
      {kind === "error" ? (
        <Stack
          role="alert"
          align="center"
          textAlign="center"
          gap={3}
          maxW="480px"
        >
          <Icon boxSize="8" color="fg.muted" aria-hidden="true">
            <WarningCircleIcon />
          </Icon>
          <Heading as="h2" size="md" fontWeight="medium">
            We couldn&apos;t open this document
          </Heading>
          <Text color="fg.muted">
            The file may be corrupted, in an unsupported format, or missing.
            Try again, or choose a different file.
          </Text>
          {error?.message && (
            <Text color="fg.subtle" wordBreak="break-word">
              Error: {error.message}
            </Text>
          )}
          {onRetry && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              mt={2}
              onClick={onRetry}
            >
              Try again
            </Button>
          )}
        </Stack>
      ) : (
        <Stack role="status" align="center" gap={5}>
          <Box w={{ base: "xs", md: "sm" }}>
            <Progress.Root
              value={null}
              size="xs"
              aria-label="Loading document"
            >
              <Progress.Track>
                <Progress.Range />
              </Progress.Track>
            </Progress.Root>
          </Box>
          <Text color="fg.muted">Loading document</Text>
        </Stack>
      )}
    </Center>
  </Flex>
);

export default StatusStates;
