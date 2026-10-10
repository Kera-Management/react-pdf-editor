import React from "react";
import {
  Box,
  Button,
  CloseButton,
  HStack,
  Icon,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import {
  AsteriskIcon,
  CopyIcon,
  PencilSimpleIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { BuildModeFieldType } from "../../PDFEditor";
import { fieldTypeIcons } from "../shared/fieldTypeMeta";

export interface FieldActionBarProps {
  fieldName: string;
  fieldType: BuildModeFieldType;
  isRequired: boolean;
  onToggleRequired: () => void;
  /** Opens the field settings bottom sheet. */
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Deselects the field. */
  onDismiss: () => void;
}

/** Height the canvas keeps clear below its last page while the bar shows. */
export const FIELD_ACTION_BAR_CLEARANCE = "200px";

interface BarActionProps {
  label: string;
  icon: React.ReactElement;
  onClick: () => void;
  pressed?: boolean;
  danger?: boolean;
}

const BarAction: React.FC<BarActionProps> = ({
  label,
  icon,
  onClick,
  pressed,
  danger,
}) => (
  <Button
    type="button"
    variant={pressed ? "subtle" : "outline"}
    colorPalette={danger ? "red" : "gray"}
    aria-pressed={pressed}
    onClick={onClick}
    h="auto"
    py={2}
    flexDirection="column"
    gap={1}
    fontWeight="medium"
  >
    <Icon boxSize="5">{icon}</Icon>
    {label}
  </Button>
);

/**
 * Mobile Prepare: docked action bar for the selected field. Tapping a field
 * only selects it (handles stay live for drag and resize); this bar replaces
 * the "Add field" pill with that field's actions, in thumb reach and never
 * over the field. Edit opens the settings bottom sheet.
 */
export const FieldActionBar: React.FC<FieldActionBarProps> = ({
  fieldName,
  fieldType,
  isRequired,
  onToggleRequired,
  onEdit,
  onDuplicate,
  onDelete,
  onDismiss,
}) => (
  <Box
    role="toolbar"
    aria-label={`Actions for ${fieldName}`}
    w="full"
    bg="bg.panel"
    borderTopWidth="1px"
    borderColor="border"
    roundedTop="l3"
    shadow="lg"
    px={4}
    pt={3}
    pb="calc(var(--chakra-spacing-3) + env(safe-area-inset-bottom))"
  >
    <HStack justify="space-between" gap={2} mb={3}>
      <HStack gap={2} minW={0}>
        <Icon boxSize="4" color="fg.muted" flexShrink={0}>
          {fieldTypeIcons[fieldType] as React.ReactElement}
        </Icon>
        <Text fontWeight="medium" truncate>
          {fieldName}
        </Text>
      </HStack>
      <CloseButton
        type="button"
        size="sm"
        variant="outline"
        aria-label="Deselect field"
        onClick={onDismiss}
      >
        <XIcon weight="bold" />
      </CloseButton>
    </HStack>
    <SimpleGrid columns={4} gap={2}>
      <BarAction
        label="Required"
        icon={<AsteriskIcon weight="bold" />}
        pressed={isRequired}
        onClick={onToggleRequired}
      />
      <BarAction
        label="Edit"
        icon={<PencilSimpleIcon />}
        onClick={onEdit}
      />
      <BarAction
        label="Duplicate"
        icon={<CopyIcon />}
        onClick={onDuplicate}
      />
      <BarAction
        label="Delete"
        icon={<TrashIcon />}
        onClick={onDelete}
        danger
      />
    </SimpleGrid>
  </Box>
);

export default FieldActionBar;
