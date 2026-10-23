import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  HStack,
  Icon,
  Progress,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  CheckCircleIcon,
  CheckIcon,
  CircleIcon,
  PlayIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { PanelHeader } from "./PanelHeader";
import { UserAvatar } from "./UserAvatar";
import { resolveFieldLabel } from "../../utils/fieldLabels";
import { assigneesIncludeParticipant } from "../../utils/participantMatching";
import {
  choiceGroupForField,
  choiceGroupLabel,
  isFieldOrChoiceGroupComplete,
  type PDFEditorChoiceGroup,
} from "../../utils/choiceGroups";

export interface ProgressPanelProps {
  /** Active participant ID */
  activeParticipantId?: string;
  /** Available participants */
  participants?: { id: string; label: string; role?: string }[];
  /** Field assignments map */
  fieldAssignments?: Record<string, string[]>;
  /** Current form field values */
  formFields: Record<string, string>;
  /** Total number of fields */
  totalFields: number;
  /** Number of completed fields */
  completedFields: number;
  /**
   * The active participant's REQUIRED work, as field names (PDFEditor
   * passes `getRequiredAssignedFieldNames`: the set `totalFields` /
   * `completedFields` count; a choice group is one entry). When given,
   * "Remaining" lists only these, so it always agrees with the count and
   * the finished state, and the participant's other assigned fields that
   * are still empty are listed under "Optional" instead. Omitted: every
   * assigned field is listed under "Remaining" (the behavior before this
   * prop existed).
   */
  requiredFieldNames?: string[];
  /** Current mode */
  mode: "build" | "edit" | "view" | "defaults";
  /** Callback when a field is focused */
  onFieldFocus?: (fieldName: string) => void;
  /**
   * Called when the signer clicks Finish once every required field is
   * complete. Omit to leave the finished state purely informational (no
   * button rendered) -- additive, so existing hosts see no change.
   */
  onFinish?: () => void;
  /**
   * Field names that actually rendered in the editor (survived the
   * host's editable/hidden pre-render filter). A field can be assigned to
   * the active participant yet never render at all -- e.g. a server bug
   * left it read-only in the AcroForm -- in which case there is no way for
   * the signer to ever complete it.
   *
   * SEMANTICS: when provided, such a field is EXCLUDED from `remainingFields`
   * (and therefore from guided Start/Next navigation) rather than shown as
   * a checklist item the signer can never check off, and is instead
   * surfaced as its own warning line below the remaining list. This
   * unblocks a signer who has completed every field they can actually see,
   * while still making the anomaly visible rather than silently dropping
   * it. Omitted entirely: every assigned field is treated as renderable,
   * i.e. unchanged from this panel's behavior before this concept existed.
   */
  renderedFieldNames?: Set<string>;
  /**
   * Friendly-label overrides, keyed by field NAME (as in
   * `fieldAssignments`). When a field's name has an entry here, that string
   * is shown in place of `humanizeFieldName(name)` -- lets a host that
   * already has real labels (e.g. from its own form-builder metadata) show
   * those instead of a best-effort guess.
   */
  fieldLabels?: Record<string, string>;
  /**
   * The PDF's own display names (AcroForm /TU), keyed by field NAME. Shown
   * when `fieldLabels` has no entry, before falling back to
   * `humanizeFieldName(name)`. PDFEditor fills this from the document.
   */
  fieldDisplayNames?: Record<string, string>;
  /**
   * Choice groups (checkbox fields answering one question, e.g. yes/no).
   * A group is listed ONCE, under its `label` (else its members' names
   * joined with " / "), with its `help` below, and is remaining until
   * exactly one member is checked. Clicking it goes to the member it is
   * listed under. PDFEditor fills this from the document's metadata.
   */
  choiceGroups?: PDFEditorChoiceGroup[];
}

export const ProgressPanel: React.FC<ProgressPanelProps> = ({
  activeParticipantId,
  participants,
  fieldAssignments,
  formFields,
  totalFields,
  completedFields,
  requiredFieldNames,
  mode,
  onFieldFocus,
  onFinish,
  renderedFieldNames,
  fieldLabels,
  fieldDisplayNames,
  choiceGroups,
}) => {
  // Which remaining field guided navigation ("Start"/"Next") last sent the
  // signer to. Tracked by name, not list position -- the remaining list
  // shrinks as fields get completed, so a field's *index* is not stable
  // across a Next click, but its *name* unambiguously identifies "where we
  // were" even after the list reshuffles.
  const [activeFieldName, setActiveFieldName] = useState<string | null>(null);

  // A new signer (or a document with no signer at all) starts guided
  // navigation over from scratch.
  useEffect(() => {
    setActiveFieldName(null);
  }, [activeParticipantId]);

  // Get active participant
  const activeParticipant = participants?.find(
    (p) => p.id === activeParticipantId
  );

  // Calculate progress percentage
  const progressPercentage =
    totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0;

  // Get assigned fields for active participant. Matched via the same
  // normalized comparator every other assignment check in this library
  // uses (trimmed + case-folded) -- a raw `.includes()` here used to let a
  // whitespace/casing drift between the id baked into a field and the
  // `activeParticipantId` the host supplies silently exclude a signer's own
  // field from their list.
  const assignedFields = React.useMemo(() => {
    // "Empty mapping means unrestricted" -- the same rule
    // resolveEffectiveFieldAssignments and getRequiredAssignedFieldNames
    // apply (see their doc comments). A host that declares no per-field
    // assignment at all (plain fill & sign) is not saying "nothing is
    // yours", it is saying "assignment does not apply here", so every
    // field is the filler's. Returning [] here instead used to leave the
    // remaining-fields checklist and Start/Next navigation permanently
    // empty while the header's X/Y count -- which goes through the
    // completion math and DOES apply this rule -- showed real work
    // outstanding: the exact counter-vs-list divergence this panel's
    // matching logic was unified to prevent.
    const hasAssignmentMapping =
      !!fieldAssignments && Object.keys(fieldAssignments).length > 0;
    if (!hasAssignmentMapping) return Object.keys(formFields);
    if (!activeParticipantId) return [];
    return Object.entries(fieldAssignments)
      .filter(([, ids]) => assigneesIncludeParticipant(ids, activeParticipantId))
      .map(([fieldName]) => fieldName);
  }, [fieldAssignments, activeParticipantId, formFields]);

  // Split assigned fields into ones that actually rendered vs ones that
  // didn't (see `renderedFieldNames` doc comment). Unrendered fields are
  // dropped out of the remaining-fields/guided-navigation flow entirely --
  // a signer can never complete a field with no DOM node to fill in -- and
  // surfaced separately as a warning below instead.
  const { renderableAssignedFields, unrenderedAssignedFields } =
    React.useMemo(() => {
      if (!renderedFieldNames) {
        return {
          renderableAssignedFields: assignedFields,
          unrenderedAssignedFields: [] as string[],
        };
      }
      const renderable: string[] = [];
      const unrendered: string[] = [];
      assignedFields.forEach((name) => {
        (renderedFieldNames.has(name) ? renderable : unrendered).push(name);
      });
      return { renderableAssignedFields: renderable, unrenderedAssignedFields: unrendered };
    }, [assignedFields, renderedFieldNames]);

  // Get remaining (incomplete) fields, in document order (the order
  // fieldAssignments/formFields were built in) -- this is also the order
  // Start/Next walk through.
  // A choice group is one entry, under the first of its members in this
  // order.
  // Split into required ("Remaining", what the count measures) and the
  // rest ("Optional") when the host says which are required.
  const { remainingFields, optionalFields } = React.useMemo(() => {
    const listedGroups = new Set<string>();
    const incomplete = renderableAssignedFields.filter((name) => {
      const group = choiceGroupForField(choiceGroups, name);
      if (group) {
        if (listedGroups.has(group.id)) return false;
        listedGroups.add(group.id);
      }
      return !isFieldOrChoiceGroupComplete(name, formFields, choiceGroups);
    });
    if (!requiredFieldNames) {
      return { remainingFields: incomplete, optionalFields: [] as string[] };
    }
    const required = new Set(requiredFieldNames);
    // A choice group is required as a whole, whichever member names it.
    const isRequired = (name: string) => {
      const group = choiceGroupForField(choiceGroups, name);
      return group
        ? group.fields.some((member) => required.has(member))
        : required.has(name);
    };
    return {
      remainingFields: incomplete.filter(isRequired),
      optionalFields: incomplete.filter((name) => !isRequired(name)),
    };
  }, [renderableAssignedFields, formFields, choiceGroups, requiredFieldNames]);

  const labelFor = (fieldName: string) =>
    resolveFieldLabel(fieldName, {
      fieldLabels,
      displayName: fieldDisplayNames?.[fieldName],
    });

  // Check if all fields are complete
  const isComplete = completedFields === totalFields && totalFields > 0;

  const goToField = (fieldName: string) => {
    setActiveFieldName(fieldName);
    onFieldFocus?.(fieldName);
  };

  const handleStart = () => {
    if (remainingFields.length > 0) {
      goToField(remainingFields[0]);
    }
  };

  const handleNext = () => {
    if (remainingFields.length === 0) return;
    const currentIndex = activeFieldName
      ? remainingFields.indexOf(activeFieldName)
      : -1;
    if (currentIndex >= 0) {
      // Still in the list: walk forward, wrapping at the end.
      const next =
        currentIndex + 1 < remainingFields.length
          ? remainingFields[currentIndex + 1]
          : remainingFields[0];
      goToField(next);
      return;
    }
    // The active field just dropped out of `remainingFields` (completed).
    // "Next" must mean the next one AFTER it in document order, not index
    // 0 -- the remaining list is directly clickable, so a signer who jumped
    // ahead to field 4 and completed it would otherwise be thrown back to
    // field 0. Fall back to index 0 only when nothing remains after it
    // (wrap), or when no field was ever active.
    const orderedFields = renderableAssignedFields;
    const completedPosition = activeFieldName
      ? orderedFields.indexOf(activeFieldName)
      : -1;
    const nextAfterCompleted =
      completedPosition >= 0
        ? remainingFields.find(
            (name) => orderedFields.indexOf(name) > completedPosition
          )
        : undefined;
    goToField(nextAfterCompleted ?? remainingFields[0]);
  };

  const renderFieldItem = (fieldName: string) => {
    const isActive = fieldName === activeFieldName;
    const group = choiceGroupForField(choiceGroups, fieldName);
    const button = (
      <Button
        key={fieldName}
        type="button"
        size="sm"
        variant={isActive ? "subtle" : "ghost"}
        colorPalette="gray"
        justifyContent="flex-start"
        w="full"
        fontWeight="normal"
        aria-current={isActive ? "step" : undefined}
        onClick={() => goToField(fieldName)}
      >
        <Icon
          boxSize="4"
          color={isActive ? "fg" : "fg.subtle"}
          flexShrink={0}
        >
          <CircleIcon weight={isActive ? "fill" : "regular"} />
        </Icon>
        <Text as="span" truncate>
          {group
            ? choiceGroupLabel(group, labelFor)
            : labelFor(fieldName)}
        </Text>
      </Button>
    );
    if (!group?.help) return button;
    return (
      <Stack key={fieldName} gap={0}>
        {button}
        <Text
          fontSize="xs"
          color="fg.muted"
          ps={8}
          pe={2}
          pb={1}
          data-choice-group-help={group.id}
        >
          {group.help}
        </Text>
      </Stack>
    );
  };

  if (mode !== "edit") return null;

  const hasStarted = activeFieldName !== null;

  return (
    <Stack gap={4}>
      {/* Participant: UserAvatar-style squircle + "Name · Role". */}
      {activeParticipant && (
        <HStack gap={3} minW={0}>
          <UserAvatar
            size="sm"
            name={activeParticipant.label}
            flexShrink={0}
          />
          <Text truncate minW={0}>
            <Text as="span" fontWeight="medium">
              {activeParticipant.label}
            </Text>
            {activeParticipant.role && (
              <Text as="span" color="fg.muted">
                {" · "}
                {activeParticipant.role}
              </Text>
            )}
          </Text>
        </HStack>
      )}

      {/* Progress: header with "N of M" badge, then the bar. */}
      <Stack gap={2}>
        <PanelHeader
          title="Progress"
          count={`${completedFields} of ${totalFields}`}
        />
        <Progress.Root
          value={progressPercentage}
          size="xs"
          colorPalette="gray"
          aria-label="Progress"
        >
          <Progress.Track>
            <Progress.Range />
          </Progress.Track>
        </Progress.Root>
      </Stack>

      {/* Guided navigation: Start jumps to the first remaining required
          field; Next advances from wherever guided navigation last sent
          the signer. Not shown once everything is complete -- the Finish
          affordance below takes over. */}
      {!isComplete && remainingFields.length > 0 && (
        <Button
          type="button"
          size="sm"
          w="full"
          onClick={hasStarted ? handleNext : handleStart}
        >
          <Icon boxSize="4">
            <PlayIcon weight="fill" />
          </Icon>
          {hasStarted ? "Next field" : "Start"}
        </Button>
      )}

      {/* Remaining Fields -- the full list, not a truncated preview. The
          sidebar section scrolls; no inner scroller needed. */}
      {remainingFields.length > 0 && (
        <Stack gap={2}>
          <PanelHeader title="Remaining" count={remainingFields.length} />
          <Stack gap={0.5}>
            {remainingFields.map(renderFieldItem)}
          </Stack>
        </Stack>
      )}

      {/* Unrendered-but-assigned fields -- couldn't be shown at all (e.g. a
          server bug locked one read-only in the AcroForm), so they're never
          part of remainingFields/guided navigation above. Surfaced here
          purely as a heads-up: the signer isn't blocked by them, but
          something is wrong and the sender needs to know. */}
      {unrenderedAssignedFields.length > 0 && (
        <Alert.Root status="warning" size="sm">
          <Alert.Indicator>
            <WarningIcon weight="bold" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              {unrenderedAssignedFields.length}{" "}
              {unrenderedAssignedFields.length === 1 ? "field" : "fields"}{" "}
              couldn't be shown. Contact the sender.
            </Alert.Title>
          </Alert.Content>
        </Alert.Root>
      )}

      {/* Complete State -- the Finish affordance. Always shown once
          isComplete; the button itself only appears when the host gave us
          somewhere to send it (onFinish is additive/optional). */}
      {isComplete && (
        <Stack gap={2} align="center" textAlign="center" pt={2}>
          <Icon boxSize="8" color="fg.muted">
            <CheckCircleIcon />
          </Icon>
          <Text fontWeight="medium">
            {optionalFields.length > 0
              ? "You've completed all your required fields."
              : "You've completed all your fields."}
          </Text>
          <Text color="fg.muted">Review your entries before submitting.</Text>
          {onFinish && (
            <Box w="full" pt={2}>
              <Button type="button" size="sm" w="full" onClick={onFinish}>
                <Icon boxSize="4">
                  <CheckIcon weight="bold" />
                </Icon>
                Finish and save
              </Button>
            </Box>
          )}
        </Stack>
      )}

      {/* The participant's own fields nothing requires (e.g. a date beside
          a signature): listed after the finished state, apart from
          "Remaining" (what the count and Finish wait for), so they never
          read as missing. */}
      {optionalFields.length > 0 && (
        <Stack gap={2}>
          <PanelHeader title="Optional" count={optionalFields.length} />
          <Stack gap={0.5}>{optionalFields.map(renderFieldItem)}</Stack>
        </Stack>
      )}
    </Stack>
  );
};

export default ProgressPanel;
