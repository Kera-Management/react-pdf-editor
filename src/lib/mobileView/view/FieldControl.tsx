import React from "react";
import {
  Box,
  Button,
  chakra,
  Flex,
  Icon,
  Input,
  NativeSelect,
  Span,
  Stack,
  Text,
  Textarea,
  VisuallyHidden,
} from "@chakra-ui/react";
import { PencilSimpleIcon, SignatureIcon } from "@phosphor-icons/react";
import type { TextRun } from "../types";
import { useFieldControl, useMobileViewContext } from "./context";
import {
  inputModeFor,
  isRequiredHere,
  isSignedValue,
  type FieldControlModel,
} from "./fieldControlModel";
import { Runs } from "./Runs";
import { STAMPED_SIGNATURE_VALUE } from "../../utils/signatureValue";

/** Spec S7: at least 16px (no iOS focus zoom) and 44px tall. */
const CONTROL_FONT_SIZE = "16px";
const CONTROL_MIN_HEIGHT = "11";

/** The attributes every reflow control carries, so guided navigation,
 * focus mapping and the progress CSS find it the same way they find an
 * original overlay. */
const dataAttributes = (control: FieldControlModel) => ({
  "data-mf-field": "",
  "data-field-id": control.id,
  "data-field-name": control.name,
  "data-required": isRequiredHere(control) ? "true" : undefined,
  "data-complete": control.complete ? "true" : "false",
});

/** Visible asterisk plus "Required" for screen readers. */
export const RequiredMark: React.FC = () => (
  <>
    <Span color="fg.muted" aria-hidden="true" ms="1">
      *
    </Span>
    <VisuallyHidden>Required</VisuallyHidden>
  </>
);

/** Printed guides that sat under the widget ("dd/mm/yyyy"). Source text. */
const Hint: React.FC<{ runs?: TextRun[]; id?: string }> = ({ runs, id }) =>
  runs && runs.length > 0 ? (
    <Text id={id} fontSize="14px" lineHeight="20px" color="fg.muted">
      <Runs runs={runs} />
    </Text>
  ) : null;

/**
 * A value the signer can't change: another signer's field (with "Assigned
 * to {name}") or any field in View mode ("Blank" when empty).
 */
const ReadOnlyValue: React.FC<{
  control: FieldControlModel;
  labelText: string;
  emptyText: string;
  note?: string | null;
}> = ({ control, labelText, emptyText, note }) => {
  let display: React.ReactNode = control.value;
  if (control.kind === "signature") {
    display =
      control.value === STAMPED_SIGNATURE_VALUE ? (
        "Signed"
      ) : isSignedValue(control.value) ? (
      <SignatureSwatch
        src={control.value}
        alt={labelText ? `Signature: ${labelText}` : "Signature"}
      />
    ) : null;
  } else if (control.kind === "checkbox" || control.kind === "radio") {
    display = null;
  } else if (control.kind === "select") {
    display =
      control.options?.find((o) => o.exportValue === control.value)
        ?.displayValue ?? control.value;
  }
  const empty = display === null || display === "";
  return (
    <Stack gap="1">
      <Box
        {...dataAttributes(control)}
        role="textbox"
        aria-readonly="true"
        aria-label={labelText}
        tabIndex={0}
        minH={CONTROL_MIN_HEIGHT}
        px="3"
        py="2.5"
        rounded="md"
        bg="bg.muted"
        color={empty ? "fg.muted" : "fg"}
        fontSize={CONTROL_FONT_SIZE}
        lineHeight="24px"
        whiteSpace="pre-wrap"
        wordBreak="break-word"
      >
        {empty ? emptyText : display}
      </Box>
      {note && (
        <Text fontSize="14px" lineHeight="20px" color="fg.muted">
          {note}
        </Text>
      )}
    </Stack>
  );
};

/** Signature ink always sits on the page white, so dark ink stays
 * visible in dark mode (spec §8.7). */
const SignatureSwatch: React.FC<{ src: string; alt: string }> = ({
  src,
  alt,
}) => (
  <Box
    bg="var(--pdfe-page-bg)"
    rounded="md"
    borderWidth="1px"
    borderColor="border"
    p="2"
    display="inline-flex"
  >
    <chakra.img src={src} alt={alt} maxH="16" maxW="full" />
  </Box>
);

const isInitialsField = (control: FieldControlModel, labelText: string) =>
  /initial/i.test(labelText) || /initial/i.test(control.name);

interface ControlProps {
  control: FieldControlModel;
  /** Accessible name (the visible label, or the sentence around an inline
   * field). */
  labelText: string;
  /** id of the visible label element, when there is one. */
  labelId?: string;
  hintId?: string;
}

/** The editable control itself, without label or hint. */
const EditableControl: React.FC<ControlProps> = ({
  control,
  labelText,
  labelId,
  hintId,
}) => {
  const { onOpenSignature, onFieldFocus, onAdvance } = useMobileViewContext();
  const a11y = {
    ...(labelId
      ? { "aria-labelledby": labelId }
      : { "aria-label": labelText || "Field" }),
    ...(hintId ? { "aria-describedby": hintId } : {}),
    "aria-required": isRequiredHere(control) || undefined,
  };
  const onFocus = () => onFieldFocus(control.id);

  if (control.kind === "signature" && control.value === STAMPED_SIGNATURE_VALUE) {
    // Signed by an earlier save: the signature is part of the page now and
    // can't be replaced (a second stamp would land on top of it).
    return (
      <Text {...dataAttributes(control)} {...a11y} aria-labelledby={undefined}>
        Signed
      </Text>
    );
  }

  if (control.kind === "signature") {
    const signed = isSignedValue(control.value);
    const prompt = isInitialsField(control, labelText)
      ? "Tap to initial"
      : "Tap to sign";
    // One button in both states (same element, same place in the tree), so
    // the adoption modal hands focus back to it after signing instead of
    // to a trigger that no longer exists.
    return (
      <Flex align="center" gap="3" wrap="wrap">
        {signed && <SignatureSwatch src={control.value} alt="Your signature" />}
        <Button
          type="button"
          variant="outline"
          size="lg"
          w={signed ? undefined : "full"}
          minH={CONTROL_MIN_HEIGHT}
          justifyContent={signed ? undefined : "flex-start"}
          fontSize={signed ? undefined : CONTROL_FONT_SIZE}
          {...dataAttributes(control)}
          {...a11y}
          aria-labelledby={undefined}
          // The action and the field: "Signature of tenant, Tap to sign".
          aria-label={
            signed
              ? `Change ${labelText || "signature"}`
              : labelText
                ? `${labelText}, ${prompt}`
                : prompt
          }
          onFocus={onFocus}
          onClick={() => onOpenSignature(control.id)}
        >
          {!signed && (
            <Icon boxSize="5">
              {isInitialsField(control, labelText) ? (
                <PencilSimpleIcon />
              ) : (
                <SignatureIcon />
              )}
            </Icon>
          )}
          {signed ? "Change" : prompt}
        </Button>
      </Flex>
    );
  }

  if (control.kind === "select") {
    const options = control.options ?? [];
    const known = options.some((o) => o.exportValue === control.value);
    return (
      <NativeSelect.Root size="lg">
        <NativeSelect.Field
          {...dataAttributes(control)}
          {...a11y}
          form=""
          value={control.value}
          minH={CONTROL_MIN_HEIGHT}
          fontSize={CONTROL_FONT_SIZE}
          bg="bg.panel"
          onFocus={onFocus}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            control.setValue(e.target.value)
          }
        >
          {!known && <option value={control.value}>Select</option>}
          {options.map((option) => (
            <option key={option.exportValue} value={option.exportValue}>
              {option.displayValue}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    );
  }

  if (control.kind === "multiline") {
    return (
      <Textarea
        {...dataAttributes(control)}
        {...a11y}
        form=""
        autoresize
        size="lg"
        minH="24"
        fontSize={CONTROL_FONT_SIZE}
        bg="bg.panel"
        maxLength={control.maxLength}
        value={control.value}
        onFocus={onFocus}
        onChange={(e) =>
          control.setValue(e.target.value)
        }
      />
    );
  }

  if (control.kind === "checkbox" || control.kind === "radio") {
    // Rendered by ChoiceRow / the radio group, which own the row label.
    return null;
  }

  return (
    <Input
      {...dataAttributes(control)}
      {...a11y}
      form=""
      type="text"
      size="lg"
      h={CONTROL_MIN_HEIGHT}
      fontSize={CONTROL_FONT_SIZE}
      bg="bg.panel"
      maxLength={control.maxLength}
      inputMode={inputModeFor(labelText)}
      enterKeyHint="next"
      autoComplete="off"
      value={control.value}
      onFocus={onFocus}
      onChange={(e) => control.setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          // Never submit the host's <form>; move on instead.
          e.preventDefault();
          onAdvance(control.id);
        }
      }}
    />
  );
};

export interface FieldControlProps {
  fieldId: string;
  /** Visible label content (source runs or synthetic text). Null for an
   * inline field, whose sentence is its label. */
  label: React.ReactNode | null;
  /** Plain text of the label, or the sentence around an inline field. */
  labelText: string;
  hint?: TextRun[];
}

/**
 * One full-width field (spec §8.3): label above, control, helper text
 * below. Handles every state the original overlay has: editable, gated
 * ("Assigned to {name}"), hidden (control omitted, label text kept) and
 * View mode.
 */
export const FieldControl: React.FC<FieldControlProps> = ({
  fieldId,
  label,
  labelText,
  hint,
}) => {
  const { mode } = useMobileViewContext();
  const control = useFieldControl(fieldId);
  const labelId = `mf-label-${fieldId}`;
  const hintId = hint && hint.length > 0 ? `mf-hint-${fieldId}` : undefined;

  if (control?.kind === "checkbox" || control?.kind === "radio") {
    // A checkbox placed as a plain field (no right-hand label found).
    return (
      <ChoiceRow
        fieldId={fieldId}
        label={label ?? (labelText || "Field")}
        labelText={labelText}
        hint={hint}
      />
    );
  }

  const labelNode =
    label !== null ? (
      <Text
        id={labelId}
        fontSize="14px"
        lineHeight="20px"
        fontWeight="medium"
        color="fg.muted"
      >
        {label}
        {isRequiredHere(control) && !control?.hidden && <RequiredMark />}
      </Text>
    ) : null;

  // Unknown id (should not happen: the fidelity check proves every widget
  // is the editor's) or hidden by gating: keep the label and the printed
  // guides, which are document text, and omit the control (spec §8.3).
  if (!control || control.hidden) {
    if (!labelNode && !hintId) return null;
    return (
      <Stack gap="2" data-mf-field-slot={fieldId}>
        {labelNode}
        <Hint runs={hint} id={hintId} />
      </Stack>
    );
  }

  let body: React.ReactNode;
  if (control.gated) {
    body = (
      <ReadOnlyValue
        control={control}
        labelText={labelText}
        emptyText="Not filled yet"
        note={control.gatedLabel}
      />
    );
  } else if (mode === "view" || control.readOnly) {
    body = (
      <ReadOnlyValue
        control={control}
        labelText={labelText}
        emptyText="Blank"
        note={control.note}
      />
    );
  } else {
    body = (
      <EditableControl
        control={control}
        labelText={labelText}
        labelId={labelNode ? labelId : undefined}
        hintId={hintId}
      />
    );
  }

  return (
    <Stack gap="2" data-mf-field-slot={fieldId}>
      {labelNode}
      {body}
      <Hint runs={hint} id={hintId} />
    </Stack>
  );
};

export interface ChoiceRowProps {
  fieldId: string;
  /** Right-hand label: source text (may hold an inline text field, which
   * the caller renders below the row). */
  label: React.ReactNode;
  labelText: string;
  /** Accessible name when the option has no label text of its own (an
   * option labelled by a column header or the group's legend). */
  fallbackName?: string;
  /** Printed guides under the widget (source text). */
  hint?: TextRun[];
  /** Radio option: the group's DOM name (unique per mount). */
  radioName?: string;
}

/**
 * A checkbox or radio option: native control, label on the right, a 44px
 * row. Native inputs keep the host page's form semantics simple: no `name`
 * on checkboxes and a mount-unique, dissociated (`form=""`) name on radios,
 * so host `FormData` never changes (spec §8.3).
 */
export const ChoiceRow: React.FC<ChoiceRowProps> = ({
  fieldId,
  label,
  labelText,
  fallbackName,
  hint,
  radioName,
}) => {
  const { mode, onFieldFocus } = useMobileViewContext();
  const control = useFieldControl(fieldId);
  const hintNode = <Hint runs={hint} />;
  if (!control || control.hidden) {
    return (
      <Box data-mf-field-slot={fieldId}>
        {label}
        {hintNode}
      </Box>
    );
  }
  const readOnly = mode === "view" || control.readOnly;
  const isRadio = control.kind === "radio";
  const name =
    labelText ||
    fallbackName ||
    control.label ||
    "Field";
  // A choice group's name and help, once, above its first member. Its
  // required mark lives here too: the members are not required one by one.
  const group = control.choiceGroup?.first ? control.choiceGroup : undefined;
  return (
    <Stack gap="1" data-mf-field-slot={fieldId}>
      {group && (
        <Stack gap="0.5" data-mf-choice-group={group.id}>
          <Text
            fontSize="14px"
            lineHeight="20px"
            fontWeight="medium"
            color="fg.muted"
          >
            {group.label}
            {group.required && !control.gated && <RequiredMark />}
          </Text>
          {group.help && (
            <Text fontSize="14px" lineHeight="20px" color="fg.muted">
              {group.help}
            </Text>
          )}
        </Stack>
      )}
      <Flex
        as="label"
        align="center"
        gap="3"
        minH={CONTROL_MIN_HEIGHT}
        cursor={readOnly ? "default" : "pointer"}
        fontSize={CONTROL_FONT_SIZE}
        lineHeight="24px"
      >
        <chakra.input
          {...dataAttributes(control)}
          type={isRadio ? "radio" : "checkbox"}
          name={isRadio ? radioName : undefined}
          form=""
          boxSize="5"
          flexShrink={0}
          accentColor="fg"
          checked={control.checked}
          disabled={readOnly}
          // Named by the wrapping <label> when that holds text; otherwise
          // (no right-hand text, or only a required mark) by a fallback.
          aria-label={typeof label === "string" && label ? undefined : name}
          aria-required={isRequiredHere(control) || undefined}
          onFocus={() => onFieldFocus(control.id)}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            control.setChecked(isRadio ? true : e.target.checked)
          }
        />
        <Box flex="1" minW={0}>
          {label}
          {isRequiredHere(control) && !isRadio && <RequiredMark />}
        </Box>
      </Flex>
      {hint && hint.length > 0 && <Box ps="8">{hintNode}</Box>}
      {(control.gatedLabel || control.note) && (
        <Text fontSize="14px" lineHeight="20px" color="fg.muted" ps="8">
          {control.gatedLabel || control.note}
        </Text>
      )}
    </Stack>
  );
};

export default FieldControl;
