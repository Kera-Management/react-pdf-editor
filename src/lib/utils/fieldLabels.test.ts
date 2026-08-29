import { describe, expect, it } from "vitest";
import { humanizeFieldName } from "./fieldLabels";

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
});
