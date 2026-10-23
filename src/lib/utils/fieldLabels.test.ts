import { describe, expect, it } from "vitest";
import { humanizeFieldName, resolveFieldLabel } from "./fieldLabels";

describe("humanizeFieldName", () => {
  it("humanizes snake_case", () => {
    expect(humanizeFieldName("tenant_full_name")).toBe("Tenant Full Name");
  });

  it("humanizes kebab-case", () => {
    expect(humanizeFieldName("tenant-full-name")).toBe("Tenant Full Name");
  });

  it("humanizes camelCase", () => {
    expect(humanizeFieldName("tenantFullName")).toBe("Tenant Full Name");
  });

  it("humanizes SCREAMING_SNAKE_CASE", () => {
    expect(humanizeFieldName("TENANT_FULL_NAME")).toBe("Tenant Full Name");
  });

  it("returns an empty string as-is", () => {
    expect(humanizeFieldName("")).toBe("");
  });

  it("collapses repeated separators", () => {
    expect(humanizeFieldName("tenant__name")).toBe("Tenant Name");
  });

  it("reduces an XFA-style hierarchical name to its humanized leaf", () => {
    expect(humanizeFieldName("form1[0].#subform[2].RFirstName[0]")).toBe(
      "R First Name"
    );
  });

  it("strips a trailing array index from an otherwise flat name", () => {
    expect(humanizeFieldName("tenant_name[0]")).toBe("Tenant Name");
  });

  it("handles a multi-level XFA path with a snake_case leaf", () => {
    expect(humanizeFieldName("form1[0].subform[0].tenant_full_name[0]")).toBe(
      "Tenant Full Name"
    );
  });
});

describe("resolveFieldLabel", () => {
  it("prefers the host's fieldLabels entry over everything", () => {
    expect(
      resolveFieldLabel("landlord_name", {
        fieldLabels: { landlord_name: "Your landlord" },
        displayName: "Landlord's legal name",
      })
    ).toBe("Your landlord");
  });

  it("uses the PDF's display name (/TU) when the host has no entry", () => {
    expect(
      resolveFieldLabel("landlord_name", {
        fieldLabels: { other: "Other" },
        displayName: "Landlord's legal name",
      })
    ).toBe("Landlord's legal name");
  });

  it("falls back to humanizeFieldName, or the site's own fallback", () => {
    expect(resolveFieldLabel("landlord_name")).toBe("Landlord Name");
    expect(
      resolveFieldLabel("landlord_name", { fallback: (name) => name })
    ).toBe("landlord_name");
  });

  it("skips blank overrides and display names", () => {
    expect(
      resolveFieldLabel("landlord_name", {
        fieldLabels: { landlord_name: "  " },
        displayName: " ",
      })
    ).toBe("Landlord Name");
    expect(
      resolveFieldLabel("landlord_name", { displayName: "  Trimmed  " })
    ).toBe("Trimmed");
  });
});
