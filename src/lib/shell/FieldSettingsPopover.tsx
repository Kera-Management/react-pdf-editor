import React, { useEffect, useRef } from "react";
import {
  Badge,
  Box,
  Button,
  CloseButton,
  Field,
  Fieldset,
  HStack,
  Icon,
  Input,
  Popover,
  Separator,
  Stack,
  Text,
  usePopover,
} from "@chakra-ui/react";
import { WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import {
  fieldTypeIcons,
  fieldTypeLabels,
} from "../components/shared/fieldTypeMeta";
import type { BuildModeField } from "../PDFEditor";
import { isFieldMissingOptions } from "../components/shared/fieldTypeMeta";
import { FieldSizeInput } from "../components/shared/FieldSizeInput";

export interface FieldSettingsPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The selected build-mode field (`selectedFieldData`). */
  field: BuildModeField;
  /**
   * Returns the selected field's current on-screen rect. Fed to Chakra's
   * `positioning.getAnchorRect`; there is no trigger element.
   */
  getAnchorRect: () => DOMRect | null;
  onUpdateField: (id: string, patch: Partial<BuildModeField>) => void;
  /** PDFEditor closes the popover and opens the options dialog. */
  onEditOptions: () => void;
  /**
   * The live measured field rect (PE's `contextToolbarTarget`). Only used as
   * a change signal: whenever it changes (scroll, zoom, drag, resize) the
   * popover re-runs positioning through `getAnchorRect`.
   */
  anchorRect?: DOMRect | null;
}

interface SizeInputProps {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}

const SizeInput: React.FC<SizeInputProps> = ({ label, value, onCommit }) => (
  <Field.Root flex="1" gap={1}>
    <FieldSizeInput value={value} onCommit={onCommit} />
    <Field.Label color="fg.muted" fontWeight="normal">
      {label}
    </Field.Label>
  </Field.Root>
);

/**
 * Desktop Prepare field settings (§3.5), anchored to the selected field via
 * `positioning.getAnchorRect`. Inline (no Portal) with a fixed strategy so
 * Esc and focus stay inside the host Dialog's layer.
 */
export const FieldSettingsPopover: React.FC<FieldSettingsPopoverProps> = ({
  open,
  onOpenChange,
  field,
  getAnchorRect,
  onUpdateField,
  onEditOptions,
  anchorRect,
}) => {
  // The positioning callback reads through a ref so a new getAnchorRect
  // identity (it changes with the field and zoom) never needs a new machine.
  const getAnchorRectRef = useRef(getAnchorRect);
  getAnchorRectRef.current = getAnchorRect;

  // Opening lands on the field name, not the header's Close button.
  const nameInputRef = useRef<HTMLInputElement>(null);

  const popover = usePopover({
    open,
    initialFocusEl: () => nameInputRef.current,
    onOpenChange: (details) => onOpenChange(details.open),
    positioning: {
      strategy: "fixed",
      placement: "right-start",
      gutter: 8,
      getAnchorRect: () => getAnchorRectRef.current(),
    },
  });

  // Zag only moves focus on an open transition. PE can mount this already
  // open (double-click on an unselected field), so cover that case too.
  const openOnMountRef = useRef(open);
  useEffect(() => {
    if (!openOnMountRef.current) return undefined;
    const frame = requestAnimationFrame(() => nameInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  // The anchor is virtual, so floating-ui can't observe it moving. Re-run
  // positioning whenever PE's live measurement changes.
  const { reposition } = popover;
  useEffect(() => {
    if (open) reposition();
  }, [open, anchorRect, field.x, field.y, field.width, field.height, reposition]);

  const isChoice = field.type === "dropdown" || field.type === "radio";
  const hasPlaceholder = field.type === "text" || field.type === "multiline";
  const optionCount = field.properties.options?.length ?? 0;

  return (
    <Popover.RootProvider value={popover} lazyMount unmountOnExit>
      <Popover.Positioner>
        <Popover.Content
          w="300px"
          rounded="l3"
          bg="bg.panel"
          borderWidth="0.5px"
          borderColor="border"
          boxShadow="md"
          p={4}
        >
          <Popover.Body p={0}>
            <Stack gap={4}>
              <HStack gap={2}>
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  boxSize="7"
                  flexShrink={0}
                  rounded="l2"
                  bg="bg.muted"
                  color="fg.muted"
                  aria-hidden="true"
                >
                  {fieldTypeIcons[field.type]}
                </Box>
                <Popover.Title flex="1" fontWeight="medium">
                  {fieldTypeLabels[field.type]}
                </Popover.Title>
                <Popover.CloseTrigger asChild>
                  <CloseButton type="button" size="xs" aria-label="Close">
                    <XIcon weight="bold" />
                  </CloseButton>
                </Popover.CloseTrigger>
              </HStack>

              <Separator />

              <Field.Root>
                <Field.Label>Field name</Field.Label>
                <Input
                  ref={nameInputRef}
                  size="sm"
                  value={field.name}
                  placeholder="Enter field name"
                  onChange={(e) =>
                    onUpdateField(field.id, { name: e.target.value })
                  }
                />
              </Field.Root>

              {hasPlaceholder && (
                <Field.Root>
                  <HStack justify="space-between" w="full">
                    <Field.Label>Placeholder</Field.Label>
                    <Badge variant="outline" size="xs">
                      Optional
                    </Badge>
                  </HStack>
                  <Input
                    size="sm"
                    value={field.properties.placeholder || ""}
                    placeholder="Enter placeholder text"
                    onChange={(e) =>
                      onUpdateField(field.id, {
                        properties: {
                          ...field.properties,
                          placeholder: e.target.value,
                        },
                      })
                    }
                  />
                </Field.Root>
              )}

              <Fieldset.Root gap={1.5}>
                <Fieldset.Legend fontWeight="medium" color="fg">
                  Size
                </Fieldset.Legend>
                <HStack gap={3} align="flex-start">
                  <SizeInput
                    label="Width"
                    value={field.width}
                    onCommit={(width) => onUpdateField(field.id, { width })}
                  />
                  <SizeInput
                    label="Height"
                    value={field.height}
                    onCommit={(height) => onUpdateField(field.id, { height })}
                  />
                </HStack>
              </Fieldset.Root>

              {isChoice && (
                <>
                  <Separator />
                  <Stack gap={2}>
                    <HStack justify="space-between">
                      <Text fontWeight="medium">Options</Text>
                      <Badge size="sm" variant="subtle" colorPalette="gray">
                        {optionCount}
                      </Badge>
                    </HStack>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      w="full"
                      onClick={onEditOptions}
                    >
                      Edit options
                    </Button>
                    {/* A7: the one shared rule (imported radios with no
                        editable options are valid). */}
                    {isFieldMissingOptions(field) && (
                      <HStack gap={1.5} color="fg.error" align="flex-start">
                        <Icon boxSize="4" mt="0.5" flexShrink={0}>
                          <WarningCircleIcon weight="bold" />
                        </Icon>
                        <Text data-testid="no-options-warning">
                          No options. Add at least one option so signers can
                          choose.
                        </Text>
                      </HStack>
                    )}
                  </Stack>
                </>
              )}
            </Stack>
          </Popover.Body>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.RootProvider>
  );
};

export default FieldSettingsPopover;
