import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { setCheckBoxValue } from "./checkBoxValue";

/** A check box named "deposit" with two widgets exporting "A" and "B". */
async function groupDocument() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const box = doc.getForm().createCheckBox("deposit");
  box.addToPage(page, { x: 10, y: 10, width: 12, height: 12 });
  box.addToPage(page, { x: 40, y: 10, width: 12, height: 12 });
  // Rename the second widget's on state from "Yes" to "B", and the first
  // to "A", the way a real group is authored.
  const rename = (index: number, to: string) => {
    const widget = box.acroField.getWidgets()[index];
    const normal = widget.dict
      .lookup(PDFName.of("AP"), PDFDict)
      .lookup(PDFName.of("N"), PDFDict);
    const on = normal.get(PDFName.of("Yes"));
    if (!on) throw new Error("fixture: no Yes state");
    normal.delete(PDFName.of("Yes"));
    normal.set(PDFName.of(to), on);
  };
  rename(0, "A");
  rename(1, "B");
  return { doc, box };
}

const states = (box: Awaited<ReturnType<typeof groupDocument>>["box"]) =>
  box.acroField
    .getWidgets()
    .map((widget) => widget.getAppearanceState()?.decodeText());

describe("setCheckBoxValue", () => {
  it("ticks only the box whose export value matches", async () => {
    const { box } = await groupDocument();
    setCheckBoxValue(box, "B");
    expect(box.acroField.getValue().decodeText()).toBe("B");
    expect(states(box)).toEqual(["Off", "B"]);
  });

  it("survives a save and reload", async () => {
    const { doc, box } = await groupDocument();
    setCheckBoxValue(box, "B");
    const reloaded = await PDFDocument.load(await doc.save());
    const again = reloaded.getForm().getCheckBox("deposit");
    expect(again.acroField.getValue().decodeText()).toBe("B");
    expect(states(again)).toEqual(["Off", "B"]);
  });

  it("unticks every box for Off or empty", async () => {
    const { box } = await groupDocument();
    setCheckBoxValue(box, "A");
    setCheckBoxValue(box, "Off");
    expect(states(box)).toEqual(["Off", "Off"]);
    setCheckBoxValue(box, "B");
    setCheckBoxValue(box, "");
    expect(states(box)).toEqual(["Off", "Off"]);
  });

  it("falls back to check() for a lone box or a plain On", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    const box = doc.getForm().createCheckBox("parking");
    box.addToPage(page, { x: 10, y: 10, width: 12, height: 12 });
    setCheckBoxValue(box, "On");
    expect(box.isChecked()).toBe(true);
  });
});
