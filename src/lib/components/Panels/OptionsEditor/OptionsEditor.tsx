import React, { useCallback, useId, useState } from "react";
import {
  Alert,
  Button,
  HStack,
  Icon,
  IconButton,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react";
import { PlusIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { PanelHeader } from "../PanelHeader";
import { Tooltip } from "../../Toolbar/Tooltip";

/**
 * Mirrors the (currently unexported) `ComboboxItem` shape from `PDFEditor.tsx`.
 * Structurally identical so callers passing `BuildModeField.properties.options`
 * type-check without a runtime dependency between the two modules.
 */
export interface ComboboxItem {
  exportValue: string;
  displayValue: string;
}

export interface OptionsEditorProps {
  /** Current dropdown/radio options for the selected field. */
  options: ComboboxItem[];
  /** Called with the trimmed label when a new option is added (Enter key or Add button). */
  onAddOption: (label: string) => void;
  /** Called with the index of the option to remove. */
  onRemoveOption: (index: number) => void;
  /**
   * Show the "No options" warning when the list is empty (A7). Default true.
   * PropertiesPanel turns it off because it shows the same warning at the
   * top of its form.
   */
  showEmptyWarning?: boolean;
}

/** A7 warning copy, shared with PropertiesPanel. */
export const NO_OPTIONS_TITLE = "No options";
export const NO_OPTIONS_DESCRIPTION =
  "Add at least one option so signers can choose.";

/** A7: shown wherever a dropdown/radio field has zero options. */
export const NoOptionsAlert: React.FC = () => (
  <Alert.Root status="warning" size="sm" role="alert">
    <Alert.Indicator>
      <WarningIcon weight="bold" />
    </Alert.Indicator>
    <Alert.Content>
      <Alert.Title>{NO_OPTIONS_TITLE}</Alert.Title>
      <Alert.Description>{NO_OPTIONS_DESCRIPTION}</Alert.Description>
    </Alert.Content>
  </Alert.Root>
);

/**
 * The dropdown/radio "Options" editor (spec §3.8 body): the current option
 * list (each with a remove button) plus an add-option row. Used inline by
 * `PropertiesPanel` (mobile drawer) and inside `OptionsEditorDialog`.
 *
 * Owns only the in-progress "new option" text; the actual mutation (building
 * the `ComboboxItem`, splicing it into `properties.options`, calling
 * `onUpdateField`) is the caller's responsibility via `onAddOption` /
 * `onRemoveOption`.
 */
export const OptionsEditor: React.FC<OptionsEditorProps> = ({
  options,
  onAddOption,
  onRemoveOption,
  showEmptyWarning = true,
}) => {
  const [newOption, setNewOption] = useState("");
  const idPrefix = useId();
  const titleId = `${idPrefix}-options-title`;

  const handleAdd = useCallback(() => {
    if (newOption.trim()) {
      onAddOption(newOption.trim());
      setNewOption("");
    }
  }, [newOption, onAddOption]);

  return (
    <Stack role="group" aria-labelledby={titleId} gap={2}>
      <PanelHeader title="Options" titleId={titleId} count={options.length} />

      {options.length === 0 && showEmptyWarning && <NoOptionsAlert />}

      {options.length > 0 && (
        <Stack as="ul" gap={0} listStyleType="none" m={0} p={0}>
          {options.map((option, index) => {
            const removeLabel = `Remove option ${option.displayValue}`;
            return (
              <HStack
                as="li"
                key={index}
                justify="space-between"
                gap={2}
                py={2}
                borderBottomWidth="1px"
                borderColor="border"
              >
                <Text truncate minW={0}>
                  {option.displayValue}
                </Text>
                <Tooltip positioning={{ placement: "top" }} content={removeLabel}>
                  <IconButton
                    type="button"
                    size="xs"
                    variant="ghost"
                    aria-label={removeLabel}
                    onClick={() => onRemoveOption(index)}
                  >
                    <XIcon />
                  </IconButton>
                </Tooltip>
              </HStack>
            );
          })}
        </Stack>
      )}

      <HStack gap={2}>
        <Input
          size="sm"
          rounded="lg"
          flex="1"
          aria-label="New option"
          value={newOption}
          onChange={(e) => setNewOption(e.target.value)}
          placeholder="Add option"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleAdd}
          disabled={!newOption.trim()}
          aria-label="Add option"
        >
          <Icon boxSize="4">
            <PlusIcon />
          </Icon>
          Add
        </Button>
      </HStack>
    </Stack>
  );
};

export default OptionsEditor;
