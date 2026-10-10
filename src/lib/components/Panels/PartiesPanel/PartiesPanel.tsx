import React from "react";
import {
  Alert,
  Box,
  CloseButton,
  Field,
  HStack,
  InputGroup,
  NumberInput,
  SegmentGroup,
  Separator,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  EnvelopeSimpleIcon,
  InfoIcon,
  UserCheckIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";

import { PartiesConfig, PartiesPanelAssignMode, PartyRole } from "./types";
import { usePartiesState } from "./usePartiesState";
import { useDragReorder } from "./useDragReorder";
import { PartyRow } from "./PartyRow";
import { PanelHeader } from "../PanelHeader";
import { LeadingIcon } from "../LeadingIcon";
import { RoleSegmentedControlOption } from "./RoleSegmentedControl";
import { resolveAssignRows } from "./assignResolution";

/** The roster this panel renders rows for -- keyed by `PartiesConfig`'s ids. */
export interface PartiesPanelParticipant {
  id: string;
  label: string;
  /** Host-supplied display tag, e.g. "Signs by email link". Optional. */
  badge?: string;
}

export interface PartiesPanelProps {
  config: PartiesConfig;
  participants: PartiesPanelParticipant[];
  /**
   * Opts the panel into selection-aware assign mode: a banner names the
   * field being assigned, and rows grow a checkbox for "assign this field
   * to this person". Omitted (the default) renders byte-identical to the
   * panel with no assign mode at all -- zero new DOM.
   */
  assignMode?: PartiesPanelAssignMode;
}

/** "Signs first" / "Signs second"... spelled out while it reads naturally. */
const stepHeading = (step: number): string => {
  const ordinals = ["first", "second", "third", "fourth", "fifth", "sixth"];
  return "Signs " + (ordinals[step] || String(step + 1) + "th");
};

const ROLE_OPTIONS: RoleSegmentedControlOption[] = [
  { value: "signer", label: "Signs" },
  { value: "viewer", label: "Copy" },
  { value: "excluded", label: "None" },
];

type OrderMode = "together" | "sequence";

const ORDER_MODE_ITEMS: { value: OrderMode; label: string }[] = [
  { value: "together", label: "All at once" },
  { value: "sequence", label: "One after another" },
];

/** Sub-section title inside the panel, with an optional count badge. */
const SectionHeading: React.FC<{ children: React.ReactNode; count?: number }> = ({
  children,
  count,
}) => <PanelHeader title={children} count={count} />;

/** Dashed placeholder for an empty role list, sized like a party card. */
const EmptyState: React.FC<{
  icon: React.ReactElement;
  children: React.ReactNode;
}> = ({ icon, children }) => (
  <HStack
    align="flex-start"
    gap={2}
    px={3}
    py={2.5}
    borderWidth="1px"
    borderStyle="dashed"
    borderColor="border.emphasized"
    rounded="l3"
    color="fg.muted"
  >
    <LeadingIcon>{icon}</LeadingIcon>
    <Text>{children}</Text>
  </HStack>
);

/** "A" / "A and B" / "A, B and C" -- no Oxford comma, no em dash. */
const joinNames = (names: string[]): string => {
  if (names.length === 1) {
    return names[0];
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

/**
 * Plain-language summary composed purely from labels + steps -- no domain
 * words. `orderedSigners` steps are always contiguous starting at 0, so
 * grouping by step index alone (no sparse-array handling) is safe.
 */
const composeSummary = (
  orderedSigners: { id: string; step: number }[],
  labelFor: (id: string) => string
): string | null => {
  if (orderedSigners.length === 0) {
    return null;
  }
  const groups: string[][] = [];
  orderedSigners.forEach(({ id, step }) => {
    if (!groups[step]) {
      groups[step] = [];
    }
    groups[step].push(labelFor(id));
  });
  if (groups.length === 1) {
    return "Everyone signs at the same time.";
  }
  const [firstGroup, ...restGroups] = groups;
  const verb = firstGroup.length === 1 ? "signs" : "sign";
  const restText = restGroups.map(joinNames).join(", then ");
  return `${joinNames(firstGroup)} ${verb} first, then ${restText}.`;
};

export const PartiesPanel: React.FC<PartiesPanelProps> = ({
  config,
  participants,
  assignMode,
}) => {
  // The banner needs a LEAVE animation, but it unmounts the instant
  // assignMode clears -- so keep the last value alive while a closing
  // animation plays, then unmount on animationend (with a timer fallback
  // for reduced-motion, where the animation never fires).
  const [visibleAssign, setVisibleAssign] =
    React.useState<PartiesPanelAssignMode | undefined>(assignMode);
  const [assignClosing, setAssignClosing] = React.useState(false);
  React.useEffect(() => {
    if (assignMode) {
      setVisibleAssign(assignMode);
      setAssignClosing(false);
      return;
    }
    if (!visibleAssign) return;
    setAssignClosing(true);
    const fallback = window.setTimeout(() => {
      setVisibleAssign(undefined);
      setAssignClosing(false);
    }, 250);
    return () => window.clearTimeout(fallback);
    // visibleAssign intentionally omitted: this effect reacts to assignMode
    // transitions only; including it would re-arm the close timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignMode]);
  const handleAssignBannerAnimationEnd = (
    event: React.AnimationEvent<HTMLDivElement>
  ) => {
    // Only the banner's own exit animation ends it, not one bubbling up
    // from a child (e.g. the close button's focus ring).
    if (assignClosing && event.target === event.currentTarget) {
      setVisibleAssign(undefined);
      setAssignClosing(false);
    }
  };

  const partyIds = React.useMemo(
    () => participants.map((p) => p.id),
    [participants]
  );
  const labelById = React.useMemo(
    () => new Map(participants.map((p) => [p.id, p.label])),
    [participants]
  );
  const badgeById = React.useMemo(
    () => new Map(participants.map((p) => [p.id, p.badge])),
    [participants]
  );
  const labelFor = React.useCallback(
    (id: string) => labelById.get(id) ?? id,
    [labelById]
  );
  // Roster order, not role-grouped order, so a party's color stays put as
  // it moves between the signer list / undecided / viewer / excluded
  // sections.
  const colorIndexById = React.useMemo(
    () => new Map(participants.map((p, index) => [p.id, index])),
    [participants]
  );

  const {
    roleFor,
    setRole,
    reorder,
    joinStepOf,
    toggleGroupedWithPrevious,
    groupAll,
    sequenceAll,
    setExpiryDays,
    orderedSigners,
    viewers,
    undecided,
    selection,
  } = usePartiesState(config, partyIds);

  const signerIds = React.useMemo(
    () => orderedSigners.map((s) => s.id),
    [orderedSigners]
  );
  // Dragging over a row's edges reorders (live, as before); over its middle
  // arms "drop onto this person" -- releasing there joins their step, so a
  // signer can be dragged INTO a step box, not just next to it.
  const { onPointerDown, onKeyDown, isDragging, dropTargetId, joinTargetId } =
    useDragReorder({ ids: signerIds, onReorder: reorder, onJoin: joinStepOf });

  const excluded = partyIds.filter((id) => roleFor(id) === "excluded");
  const summary = composeSummary(orderedSigners, labelFor);

  // Assign mode: reuse the same stale/excluded resolution PropertiesPanel's
  // "Assign to" list uses, so an excluded party who was assigned before
  // being excluded still gets a checkbox instead of silently losing it.
  const assignRows = assignMode
    ? resolveAssignRows(
        assignMode.assignedIds,
        assignMode.participants,
        assignMode.allParticipants
      )
    : [];
  const staleAssignedIds = new Set(
    assignRows.filter((row) => row.excluded).map((row) => row.id)
  );

  /** Signer/undecided/viewer rows: always checkable while assign mode is on. */
  const assignPropsFor = (partyId: string) => {
    if (!assignMode) {
      return {};
    }
    const checked = assignMode.assignedIds.includes(partyId);
    return {
      assignChecked: checked,
      onAssignToggle: () => assignMode.onToggle(partyId, !checked),
      assignAriaLabel: `Assign ${labelFor(partyId)} to ${assignMode.fieldLabel}`,
    };
  };

  /** Excluded rows: checkable ONLY when stale-assigned (assigned but not on the assignable list). */
  const assignPropsForExcluded = (partyId: string) => {
    if (!assignMode || !staleAssignedIds.has(partyId)) {
      return {};
    }
    return {
      assignChecked: true,
      onAssignToggle: () => assignMode.onToggle(partyId, false),
      assignAriaLabel: `Assign ${labelFor(partyId)} to ${assignMode.fieldLabel}`,
    };
  };

  const handleRoleChange = (id: string) => (next: PartyRole) => setRole(id, next);

  const expiryValue = selection.expiryDays;
  const expiryDisplay =
    expiryValue === null || expiryValue === undefined ? "" : String(expiryValue);

  const handleExpiryChange = (details: { value: string; valueAsNumber: number }) => {
    if (details.value === "") {
      setExpiryDays(null);
      return;
    }
    if (!Number.isNaN(details.valueAsNumber)) {
      setExpiryDays(details.valueAsNumber);
    }
  };

  // Which pole of the order the signers sit at, so the SegmentGroup shows
  // it; null (no segment lit) for a mixed order.
  const orderMode: OrderMode | null =
    orderedSigners.length < 2
      ? null
      : orderedSigners.every((s) => s.step === 0)
        ? "together"
        : orderedSigners.every((s, index) => s.step === index)
          ? "sequence"
          : null;

  const handleOrderModeChange = (details: { value: string | null }) => {
    if (details.value === "together") groupAll();
    else if (details.value === "sequence") sequenceAll();
  };

  return (
    <Stack gap={4}>
      {/* The panel's host-facing title says WHO ("Recipients"); this section
          is about WHEN, and needs to say so. */}
      <Stack gap={2}>
        <SectionHeading>Signing order</SectionHeading>
        {summary ? (
          <Text color="fg.muted">{summary}</Text>
        ) : (
          <Alert.Root status="error" size="sm" role="alert">
            <Alert.Indicator>
              <WarningCircleIcon weight="bold" />
            </Alert.Indicator>
            <Alert.Title>At least one person needs to sign.</Alert.Title>
          </Alert.Root>
        )}

        {/* Order is expressed as VISIBLE step groups: everyone in one box
            signs at the same time; boxes run top to bottom with a "then"
            between. The two common cases are one-click poles here. */}
        {orderedSigners.length > 1 && (
          <SegmentGroup.Root
            size="sm"
            value={orderMode}
            onValueChange={handleOrderModeChange}
            aria-label="Signing order"
            alignSelf="flex-start"
          >
            <SegmentGroup.Indicator />
            <SegmentGroup.Items items={ORDER_MODE_ITEMS} />
          </SegmentGroup.Root>
        )}
      </Stack>

      {/* Directly above the ROWS it explains, not above the panel's order
          chrome: at the panel top it sat between the question and the
          switches it teaches. The label is always the field's display name
          (A1), never its id. */}
      {visibleAssign && (
        <Alert.Root
          status="info"
          size="sm"
          role="status"
          data-state={assignClosing ? "closed" : "open"}
          _open={{
            animationName: "fade-in, slide-from-top",
            animationDuration: "moderate",
          }}
          _closed={{
            animationName: "fade-out, slide-to-top",
            animationDuration: "fast",
            animationFillMode: "forwards",
          }}
          onAnimationEnd={handleAssignBannerAnimationEnd}
        >
          <Alert.Indicator>
            <InfoIcon weight="bold" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>Who fills "{visibleAssign.fieldLabel}"?</Alert.Title>
            <Alert.Description>
              Turn on each person who should complete this field.
            </Alert.Description>
          </Alert.Content>
          <CloseButton
            type="button"
            size="xs"
            aria-label="Stop assigning"
            onClick={visibleAssign.onDeselect}
            alignSelf="flex-start"
            mt="-1"
            me="-1"
          >
            <XIcon weight="bold" />
          </CloseButton>
        </Alert.Root>
      )}

      {orderedSigners.length > 0 && (
        <Stack gap={2}>
          {(() => {
            const groups: { step: number; ids: string[] }[] = [];
            orderedSigners.forEach(({ id, step }) => {
              const last = groups[groups.length - 1];
              if (last && last.step === step) last.ids.push(id);
              else groups.push({ step, ids: [id] });
            });
            const multiStep = groups.length > 1;
            return groups.map((group, groupIndex) => {
              // A drop right now would pull the dragged signer into this box.
              const isJoinTarget =
                joinTargetId !== null && group.ids.includes(joinTargetId);
              // Each row is its own card; a muted box only wraps signers who
              // sign together (or the step a drop would join).
              const boxed = isJoinTarget || group.ids.length > 1;
              return (
                <Box key={group.step}>
                  {groupIndex > 0 && (
                    <Text
                      color="fg.muted"
                      textAlign="center"
                      py={1}
                      aria-hidden="true"
                    >
                      then
                    </Text>
                  )}
                  <Stack
                    gap={2}
                    borderWidth={boxed ? "1px" : 0}
                    borderStyle={isJoinTarget ? "dashed" : "solid"}
                    borderColor={isJoinTarget ? "border.emphasized" : "border"}
                    bg={boxed ? "bg.muted" : undefined}
                    rounded="l3"
                    p={boxed ? 2 : 0}
                    data-testid={"step-group-" + groupIndex}
                    data-join-target={isJoinTarget ? "" : undefined}
                  >
                    {isJoinTarget && (
                      <Text color="fg.muted" textAlign="center">
                        Drop to sign together
                      </Text>
                    )}
                    {multiStep && (
                      <Text fontWeight="medium" color="fg.muted">
                        {stepHeading(groupIndex)}
                        {group.ids.length > 1 ? " · together" : ""}
                      </Text>
                    )}
                    {group.ids.map((id, memberIndex) => {
                      const index = orderedSigners.findIndex((s) => s.id === id);
                      // The toggle states its OUTCOME with real names, not the
                      // step machinery. Grouped rows offer to break out below
                      // their step-mates; ungrouped rows offer to sign
                      // alongside the step above.
                      const toggleLabel =
                        memberIndex > 0
                          ? `Sign after ${joinNames(
                              group.ids
                                .filter((other) => other !== id)
                                .map(labelFor)
                            )}`
                          : groupIndex > 0
                            ? `Sign at the same time as ${joinNames(
                                groups[groupIndex - 1].ids.map(labelFor)
                              )}`
                            : undefined;
                      return (
                        <PartyRow
                          key={id}
                          id={id}
                          label={labelFor(id)}
                          colorIndex={colorIndexById.get(id)}
                          badge={badgeById.get(id)}
                          role="signer"
                          roleOptions={ROLE_OPTIONS}
                          onRoleChange={handleRoleChange(id)}
                          groupToggleLabel={toggleLabel}
                          onToggleGrouped={
                            index > 0
                              ? () => toggleGroupedWithPrevious(id)
                              : undefined
                          }
                          draggable
                          isDragging={isDragging(id)}
                          isDropTarget={dropTargetId === id}
                          onPointerDown={(e) => onPointerDown(id, e)}
                          onKeyDown={(e) => onKeyDown(id, e)}
                          {...assignPropsFor(id)}
                        />
                      );
                    })}
                  </Stack>
                </Box>
              );
            });
          })()}
        </Stack>
      )}

      {undecided.length > 0 && (
        <Stack gap={2}>
          {undecided.map((id) => (
            <PartyRow
              key={id}
              id={id}
              label={labelFor(id)}
              colorIndex={colorIndexById.get(id)}
              badge={badgeById.get(id)}
              role={undefined}
              roleOptions={ROLE_OPTIONS}
              onRoleChange={handleRoleChange(id)}
              hint="Choose a role"
              {...assignPropsFor(id)}
            />
          ))}
        </Stack>
      )}

      <Separator />

      <Stack gap={2}>
        <SectionHeading count={viewers.length}>Also gets a copy</SectionHeading>
        {viewers.length === 0 ? (
          <EmptyState icon={<EnvelopeSimpleIcon />}>
            Choose Copy on anyone who should get the signed document.
          </EmptyState>
        ) : (
          <Stack gap={2}>
            {viewers.map((id) => (
              <PartyRow
                key={id}
                id={id}
                label={labelFor(id)}
                colorIndex={colorIndexById.get(id)}
                badge={badgeById.get(id)}
                role="viewer"
                roleOptions={ROLE_OPTIONS}
                onRoleChange={handleRoleChange(id)}
                {...assignPropsFor(id)}
              />
            ))}
          </Stack>
        )}
      </Stack>

      <Separator />

      <Stack gap={2}>
        <SectionHeading count={excluded.length}>Not included</SectionHeading>
        {excluded.length === 0 ? (
          <EmptyState icon={<UserCheckIcon />}>Everyone is included.</EmptyState>
        ) : (
          <Stack gap={2}>
            {excluded.map((id) => (
              <PartyRow
                key={id}
                id={id}
                label={labelFor(id)}
                colorIndex={colorIndexById.get(id)}
                badge={badgeById.get(id)}
                role="excluded"
                roleOptions={ROLE_OPTIONS}
                onRoleChange={handleRoleChange(id)}
                {...assignPropsForExcluded(id)}
              />
            ))}
          </Stack>
        )}
      </Stack>

      {config.expiry && <Separator />}
      {config.expiry && (
        <Field.Root>
          <Field.Label>This offer expires in</Field.Label>
          <InputGroup endAddon="days">
            <NumberInput.Root
              size="sm"
              min={0}
              w="full"
              value={expiryDisplay}
              onValueChange={handleExpiryChange}
            >
              <NumberInput.Input borderEndRadius="0" />
            </NumberInput.Root>
          </InputGroup>
        </Field.Root>
      )}
    </Stack>
  );
};

export default PartiesPanel;
