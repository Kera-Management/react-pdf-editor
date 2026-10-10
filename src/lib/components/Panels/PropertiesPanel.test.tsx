import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { renderWithChakra as render } from "../../testUtils";
import { PropertiesPanel } from "./PropertiesPanel";
import type { BuildModeField } from "../../PDFEditor";

const buildField = (
  overrides: Partial<BuildModeField> = {}
): BuildModeField => ({
  id: "field-1",
  type: "text",
  name: "First Name",
  x: 10,
  y: 10,
  width: 120,
  height: 24,
  page: 1,
  origin: "new",
  properties: {},
  ...overrides,
});

const noop = () => {};

describe("PropertiesPanel", () => {
  it("renders nothing when no field is selected", () => {
    const { container } = render(
      <PropertiesPanel
        selectedField={null}
        onUpdateField={noop}
        onDeleteField={noop}
        onClose={noop}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("pairs every text control with its label via htmlFor/id", () => {
    const field = buildField({
      type: "text",
      properties: { placeholder: "e.g. Jane" },
    });

    render(
      <PropertiesPanel
        selectedField={field}
        onUpdateField={noop}
        onDeleteField={noop}
        onClose={noop}
      />
    );

    expect(screen.getByLabelText("Field name")).toHaveValue("First Name");
    expect(screen.getByLabelText(/^Placeholder/)).toHaveValue("e.g. Jane");
    expect(screen.getByLabelText("Width")).toHaveValue("120");
    expect(screen.getByLabelText("Height")).toHaveValue("24");
  });

  it("renders the OptionsEditor (Options field + add-option control) for dropdown fields", () => {
    const field = buildField({
      type: "dropdown",
      properties: { options: [{ exportValue: "red", displayValue: "Red" }] },
    });

    render(
      <PropertiesPanel
        selectedField={field}
        onUpdateField={noop}
        onDeleteField={noop}
        onClose={noop}
      />
    );

    expect(screen.getByRole("group", { name: "Options" })).toBeInTheDocument();
    expect(screen.getByText("Red")).toBeInTheDocument();
    expect(screen.getByLabelText("New option")).toBeInTheDocument();
  });

  it("puts an aria-label on the delete button", () => {
    const field = buildField();

    render(
      <PropertiesPanel
        selectedField={field}
        onUpdateField={noop}
        onDeleteField={noop}
        onClose={noop}
      />
    );

    expect(
      screen.getByRole("button", { name: "Delete field" })
    ).toBeInTheDocument();
  });

  it("calls onUpdateField when the field name changes", async () => {
    const user = userEvent.setup();
    const onUpdateField = vi.fn();
    const field = buildField();

    render(
      <PropertiesPanel
        selectedField={field}
        onUpdateField={onUpdateField}
        onDeleteField={noop}
        onClose={noop}
      />
    );

    await user.type(screen.getByLabelText("Field name"), "!");

    expect(onUpdateField).toHaveBeenCalledWith("field-1", {
      name: "First Name!",
    });
  });

  it("shows the assignable participant list under Assign to", () => {
    const field = buildField();

    render(
      <PropertiesPanel
        selectedField={field}
        onUpdateField={noop}
        onDeleteField={noop}
        onClose={noop}
        participants={[
          { id: "p1", label: "Olive Ono", role: "Landlord" },
          { id: "p2", label: "Sam Poe" },
        ]}
      />
    );

    expect(screen.getByText("Assign to")).toBeInTheDocument();
    expect(screen.getByLabelText(/Olive Ono/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Sam Poe/)).toBeInTheDocument();
  });

  it("does not render an Assign to section when there are no participants and no assignees", () => {
    const field = buildField();

    render(
      <PropertiesPanel
        selectedField={field}
        onUpdateField={noop}
        onDeleteField={noop}
        onClose={noop}
        participants={[]}
      />
    );

    expect(screen.queryByText("Assign to")).not.toBeInTheDocument();
  });

  it("shows a resolved name (never a raw id) for an assignee excluded from the ASSIGNABLE list", () => {
    const field = buildField({
      properties: { assignees: ["p1", "p404"] },
    });

    render(
      <PropertiesPanel
        selectedField={field}
        onUpdateField={noop}
        onDeleteField={noop}
        onClose={noop}
        // p404 is assigned but no longer assignable (e.g. excluded from the document) --
        // it should still show up, with its name from the FULL list, not "p404".
        participants={[{ id: "p1", label: "Olive Ono" }]}
        allParticipants={[
          { id: "p1", label: "Olive Ono" },
          { id: "p404", label: "Sam Poe" },
        ]}
      />
    );

    const staleRow = screen.getByLabelText(/Sam Poe/);
    expect(staleRow).toBeInTheDocument();
    expect(staleRow).toBeChecked();
    expect(screen.queryByText("p404")).not.toBeInTheDocument();
    expect(screen.getAllByText("Excluded")).toHaveLength(1);
  });

  it("falls back to participants for label resolution when allParticipants is omitted", () => {
    const field = buildField({ properties: { assignees: ["p1", "p2"] } });

    render(
      <PropertiesPanel
        selectedField={field}
        onUpdateField={noop}
        onDeleteField={noop}
        onClose={noop}
        participants={[{ id: "p1", label: "Olive Ono" }]}
      />
    );

    // p2 isn't in `participants` and there's no `allParticipants` to resolve it from,
    // so it falls back to the raw id -- but it still renders (never silently dropped).
    expect(screen.getByLabelText(/p2/)).toBeInTheDocument();
  });

  it("unchecking a stale assignee row removes it via onUpdateField", async () => {
    const user = userEvent.setup();
    const onUpdateField = vi.fn();
    const field = buildField({ properties: { assignees: ["p1", "p404"] } });

    render(
      <PropertiesPanel
        selectedField={field}
        onUpdateField={onUpdateField}
        onDeleteField={noop}
        onClose={noop}
        participants={[{ id: "p1", label: "Olive Ono" }]}
        allParticipants={[
          { id: "p1", label: "Olive Ono" },
          { id: "p404", label: "Sam Poe" },
        ]}
      />
    );

    await user.click(screen.getByLabelText(/Sam Poe/));

    expect(onUpdateField).toHaveBeenCalledWith("field-1", {
      properties: expect.objectContaining({ assignees: ["p1"] }),
    });
  });

  it("uses sentence-case labels and 'pt' size addons (copy #14, #17)", () => {
    render(
      <PropertiesPanel
        selectedField={buildField()}
        onUpdateField={noop}
        onDeleteField={noop}
        onClose={noop}
      />
    );
    expect(screen.queryByText("Field Name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("W")).not.toBeInTheDocument();
    expect(screen.getAllByText("pt")).toHaveLength(2);
    expect(screen.getByRole("group", { name: "Size" })).toBeInTheDocument();
  });

  it("updates width from the size input and ignores non-positive values", async () => {
    const user = userEvent.setup();
    const onUpdateField = vi.fn();
    const Harness = () => {
      const [field, setField] = React.useState(buildField());
      return (
        <PropertiesPanel
          selectedField={field}
          onUpdateField={(id, patch) => {
            onUpdateField(id, patch);
            setField((f) => ({ ...f, ...patch }));
          }}
          onDeleteField={noop}
          onClose={noop}
        />
      );
    };
    render(<Harness />);
    const width = screen.getByLabelText("Width");
    await user.tripleClick(width);
    await user.keyboard("150");
    expect(onUpdateField).toHaveBeenLastCalledWith("field-1", { width: 150 });
    expect(width).toHaveValue("150");

    onUpdateField.mockClear();
    await user.tripleClick(width);
    await user.keyboard("0");
    expect(onUpdateField).not.toHaveBeenCalledWith("field-1", { width: 0 });
  });

  it("renders Required as a switch with helper text (copy #15)", async () => {
    const user = userEvent.setup();
    const onUpdateField = vi.fn();
    render(
      <PropertiesPanel
        selectedField={buildField()}
        onUpdateField={onUpdateField}
        onDeleteField={noop}
        onClose={noop}
      />
    );
    expect(screen.queryByText("Required field")).not.toBeInTheDocument();
    const toggle = screen.getByRole("checkbox", { name: "Required" });
    expect(toggle).toHaveAccessibleDescription("Signer must fill this field");
    expect(toggle).not.toBeChecked();

    await user.click(toggle);
    expect(onUpdateField).toHaveBeenCalledWith("field-1", {
      properties: expect.objectContaining({ required: true }),
    });
  });

  it("has no Close button; the drawer owns closing (copy #16)", () => {
    render(
      <PropertiesPanel
        selectedField={buildField()}
        onUpdateField={noop}
        onDeleteField={noop}
        onClose={noop}
      />
    );
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("deletes the field from the header action", async () => {
    const user = userEvent.setup();
    const onDeleteField = vi.fn();
    render(
      <PropertiesPanel
        selectedField={buildField()}
        onUpdateField={noop}
        onDeleteField={onDeleteField}
        onClose={noop}
      />
    );
    await user.click(screen.getByRole("button", { name: "Delete field" }));
    expect(onDeleteField).toHaveBeenCalledWith("field-1");
  });

  it("puts type=button on every button (the host wraps the editor in a form)", () => {
    render(
      <PropertiesPanel
        selectedField={buildField({
          type: "dropdown",
          properties: { options: [{ exportValue: "a", displayValue: "A" }] },
        })}
        onUpdateField={noop}
        onDeleteField={noop}
        onClose={noop}
      />
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
    }
  });

  describe("A7: dropdown/radio with no options", () => {
    it.each(["dropdown", "radio"] as const)(
      "shows a 'No options' warning for an empty %s",
      (type) => {
        render(
          <PropertiesPanel
            selectedField={buildField({ type, properties: { options: [] } })}
            onUpdateField={noop}
            onDeleteField={noop}
            onClose={noop}
          />
        );
        const alerts = screen.getAllByRole("alert");
        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toHaveTextContent("No options");
        expect(alerts[0]).toHaveTextContent(
          "Add at least one option so signers can choose."
        );
      }
    );

    it("clears the warning once an option exists", () => {
      const field = buildField({ type: "dropdown", properties: { options: [] } });
      const { rerender } = render(
        <PropertiesPanel
          selectedField={field}
          onUpdateField={noop}
          onDeleteField={noop}
          onClose={noop}
        />
      );
      expect(screen.getByRole("alert")).toBeInTheDocument();

      rerender(
        <PropertiesPanel
          selectedField={{
            ...field,
            properties: { options: [{ exportValue: "a", displayValue: "A" }] },
          }}
          onUpdateField={noop}
          onDeleteField={noop}
          onClose={noop}
        />
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("does not warn for field types that have no options", () => {
      render(
        <PropertiesPanel
          selectedField={buildField({ type: "text" })}
          onUpdateField={noop}
          onDeleteField={noop}
          onClose={noop}
        />
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
