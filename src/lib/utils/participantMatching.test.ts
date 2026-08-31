import { describe, expect, it } from "vitest";
import {
  assigneesIncludeParticipant,
  normalizeParticipantId,
  resolveEffectiveFieldAssignments,
} from "./participantMatching";

describe("normalizeParticipantId", () => {
  it("trims and lowercases", () => {
    expect(normalizeParticipantId("  Tenant1  ")).toBe("tenant1");
  });

  it("treats null/undefined as an empty string", () => {
    expect(normalizeParticipantId(undefined)).toBe("");
    expect(normalizeParticipantId(null)).toBe("");
  });
});

describe("assigneesIncludeParticipant", () => {
  it("matches despite whitespace/casing drift", () => {
    expect(assigneesIncludeParticipant([" Tenant1 "], "tenant1")).toBe(true);
  });

  it("returns false for an empty or missing assignee list", () => {
    expect(assigneesIncludeParticipant([], "tenant1")).toBe(false);
    expect(assigneesIncludeParticipant(undefined, "tenant1")).toBe(false);
  });

  it("returns false when the participant is not among the assignees", () => {
    expect(assigneesIncludeParticipant(["landlord1"], "tenant1")).toBe(false);
  });
});

describe("resolveEffectiveFieldAssignments", () => {
  it("prefers a non-empty host map over embedded metadata", () => {
    const host = { tenant_name: ["tenant1"] };
    const embedded = { tenant_name: ["someone-else"], landlord_name: ["landlord1"] };
    expect(resolveEffectiveFieldAssignments(host, embedded)).toBe(host);
  });

  it("falls back to embedded metadata when the host map is empty", () => {
    const embedded = { tenant_name: ["tenant1"] };
    expect(resolveEffectiveFieldAssignments({}, embedded)).toBe(embedded);
  });

  it("falls back to embedded metadata when the host map is undefined", () => {
    const embedded = { tenant_name: ["tenant1"] };
    expect(resolveEffectiveFieldAssignments(undefined, embedded)).toBe(embedded);
  });
});
