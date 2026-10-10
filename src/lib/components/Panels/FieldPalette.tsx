import React, { useCallback, useRef, useState } from "react";
import { Box, Center, HStack, Icon, Stack, Text } from "@chakra-ui/react";
import {
  CheckSquareIcon,
  DotsSixVerticalIcon,
  RadioButtonIcon,
  RowsPlusBottomIcon,
  SignatureIcon,
  TextAaIcon,
  TextAlignJustifyIcon,
} from "@phosphor-icons/react";
import { BuildModeField, BuildModeFieldType } from "../../PDFEditor";

export interface FieldPaletteProps {
  onFieldDragStart: (fieldType: BuildModeFieldType) => void;
  onFieldDragEnd: () => void;
  onTouchDrop?: (
    fieldType: BuildModeFieldType,
    clientX: number,
    clientY: number
  ) => boolean;
  /**
   * Adds a field of this type without drag-and-drop -- fired on click, and
   * on Enter/Space when a palette item has keyboard focus. The host
   * decides where it lands (typically the center of the current view).
   */
  onFieldAdd?: (fieldType: BuildModeFieldType) => void;
  selectedField: BuildModeField | null;
  onCloseEditor: () => void;
}

interface FieldTypeConfig {
  type: BuildModeFieldType;
  label: string;
  icon: React.ReactElement;
}

const fieldTypes: FieldTypeConfig[] = [
  { type: "text", label: "Text", icon: <TextAaIcon /> },
  { type: "multiline", label: "Text Area", icon: <TextAlignJustifyIcon /> },
  { type: "checkbox", label: "Checkbox", icon: <CheckSquareIcon /> },
  { type: "dropdown", label: "Dropdown", icon: <RowsPlusBottomIcon /> },
  { type: "radio", label: "Radio", icon: <RadioButtonIcon /> },
  { type: "signature", label: "Signature", icon: <SignatureIcon /> },
];

/**
 * Prepare-mode field palette (spec §3.3). Rows are bordered cards with an
 * always-visible grip, so they read as draggable. They stay `div role="button"` rather than `<button>`
 * so native HTML5 drag works in every browser, with Enter/Space wired by
 * hand. Drag (HTML5 + touch) and click-to-add logic is unchanged.
 */
export const FieldPalette: React.FC<FieldPaletteProps> = ({
  onFieldDragStart,
  onFieldDragEnd,
  onTouchDrop,
  onFieldAdd,
}) => {
  const [activeType, setActiveType] = useState<BuildModeFieldType | null>(null);
  const isDraggingTouch = useRef(false);
  const draggedFieldTypeRef = useRef<BuildModeFieldType | null>(null);

  // Desktop drag handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent, fieldType: BuildModeFieldType) => {
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("fieldType", fieldType);
      setActiveType(fieldType);
      onFieldDragStart(fieldType);
    },
    [onFieldDragStart]
  );

  const handleDragEnd = useCallback(() => {
    setActiveType(null);
    onFieldDragEnd();
  }, [onFieldDragEnd]);

  // Touch drag handlers
  const handleTouchStart = useCallback(
    (e: React.TouchEvent, fieldType: BuildModeFieldType) => {
      e.stopPropagation();
      isDraggingTouch.current = true;
      draggedFieldTypeRef.current = fieldType;
      setActiveType(fieldType);
      onFieldDragStart(fieldType);
    },
    [onFieldDragStart]
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingTouch.current) return;
    e.preventDefault();
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!isDraggingTouch.current || !draggedFieldTypeRef.current) return;

      isDraggingTouch.current = false;
      setActiveType(null);
      onFieldDragEnd();

      const touch = e.changedTouches[0];
      if (touch && onTouchDrop) {
        onTouchDrop(draggedFieldTypeRef.current, touch.clientX, touch.clientY);
      }
      draggedFieldTypeRef.current = null;
    },
    [onFieldDragEnd, onTouchDrop]
  );

  return (
    <Stack gap={3}>
      <Stack gap={2}>
        {fieldTypes.map((field) => {
          const isActive = activeType === field.type;
          return (
            <Box
              key={field.type}
              role="button"
              tabIndex={0}
              aria-label={`Add ${field.label} field`}
              draggable
              data-field-type={field.type}
              data-dragging={isActive ? "" : undefined}
              display="flex"
              alignItems="center"
              w="full"
              h="12"
              ps="2"
              pe="2"
              gap={3}
              rounded="l2"
              borderWidth="1px"
              borderColor={isActive ? "border.emphasized" : "border"}
              color="fg"
              bg={isActive ? "bg.muted" : "bg.panel"}
              shadow="xs"
              cursor={isActive ? "grabbing" : "grab"}
              userSelect="none"
              transition="background 0.15s, border-color 0.15s"
              focusRing="outside"
              _hover={{ bg: "bg.muted", borderColor: "border.emphasized" }}
              onDragStart={(e: React.DragEvent) =>
                handleDragStart(e, field.type)
              }
              onDragEnd={handleDragEnd}
              onTouchStart={(e: React.TouchEvent) =>
                handleTouchStart(e, field.type)
              }
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onClick={() => onFieldAdd?.(field.type)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onFieldAdd?.(field.type);
                }
              }}
            >
              <HStack gap={3} flex="1" minW={0} color="inherit">
                <Center
                  boxSize="8"
                  flexShrink={0}
                  rounded="md"
                  bg="bg.muted"
                  color="fg"
                >
                  <Icon boxSize="5">{field.icon}</Icon>
                </Center>
                <Text truncate>{field.label}</Text>
              </HStack>
              <Icon
                data-grip=""
                aria-hidden
                boxSize="4"
                color="fg.muted"
              >
                <DotsSixVerticalIcon weight="bold" />
              </Icon>
            </Box>
          );
        })}
      </Stack>

      <Text color="fg.muted" textAlign="center">
        Drag onto the page or click to add
      </Text>
    </Stack>
  );
};

export default FieldPalette;
