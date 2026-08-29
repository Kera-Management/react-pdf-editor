import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ProgressPanel } from "./ProgressPanel";

const baseProps = {
  activeParticipantId: "signer-1",
  participants: [{ id: "signer-1", label: "Jane Tenant" }],
  fieldAssignments: {
    tenant_full_name: ["signer-1"],
    move_in_date: ["signer-1"],
    signature_field: ["signer-1"],
  },
  mode: "edit" as const,
};

describe("ProgressPanel guided signing", () => {
  it("renders human-readable labels, not raw field names", () => {
    render(
      <ProgressPanel
        {...baseProps}
        formFields={{}}
        totalFields={3}
        completedFields={0}
      />
    );

    expect(screen.getByText("Tenant Full Name")).toBeInTheDocument();
    expect(screen.getByText("Move In Date")).toBeInTheDocument();
    expect(screen.queryByText("tenant_full_name")).not.toBeInTheDocument();
  });

  it("renders every remaining field, not a truncated preview", () => {
    render(
      <ProgressPanel
        {...baseProps}
        formFields={{}}
        totalFields={3}
        completedFields={0}
      />
    );

    expect(screen.getByText("Signature Field")).toBeInTheDocument();
    expect(screen.queryByText(/\+\d+ more/i)).not.toBeInTheDocument();
  });

  it("Start focuses the first remaining field, Next advances to the next one", () => {
    const onFieldFocus = vi.fn();
    render(
      <ProgressPanel
        {...baseProps}
        formFields={{}}
        totalFields={3}
        completedFields={0}
        onFieldFocus={onFieldFocus}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onFieldFocus).toHaveBeenCalledWith("tenant_full_name");

    fireEvent.click(screen.getByRole("button", { name: /next field/i }));
    expect(onFieldFocus).toHaveBeenCalledWith("move_in_date");
  });

  it("Next continues from where the list shifted to after a field is completed", () => {
    const onFieldFocus = vi.fn();
    const { rerender } = render(
      <ProgressPanel
        {...baseProps}
        formFields={{}}
        totalFields={3}
        completedFields={0}
        onFieldFocus={onFieldFocus}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onFieldFocus).toHaveBeenCalledWith("tenant_full_name");

    // tenant_full_name gets filled in and drops out of the remaining list.
    rerender(
      <ProgressPanel
        {...baseProps}
        formFields={{ tenant_full_name: "Jane Tenant" }}
        totalFields={3}
        completedFields={1}
        onFieldFocus={onFieldFocus}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /next field/i }));
    expect(onFieldFocus).toHaveBeenLastCalledWith("move_in_date");
  });

  it("without onFinish, the complete state is purely informational (no button)", () => {
    render(
      <ProgressPanel
        {...baseProps}
        formFields={{
          tenant_full_name: "Jane Tenant",
          move_in_date: "2026-01-01",
          signature_field: "data:image/png;base64,abc",
        }}
        totalFields={3}
        completedFields={3}
      />
    );

    expect(
      screen.getByText("You've completed all your fields!")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /finish/i })
    ).not.toBeInTheDocument();
  });

  it("with onFinish, renders a prominent 'Finish and save' button that fires the callback", () => {
    const onFinish = vi.fn();
    render(
      <ProgressPanel
        {...baseProps}
        formFields={{
          tenant_full_name: "Jane Tenant",
          move_in_date: "2026-01-01",
          signature_field: "data:image/png;base64,abc",
        }}
        totalFields={3}
        completedFields={3}
        onFinish={onFinish}
      />
    );

    const button = screen.getByRole("button", { name: "Finish and save" });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("does not show Start/Next once every field is complete", () => {
    render(
      <ProgressPanel
        {...baseProps}
        formFields={{
          tenant_full_name: "Jane Tenant",
          move_in_date: "2026-01-01",
          signature_field: "data:image/png;base64,abc",
        }}
        totalFields={3}
        completedFields={3}
      />
    );
    expect(
      screen.queryByRole("button", { name: /^start$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /next field/i })
    ).not.toBeInTheDocument();
  });
});
