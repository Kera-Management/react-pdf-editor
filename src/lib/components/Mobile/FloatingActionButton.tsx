import React from "react";
import { Button, Icon, Stack } from "@chakra-ui/react";
import { PlusIcon } from "@phosphor-icons/react";
import type { BuildModeFieldType } from "../../PDFEditor";
import { ADD_FIELD_ACTIONS } from "./addFieldActions";

export interface FloatingActionButtonProps {
  /** Opens the "Add a field" drawer. */
  onClick: () => void;
  /** Whether the button is shown. */
  isVisible?: boolean;
}

/**
 * Mobile "Add field" button (spec §3.12, C6): the app's `MobileActionsFab`
 * inverted pill. Positioning is the caller's job (MobileChrome stacks it
 * under the page pill). Replaces the round FAB and its radial menu.
 */
export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  onClick,
  isVisible = true,
}) => {
  if (!isVisible) return null;
  return (
    <Button
      type="button"
      onClick={onClick}
      rounded="full"
      colorPalette="gray"
      bg="bg.inverted"
      color="fg.inverted"
      size="lg"
      h="11"
      px={8}
      shadow="lg"
    >
      <Icon asChild boxSize="4">
        <PlusIcon weight="bold" />
      </Icon>
      Add field
    </Button>
  );
};

export interface AddFieldListProps {
  /** Called with the chosen type. The caller closes the drawer. */
  onSelect: (fieldType: BuildModeFieldType) => void;
}

/** Body of the "Add a field" drawer: one row per field type (RowActions sheet). */
export const AddFieldList: React.FC<AddFieldListProps> = ({ onSelect }) => (
  <Stack gap={2}>
    {ADD_FIELD_ACTIONS.map((action) => (
      <Button
        key={action.id}
        type="button"
        variant="outline"
        size="lg"
        w="full"
        px={3}
        justifyContent="flex-start"
        fontWeight="normal"
        onClick={() => onSelect(action.id)}
      >
        <Icon asChild boxSize="5" color="fg.muted">
          {action.icon}
        </Icon>
        {action.label}
      </Button>
    ))}
  </Stack>
);

export default FloatingActionButton;
