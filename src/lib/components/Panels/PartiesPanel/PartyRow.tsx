import React from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Stack,
  Text,
} from "@chakra-ui/react";
import { ArrowsDownUpIcon, DotsSixVerticalIcon } from "@phosphor-icons/react";

import { UserAvatar } from "../UserAvatar";
import { LeadingIcon } from "../LeadingIcon";
import { Switch } from "../../Switch";
import { PartyRole } from "./types";
import {
  RoleSegmentedControl,
  RoleSegmentedControlOption,
} from "./RoleSegmentedControl";

export interface PartyRowProps {
  /** Party id, used only for the drag-reorder data attribute. */
  id: string;
  /** Full display name. Never truncated: wraps instead. */
  label: string;
  /**
   * This party's position in the roster order (the `participants` array
   * the host passed to the panel). Its presence turns the avatar on; the
   * avatar's colour comes from the name, as in the app. Omit to render the
   * row without an avatar (e.g. hosts not yet on the
   * roster-order contract).
   */
  colorIndex?: number;
  /** Host-supplied display tag (e.g. a relationship or delivery note). */
  badge?: string;
  /** Current role. `undefined` renders the segmented control undecided. */
  role: PartyRole | undefined;
  roleOptions: RoleSegmentedControlOption[];
  onRoleChange: (role: PartyRole) => void;
  /**
   * The same-time toggle's full label, composed by the panel from real
   * names ("Sign at the same time as Olive Ono" / "Sign after Olive Ono").
   * Structural copy like "Join the step above" tested as meaning nothing
   * to everyday users, so the row never invents its own wording here.
   */
  groupToggleLabel?: string;
  /** Present only on non-first signer rows: renders the same-time toggle. */
  onToggleGrouped?: () => void;
  /** Quiet hint shown for undecided rows, e.g. "Choose a role". */
  hint?: string;
  /** Drag reorder via the grip handle, signer rows only. */
  draggable?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onPointerDown?: (event: React.PointerEvent) => void;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  /**
   * Assign-mode switch state. Only meaningful alongside `onAssignToggle`;
   * both come from the panel's `assignMode` prop.
   */
  assignChecked?: boolean;
  /** Presence renders the assign-mode switch on the name line's right edge. */
  onAssignToggle?: () => void;
  /**
   * Full accessible label for the assign switch, e.g. "Assign Olive Ono
   * to Move-in date", composed by the panel from real names, the same
   * idiom as `groupToggleLabel`: the row never invents its own wording.
   */
  assignAriaLabel?: string;
}

const stopPropagation = (event: React.SyntheticEvent) => event.stopPropagation();

/**
 * One party in the recipients panel. Mirrors the app's `RoomComposer` rows
 * (bordered card, grip handle, `bg.muted` while dragging) and
 * `RecipientStatusRow` (medium name, muted metadata).
 */
export const PartyRow: React.FC<PartyRowProps> = ({
  id,
  label,
  colorIndex,
  badge,
  role,
  roleOptions,
  onRoleChange,
  groupToggleLabel,
  onToggleGrouped,
  hint,
  draggable = false,
  isDragging = false,
  isDropTarget = false,
  onPointerDown,
  onKeyDown,
  assignChecked,
  onAssignToggle,
  assignAriaLabel,
}) => {
  const showDropTarget = isDropTarget && !isDragging;

  return (
    <Box
      role="group"
      aria-label={label}
      data-reorder-id={draggable ? id : undefined}
      data-dragging={isDragging ? "" : undefined}
      data-drop-target={showDropTarget ? "" : undefined}
      tabIndex={draggable ? 0 : undefined}
      onKeyDown={draggable ? onKeyDown : undefined}
      borderWidth="1px"
      borderColor={showDropTarget ? "border.emphasized" : "border"}
      bg={isDragging ? "bg.muted" : showDropTarget ? "bg.subtle" : "bg.panel"}
      opacity={isDragging ? 0.6 : 1}
      rounded="l3"
      px={draggable ? 1 : 3}
      focusVisibleRing="outside"
    >
      <Flex align="flex-start" gap={2} py={2}>
        {/* Grip on the LEFT edge: the reorderable-list convention. Pointer
            only; keyboard reorder (arrow keys) lives on the row itself, so
            the handle stays out of the tab order. */}
        {draggable && (
          <IconButton
            type="button"
            aria-label={`Drag ${label} to reorder`}
            tabIndex={-1}
            size="xs"
            variant="plain"
            color="fg.muted"
            cursor={isDragging ? "grabbing" : "grab"}
            touchAction="none"
            flexShrink={0}
            data-drag-handle={id}
            onPointerDown={onPointerDown}
          >
            <DotsSixVerticalIcon weight="bold" />
          </IconButton>
        )}

        <Stack gap={2} flex="1" minW={0}>
          <HStack gap={2} align="center">
            {colorIndex !== undefined && (
              <UserAvatar
                name={label}
                size="xs"
                flexShrink={0}
                aria-hidden="true"
              />
            )}
            {/* Names wrap rather than truncate: a recipient must always be
                identifiable in full. */}
            <Text fontWeight="medium" flex="1" minW={0} wordBreak="break-word">
              {label}
            </Text>

            {/* Assign switch on the name line's RIGHT edge: a settings row,
                "this person, on/off for the field". The wrapper stops pointer
                and keyboard events so toggling never starts a drag. */}
            {onAssignToggle && (
              <Box
                flexShrink={0}
                display="inline-flex"
                onPointerDown={stopPropagation}
                onKeyDown={stopPropagation}
              >
                <Switch
                  size="sm"
                  checked={!!assignChecked}
                  onToggle={onAssignToggle}
                  ariaLabel={assignAriaLabel ?? `Assign ${label}`}
                />
              </Box>
            )}
          </HStack>

          {(badge || hint) && (
            <HStack gap={2} wrap="wrap">
              {badge && (
                <Badge size="sm" variant="subtle" colorPalette="gray">
                  {badge}
                </Badge>
              )}
              {hint && <Text color="fg.muted">{hint}</Text>}
            </HStack>
          )}

          {/* Role changes must never be read as the start of a drag gesture,
              and arrow keys here must switch roles, not reorder the row. */}
          <Box onPointerDown={stopPropagation} onKeyDown={stopPropagation}>
            <RoleSegmentedControl
              size="xs"
              options={roleOptions}
              value={role}
              onChange={(value) => onRoleChange(value as PartyRole)}
              aria-label={`Role for ${label}`}
            />
          </Box>

          {onToggleGrouped && groupToggleLabel && (
            <Box>
              <Button
                type="button"
                size="xs"
                variant="outline"
                w="full"
                h="auto"
                minH="7"
                py="1"
                justifyContent="flex-start"
                alignItems="flex-start"
                textAlign="start"
                whiteSpace="normal"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleGrouped();
                }}
                onPointerDown={stopPropagation}
              >
                <LeadingIcon>
                  <ArrowsDownUpIcon weight="bold" />
                </LeadingIcon>
                {groupToggleLabel}
              </Button>
            </Box>
          )}
        </Stack>
      </Flex>
    </Box>
  );
};

export default PartyRow;
