import React, { useEffect, useMemo, useRef } from "react";
import { Box, Button, CloseButton, HStack, Text } from "@chakra-ui/react";
import { Tour, useTour, type TourStepDetails } from "@ark-ui/react/tour";
import type { EditorTourEndReason, EditorTourStep } from "./types";

export interface EditorTourProps {
  /** The steps of this run, already filtered to the ones on screen. */
  steps: EditorTourStep[];
  /** 1-based number of the step now showing. */
  onStepChange: (stepNumber: number) => void;
  /** Called once, when the run ends from inside the tour. */
  onEnd: (reason: EditorTourEndReason) => void;
}

// Ark's step actions put these on the buttons as their accessible names.
const TRANSLATIONS = {
  nextStep: "Next",
  prevStep: "Back",
  close: "Close tour",
  progressText: ({ current, total }: { current: number; total: number }) =>
    `${current + 1} of ${total}`,
};

/**
 * One run of a guided tour (spec §5.1): Ark UI's tour machine for the
 * dimmed backdrop, spotlight, focus handling and keyboard support, styled
 * as a neutral Chakra popover. Mounted per run and started on mount; the
 * caller unmounts it to end a run from outside (a mode switch, Finish).
 *
 * Next / Back / Skip only. Skip, the close button, Esc and a click on the
 * dimmed background all end the run as "dismissed"; Done on the last step
 * is the only "completed".
 *
 * Not portaled: hosts mount the editor inside a modal Chakra Dialog, which
 * sets `pointer-events: none` on <body> and treats anything outside its
 * content as outside. The tour renders in place, inside the editor's root
 * (so inside the host's dialog), on a fixed full-viewport layer.
 */
export const EditorTour: React.FC<EditorTourProps> = ({
  steps,
  onStepChange,
  onEnd,
}) => {
  const completedRef = useRef(false);
  const endedRef = useRef(false);
  const latest = useRef({ onStepChange, onEnd });
  latest.current = { onStepChange, onEnd };

  const tourSteps = useMemo<TourStepDetails[]>(
    () =>
      steps.map((step) => ({
        id: step.id,
        type: "tooltip",
        title: step.title,
        description: step.body,
        target: step.target,
        placement: step.placement,
        backdrop: true,
        arrow: true,
        // Ark runs a step's effect before showing it and its cleanup when
        // the step ends (Next, Back, Skip, Esc, unmount).
        ...(step.prepare && {
          effect: ({ show }: { show: () => void }) => step.prepare!(show),
        }),
      })),
    [steps]
  );

  const tour = useTour({
    steps: tourSteps,
    translations: TRANSLATIONS,
    // Only a click on the background ends the tour. Focus moving out on
    // its own (a menu handing focus back, the editor's auto-scroll to the
    // first field) must not.
    onFocusOutside: (event) => event.preventDefault(),
    onStepChange: ({ stepIndex }) => {
      if (stepIndex >= 0) latest.current.onStepChange(stepIndex + 1);
    },
    onStatusChange: ({ status }) => {
      if (status === "started" || endedRef.current) return;
      // Any other status ends the run: dismissed, skipped, completed, or
      // a target that vanished ("not-found"). On the last step Ark reports
      // "dismissed" then "completed" for Esc as well as Done, so Done
      // marks itself rather than trusting the status.
      endedRef.current = true;
      latest.current.onEnd(completedRef.current ? "completed" : "dismissed");
    },
  });

  // Esc ends the run, and only the run. A host Dialog listens for Esc on
  // the document in the capture phase too, and registered first, so the
  // tour's own handler would come too late to keep the host from closing.
  // A window capture listener runs before any document listener.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (endedRef.current) return;
      endedRef.current = true;
      latest.current.onEnd("dismissed");
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // `tour` changes identity every render; start once per mount.
  const startRef = useRef(tour.start);
  startRef.current = tour.start;
  useEffect(() => {
    startRef.current();
  }, []);

  const step = tour.step;

  return (
    <Tour.Root tour={tour}>
      {/* Ark positions the backdrop, spotlight and popover absolutely
          against their offset parent: this layer, pinned to the viewport.
          The layer itself lets clicks through; its parts take them. */}
      <Box
        data-part="tour-layer"
        position="fixed"
        inset="0"
        zIndex="popover"
        pointerEvents="none"
      >
        <Tour.Backdrop asChild>
          <Box bg="blackAlpha.600" zIndex="popover" pointerEvents="auto" />
        </Tour.Backdrop>
        <Tour.Spotlight asChild>
          <Box
            zIndex="popover"
            borderWidth="2px"
            borderColor="border.emphasized"
          />
        </Tour.Spotlight>
        <Tour.Positioner asChild>
          <Box zIndex="popover" pointerEvents="auto">
            <Tour.Content asChild>
              <Box
                data-part="tour-popover"
                bg="bg.panel"
                color="fg"
                borderWidth="1px"
                borderColor="border"
                rounded="l3"
                shadow="lg"
                p="4"
                w="xs"
                maxW="calc(100vw - var(--chakra-spacing-8))"
                outline="none"
              >
                <Tour.Arrow
                  style={
                    {
                      "--arrow-size": "var(--chakra-sizes-3)",
                      "--arrow-background": "var(--chakra-colors-bg-panel)",
                    } as React.CSSProperties
                  }
                >
                  <Tour.ArrowTip asChild>
                    <Box
                      borderTopWidth="1px"
                      borderInlineStartWidth="1px"
                      borderColor="border"
                    />
                  </Tour.ArrowTip>
                </Tour.Arrow>
                <HStack justify="space-between" align="center" mb="1">
                  <Tour.ProgressText asChild>
                    <Text textStyle="xs" color="fg.muted">
                      {tour.getProgressText()}
                    </Text>
                  </Tour.ProgressText>
                  <Tour.CloseTrigger asChild>
                    <CloseButton size="2xs" variant="ghost" me="-2" />
                  </Tour.CloseTrigger>
                </HStack>
                <Tour.Title asChild>
                  <Text as="h2" fontWeight="semibold" textStyle="md">
                    {step?.title}
                  </Text>
                </Tour.Title>
                <Tour.Description asChild>
                  <Text color="fg.muted" mt="1">
                    {step?.description}
                  </Text>
                </Tour.Description>
                <HStack justify="space-between" mt="4" gap="2">
                  <Tour.ActionTrigger
                    asChild
                    action={{
                      label: "Skip",
                      action: (actions) => actions.skip(),
                    }}
                  >
                    <Button size="xs" variant="ghost" ms="-2">
                      Skip
                    </Button>
                  </Tour.ActionTrigger>
                  <HStack gap="2">
                    {tour.hasPrevStep && (
                      <Tour.ActionTrigger
                        asChild
                        action={{ label: "Back", action: "prev" }}
                      >
                        <Button size="xs" variant="outline">
                          Back
                        </Button>
                      </Tour.ActionTrigger>
                    )}
                    {tour.hasNextStep ? (
                      <Tour.ActionTrigger
                        asChild
                        action={{ label: "Next", action: "next" }}
                      >
                        <Button size="xs">Next</Button>
                      </Tour.ActionTrigger>
                    ) : (
                      <Tour.ActionTrigger
                        asChild
                        action={{
                          label: "Done",
                          action: (actions) => {
                            completedRef.current = true;
                            actions.dismiss();
                          },
                        }}
                      >
                        <Button size="xs">Done</Button>
                      </Tour.ActionTrigger>
                    )}
                  </HStack>
                </HStack>
              </Box>
            </Tour.Content>
          </Box>
        </Tour.Positioner>
      </Box>
    </Tour.Root>
  );
};

export default EditorTour;
