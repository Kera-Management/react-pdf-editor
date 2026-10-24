import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PDFDocument, PDFHexString, PDFName } from "pdf-lib";
import { renderWithChakra } from "./testUtils";

import PDFEditor, {
  type PDFEditorDefaultsValues,
  type PDFEditorProps,
} from "./PDFEditor";
import {
  createEditorMetadata,
  serializeEditorMetadata,
} from "./participantCompletion";

/**
 * Defaults mode (`mode="defaults"`) and "Use on future documents"
 * (`rememberableFields`). Real pdf-lib builds the document (with /TU and
 * editor metadata); only pdfjs-dist, the reading side, is mocked.
 */

const { getDocumentMock, fakeDocRef, pageRenderMock } = vi.hoisted(() => ({
  getDocumentMock: vi.fn(),
  fakeDocRef: { current: null as unknown },
  pageRenderMock: vi.fn(),
}));

vi.mock("pdfjs-dist", () => ({
  AnnotationMode: { ENABLE_FORMS: 2 },
  GlobalWorkerOptions: { workerSrc: "" },
  RenderingCancelledException: class RenderingCancelledException extends Error {},
  version: "5.4.54",
  getDocument: (...args: unknown[]) => getDocumentMock(...args),
}));

const RECTS = {
  parking: { x: 10, y: 260, width: 150, height: 20 },
  heat: { x: 10, y: 230, width: 12, height: 12 },
  water: { x: 40, y: 230, width: 12, height: 12 },
  terms: { x: 10, y: 160, width: 250, height: 60 },
  smoking: { x: 10, y: 130, width: 150, height: 20 },
  tenant_name: { x: 10, y: 100, width: 150, height: 20 },
  landlord_sig: { x: 10, y: 40, width: 150, height: 30 },
};
type Name = keyof typeof RECTS;

async function buildSourceDocument(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const form = doc.getForm();
  const parking = form.createTextField("parking");
  parking.addToPage(page, { ...RECTS.parking, borderWidth: 0 });
  parking.acroField.dict.set(
    PDFName.of("TU"),
    PDFHexString.fromText("Parking spaces")
  );
  form.createCheckBox("heat").addToPage(page, { ...RECTS.heat, borderWidth: 0 });
  form.createCheckBox("water").addToPage(page, { ...RECTS.water, borderWidth: 0 });
  const terms = form.createTextField("terms");
  terms.enableMultiline();
  terms.addToPage(page, { ...RECTS.terms, borderWidth: 0 });
  form.createTextField("smoking").addToPage(page, { ...RECTS.smoking, borderWidth: 0 });
  form
    .createTextField("tenant_name")
    .addToPage(page, { ...RECTS.tenant_name, borderWidth: 0 });
  form
    .createTextField("landlord_sig")
    .addToPage(page, { ...RECTS.landlord_sig, borderWidth: 0 });
  doc.setTitle(
    serializeEditorMetadata(
      createEditorMetadata({
        fieldAssignments: {},
        requiredFields: ["parking", "tenant_name"],
        signatureFields: ["landlord_sig"],
      })
    )
  );
  return doc.save();
}

const rawField = (
  id: string,
  name: Name,
  type: "text" | "checkbox",
  extra: Record<string, unknown> = {}
) => {
  const r = RECTS[name];
  return {
    editable: true,
    hidden: false,
    id,
    multiline: false,
    name,
    page: 0,
    password: false,
    rect: [r.x, r.y, r.x + r.width, r.y + r.height],
    type,
    value: "",
    defaultValue: "",
    ...extra,
  };
};

function makeFakeDoc(bytes: Uint8Array) {
  const page = {
    pageNumber: 1,
    destroyed: false,
    getViewport: vi.fn((opts?: { scale?: number }) => ({
      width: 300 * (opts?.scale ?? 1),
      height: 300 * (opts?.scale ?? 1),
    })),
    render: pageRenderMock,
  };
  return {
    numPages: 1,
    getPage: vi.fn(async () => page),
    getFieldObjects: vi.fn(async () => ({
      parking: [rawField("f_parking", "parking", "text")],
      heat: [
        rawField("f_heat", "heat", "checkbox", {
          exportValues: "Yes",
          value: "Off",
          defaultValue: "Off",
        }),
      ],
      terms: [rawField("f_terms", "terms", "text", { multiline: true })],
      // Filled in the PDF already, as a host's blank form with saved
      // defaults would be.
      smoking: [rawField("f_smoking", "smoking", "text", { value: "No smoking" })],
      tenant_name: [rawField("f_tenant", "tenant_name", "text", { value: "Ada Tenant" })],
      landlord_sig: [rawField("f_sig", "landlord_sig", "text")],
      water: [
        rawField("f_water", "water", "checkbox", {
          exportValues: "Yes",
          value: "Off",
          defaultValue: "Off",
        }),
      ],
    })),
    getData: vi.fn(async () => bytes),
    destroy: vi.fn(),
  };
}

const overlay = <T extends HTMLElement = HTMLInputElement>(
  container: HTMLElement,
  id: string
) =>
  container.querySelector<T>(
    `[id^="page_div_container_"] [data-field-id="${id}"]`
  )!;

let sourceBytes: Uint8Array;

beforeEach(async () => {
  sourceBytes ??= await buildSourceDocument();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return {
        ownerCanvasId: this.id,
        scale: vi.fn(),
      } as unknown as CanvasRenderingContext2D;
    }
  );
  pageRenderMock.mockReset();
  pageRenderMock.mockImplementation(() => ({
    promise: Promise.resolve(),
    cancel: vi.fn(),
  }));
  fakeDocRef.current = makeFakeDoc(sourceBytes);
  getDocumentMock.mockReset();
  getDocumentMock.mockImplementation(() => ({
    promise: Promise.resolve(fakeDocRef.current),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const DEFAULTABLE = ["parking", "heat", "terms", "smoking", "landlord_sig", "not_in_document"];

async function mount(props: Partial<PDFEditorProps> = {}) {
  const utils = renderWithChakra(
    <PDFEditor src="fake://form.pdf" {...props} />
  );
  await waitFor(() => {
    if (!utils.container.querySelector("#page_canvas_1")) {
      throw new Error("not mounted");
    }
  });
  return utils;
}

async function mountDefaults(props: Partial<PDFEditorProps> = {}) {
  const utils = await mount({
    mode: "defaults",
    allowedModes: ["defaults"],
    defaultableFields: DEFAULTABLE,
    ...props,
  });
  await waitFor(() => {
    if (!overlay(utils.container, "f_parking")) throw new Error("no fields");
  });
  return utils;
}

const saveDefaultsButton = () =>
  screen.getByRole("button", { name: /^Save defaults/ });

describe("defaults mode: what renders", () => {
  it("makes only defaultable fields editable; the rest read-only with their values", async () => {
    const { container } = await mountDefaults();
    expect(overlay(container, "f_parking").readOnly).toBe(false);
    expect(overlay(container, "f_heat").disabled).toBe(false);
    expect(overlay<HTMLTextAreaElement>(container, "f_terms").readOnly).toBe(false);
    expect(overlay(container, "f_smoking").readOnly).toBe(false);

    const tenant = overlay(container, "f_tenant");
    expect(tenant.readOnly).toBe(true);
    expect(tenant.value).toBe("Ada Tenant");
    fireEvent.change(tenant, { target: { value: "Changed" } });
    expect(tenant.value).toBe("Ada Tenant");

    // A signature field never signs here, even when listed.
    const sig = overlay<HTMLButtonElement>(container, "f_sig");
    expect(sig.disabled).toBe(true);
    fireEvent.click(sig);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // A locked text box used to be read-only only: it looked and focused
  // exactly like a defaultable one, took the caret, then swallowed every
  // keystroke ("I'm clicking on fields but I can't type"). It is disabled
  // now, like the locked checkboxes: dimmed, no focus, not in the tab order.
  it("types into a defaultable field; a locked text box takes no focus", async () => {
    const user = userEvent.setup();
    const { container } = await mountDefaults();
    const parking = overlay(container, "f_parking");
    await user.click(parking);
    expect(parking).toHaveFocus();
    await user.keyboard("P12");
    expect(parking.value).toBe("P12");

    const tenant = overlay(container, "f_tenant");
    expect(tenant.disabled).toBe(true);
    await user.click(tenant);
    expect(tenant).not.toHaveFocus();
    await user.keyboard("x");
    expect(tenant.value).toBe("Ada Tenant");
    expect(parking.value).toBe("P12");

    // Tab from the last editable box never lands on the locked one.
    await user.click(overlay(container, "f_smoking"));
    await user.tab();
    expect(tenant).not.toHaveFocus();
  });

  it("keeps View mode's text read-only, not disabled", async () => {
    const { container } = await mount({ mode: "view", allowedModes: ["view"] });
    await waitFor(() => {
      if (!overlay(container, "f_tenant")) throw new Error("no fields");
    });
    const tenant = overlay(container, "f_tenant");
    expect(tenant.readOnly).toBe(true);
    expect(tenant.disabled).toBe(false);
  });

  it("labels fields with their display names (/TU)", async () => {
    const { container } = await mountDefaults();
    expect(overlay(container, "f_parking").getAttribute("title")).toBe(
      "Parking spaces"
    );
    expect(overlay(container, "f_parking").getAttribute("name")).toBe("parking");
  });

  it("has no signing, progress, required or participant UI", async () => {
    const { container } = await mountDefaults({
      participants: [{ id: "p1", label: "Lee Landlord" }],
      activeParticipantId: "p1",
      parties: {
        seedKey: "k",
        initial: { roles: {}, order: [], groupedWithPrevious: {} },
        onSelectionChange: vi.fn(),
        modes: ["build", "edit", "view", "defaults"],
      },
    });
    expect(container.querySelector("[data-required]")).toBeNull();
    expect(screen.queryByText(/Progress/)).toBeNull();
    expect(screen.queryByText(/Remaining/)).toBeNull();
    expect(screen.queryByText("Recipients")).toBeNull();
    expect(screen.queryByText("Sign")).toBeNull();
    // No mode switcher with one mode; the primary button names the job.
    expect(saveDefaultsButton()).toBeInTheDocument();
  });

  it("keeps a host's own save label", async () => {
    await mountDefaults({ saveLabel: "Save my defaults" });
    expect(
      screen.getByRole("button", { name: /^Save my defaults/ })
    ).toBeInTheDocument();
  });
});

describe("defaults mode: what Save defaults reports", () => {
  it("reports every defaultable field with its type, and null for cleared text", async () => {
    const onDefaultsSave = vi.fn();
    const onSave = vi.fn();
    const { container } = await mountDefaults({
      onDefaultsSave,
      onSave,
      initialFieldValues: { terms: "No pets", heat: true },
    });
    await waitFor(() =>
      expect(overlay<HTMLTextAreaElement>(container, "f_terms").value).toBe("No pets")
    );
    expect(overlay(container, "f_heat").checked).toBe(true);

    fireEvent.change(overlay(container, "f_parking"), {
      target: { value: "  2 spaces  " },
    });
    fireEvent.change(overlay(container, "f_smoking"), { target: { value: "   " } });

    await act(async () => {
      fireEvent.click(saveDefaultsButton());
    });
    await waitFor(() => expect(onDefaultsSave).toHaveBeenCalledTimes(1));
    const values = onDefaultsSave.mock.calls[0][0] as PDFEditorDefaultsValues;
    expect(values).toEqual({
      parking: "2 spaces",
      heat: true,
      terms: "No pets",
      smoking: null,
    });
    // Never reported: a field not listed, a signature, a name the
    // document doesn't have. And no PDF at all.
    expect(values).not.toHaveProperty("tenant_name");
    expect(values).not.toHaveProperty("landlord_sig");
    expect(values).not.toHaveProperty("not_in_document");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("reports an unticked checkbox as false and keeps untouched PDF values", async () => {
    const onDefaultsSave = vi.fn();
    const { container } = await mountDefaults({
      onDefaultsSave,
      initialFieldValues: { heat: true },
    });
    await waitFor(() => expect(overlay(container, "f_heat").checked).toBe(true));
    fireEvent.click(overlay(container, "f_heat"));
    await act(async () => {
      fireEvent.click(saveDefaultsButton());
    });
    await waitFor(() => expect(onDefaultsSave).toHaveBeenCalledTimes(1));
    expect(onDefaultsSave.mock.calls[0][0]).toEqual({
      parking: null,
      heat: false,
      terms: null,
      smoking: "No smoking",
    });
  });

  it("awaits the host and clears the unsaved state once it lands", async () => {
    let resolve!: () => void;
    const onDefaultsSave = vi.fn(
      () => new Promise<void>((r) => (resolve = r))
    );
    const { container } = await mountDefaults({ onDefaultsSave });
    fireEvent.change(overlay(container, "f_parking"), { target: { value: "1" } });
    expect(
      screen.getByRole("button", { name: "Save defaults (unsaved changes)" })
    ).toBeInTheDocument();
    fireEvent.click(saveDefaultsButton());
    await waitFor(() => expect(onDefaultsSave).toHaveBeenCalled());
    await act(async () => resolve());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save defaults" })).toBeInTheDocument()
    );
  });

  it("ref.save() reports values too", async () => {
    const onDefaultsSave = vi.fn();
    const ref = React.createRef<import("./PDFEditor").PDFEditorRef>();
    const utils = renderWithChakra(
      <PDFEditor
        ref={ref}
        src="fake://form.pdf"
        mode="defaults"
        allowedModes={["defaults"]}
        defaultableFields={["parking"]}
        onDefaultsSave={onDefaultsSave}
      />
    );
    await waitFor(() => {
      if (!overlay(utils.container, "f_parking")) throw new Error("no fields");
    });
    await act(async () => {
      await ref.current!.save();
    });
    expect(onDefaultsSave).toHaveBeenCalledWith({ parking: null });
  });
});

describe("initialFieldValues booleans", () => {
  it("tick a checkbox in Fill & Sign and are ignored for text fields", async () => {
    const { container } = await mount({
      mode: "edit",
      initialFieldValues: { heat: true, parking: true as unknown as string },
    });
    await waitFor(() => expect(overlay(container, "f_heat").checked).toBe(true));
    expect(overlay(container, "f_parking").value).toBe("");
  });
});

const findRemember = () =>
  screen.queryByRole("button", { name: "Use on future documents" });

describe("Use on future documents: Fill & Sign", () => {
  const REMEMBERABLE = ["parking", "heat", "landlord_sig", "smoking"];

  it("shows beside a focused listed field once it has a value, and reports it", async () => {
    const user = userEvent.setup();
    const onRememberFieldValue = vi.fn(async () => undefined);
    const { container } = await mount({
      mode: "edit",
      rememberableFields: REMEMBERABLE,
      onRememberFieldValue,
    });
    const parking = overlay(container, "f_parking");
    await user.click(parking);
    // Blank: nothing to keep yet.
    expect(findRemember()).toBeNull();
    await user.type(parking, " 2 spaces ");
    const toolbar = await screen.findByRole("toolbar", { name: "Field actions" });
    expect(within(toolbar).getByText("Parking spaces")).toBeInTheDocument();

    await user.click(findRemember()!);
    expect(onRememberFieldValue).toHaveBeenCalledWith("parking", "2 spaces");
    expect(await screen.findByText("Saved for future documents")).toBeInTheDocument();
    // The field kept focus.
    expect(document.activeElement).toBe(parking);
  });

  it("reports a ticked checkbox as true", async () => {
    const user = userEvent.setup();
    const onRememberFieldValue = vi.fn();
    const { container } = await mount({
      mode: "edit",
      rememberableFields: REMEMBERABLE,
      onRememberFieldValue,
    });
    await user.click(overlay(container, "f_heat"));
    await user.click(await screen.findByRole("button", { name: "Use on future documents" }));
    expect(onRememberFieldValue).toHaveBeenCalledWith("heat", true);
  });

  it("is never offered for signatures, unlisted fields, or without the callback", async () => {
    const user = userEvent.setup();
    const { container, unmount } = await mount({
      mode: "edit",
      rememberableFields: REMEMBERABLE,
      onRememberFieldValue: vi.fn(),
    });
    // Not listed, though it has a value.
    await user.click(overlay(container, "f_tenant"));
    expect(findRemember()).toBeNull();
    // Listed, but a signature.
    act(() => overlay<HTMLButtonElement>(container, "f_sig").focus());
    expect(findRemember()).toBeNull();
    // Listed with a value: offered; focus elsewhere hides it.
    await user.click(overlay(container, "f_smoking"));
    expect(findRemember()).not.toBeNull();
    await user.click(overlay(container, "f_tenant"));
    expect(findRemember()).toBeNull();
    unmount();

    const second = await mount({ mode: "edit", rememberableFields: REMEMBERABLE });
    await user.click(overlay(second.container, "f_smoking"));
    expect(findRemember()).toBeNull();
  });

  it("shows nothing when the host's save fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onRememberFieldValue = vi.fn(async () => {
      throw new Error("nope");
    });
    const { container } = await mount({
      mode: "edit",
      rememberableFields: REMEMBERABLE,
      onRememberFieldValue,
    });
    await user.click(overlay(container, "f_smoking"));
    await user.click(findRemember()!);
    await waitFor(() => expect(onRememberFieldValue).toHaveBeenCalled());
    expect(screen.queryByText("Saved for future documents")).toBeNull();
    expect(findRemember()).not.toBeNull();
  });

  it("is not offered in defaults mode or View", async () => {
    const user = userEvent.setup();
    const { container, unmount } = await mountDefaults({
      rememberableFields: REMEMBERABLE,
      onRememberFieldValue: vi.fn(),
    });
    await user.click(overlay(container, "f_smoking"));
    expect(findRemember()).toBeNull();
    unmount();
    const view = await mount({
      mode: "view",
      rememberableFields: REMEMBERABLE,
      onRememberFieldValue: vi.fn(),
    });
    await waitFor(() => expect(overlay(view.container, "f_smoking")).not.toBeNull());
    await user.click(overlay(view.container, "f_smoking"));
    expect(findRemember()).toBeNull();
  });
});

describe("Use on future documents: Prepare", () => {
  const select = async (container: HTMLElement, id: string) => {
    const box = await waitFor(() => {
      const el = container.querySelector<HTMLElement>(
        `[data-build-field-id="existing_${id}"]`
      );
      if (!el) throw new Error("no build field");
      return el;
    });
    fireEvent.click(box);
  };

  it("adds the action to the field toolbar for a listed field with a value", async () => {
    const onRememberFieldValue = vi.fn();
    const { container } = await mount({
      mode: "build",
      rememberableFields: ["smoking", "landlord_sig", "parking"],
      onRememberFieldValue,
    });
    await select(container, "f_smoking");
    const toolbar = await screen.findByRole("toolbar", { name: "Field actions" });
    fireEvent.click(within(toolbar).getByRole("button", { name: "Use on future documents" }));
    await waitFor(() =>
      expect(onRememberFieldValue).toHaveBeenCalledWith("smoking", "No smoking")
    );
    expect(await within(toolbar).findByText("Saved for future documents")).toBeInTheDocument();

    // Blank, or a signature: not offered.
    await select(container, "f_parking");
    await screen.findByRole("toolbar", { name: "Field actions" });
    expect(findRemember()).toBeNull();
    await select(container, "f_sig");
    await screen.findByRole("toolbar", { name: "Field actions" });
    expect(findRemember()).toBeNull();
  });

  it("leaves the toolbar as it was without the props", async () => {
    const { container } = await mount({ mode: "build" });
    await select(container, "f_smoking");
    const toolbar = await screen.findByRole("toolbar", { name: "Field actions" });
    expect(within(toolbar).queryByRole("button", { name: "Use on future documents" })).toBeNull();
    expect(within(toolbar).getByRole("button", { name: "Required" })).toBeInTheDocument();
  });

  it("offers it in the phone action bar too", async () => {
    const original = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    try {
      const onRememberFieldValue = vi.fn();
      const { container } = await mount({
        mode: "build",
        rememberableFields: ["smoking"],
        onRememberFieldValue,
      });
      await select(container, "f_smoking");
      const bar = await screen.findByRole("toolbar", { name: /^Actions for/ });
      fireEvent.click(within(bar).getByRole("button", { name: "Use on future documents" }));
      await waitFor(() =>
        expect(onRememberFieldValue).toHaveBeenCalledWith("smoking", "No smoking")
      );
      expect(
        await within(bar).findByRole("button", { name: "Saved for future documents" })
      ).toBeDisabled();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: original });
    }
  });
});

describe("defaults mode: defaultableFields and fieldNotes follow the props", () => {
  const NOTES = {
    tenant_name: "Filled in on each document",
    landlord_sig: "Signed on each document",
    parking: "Never shown: parking is editable",
  };

  it("unlocks and locks fields in place, keeping every value", async () => {
    const user = userEvent.setup();
    const onDefaultsSave = vi.fn();
    const props: Partial<PDFEditorProps> = {
      mode: "defaults",
      allowedModes: ["defaults"],
      onDefaultsSave,
    };
    const { container, rerender } = await mountDefaults(props);
    const parking = overlay(container, "f_parking");
    await user.click(parking);
    await user.keyboard("P12");
    await user.click(overlay(container, "f_smoking"));
    await user.keyboard(" indoors");
    expect(overlay(container, "f_tenant").disabled).toBe(true);

    // tenant_name becomes editable, smoking becomes locked: no remount
    // (the same element), and both keep what they show.
    rerender(
      <PDFEditor
        src="fake://form.pdf"
        {...props}
        defaultableFields={["parking", "heat", "terms", "tenant_name"]}
      />
    );
    const tenant = overlay(container, "f_tenant");
    await waitFor(() => expect(tenant.disabled).toBe(false));
    expect(overlay(container, "f_parking")).toBe(parking);
    expect(parking.value).toBe("P12");
    const smoking = overlay(container, "f_smoking");
    expect(smoking.disabled).toBe(true);
    expect(smoking.value).toBe("No smoking indoors");

    await user.clear(tenant);
    await user.type(tenant, "Pat");
    expect(tenant.value).toBe("Pat");

    fireEvent.click(saveDefaultsButton());
    await waitFor(() => expect(onDefaultsSave).toHaveBeenCalledTimes(1));
    expect(onDefaultsSave.mock.calls[0][0]).toEqual({
      parking: "P12",
      heat: false,
      terms: null,
      tenant_name: "Pat",
    });
  });

  it("shows a locked field's note as its title and a hover label; editable fields get none", async () => {
    const { container } = await mountDefaults({ fieldNotes: NOTES });
    const tenant = overlay(container, "f_tenant");
    expect(tenant.title).toBe("Tenant Name. Filled in on each document");
    const label = container.querySelector(`[data-field-note="f_tenant"]`)!;
    expect(label).toHaveTextContent("Filled in on each document");
    // Right after its field, so the CSS hover rule can reach it.
    expect(tenant.nextElementSibling).toBe(label);

    // A signature too: its label, then the note.
    expect(overlay(container, "f_sig").title).toBe("Landlord Sig. Signed on each document");
    expect(container.querySelector(`[data-field-note="f_sig"]`)).toHaveTextContent(
      "Signed on each document"
    );

    // Listed as defaultable: no note at all.
    expect(container.querySelector(`[data-field-note="f_parking"]`)).toBeNull();
    expect(overlay(container, "f_parking").title).toBe("Parking spaces");
  });

  it("updates notes live and drops one when its field unlocks", async () => {
    const { container, rerender } = await mountDefaults({ fieldNotes: NOTES });
    rerender(
      <PDFEditor
        src="fake://form.pdf"
        mode="defaults"
        allowedModes={["defaults"]}
        defaultableFields={[...DEFAULTABLE, "tenant_name"]}
        fieldNotes={{ ...NOTES, smoking: "Ignored", landlord_sig: "Kera adds this" }}
      />
    );
    await waitFor(() =>
      expect(container.querySelector(`[data-field-note="f_tenant"]`)).toBeNull()
    );
    expect(overlay(container, "f_tenant").title).toBe("Tenant Name");
    expect(container.querySelector(`[data-field-note="f_sig"]`)).toHaveTextContent(
      "Kera adds this"
    );
    expect(container.querySelector(`[data-field-note="f_smoking"]`)).toBeNull();
  });

  it("shows no notes outside defaults mode", async () => {
    const { container } = await mount({
      mode: "view",
      allowedModes: ["view"],
      fieldNotes: NOTES,
    });
    await waitFor(() => {
      if (!overlay(container, "f_tenant")) throw new Error("no fields");
    });
    expect(container.querySelector("[data-field-note]")).toBeNull();
    expect(overlay(container, "f_tenant").title).toBe("Tenant Name");
  });

  it("shows the note under a locked field in the mobile friendly view", async () => {
    const original = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    try {
      await mountDefaults({ fieldNotes: NOTES, mobileFriendlyView: true });
      // The reflow view, or its fallback to the original: either way the
      // note is there for a locked field.
      await waitFor(() =>
        expect(screen.getAllByText("Filled in on each document").length).toBeGreaterThan(0)
      );
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: original });
    }
  });
});

describe("exclusiveFieldGroups", () => {
  it("ticking one box unticks its partners in defaults mode", async () => {
    const onDefaultsSave = vi.fn();
    const { container } = await mountDefaults({
      defaultableFields: [...DEFAULTABLE, "water"],
      exclusiveFieldGroups: [["heat", "water"]],
      onDefaultsSave,
    });
    fireEvent.click(overlay(container, "f_heat"));
    await waitFor(() => expect(overlay(container, "f_heat").checked).toBe(true));
    fireEvent.click(overlay(container, "f_water"));
    await waitFor(() => expect(overlay(container, "f_water").checked).toBe(true));
    expect(overlay(container, "f_heat").checked).toBe(false);

    // Unticking leaves both unticked.
    fireEvent.click(overlay(container, "f_water"));
    await waitFor(() => expect(overlay(container, "f_water").checked).toBe(false));
    expect(overlay(container, "f_heat").checked).toBe(false);

    fireEvent.click(overlay(container, "f_heat"));
    fireEvent.click(saveDefaultsButton());
    await waitFor(() => expect(onDefaultsSave).toHaveBeenCalledTimes(1));
    expect(onDefaultsSave.mock.calls[0][0]).toMatchObject({ heat: true, water: false });
  });

  it("works in Fill & Sign too, and follows the prop", async () => {
    const { container, rerender } = await mount({ mode: "edit", allowedModes: ["edit"] });
    await waitFor(() => {
      if (!overlay(container, "f_heat")) throw new Error("no fields");
    });
    // No groups: both can be ticked.
    fireEvent.click(overlay(container, "f_heat"));
    fireEvent.click(overlay(container, "f_water"));
    await waitFor(() => expect(overlay(container, "f_water").checked).toBe(true));
    expect(overlay(container, "f_heat").checked).toBe(true);

    rerender(
      <PDFEditor
        src="fake://form.pdf"
        mode="edit"
        allowedModes={["edit"]}
        exclusiveFieldGroups={[["water", "heat"]]}
      />
    );
    fireEvent.click(overlay(container, "f_water"));
    fireEvent.click(overlay(container, "f_water"));
    await waitFor(() => expect(overlay(container, "f_water").checked).toBe(true));
    expect(overlay(container, "f_heat").checked).toBe(false);
  });

  it("leaves a locked partner alone in defaults mode", async () => {
    // water is not defaultable: locked, and ticked by the source document.
    (fakeDocRef.current as { getFieldObjects: unknown }).getFieldObjects =
      vi.fn(async () => ({
        heat: [
          rawField("f_heat", "heat", "checkbox", {
            exportValues: "Yes",
            value: "Off",
            defaultValue: "Off",
          }),
        ],
        parking: [rawField("f_parking", "parking", "text")],
        water: [
          rawField("f_water", "water", "checkbox", {
            exportValues: "Yes",
            value: "Yes",
            defaultValue: "Off",
          }),
        ],
      }));
    const { container } = await mountDefaults({ exclusiveFieldGroups: [["heat", "water"]] });
    expect(overlay(container, "f_water").checked).toBe(true);
    fireEvent.click(overlay(container, "f_heat"));
    await waitFor(() => expect(overlay(container, "f_heat").checked).toBe(true));
    expect(overlay(container, "f_water").checked).toBe(true);
  });
});
