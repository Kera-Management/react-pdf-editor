import { describe, expect, it, vi } from "vitest";

// participantCompletion's headless PDF read path imports pdf.js, which needs
// browser globals at load time; nothing here reads a PDF.
vi.mock("pdfjs-dist", () => ({ getDocument: vi.fn() }));
import {
  choiceGroupLabel,
  choiceGroupsFromMetadata,
  isChoiceGroupComplete,
  isFieldOrChoiceGroupComplete,
  normalizeChoiceGroups,
  pruneChoiceGroups,
  type PDFEditorChoiceGroup,
} from "./choiceGroups";
import {
  calculateParticipantCompletion,
  createEditorMetadata,
  getRequiredAssignedFieldNames,
  parseEditorMetadataValue,
  serializeEditorMetadata,
  type PDFEditorMetadata,
} from "../participantCompletion";

const EMAIL: PDFEditorChoiceGroup = {
  id: "notices_by_email",
  fields: ["email_yes", "email_no"],
  required: true,
  label: "Notices by email",
  help: "Choose yes to get notices by email.",
};

describe("isChoiceGroupComplete", () => {
  it("is complete only when exactly one member is checked", () => {
    expect(isChoiceGroupComplete({}, EMAIL)).toBe(false);
    expect(isChoiceGroupComplete({ email_yes: "Off", email_no: "" }, EMAIL)).toBe(false);
    expect(isChoiceGroupComplete({ email_yes: "Yes", email_no: "Off" }, EMAIL)).toBe(true);
    expect(isChoiceGroupComplete({ email_yes: "Off", email_no: "On" }, EMAIL)).toBe(true);
    expect(isChoiceGroupComplete({ email_yes: "Yes", email_no: "Yes" }, EMAIL)).toBe(false);
  });

  it("isFieldOrChoiceGroupComplete answers a member with its group's state", () => {
    const values = { email_yes: "Off", email_no: "Yes", name: "" };
    expect(isFieldOrChoiceGroupComplete("email_yes", values, [EMAIL])).toBe(true);
    expect(isFieldOrChoiceGroupComplete("name", values, [EMAIL])).toBe(false);
    expect(isFieldOrChoiceGroupComplete("email_yes", values, undefined)).toBe(false);
  });
});

describe("normalizeChoiceGroups / choiceGroupsFromMetadata", () => {
  it("drops malformed groups, duplicate ids, and fields already claimed", () => {
    expect(
      normalizeChoiceGroups([
        EMAIL,
        { id: "", fields: ["a", "b"], required: true },
        { id: "notices_by_email", fields: ["c", "d"], required: true },
        { id: "one", fields: ["only"], required: true },
        { id: "steal", fields: ["email_no", "x"], required: false },
        { id: "dupes", fields: ["p", "p", "q", 3], required: "yes", label: " " },
        null,
      ])
    ).toEqual([
      EMAIL,
      { id: "dupes", fields: ["p", "q"], required: false },
    ]);
    expect(normalizeChoiceGroups(undefined)).toEqual([]);
  });

  it("reads parsed metadata or the raw title string", () => {
    const title = serializeEditorMetadata(
      createEditorMetadata({
        fieldAssignments: {},
        requiredFields: [],
        choiceGroups: [EMAIL],
      })
    );
    expect(choiceGroupsFromMetadata(title)).toEqual([EMAIL]);
    expect(choiceGroupsFromMetadata(parseEditorMetadataValue(title))).toEqual([EMAIL]);
    expect(choiceGroupsFromMetadata("Some ordinary title")).toEqual([]);
    expect(choiceGroupsFromMetadata("REACT_PDF_EDITOR_METADATA:{bad")).toEqual([]);
    expect(choiceGroupsFromMetadata(null)).toEqual([]);
  });
});

describe("choiceGroupLabel", () => {
  it("uses the label, else the members' names joined with ' / '", () => {
    expect(choiceGroupLabel(EMAIL)).toBe("Notices by email");
    const unlabelled: PDFEditorChoiceGroup = { ...EMAIL };
    delete unlabelled.label;
    expect(choiceGroupLabel(unlabelled, (name) => name.toUpperCase())).toBe(
      "EMAIL_YES / EMAIL_NO"
    );
  });
});

describe("pruneChoiceGroups", () => {
  const three: PDFEditorChoiceGroup = {
    id: "heat",
    fields: ["heat_l", "heat_t", "heat_n"],
    required: true,
  };

  it("drops a deleted member, follows renames, and drops groups under two members", () => {
    expect(
      pruneChoiceGroups(
        [three, EMAIL],
        ["heat_l", "heat_tenant", "email_yes"],
        new Map([["heat_t", "heat_tenant"]])
      )
    ).toEqual([{ ...three, fields: ["heat_l", "heat_tenant"] }]);
  });
});

describe("editor metadata: choiceGroups", () => {
  it("round-trips through serialize/parse and stays v3", () => {
    const metadata = createEditorMetadata({
      fieldAssignments: { email_yes: ["p1"], email_no: ["p1"] },
      requiredFields: ["name"],
      signatureFields: ["sig"],
      choiceGroups: [EMAIL],
    });
    const parsed = parseEditorMetadataValue(serializeEditorMetadata(metadata));
    expect(parsed).toEqual(metadata);
    expect(parsed.version).toBe(3);
    expect(parsed.choiceGroups).toEqual([EMAIL]);
  });

  it("writes no choiceGroups key when there are none (old documents unchanged)", () => {
    const metadata = createEditorMetadata({
      fieldAssignments: {},
      requiredFields: ["name"],
      choiceGroups: [],
    });
    expect("choiceGroups" in metadata).toBe(false);
    expect(serializeEditorMetadata(metadata)).toBe(
      'REACT_PDF_EDITOR_METADATA:{"version":3,"fieldAssignments":{},"requiredFields":["name"],"signatureFields":[]}'
    );
    expect(
      "choiceGroups" in
        parseEditorMetadataValue(
          'REACT_PDF_EDITOR_METADATA:{"version":3,"fieldAssignments":{},"requiredFields":[],"signatureFields":[]}'
        )
    ).toBe(false);
  });
});

describe("completion with choice groups", () => {
  const metadata = (over: Partial<PDFEditorMetadata> = {}): PDFEditorMetadata => ({
    version: 3,
    fieldAssignments: { name: ["p1"], email_yes: ["p1"], email_no: ["p1"] },
    requiredFields: ["name"],
    signatureFields: [],
    choiceGroups: [EMAIL],
    ...over,
  });

  it("counts a required group as ONE item, under its first member", () => {
    expect(getRequiredAssignedFieldNames({ metadata: metadata(), participantId: "p1" })).toEqual([
      "name",
      "email_yes",
    ]);
    const none = calculateParticipantCompletion({
      metadata: metadata(),
      formFields: { name: "Lee", email_yes: "Off", email_no: "Off" },
      participantId: "p1",
    });
    expect(none).toMatchObject({
      requiredAssignedCount: 2,
      completedRequiredCount: 1,
      remainingRequiredFields: ["email_yes"],
      remainingChoiceGroups: ["notices_by_email"],
      isComplete: false,
    });
    const both = calculateParticipantCompletion({
      metadata: metadata(),
      formFields: { name: "Lee", email_yes: "Yes", email_no: "Yes" },
      participantId: "p1",
    });
    expect(both.isComplete).toBe(false);
    const one = calculateParticipantCompletion({
      metadata: metadata(),
      formFields: { name: "Lee", email_yes: "Off", email_no: "Yes" },
      participantId: "p1",
    });
    expect(one).toMatchObject({
      requiredAssignedCount: 2,
      completedRequiredCount: 2,
      remainingChoiceGroups: [],
      isComplete: true,
    });
  });

  it("never requires members individually, even when listed in requiredFields", () => {
    const listed = metadata({
      requiredFields: ["name", "email_yes", "email_no"],
      choiceGroups: [{ ...EMAIL, required: false }],
    });
    expect(getRequiredAssignedFieldNames({ metadata: listed, participantId: "p1" })).toEqual([
      "name",
      "email_yes",
    ]);
    expect(
      calculateParticipantCompletion({
        metadata: listed,
        formFields: { name: "Lee", email_yes: "Yes", email_no: "Off" },
        participantId: "p1",
      }).isComplete
    ).toBe(true);
  });

  it("only counts a group for the participant its members are assigned to", () => {
    const theirs = metadata({
      fieldAssignments: { name: ["p1"], email_yes: ["p2"], email_no: ["p2"] },
    });
    expect(getRequiredAssignedFieldNames({ metadata: theirs, participantId: "p1" })).toEqual([
      "name",
    ]);
    expect(getRequiredAssignedFieldNames({ metadata: theirs, participantId: "p2" })).toEqual([
      "email_yes",
    ]);
  });

  it("an optional group is not required work", () => {
    const optional = metadata({ choiceGroups: [{ ...EMAIL, required: false }] });
    expect(getRequiredAssignedFieldNames({ metadata: optional, participantId: "p1" })).toEqual([
      "name",
    ]);
  });

  it("assigned-fields fallback (nothing declared required) collapses a group to one entry", () => {
    const fallback = metadata({
      requiredFields: [],
      choiceGroups: [{ ...EMAIL, required: false }],
    });
    expect(getRequiredAssignedFieldNames({ metadata: fallback, participantId: "p1" })).toEqual([
      "name",
      "email_yes",
    ]);
  });

  it("without choice groups the result is exactly as before", () => {
    const plain = metadata();
    delete plain.choiceGroups;
    const result = calculateParticipantCompletion({
      metadata: plain,
      formFields: { name: "", email_yes: "Off", email_no: "Off" },
      participantId: "p1",
    });
    expect(result).toEqual({
      requiredAssignedCount: 1,
      completedRequiredCount: 0,
      remainingRequiredCount: 1,
      remainingRequiredFields: ["name"],
      unrenderableAssignedFields: [],
      isComplete: false,
    });
  });
});
