import { useState } from "react";
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithChakra } from "../../testUtils";
import { MobileFriendlyView } from "../MobileFriendlyView";
import { convertDocument } from "../convert";
import {
  allRuns,
  box,
  makeItem,
  makePage,
  makeWidget,
  paragraph,
  rightOf,
  words,
} from "../convert/__tests__/fixtures";
import type { MobileDocument, SourceWidget } from "../types";
import type { FieldControlModel } from "./fieldControlModel";

/**
 * The real converter feeding the real view (no hand-built document): the
 * two halves agree on the contract in `../types.ts`. Every placed widget
 * gets exactly one control and every converted run reaches the DOM.
 */

const heading = words("Notice of Rent Increase", 72, 60, 16, { bold: true });
const intro = paragraph(
  [
    "This notice is given under the Residential Tenancies Act.",
    "Read the instructions carefully before you sign it.",
  ],
  72,
  100
);
const nameLabel = words("Tenant name:", 72, 150);
const amountBefore = words("Your new rent is $", 72, 180);
const amountAfter = words("per month.", rightOf(amountBefore) + 90, 180);
const parking = words("Parking included", 92, 210);
// A printed box with no widget over it (old NS Form P): drawn as a box.
const printedBox = makeItem("q", 72, 240, 10, { dingbat: true, fontName: "ZapfDingbatsITC" });
const storage = words("Storage locker", 92, 240);
const signLabel = words("Signature", 72, 270);
// A printed date guide under its field: a hint, which is source text.
const dateLabel = words("Date:", 72, 330);
const dateGuide = makeItem("dd/mm/yyyy", 115, 332, 8);

const WIDGETS: SourceWidget[] = [
  makeWidget("w_name", "text", box(rightOf(nameLabel) + 6, 140, 200, 14), {
    name: "tenant_name",
  }),
  makeWidget("w_rent", "text", box(rightOf(amountBefore) + 4, 170, 80, 14), {
    name: "new_rent",
    tooltip: "New monthly rent",
  }),
  makeWidget("w_park", "checkbox", box(72, 201, 12, 12), {
    name: "parking",
    exportValue: "Yes",
  }),
  makeWidget("w_sig", "signature", box(72, 276, 200, 24), {
    name: "tenant_sig",
  }),
  makeWidget("w_date", "text", box(110, 318, 120, 18), {
    name: "date_signed",
  }),
];

const convertSample = (): MobileDocument => {
  const page = makePage(
    [
      ...heading,
      ...intro,
      ...nameLabel,
      ...amountBefore,
      ...amountAfter,
      ...parking,
      printedBox,
      ...storage,
      ...signLabel,
      ...dateLabel,
      dateGuide,
      makeItem("v. 01/04/2022", 72, 760, 7),
    ],
    WIDGETS
  );
  const result = convertDocument([page]);
  if (result.status !== "ok") {
    throw new Error(JSON.stringify(result.report.reasons));
  }
  return result.document;
};

function Harness({
  document,
  gatedHidden = false,
}: {
  document: MobileDocument;
  /** Every field is another signer's, with unassigned fields hidden. */
  gatedHidden?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const getFieldControl = (id: string): FieldControlModel | null => {
    const widget = WIDGETS.find((w) => w.id === id);
    if (!widget) return null;
    const value = values[id] ?? "";
    return {
      id,
      name: widget.name,
      label: widget.name,
      kind: widget.kind,
      value,
      checked: !!value && value !== "Off",
      setValue: (v) => setValues((prev) => ({ ...prev, [id]: v })),
      setChecked: (on) =>
        setValues((prev) => ({
          ...prev,
          [id]: on ? (widget.exportValue ?? "On") : "Off",
        })),
      required: false,
      complete: !!value && value !== "Off",
      readOnly: gatedHidden,
      gated: gatedHidden,
      gatedLabel: gatedHidden ? "Assigned to Lee Landlord" : null,
      hidden: gatedHidden,
    };
  };
  return (
    <>
      <MobileFriendlyView
        status="ready"
        document={document}
        mode="edit"
        getFieldControl={getFieldControl}
        onOpenSignature={() => undefined}
      />
      <output data-testid="values">{JSON.stringify(values)}</output>
    </>
  );
}

describe("real converter output in MobileFriendlyView", () => {
  it("renders one control per widget and every converted run", () => {
    const document = convertSample();
    const { container } = renderWithChakra(<Harness document={document} />);
    const ids = Array.from(
      container.querySelectorAll("[data-mf-field][data-field-id]")
    ).map((el) => el.getAttribute("data-field-id"));
    expect(ids.slice().sort()).toEqual(WIDGETS.map((w) => w.id).sort());
    const dom = (container.textContent ?? "").replace(/\s+/g, "");
    allRuns(document)
      .filter((run) => !run.printedBox)
      .forEach((run) => {
        expect(dom).toContain(run.text.replace(/\s+/g, ""));
      });
    // The printed box shows as a box, never as its font letter.
    expect(container.querySelectorAll("[data-printed-box]")).toHaveLength(1);
    expect(dom).toContain("\u2610Storagelocker");
    expect(dom).not.toContain("qStorage");
    container.querySelectorAll("button").forEach((button) => {
      expect(button).toHaveAttribute("type", "button");
    });
  });

  it("writes through the field model by widget id", async () => {
    const user = userEvent.setup();
    const { container, getByTestId } = renderWithChakra(
      <Harness document={convertSample()} />
    );
    const name = container.querySelector<HTMLInputElement>(
      '[data-mf-field][data-field-id="w_name"]'
    );
    await user.type(name!, "Ann");
    const park = container.querySelector<HTMLElement>(
      '[data-mf-field][data-field-id="w_park"]'
    );
    await user.click(park!);
    expect(JSON.parse(getByTestId("values").textContent ?? "{}")).toEqual({
      w_name: "Ann",
      w_park: "Yes",
    });
  });

  it("keeps every converted run, hints included, when gating hides the fields", () => {
    const document = convertSample();
    // The date guide really is a hint of its field.
    const hinted = JSON.stringify(document).includes('"hint"');
    expect(hinted).toBe(true);
    const { container } = renderWithChakra(
      <Harness document={document} gatedHidden />
    );
    expect(container.querySelectorAll("[data-mf-field]")).toHaveLength(0);
    const dom = (container.textContent ?? "").replace(/\s+/g, "");
    allRuns(document)
      .filter((run) => !run.printedBox)
      .forEach((run) => {
        expect(dom).toContain(run.text.replace(/\s+/g, ""));
      });
    expect(dom).toContain("dd/mm/yyyy");
  });
});
