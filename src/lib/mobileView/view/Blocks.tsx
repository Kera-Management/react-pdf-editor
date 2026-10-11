import React, { useId } from "react";
import { Box, Button, chakra, Stack, Text } from "@chakra-ui/react";
import type {
  ChoiceBlock,
  InlineNode,
  ListItem,
  MobileBlock,
  RadioGroupBlock,
  TextRun,
} from "../types";
import { humanizeFieldName } from "../../utils/fieldLabels";
import { useFieldControls, useMobileViewContext } from "./context";
import {
  fieldLabelText,
  runsToText,
  splitInline,
  textAroundField,
} from "./documentModel";
import { ChoiceRow, FieldControl, RequiredMark } from "./FieldControl";
import { isRequiredHere } from "./fieldControlModel";
import { Runs } from "./Runs";

/** Body copy: 16px/24px `fg` (spec §8.2). Small print and furniture: 14px
 * `fg.muted`, never smaller. */
const bodyText = { fontSize: "16px", lineHeight: "24px", color: "fg" };
const smallText = { fontSize: "14px", lineHeight: "20px", color: "fg.muted" };
const labelText = {
  fontSize: "14px",
  lineHeight: "20px",
  fontWeight: "medium",
  color: "fg.muted",
};

/**
 * Inline content with any fields broken out onto their own lines: each
 * text piece is a paragraph, each field a full-width control placed exactly
 * where it sat in the sentence (spec §8.3).
 */
const InlineFlow: React.FC<{
  content: InlineNode[];
  small?: boolean;
}> = ({ content, small }) => {
  const pieces = splitInline(content);
  return (
    <>
      {pieces.map((piece, index) =>
        piece.kind === "text" ? (
          <Text key={index} {...(small ? smallText : bodyText)}>
            <Runs runs={piece.runs} />
          </Text>
        ) : (
          <FieldControl
            key={piece.field.fieldId}
            fieldId={piece.field.fieldId}
            label={null}
            labelText={
              piece.field.ariaLabel?.text ||
              textAroundField(content, piece.field.fieldId)
            }
            hint={piece.field.hint}
          />
        )
      )}
    </>
  );
};

const isSmallRun = (runs: TextRun[]) =>
  runs.length > 0 && runs.every((run) => run.small);

const ListItems: React.FC<{ items: ListItem[]; ordered: boolean }> = ({
  items,
  ordered,
}) => (
  <chakra.ul
    as={ordered ? "ol" : "ul"}
    listStyleType="none"
    m="0"
    p="0"
    display="flex"
    flexDirection="column"
    gap="2"
  >
    {items.map((item) => (
      <chakra.li key={item.id} display="flex" gap="2" alignItems="flex-start">
        {item.marker && (
          // The printed marker is source text, shown as text (no CSS
          // counters), in a hanging column.
          <Box as="span" {...bodyText} flexShrink={0} minW="6">
            <Runs runs={[item.marker]} />
          </Box>
        )}
        <Stack gap="2" flex="1" minW={0}>
          <InlineFlow content={item.content} />
          {item.children.length > 0 && (
            <ListItems items={item.children} ordered={ordered} />
          )}
        </Stack>
      </chakra.li>
    ))}
  </chakra.ul>
);

/** Splits a choice label into the text before its first field (the row
 * label) and everything from that field on (rendered below the row). */
const splitLabel = (label: InlineNode[]) => {
  const fieldAt = label.findIndex((node) => node.kind === "field");
  const head = fieldAt < 0 ? label : label.slice(0, fieldAt);
  return {
    headRuns: head.filter((node): node is TextRun => node.kind === "text"),
    tail: fieldAt < 0 ? [] : label.slice(fieldAt),
  };
};

/** A checkbox with its right-hand label; any field inside the label
 * ("Other: [____]") follows the row on its own line. */
const Choice: React.FC<{ block: ChoiceBlock }> = ({ block }) => {
  const { headRuns, tail } = splitLabel(block.label);
  return (
    <Stack gap="2">
      <ChoiceRow
        fieldId={block.fieldId}
        label={headRuns.length > 0 ? <Runs runs={headRuns} /> : null}
        labelText={runsToText(headRuns)}
      />
      {tail.length > 0 && (
        <Stack gap="2" ps="8">
          <InlineFlow content={tail} />
        </Stack>
      )}
    </Stack>
  );
};

const RadioGroup: React.FC<{ block: RadioGroupBlock }> = ({ block }) => {
  const controls = useFieldControls(block.options.map((o) => o.fieldId));
  // Mount-unique and dissociated from the host form (`form=""` on each
  // input): reflow radios never join the original overlay's group of the
  // same AcroForm name, and never reach the host's FormData.
  const radioName = `${useId()}-${block.groupName}`;
  const required = controls.some(isRequiredHere);
  const legend = block.label
    ? block.label.kind === "source"
      ? runsToText(block.label.runs)
      : block.label.text.text
    : humanizeFieldName(block.groupName);
  return (
    <chakra.fieldset border="0" m="0" p="0" minW={0}>
      {block.label && (
        <chakra.legend {...labelText} mb="1" p="0">
          {block.label.kind === "source" ? (
            <Runs runs={block.label.runs} />
          ) : (
            block.label.text.text
          )}
          {required && <RequiredMark />}
        </chakra.legend>
      )}
      <Stack gap="1">
        {block.options.map((option, index) => {
          const { headRuns, tail } = splitLabel(option.label);
          const exportValue = controls[index]?.exportValue;
          return (
            <Stack key={option.fieldId} gap="2">
              <ChoiceRow
                fieldId={option.fieldId}
                label={headRuns.length > 0 ? <Runs runs={headRuns} /> : null}
                labelText={runsToText(headRuns)}
                // An option labelled only by a column header or the legend.
                fallbackName={
                  exportValue && exportValue !== "Off"
                    ? `${legend}: ${exportValue}`
                    : `${legend}, option ${index + 1}`
                }
                radioName={radioName}
              />
              {tail.length > 0 && (
                <Stack gap="2" ps="8">
                  <InlineFlow content={tail} />
                </Stack>
              )}
            </Stack>
          );
        })}
      </Stack>
    </chakra.fieldset>
  );
};

const headingProps = {
  1: { as: "h2", fontSize: "20px", lineHeight: "28px" },
  2: { as: "h3", fontSize: "16px", lineHeight: "24px" },
  3: { as: "h4", fontSize: "16px", lineHeight: "24px" },
} as const;

/** Block content, without the block's own wrapper attributes. */
const BlockBody: React.FC<{ block: MobileBlock }> = ({ block }) => {
  const { onShowOriginal } = useMobileViewContext();
  switch (block.type) {
    case "heading":
      return (
        <Text
          {...headingProps[block.level]}
          fontWeight="semibold"
          color="fg"
          mt="2"
        >
          <Runs runs={block.content} />
        </Text>
      );
    case "paragraph":
      return (
        <Stack gap="2">
          <InlineFlow
            content={block.content}
            small={
              block.role !== "body" ||
              isSmallRun(
                block.content.filter((n): n is TextRun => n.kind === "text")
              )
            }
          />
        </Stack>
      );
    case "list":
      return <ListItems items={block.items} ordered={block.ordered} />;
    case "field":
      return (
        <FieldControl
          fieldId={block.fieldId}
          label={
            !block.label ? (
              "Field"
            ) : block.label.kind === "source" ? (
              <Runs runs={block.label.runs} />
            ) : (
              block.label.text.text
            )
          }
          labelText={fieldLabelText(block.label) || "Field"}
          hint={block.hint}
        />
      );
    case "choice":
      return <Choice block={block} />;
    case "radioGroup":
      return <RadioGroup block={block} />;
    case "keyValue":
      // Stacked: label, then value. Columns are never side by side.
      return (
        <Stack gap="2">
          <Text {...labelText}>
            <Runs runs={block.label} />
          </Text>
          {block.value.map((child) => (
            <BlockBody key={child.id} block={child} />
          ))}
        </Stack>
      );
    case "group":
      return (
        <Stack gap="3">
          {block.heading && block.heading.length > 0 && (
            <Text {...labelText}>
              <Runs runs={block.heading} />
            </Text>
          )}
          {block.children.map((child) => (
            <BlockBody key={child.id} block={child} />
          ))}
        </Stack>
      );
    case "imagePlaceholder":
      return (
        <Stack
          gap="2"
          p="3"
          rounded="md"
          borderWidth="1px"
          borderColor="border"
          bg="bg.muted"
        >
          <Text {...smallText}>Shown in the original</Text>
          {onShowOriginal && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              alignSelf="flex-start"
              onClick={() => onShowOriginal(block.origin)}
            >
              View original
            </Button>
          )}
        </Stack>
      );
    case "pageBreak":
      // Rendered by the page section (MobileFriendlyView).
      return null;
    default:
      return null;
  }
};

/** A top-level block with the attributes place keeping reads: its id and
 * where it came from on the original page. Memoized: the converted
 * document never changes, so typing re-renders only the field controls
 * (which subscribe to their own field), never the text around them. */
export const Block = React.memo(function Block({
  block,
}: {
  block: MobileBlock;
}) {
  return (
    <Box
      data-mf-block={block.id}
      data-mf-origin-page={block.origin?.pageIndex}
      data-mf-origin-top={block.origin?.box.top}
    >
      <BlockBody block={block} />
    </Box>
  );
});

export default Block;
