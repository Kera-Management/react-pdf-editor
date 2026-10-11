import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithChakra } from "../../testUtils";
import { MobileFriendlyView } from "../MobileFriendlyView";
import type { MobileBlock, MobileDocument, MobileFieldKind } from "../types";
import type { FieldControlModel } from "./fieldControlModel";
import { Runs } from "./Runs";
import { makeSampleDocument, run } from "./__fixtures__/sampleDocument";

interface FakeField {
  name: string;
  kind: MobileFieldKind;
  exportValue?: string;
  required?: boolean;
  gatedLabel?: string;
  hidden?: boolean;
  options?: { exportValue: string; displayValue: string }[];
}

const FIELDS: Record<string, FakeField> = {
  f_name: { name: "tenant_name", kind: "text", required: true },
  f_phone: { name: "phone", kind: "text" },
  f_park: { name: "parking", kind: "checkbox", exportValue: "Yes" },
  f_heat_l: { name: "heat", kind: "radio", exportValue: "Landlord" },
  f_heat_t: { name: "heat", kind: "radio", exportValue: "Tenant" },
  f_prov: {
    name: "province",
    kind: "select",
    options: [
      { exportValue: "ON", displayValue: "Ontario" },
      { exportValue: "NS", displayValue: "Nova Scotia" },
    ],
  },
  f_name2: { name: "tenant_name", kind: "text", required: true },
  f_sig: { name: "tenant_sig", kind: "signature", required: true },
};

const SIGNATURE = "data:image/png;base64,AAAA";

/**
 * A stand-in for the editor: a tiny value store keyed by id, exposing the
 * same FieldControlModel contract PDFEditor's getFieldControlModel does.
 */
function Harness({
  mode = "edit",
  initial = {},
  fieldOverrides = {},
  onSetValue,
  onOpenSignature = () => undefined,
  document: documentOverride,
  signOnOpen = false,
}: {
  /** Opening a signature adopts SIGNATURE at once (the modal's stand-in). */
  signOnOpen?: boolean;
  /** Replaces the sample document. */
  document?: MobileDocument;
  mode?: "edit" | "view";
  initial?: Record<string, string>;
  fieldOverrides?: Record<string, Partial<FakeField>>;
  onSetValue?: (id: string, value: string) => void;
  onOpenSignature?: (fieldId: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [doc] = useState(() => documentOverride ?? makeSampleDocument());
  const getFieldControl = (id: string): FieldControlModel | null => {
    const base = FIELDS[id];
    if (!base) return null;
    const field = { ...base, ...fieldOverrides[id] };
    const value = values[id] ?? "";
    const write = (ids: string[], v: string) =>
      setValues((prev) => {
        const next = { ...prev };
        ids.forEach((i) => (next[i] = v));
        return next;
      });
    const sameName = (types?: MobileFieldKind[]) =>
      Object.keys(FIELDS).filter(
        (i) =>
          FIELDS[i].name === field.name &&
          (!types || types.includes(FIELDS[i].kind))
      );
    return {
      id,
      name: field.name,
      kind: field.kind,
      value,
      checked:
        field.kind === "radio"
          ? value === field.exportValue
          : !!value && value !== "Off",
      setValue: (v) => {
        onSetValue?.(id, v);
        write(sameName(["text", "select"]), v);
      },
      setChecked: (on) => {
        if (field.kind === "radio") write(sameName(), field.exportValue ?? "");
        else write([id], on ? (field.exportValue ?? "On") : "Off");
      },
      options: field.options,
      exportValue: field.exportValue,
      required: !!field.required,
      complete: !!value && value !== "Off",
      readOnly: mode === "view" || !!field.gatedLabel,
      gatedLabel: field.gatedLabel ?? null,
      hidden: !!field.hidden,
    };
  };
  return (
    <>
      <MobileFriendlyView
        status="ready"
        document={doc}
        mode={mode}
        getFieldControl={getFieldControl}
        onOpenSignature={(id) => {
          onOpenSignature(id);
          if (signOnOpen) setValues((prev) => ({ ...prev, [id]: SIGNATURE }));
        }}
      />
      <output data-testid="values">{JSON.stringify(values)}</output>
    </>
  );
}

const valuesOf = () =>
  JSON.parse(screen.getByTestId("values").textContent || "{}") as Record<
    string,
    string
  >;

const control = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLElement>(
    `[data-mf-field][data-field-id="${id}"]`
  );

describe("MobileFriendlyView rendering", () => {
  it("renders the document text, headings, page dividers and furniture", () => {
    renderWithChakra(<Harness />);
    expect(
      screen.getByRole("heading", { name: "Part 1: Parties" })
    ).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(
      screen.getByText("Form T1 | Residential Tenancies")
    ).toBeInTheDocument();
    // List marker is source text, rendered as text.
    expect(screen.getByText("(a)")).toBeInTheDocument();
    expect(
      screen.getByText("Rent is due on the first day.")
    ).toBeInTheDocument();
    // Key/value label stacked above its field.
    expect(screen.getAllByText("Province").length).toBeGreaterThan(0);
  });

  it("keeps printed blanks in the DOM text", () => {
    const { container } = renderWithChakra(<Harness />);
    expect(container.textContent).toContain(
      "agree to rent the unit below. Return by ________ please."
    );
    expect(container.querySelector("[data-blank]")).not.toBeNull();
  });

  it("gives every page an anchor and section for navigation", () => {
    const { container } = renderWithChakra(<Harness />);
    expect(container.querySelector("#mf_page_0")).not.toBeNull();
    expect(container.querySelector("#mf_page_1")).not.toBeNull();
    expect(container.querySelectorAll("[data-mf-page]")).toHaveLength(2);
  });

  it("shows a loading state while converting", () => {
    renderWithChakra(
      <MobileFriendlyView
        status="loading"
        document={null}
        mode="edit"
        getFieldControl={() => null}
        onOpenSignature={() => undefined}
      />
    );
    expect(
      screen.getByText("Preparing mobile friendly view")
    ).toBeInTheDocument();
  });

  it("renders in dark mode with semantic tokens", () => {
    const { container } = renderWithChakra(<Harness />, { colorMode: "dark" });
    expect(
      container.querySelector('[data-part="mobile-friendly-view"]')
    ).not.toBeNull();
  });
});

describe("MobileFriendlyView fields", () => {
  it("labels an inline field with the sentence around it", () => {
    const { container } = renderWithChakra(<Harness />);
    expect(control(container, "f_name")).toHaveAttribute("aria-label", "I,");
  });

  it("writes text through the model, syncing same-name ids", async () => {
    const user = userEvent.setup();
    const onSetValue = vi.fn();
    const { container } = renderWithChakra(<Harness onSetValue={onSetValue} />);
    await user.type(control(container, "f_name")!, "Ann");
    expect(onSetValue).toHaveBeenLastCalledWith("f_name", "Ann");
    expect(valuesOf()).toMatchObject({ f_name: "Ann", f_name2: "Ann" });
    // The other copy shows the same value.
    expect(control(container, "f_name2")).toHaveValue("Ann");
  });

  it("marks required, complete and the field name on every control", async () => {
    const user = userEvent.setup();
    const { container } = renderWithChakra(<Harness />);
    const name = control(container, "f_name")!;
    expect(name).toHaveAttribute("data-required", "true");
    expect(name).toHaveAttribute("data-complete", "false");
    expect(name).toHaveAttribute("data-field-name", "tenant_name");
    await user.type(name, "A");
    expect(control(container, "f_name")).toHaveAttribute(
      "data-complete",
      "true"
    );
    // Visible asterisk plus screen-reader text.
    expect(screen.getAllByText("Required").length).toBeGreaterThan(0);
  });

  it("shows printed guides as helper text", () => {
    const { container } = renderWithChakra(<Harness />);
    const phone = control(container, "f_phone")!;
    const hintId = phone.getAttribute("aria-describedby");
    expect(hintId).toBeTruthy();
    expect(container.querySelector(`#${hintId}`)).toHaveTextContent(
      "(###) ###-####"
    );
    expect(phone).toHaveAttribute("inputmode", "tel");
  });

  it("checks a checkbox to its export value and back to Off", async () => {
    const user = userEvent.setup();
    renderWithChakra(<Harness />);
    const box = screen.getByRole("checkbox", { name: "Parking is included" });
    await user.click(box);
    expect(valuesOf().f_park).toBe("Yes");
    await user.click(box);
    expect(valuesOf().f_park).toBe("Off");
  });

  it("selects a radio option for the whole group", async () => {
    const user = userEvent.setup();
    renderWithChakra(<Harness />);
    const group = screen.getByRole("group", { name: /Who pays for heat\?/ });
    await user.click(within(group).getByRole("radio", { name: "Tenant" }));
    expect(valuesOf()).toMatchObject({ f_heat_l: "Tenant", f_heat_t: "Tenant" });
    expect(within(group).getByRole("radio", { name: "Tenant" })).toBeChecked();
    expect(
      within(group).getByRole("radio", { name: "Landlord" })
    ).not.toBeChecked();
  });

  it("changes a select through the model", async () => {
    const user = userEvent.setup();
    const { container } = renderWithChakra(<Harness />);
    await user.selectOptions(
      control(container, "f_prov") as HTMLSelectElement,
      "NS"
    );
    expect(valuesOf().f_prov).toBe("NS");
  });

  it("opens the shared signature modal and shows the adopted image", async () => {
    const user = userEvent.setup();
    const onOpenSignature = vi.fn();
    const { rerender } = renderWithChakra(
      <Harness onOpenSignature={onOpenSignature} />
    );
    await user.click(screen.getByRole("button", { name: /Tap to sign/ }));
    expect(onOpenSignature).toHaveBeenCalledWith("f_sig");
    rerender(
      <Harness
        key="signed"
        onOpenSignature={onOpenSignature}
        initial={{ f_sig: SIGNATURE }}
      />
    );
    expect(screen.getByRole("img", { name: "Your signature" })).toHaveAttribute(
      "src",
      SIGNATURE
    );
    await user.click(screen.getByRole("button", { name: /Change/ }));
    expect(onOpenSignature).toHaveBeenCalledTimes(2);
  });

  it("Enter moves to the next control instead of submitting", () => {
    const { container } = renderWithChakra(<Harness />);
    const name = control(container, "f_name")!;
    name.focus();
    fireEvent.keyDown(name, { key: "Enter" });
    expect(document.activeElement).toBe(control(container, "f_phone"));
  });
});

describe("MobileFriendlyView gating and view mode", () => {
  it("shows another signer's field read-only with its assignee", () => {
    const { container } = renderWithChakra(
      <Harness
        fieldOverrides={{ f_phone: { gatedLabel: "Assigned to Landlord" } }}
      />
    );
    expect(screen.getByText("Assigned to Landlord")).toBeInTheDocument();
    expect(screen.getByText("Not filled yet")).toBeInTheDocument();
    expect(control(container, "f_phone")?.tagName).not.toBe("INPUT");
    // The source label is document text and stays.
    expect(screen.getByText("Tenant phone number")).toBeInTheDocument();
  });

  it("omits a hidden field's control but keeps its label text", () => {
    const { container } = renderWithChakra(
      <Harness
        fieldOverrides={{
          f_phone: { gatedLabel: "Assigned to Landlord", hidden: true },
        }}
      />
    );
    expect(control(container, "f_phone")).toBeNull();
    expect(screen.queryByText("Assigned to Landlord")).toBeNull();
    expect(screen.getByText("Tenant phone number")).toBeInTheDocument();
  });

  it("renders every value read-only in View mode", () => {
    const { container } = renderWithChakra(
      <Harness mode="view" initial={{ f_phone: "416 555 0100" }} />
    );
    expect(container.querySelectorAll('input[type="text"]')).toHaveLength(0);
    expect(screen.getByText("416 555 0100")).toBeInTheDocument();
    expect(screen.getAllByText("Blank").length).toBeGreaterThan(0);
    expect(screen.getByRole("checkbox", { name: "Parking is included" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Tap to sign/ })).toBeNull();
  });
});

describe("MobileFriendlyView guardrails", () => {
  it("gives every button type=button", () => {
    const { container } = renderWithChakra(<Harness />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((button) =>
      expect(button).toHaveAttribute("type", "button")
    );
  });

  it("sizes text inputs and selects at 16px or more (no iOS focus zoom)", () => {
    const { container } = renderWithChakra(<Harness />);
    const controls = container.querySelectorAll<HTMLElement>(
      'input[type="text"][data-mf-field], select[data-mf-field]'
    );
    expect(controls.length).toBeGreaterThan(0);
    controls.forEach((el) => {
      const style = window.getComputedStyle(el);
      expect(parseFloat(style.fontSize)).toBeGreaterThanOrEqual(16);
    });
  });

  it("leaves a host form's FormData unchanged", async () => {
    const user = userEvent.setup();
    let form: HTMLFormElement | null = null;
    const { container } = renderWithChakra(
      <form
        ref={(node) => {
          form = node;
        }}
      >
        <Harness />
      </form>
    );
    await user.type(control(container, "f_name")!, "Ann");
    await user.click(screen.getByRole("checkbox", { name: "Parking is included" }));
    await user.click(screen.getByRole("radio", { name: "Tenant" }));
    expect(Array.from(new FormData(form!).keys())).toEqual([]);
  });
});

/** The sample document with some blocks replaced (by id). */
const withBlocks = (replace: Record<string, MobileBlock>): MobileDocument => {
  const doc = makeSampleDocument();
  return { ...doc, blocks: doc.blocks.map((b) => replace[b.id] ?? b) };
};

describe("MobileFriendlyView review fixes", () => {
  it("joins runs exactly as converted, adding no space between them", () => {
    const { container } = renderWithChakra(
      <p>
        <Runs
          runs={[
            run("Residential Tenancies Act, 2006"),
            run(".", { bold: true }),
            run(" On or before the 15"),
            run("th"),
            run(" day"),
          ]}
        />
      </p>
    );
    expect(container.textContent).toBe(
      "Residential Tenancies Act, 2006. On or before the 15th day"
    );
  });

  it("names a checkbox or radio option that has no label text of its own", () => {
    renderWithChakra(
      <Harness
        document={withBlocks({
          "p0-b4": {
            id: "p0-b4",
            type: "choice",
            origin: null,
            fieldId: "f_park",
            label: [],
          },
          "p0-b5": {
            id: "p0-b5",
            type: "radioGroup",
            origin: null,
            groupName: "heat",
            label: { kind: "source", runs: [run("Who pays for heat?")] },
            options: [
              { fieldId: "f_heat_l", label: [] },
              { fieldId: "f_heat_t", label: [] },
            ],
          },
        })}
      />
    );
    expect(screen.getByRole("checkbox", { name: "Parking" })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Who pays for heat?: Landlord" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Who pays for heat?: Tenant" })
    ).toBeInTheDocument();
  });

  it("shows a checkbox field's printed guide", () => {
    renderWithChakra(
      <Harness
        document={withBlocks({
          "p0-b4": {
            id: "p0-b4",
            type: "field",
            origin: null,
            fieldId: "f_park",
            kind: "checkbox",
            label: { kind: "source", runs: [run("Parking")] },
            hint: [run("Yes / No")],
          },
        })}
      />
    );
    expect(screen.getByText("Yes / No")).toBeInTheDocument();
  });

  it("does not mark another signer's field as required of this one", () => {
    const { container } = renderWithChakra(
      <Harness
        fieldOverrides={{ f_name2: { gatedLabel: "Assigned to Landlord" } }}
      />
    );
    const slot = container.querySelector('[data-mf-field-slot="f_name2"]')!;
    expect(within(slot as HTMLElement).queryByText("Required")).toBeNull();
    expect(control(container, "f_name2")).not.toHaveAttribute("data-required");
    // The signer's own required field keeps its mark.
    expect(control(container, "f_name")).toHaveAttribute("data-required", "true");
  });

  it("describes a signature that is not the viewer's by its field", () => {
    renderWithChakra(<Harness mode="view" initial={{ f_sig: SIGNATURE }} />);
    expect(
      screen.getByRole("img", { name: "Signature: Signature of tenant" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Your signature" })).toBeNull();
  });

  it("keeps the signature button the same element once signed", async () => {
    // So the adoption modal can hand focus back to it.
    const user = userEvent.setup();
    const { container } = renderWithChakra(<Harness signOnOpen />);
    const before = control(container, "f_sig");
    expect(before).toHaveAccessibleName(/Tap to sign/);
    await user.click(before!);
    const after = control(container, "f_sig");
    expect(after).toBe(before);
    expect(after).toHaveAccessibleName(/^Change/);
    expect(screen.getByRole("img", { name: "Your signature" })).toBeInTheDocument();
  });
});

