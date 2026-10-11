import React, { useCallback, useId } from "react";
import {
  Badge,
  Box,
  Checkbox,
  Field,
  Flex,
  HStack,
  IconButton,
  Input,
  Separator,
  SimpleGrid,
  Stack,
  Switch,
  Text,
} from "@chakra-ui/react";
import { CheckIcon, TrashIcon } from "@phosphor-icons/react";
import { BuildModeField } from "../../PDFEditor";
import { PanelHeader } from "./PanelHeader";
import { NoOptionsAlert, OptionsEditor } from "./OptionsEditor";
import { Tooltip } from "../Toolbar/Tooltip";
import { FieldSizeInput } from "../shared/FieldSizeInput";
import {
  fieldTypeIcons,
  fieldTypeLabels,
  isFieldMissingOptions,
} from "../shared/fieldTypeMeta";

export interface PropertiesPanelParticipant {
  id: string;
  label: string;
  role?: string;
}

export interface PropertiesPanelProps {
  /**
   * Currently selected field. The panel renders nothing (returns `null`) when this is
   * `null` -- a host gates its own sidebar section on this same value rather than
   * duplicating the empty state.
   */
  selectedField: BuildModeField | null;
  /** Callback when field is updated */
  onUpdateField: (fieldId: string, updates: Partial<BuildModeField>) => void;
  /** Callback when field is deleted */
  onDeleteField: (fieldId: string) => void;
  /**
   * Callback to close the panel. No longer rendered as a button (the mobile
   * Drawer has its own close, spec §3.4 / copy #16); kept for compatibility.
   */
  onClose: () => void;
  /**
   * Participants assignable to fields -- typically the host's ASSIGNABLE list
   * (participants minus anyone currently excluded). Drives which rows appear as
   * freshly-checkable in "Assign to".
   */
  participants?: PropertiesPanelParticipant[];
  /**
   * The FULL, unfiltered participant list. Used only to resolve a display name for an
   * id already present in `selectedField.properties.assignees` that no longer appears
   * in `participants` (e.g. a party was excluded after fields were assigned to them),
   * so that row keeps showing their name instead of a raw id. Falls back to
   * `participants` when omitted, and to the raw id if the name isn't found in either
   * list.
   */
  allParticipants?: PropertiesPanelParticipant[];
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedField,
  onUpdateField,
  onDeleteField,
  participants = [],
  allParticipants,
}) => {
  const idPrefix = useId();

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (selectedField) {
        onUpdateField(selectedField.id, { name: e.target.value });
      }
    },
    [selectedField, onUpdateField]
  );

  const handleRequiredChange = useCallback(
    (checked: boolean) => {
      if (selectedField) {
        onUpdateField(selectedField.id, {
          properties: {
            ...selectedField.properties,
            required: checked,
          },
        });
      }
    },
    [selectedField, onUpdateField]
  );

  const handlePlaceholderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (selectedField) {
        onUpdateField(selectedField.id, {
          properties: {
            ...selectedField.properties,
            placeholder: e.target.value,
          },
        });
      }
    },
    [selectedField, onUpdateField]
  );

  const handleSizeChange = useCallback(
    (dimension: "width" | "height", size: number) => {
      if (selectedField) {
        onUpdateField(selectedField.id, { [dimension]: size });
      }
    },
    [selectedField, onUpdateField]
  );

  const handleAssignmentChange = useCallback(
    (participantId: string, checked: boolean) => {
      if (selectedField) {
        const currentAssignments = selectedField.properties.assignees || [];
        const newAssignments = checked
          ? [...currentAssignments, participantId]
          : currentAssignments.filter((id: string) => id !== participantId);
        onUpdateField(selectedField.id, {
          properties: {
            ...selectedField.properties,
            assignees: newAssignments,
          },
        });
      }
    },
    [selectedField, onUpdateField]
  );

  const handleAddOption = useCallback(
    (label: string) => {
      if (selectedField && label.trim()) {
        const currentOptions = selectedField.properties.options || [];
        const newOptionItem = {
          exportValue: label.trim().toLowerCase().replace(/\s+/g, "_"),
          displayValue: label.trim(),
        };
        onUpdateField(selectedField.id, {
          properties: {
            ...selectedField.properties,
            options: [...currentOptions, newOptionItem],
          },
        });
      }
    },
    [selectedField, onUpdateField]
  );

  const handleRemoveOption = useCallback(
    (index: number) => {
      if (selectedField) {
        const currentOptions = selectedField.properties.options || [];
        onUpdateField(selectedField.id, {
          properties: {
            ...selectedField.properties,
            options: currentOptions.filter((_, i) => i !== index),
          },
        });
      }
    },
    [selectedField, onUpdateField]
  );

  if (!selectedField) {
    return null;
  }

  const needsOptions =
    selectedField.type === "dropdown" || selectedField.type === "radio";

  const options = selectedField.properties.options || [];
  // A7: the one shared rule (imported radios with no editable options are
  // valid), so this agrees with the canvas chip.
  const hasNoOptions = isFieldMissingOptions(selectedField);

  const sizeLegendId = `${idPrefix}-size`;
  const requiredLabelId = `${idPrefix}-required-label`;
  const requiredHelpId = `${idPrefix}-required-help`;
  const assignHeadingId = `${idPrefix}-assign-to`;

  // Assign-to keeps rendering the ASSIGNABLE list (`participants`) for freshly-checkable
  // rows, but any id already in `assignees` that has fallen out of that list (e.g. the
  // party was excluded after being assigned) still gets a row so the assignment stays
  // visible -- its label is resolved from the FULL participant list, never the raw id.
  const assignedIds = selectedField.properties.assignees || [];
  const labelSource = allParticipants ?? participants;
  const staleAssignedRows = assignedIds
    .filter((id) => !participants.some((p) => p.id === id))
    .map((id) => ({
      id,
      label: labelSource.find((p) => p.id === id)?.label ?? id,
      role: undefined as string | undefined,
      excluded: true,
    }));
  const assignRows = [
    ...participants.map((p) => ({ ...p, excluded: false })),
    ...staleAssignedRows,
  ];

  const sizeInput = (dimension: "width" | "height", label: string) => (
    <Field.Root>
      <Field.Label>{label}</Field.Label>
      <FieldSizeInput
        w="full"
        value={selectedField[dimension]}
        onCommit={(size) => handleSizeChange(dimension, size)}
        inputProps={{ rounded: "lg" }}
      />
    </Field.Root>
  );

  return (
    <Stack gap={4} data-field-type={selectedField.type}>
      {/* Field type header: icon well + label, Delete action. */}
      <HStack justify="space-between" gap={2}>
        <HStack gap={2} minW={0}>
          <Flex
            align="center"
            justify="center"
            boxSize="7"
            bg="bg.muted"
            rounded="l2"
            color="fg.muted"
            flexShrink={0}
            aria-hidden
          >
            {fieldTypeIcons[selectedField.type]}
          </Flex>
          <Text fontWeight="medium" truncate>
            {fieldTypeLabels[selectedField.type]}
          </Text>
        </HStack>
        <Tooltip positioning={{ placement: "top" }} content="Delete field">
          <IconButton
            type="button"
            size="xs"
            variant="ghost"
            color="fg.error"
            aria-label="Delete field"
            onClick={() => onDeleteField(selectedField.id)}
          >
            <TrashIcon />
          </IconButton>
        </Tooltip>
      </HStack>

      {/* A7: a dropdown/radio with no options can't be answered. */}
      {hasNoOptions && <NoOptionsAlert />}

      {/* Structure: what the field is made of */}
      <Stack gap={4}>
        <PanelHeader title="Structure" />

        <Field.Root>
          <Field.Label>Field name</Field.Label>
          <Input
            size="sm"
            rounded="lg"
            value={selectedField.name}
            onChange={handleNameChange}
            placeholder="Enter field name"
          />
        </Field.Root>

        {(selectedField.type === "text" ||
          selectedField.type === "multiline") && (
          <Field.Root>
            <HStack gap={1}>
              <Field.Label>Placeholder</Field.Label>
              <Badge variant="outline" size="xs">
                Optional
              </Badge>
            </HStack>
            <Input
              size="sm"
              rounded="lg"
              value={selectedField.properties.placeholder || ""}
              onChange={handlePlaceholderChange}
              placeholder="Enter placeholder text"
            />
          </Field.Root>
        )}

        {needsOptions && (
          <OptionsEditor
            options={options}
            onAddOption={handleAddOption}
            onRemoveOption={handleRemoveOption}
            showEmptyWarning={false}
          />
        )}

        <Stack role="group" aria-labelledby={sizeLegendId} gap={1.5}>
          <Text id={sizeLegendId} fontWeight="medium" textStyle="sm">
            Size
          </Text>
          <SimpleGrid columns={2} gap={3}>
            {sizeInput("width", "Width")}
            {sizeInput("height", "Height")}
          </SimpleGrid>
        </Stack>
      </Stack>

      <Separator />

      {/* Behaviour: how the field acts */}
      <Stack gap={4}>
        <PanelHeader title="Behaviour" />
        <Flex align="start" justify="space-between" gap={6}>
          <Box>
            <Text id={requiredLabelId} fontWeight="medium">
              Required
            </Text>
            <Text id={requiredHelpId} color="fg.muted">
              Signer must fill this field
            </Text>
          </Box>
          <Switch.Root
            size="sm"
            checked={selectedField.properties.required || false}
            onCheckedChange={(details: { checked: boolean }) =>
              handleRequiredChange(details.checked)
            }
          >
            <Switch.HiddenInput
              aria-labelledby={requiredLabelId}
              aria-describedby={requiredHelpId}
            />
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Root>
        </Flex>
      </Stack>

      {/* Assign to */}
      {assignRows.length > 0 && (
        <>
          <Separator />
          <Stack role="group" aria-labelledby={assignHeadingId} gap={3}>
            <PanelHeader title="Assign to" titleId={assignHeadingId} />
            <Stack gap={2}>
              {assignRows.map((participant) => {
                const isAssigned = assignedIds.includes(participant.id);
                return (
                  <Checkbox.Root
                    key={participant.id}
                    size="sm"
                    checked={isAssigned}
                    onCheckedChange={(details: {
                      checked: boolean | "indeterminate";
                    }) =>
                      handleAssignmentChange(
                        participant.id,
                        details.checked === true
                      )
                    }
                  >
                    <Checkbox.HiddenInput />
                    <Checkbox.Control>
                      <Checkbox.Indicator>
                        <CheckIcon weight="bold" />
                      </Checkbox.Indicator>
                    </Checkbox.Control>
                    <Checkbox.Label>
                      <HStack gap={2} as="span">
                        <Text as="span">{participant.label}</Text>
                        {participant.excluded ? (
                          <Badge size="xs" variant="outline">
                            Excluded
                          </Badge>
                        ) : (
                          participant.role && (
                            <Text as="span" color="fg.muted">
                              {participant.role}
                            </Text>
                          )
                        )}
                      </HStack>
                    </Checkbox.Label>
                  </Checkbox.Root>
                );
              })}
            </Stack>
          </Stack>
        </>
      )}
    </Stack>
  );
};

export default PropertiesPanel;
