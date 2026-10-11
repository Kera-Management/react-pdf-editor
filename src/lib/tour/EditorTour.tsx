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

// Spotlight corners. Ark pads the cut-out 10px around the target, so this
// roughly follows the rounded corners of the cards and menus it frames.
const SPOTLIGHT_RADIUS = 16;

/**
 * One run of a guided tour (spec §5.1): Ark UI's tour machine for the
 * dimmed backdrop, spotlight, focus handling and keyboard support, styled
 * as a neutral Chakra popover. Mounted per run and started on mount; the
 * caller unmounts it to end a run from outside (a mode switch, Finish).
 *
 * Every run opens on a centred intro card (Start tour / Skip) that says
 * what the tour covers; "1 of N" counts only the steps after it.
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

  const introCount = steps[0]?.kind === "intro" ? 1 : 0;

  const tourSteps = useMemo<TourStepDetails[]>(
    () =>
      steps.map((step) =>
        step.kind === "intro"
          ? {
              id: step.id,
              type: "dialog",
              title: step.title,
              description: step.body,
              backdrop: true,
            }
          : {
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
            },
      ),
    [steps],
  );

  const tour = useTour({
    steps: tourSteps,
    spotlightRadius: SPOTLIGHT_RADIUS,
    // Ark's step actions put these on the buttons as their accessible names.
    translations: {
      nextStep: "Next",
      prevStep: "Back",
      close: "Close tour",
      progressText: ({ current, total }) =>
        `${current - introCount + 1} of ${total - introCount}`,
    },
    // Only a click on the background ends the tour. Focus moving out on
    // its own (a menu handing focus back, the editor's auto-scroll to the
    // first field) must not.
    onFocusOutside: (event) => event.preventDefault(),
    onStepChange: ({ stepIndex }) => {
      // The intro is step 0; the steps after it count from 1.
      if (stepIndex >= 0)
        latest.current.onStepChange(stepIndex - introCount + 1);
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
  const isIntro = step?.type === "dialog";
  // Back from the first real step would only return to the intro.
  const canGoBack = tour.hasPrevStep && tour.stepIndex > introCount;

  return (
    <Tour.Root tour={tour}>
      {/* Ark positions the backdrop, spotlight and popover absolutely
          against their offset parent: this layer, pinned to the viewport.
          The layer also blocks the editor while the tour runs: the
          spotlight is a hole in the backdrop, so without it the
          highlighted control (the open mode menu, Save) stays clickable
          and a mode switch mid-tour starts the other mode's tour. A
          press on the layer is "outside" the popover: Ark ignores it
          inside the spotlight and dismisses the tour anywhere else, like
          the backdrop. It is the parts' stacking context, so they stack backdrop < spotlight <
          popover here. Ark copies the content's z-index onto the
          positioner, so the content must carry the popover's. */}
      <Box
        data-part="tour-layer"
        position="fixed"
        inset="0"
        zIndex="popover"
        pointerEvents="auto"
      >
        <Tour.Backdrop asChild>
          <Box bg="blackAlpha.600" zIndex="0" pointerEvents="auto" />
        </Tour.Backdrop>
        <Tour.Spotlight asChild>
          <Box zIndex="1" borderWidth="2px" borderColor="border.emphasized" />
        </Tour.Spotlight>
        <Tour.Positioner asChild>
          <Box
            zIndex="2"
            pointerEvents="auto"
            // The intro card has no target: centre it in the viewport.
            css={{
              "&[data-type=dialog]": {
                position: "absolute",
                inset: "0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                p: "4",
                // Clicks beside the card reach the backdrop (dismiss).
                pointerEvents: "none",
              },
            }}
          >
            <Tour.Content asChild>
              <Box
                data-part="tour-popover"
                position="relative"
                zIndex="2"
                pointerEvents="auto"
                bg="bg.panel"
                color="fg"
                borderWidth="1px"
                borderColor="border"
                rounded="l3"
                shadow="lg"
                p="4"
                w={isIntro ? "sm" : "xs"}
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
                  {isIntro ? (
                    <Text textStyle="xs" color="fg.muted">
                      Quick tour
                    </Text>
                  ) : (
                    <Tour.ProgressText asChild>
                      <Text textStyle="xs" color="fg.muted">
                        {tour.getProgressText()}
                      </Text>
                    </Tour.ProgressText>
                  )}
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
                    {canGoBack && (
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
                        action={{
                          label: isIntro ? "Start tour" : "Next",
                          // Ark names a "next" button "Next" for screen
                          // readers; a custom action keeps the visible
                          // "Start tour" as its name.
                          action: isIntro
                            ? (actions) => actions.next()
                            : "next",
                        }}
                      >
                        <Button size="xs">
                          {isIntro ? "Start tour" : "Next"}
                        </Button>
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
