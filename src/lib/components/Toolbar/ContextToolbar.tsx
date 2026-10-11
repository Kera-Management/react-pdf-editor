import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  HStack,
  Icon,
  IconButton,
  Menu,
  StackSeparator,
  Text,
} from "@chakra-ui/react";
import {
  AsteriskIcon,
  CaretDownIcon,
  CopyIcon,
  PencilSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { positionFloatingElement } from "../shared/positionFloating";
import { fieldTypeIcons } from "../shared/fieldTypeMeta";
import { BuildModeFieldType } from "../../PDFEditor";
import { Tooltip } from "./Tooltip";

/**
 * Identifies the selected field in the toolbar's leading context segment:
 * the icon comes from the shared fieldTypeMeta map, the name is whatever the
 * field is currently called.
 */
export interface ContextToolbarFieldContext {
  fieldName: string;
  fieldType: BuildModeFieldType;
}

export interface ContextToolbarProps {
  /** Position relative to the selected element */
  targetRect: DOMRect | null;
  /** Container element for positioning calculations */
  containerRef?: React.RefObject<HTMLElement>;
  /** Whether the toolbar is visible */
  isVisible: boolean;
  /**
   * The selected field's name + type, shown in the leading context segment.
   * The segment simply doesn't render without it.
   */
  context?: ContextToolbarFieldContext;
  /**
   * Transient confirmation text (e.g. "Added to 4 pages") that temporarily
   * replaces the field name in the context segment. Pass null/undefined (or
   * omit) to show the field name.
   */
  feedbackText?: string | null;
  /** Whether the field is required (for a multi-selection: all of them). */
  isRequired?: boolean;
  /** Callback for required toggle */
  onToggleRequired?: () => void;
  /** Callback to open the field's settings popover */
  onOpenProperties?: () => void;
  /** Duplicate this field in place, on the current page. */
  onDuplicate?: () => void;
  /** Duplicate this field onto every other page in the document. */
  onDuplicateAllPages?: () => void;
  /** Callback for delete action */
  onDelete?: () => void;
  /**
   * Callback for lock/unlock toggle. Accepted for API stability but not
   * wired to any control yet; no lock button renders.
   */
  onToggleLock?: () => void;
  /** Whether the field is locked. Same status as onToggleLock: unwired. */
  isLocked?: boolean;
  /** Additional actions, rendered after Duplicate and before Delete. */
  additionalActions?: React.ReactNode;
  /**
   * A6: number of selected fields. Above 1 the leading segment becomes an
   * "N selected" badge, Edit and Duplicate are disabled (not hidden), and
   * Required/Delete act on the whole selection via the batch callbacks.
   */
  selectionCount?: number;
  /** A6: set Required on every selected field. Falls back to onToggleRequired. */
  onBatchRequired?: (required: boolean) => void;
  /** A6: delete every selected field. Falls back to onDelete. */
  onBatchDelete?: () => void;
}

type Position = "top" | "bottom";

// Gap between the target element and the toolbar, in px.
const GAP = 8;

// Below this much horizontal room the labels collapse to icon buttons.
const COMPACT_WIDTH = 480;

interface ActionProps {
  label: string;
  icon: React.ReactNode;
  compact: boolean;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  danger?: boolean;
}

/**
 * One toolbar action. Labelled `Button` normally; an `IconButton` with a
 * tooltip when the toolbar is compact. The aria-label is the same either way.
 */
const Action = React.forwardRef<HTMLButtonElement, ActionProps>(
  function Action(
    { label, icon, compact, onClick, disabled, pressed, danger, ...rest },
    ref
  ) {
    const toggleProps =
      pressed === undefined
        ? { variant: "ghost" as const }
        : pressed
          ? { variant: "subtle" as const, colorPalette: "gray" }
          : { variant: "ghost" as const };
    const shared = {
      ref,
      type: "button" as const,
      size: "xs" as const,
      "aria-label": label,
      "aria-pressed": pressed,
      onClick,
      disabled,
      color: danger ? "fg.error" : undefined,
      ...toggleProps,
      ...rest,
    };

    if (compact) {
      return (
        <Tooltip content={label}>
          <IconButton {...shared}>{icon}</IconButton>
        </Tooltip>
      );
    }
    return (
      <Button {...shared}>
        {icon}
        {label}
      </Button>
    );
  }
);

export const ContextToolbar: React.FC<ContextToolbarProps> = ({
  targetRect,
  containerRef,
  isVisible,
  context,
  feedbackText,
  isRequired = false,
  onToggleRequired,
  onOpenProperties,
  onDuplicate,
  onDuplicateAllPages,
  onDelete,
  additionalActions,
  selectionCount = 1,
  onBatchRequired,
  onBatchDelete,
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>("top");
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [duplicateMenuOpen, setDuplicateMenuOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const menuTriggerId = useId();

  // Narrow canvases collapse labels to icons (§3.2).
  useLayoutEffect(() => {
    if (!isVisible) return;
    const width = containerRef?.current?.getBoundingClientRect().width;
    setCompact(width !== undefined && width > 0 && width < COMPACT_WIDTH);
  }, [isVisible, targetRect, containerRef]);

  // Anchor math stays the shared positionFloating helper (not Chakra
  // positioning): it tracks a canvas element through scroll and zoom.
  useLayoutEffect(() => {
    if (!isVisible || !targetRect || !toolbarRef.current) return;

    const toolbarRect = toolbarRef.current.getBoundingClientRect();
    const containerRect = containerRef?.current?.getBoundingClientRect();

    const result = positionFloatingElement(
      targetRect,
      toolbarRect,
      containerRect,
      GAP
    );

    setCoords({ x: result.x, y: result.y });
    setPosition(result.placement);
  }, [isVisible, targetRect, containerRef, compact, selectionCount]);

  // The duplicate menu belongs to whichever field is selected: close it when
  // the toolbar hides or re-anchors so it never lingers over the wrong field.
  useEffect(() => {
    setDuplicateMenuOpen(false);
  }, [isVisible, targetRect]);

  if (!isVisible || !targetRect) return null;

  const isMulti = selectionCount > 1;
  const hasBothDuplicateActions = !!onDuplicate && !!onDuplicateAllPages;
  const showDuplicate = !!(onDuplicate || onDuplicateAllPages);
  const segmentText = feedbackText ?? context?.fieldName;

  const handleRequired = () => {
    if (isMulti && onBatchRequired) onBatchRequired(!isRequired);
    else onToggleRequired?.();
  };
  const handleDelete = isMulti && onBatchDelete ? onBatchDelete : onDelete;
  const showRequired = !!(onToggleRequired || (isMulti && onBatchRequired));
  const showDelete = !!(onDelete || (isMulti && onBatchDelete));

  const leading = isMulti ? (
    <Box px={1} display="flex" alignItems="center">
      <Badge size="sm" variant="solid" colorPalette="gray" role="status">
        {selectionCount} selected
      </Badge>
    </Box>
  ) : context ? (
    <HStack
      gap={1.5}
      px={2}
      minW={0}
      maxW={compact ? "28" : "48"}
      color="fg.muted"
      role="status"
      aria-live="polite"
    >
      <Icon boxSize="4" flexShrink={0} aria-hidden="true">
        {fieldTypeIcons[context.fieldType]}
      </Icon>
      <Text truncate>{segmentText}</Text>
    </HStack>
  ) : feedbackText ? (
    <Text color="fg.muted" px={2} role="status" aria-live="polite">
      {feedbackText}
    </Text>
  ) : null;

  const duplicateControl = !showDuplicate ? null : hasBothDuplicateActions ? (
    <ButtonGroup attached size="xs" variant="ghost">
      <Action
        label="Duplicate"
        icon={<CopyIcon />}
        compact={compact}
        disabled={isMulti}
        onClick={onDuplicate}
      />
      <Menu.Root
        ids={{ trigger: menuTriggerId }}
        open={duplicateMenuOpen}
        onOpenChange={(e) => setDuplicateMenuOpen(e.open)}
        positioning={{ strategy: "fixed", placement: "bottom-end" }}
      >
        <Tooltip content="Duplicate options" ids={{ trigger: menuTriggerId }}>
          <Menu.Trigger asChild>
            <IconButton
              type="button"
              size="xs"
              variant="ghost"
              aria-label="Duplicate options"
              disabled={isMulti}
            >
              <CaretDownIcon weight="bold" />
            </IconButton>
          </Menu.Trigger>
        </Tooltip>
        <Menu.Positioner>
          <Menu.Content minW="40" rounded="xl">
            <Menu.Item value="this-page" rounded="lg" onSelect={() => onDuplicate?.()}>
              On this page
            </Menu.Item>
            <Menu.Item
              value="every-page"
              rounded="lg"
              onSelect={() => onDuplicateAllPages?.()}
            >
              On every page
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Menu.Root>
    </ButtonGroup>
  ) : (
    <Action
      label="Duplicate"
      icon={<CopyIcon />}
      compact={compact}
      disabled={isMulti}
      onClick={() => (onDuplicate ?? onDuplicateAllPages)?.()}
    />
  );

  return (
    <HStack
      ref={toolbarRef}
      role="toolbar"
      aria-label="Field actions"
      data-placement={position}
      data-compact={compact ? "" : undefined}
      position="fixed"
      left={`${coords.x}px`}
      top={`${coords.y}px`}
      zIndex="popover"
      gap={1}
      bg="bg.panel"
      shadow="md"
      rounded="xl"
      p="1.5"
      whiteSpace="nowrap"
      separator={<StackSeparator h="5" alignSelf="center" />}
    >
      {leading}

      {(showRequired || onOpenProperties || showDuplicate || additionalActions) && (
        <HStack gap={1}>
          {showRequired && (
            <Action
              label="Required"
              icon={<AsteriskIcon weight="bold" />}
              compact={compact}
              pressed={isRequired}
              onClick={handleRequired}
            />
          )}
          {onOpenProperties && (
            <Action
              label="Edit"
              icon={<PencilSimpleIcon />}
              compact={compact}
              disabled={isMulti}
              onClick={onOpenProperties}
            />
          )}
          {duplicateControl}
          {additionalActions}
        </HStack>
      )}

      {showDelete && (
        <Action
          label="Delete"
          icon={<TrashIcon />}
          compact={compact}
          danger
          onClick={handleDelete}
        />
      )}
    </HStack>
  );
};

export default ContextToolbar;
