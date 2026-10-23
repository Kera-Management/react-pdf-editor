import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PDFDocument, PDFHexString, PDFName } from "pdf-lib";
import { renderWithChakra } from "./testUtils";

import PDFEditor, { type PDFEditorProps, type PDFEditorRef } from "./PDFEditor";
import {
  createEditorMetadata,
  parseEditorMetadataValue,
  serializeEditorMetadata,
} from "./participantCompletion";

/**
 * Host-driven values: locked fields following `initialFieldValues` in
 * defaults mode, `resetFieldValues`, and Prepare making an assigned
 * signature required. Real pdf-lib builds the document; only pdfjs-dist,
 * the reading side, is mocked.
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

const BASE: Partial<PDFEditorProps> = {
  mode: "defaults",
  allowedModes: ["defaults"],
};

function Editor(props: Partial<PDFEditorProps>) {
  return <PDFEditor src="fake://form.pdf" {...props} />;
}

async function mountWith(props: Partial<PDFEditorProps>) {
  const utils = renderWithChakra(<Editor {...props} />);
  await waitFor(() => {
    if (!overlay(utils.container, "f_parking")) throw new Error("no fields");
  });
  return utils;
}

const saveButton = () => screen.getByRole("button", { name: /^Save defaults/ });
const isUnsaved = () => /unsaved changes/.test(saveButton().getAttribute("aria-label") ?? "");

describe("defaults mode: locked fields follow initialFieldValues", () => {
  it("shows the host's value (or empty) instead of the PDF's, and follows changes", async () => {
    const props = {
      ...BASE,
      defaultableFields: ["parking", "heat", "smoking"],
      initialFieldValues: { tenant_name: "Kera Tenant", water: true },
    };
    const { container, rerender } = await mountWith(props);
    await waitFor(() =>
      expect(overlay(container, "f_tenant").value).toBe("Kera Tenant")
    );
    expect(overlay(container, "f_water").checked).toBe(true);
    // Editable fields keep the PDF's value when the host has none.
    expect(overlay(container, "f_smoking").value).toBe("No smoking");

    rerender(<Editor {...props} initialFieldValues={{ tenant_name: "Other" }} />);
    await waitFor(() => expect(overlay(container, "f_tenant").value).toBe("Other"));
    expect(overlay(container, "f_water").checked).toBe(false);

    rerender(<Editor {...props} initialFieldValues={{}} />);
    await waitFor(() => expect(overlay(container, "f_tenant").value).toBe(""));
  });

  it("replaces what the person typed when the host locks the field", async () => {
    const user = userEvent.setup();
    const props = {
      ...BASE,
      defaultableFields: ["parking", "heat", "smoking"],
      initialFieldValues: { smoking: "No smoking" },
    };
    const { container, rerender } = await mountWith(props);
    const smoking = overlay(container, "f_smoking");
    await user.click(smoking);
    await user.keyboard(" indoors");
    expect(smoking.value).toBe("No smoking indoors");
    expect(isUnsaved()).toBe(true);

    rerender(
      <Editor
        {...props}
        defaultableFields={["parking", "heat"]}
        initialFieldValues={{ smoking: "Smoking allowed outside" }}
      />
    );
    await waitFor(() =>
      expect(overlay(container, "f_smoking").value).toBe("Smoking allowed outside")
    );
    expect(overlay(container, "f_smoking").disabled).toBe(true);
    // Its edit is gone, so nothing is unsaved any more.
    await waitFor(() => expect(isUnsaved()).toBe(false));

    // Unlocking keeps what it shows; editable fields don't follow the prop.
    rerender(
      <Editor
        {...props}
        defaultableFields={["parking", "heat", "smoking"]}
        initialFieldValues={{ smoking: "Ignored now" }}
      />
    );
    await waitFor(() => expect(overlay(container, "f_smoking").disabled).toBe(false));
    expect(overlay(container, "f_smoking").value).toBe("Smoking allowed outside");
  });

  it("leaves locked fields on the PDF's values without the prop", async () => {
    const { container } = await mountWith({ ...BASE, defaultableFields: ["parking"] });
    expect(overlay(container, "f_tenant").value).toBe("Ada Tenant");
  });

  it("doesn't apply outside defaults mode", async () => {
    const { container } = await mountWith({ mode: "view", initialFieldValues: {} });
    expect(overlay(container, "f_tenant").value).toBe("Ada Tenant");
  });
});

describe("resetFieldValues", () => {
  it("puts listed fields back to the host's value or empty, and they stop being unsaved", async () => {
    const user = userEvent.setup();
    const onDefaultsSave = vi.fn();
    const props = {
      ...BASE,
      onDefaultsSave,
      defaultableFields: ["parking", "heat", "smoking"],
      initialFieldValues: { heat: true },
      resetFieldValues: { fields: ["parking", "heat", "smoking"], nonce: 0 },
    };
    const { container, rerender } = await mountWith(props);
    // The first nonce is the starting point, not a reset.
    await waitFor(() => expect(overlay(container, "f_heat").checked).toBe(true));
    expect(overlay(container, "f_smoking").value).toBe("No smoking");

    await user.click(overlay(container, "f_parking"));
    await user.keyboard("P12");
    fireEvent.click(overlay(container, "f_heat"));
    await waitFor(() => expect(overlay(container, "f_heat").checked).toBe(false));
    expect(isUnsaved()).toBe(true);

    // Same nonce: nothing happens.
    rerender(<Editor {...props} />);
    expect(overlay(container, "f_parking").value).toBe("P12");

    rerender(
      <Editor
        {...props}
        resetFieldValues={{ fields: ["parking", "heat", "smoking"], nonce: 1 }}
      />
    );
    await waitFor(() => expect(overlay(container, "f_parking").value).toBe(""));
    expect(overlay(container, "f_heat").checked).toBe(true);
    // No host value: empty, even over the PDF's own value.
    expect(overlay(container, "f_smoking").value).toBe("");
    await waitFor(() => expect(isUnsaved()).toBe(false));

    fireEvent.click(saveButton());
    await waitFor(() => expect(onDefaultsSave).toHaveBeenCalledTimes(1));
    expect(onDefaultsSave.mock.calls[0][0]).toEqual({
      parking: null,
      heat: true,
      smoking: null,
    });
  });

  it("keeps the session unsaved when another field changed too", async () => {
    const props = {
      ...BASE,
      defaultableFields: ["parking", "terms"],
      resetFieldValues: { fields: ["parking"], nonce: 0 },
    };
    const { container, rerender } = await mountWith(props);
    fireEvent.change(overlay(container, "f_parking"), { target: { value: "1" } });
    fireEvent.change(overlay<HTMLTextAreaElement>(container, "f_terms"), {
      target: { value: "Terms" },
    });
    rerender(<Editor {...props} resetFieldValues={{ fields: ["parking"], nonce: 1 }} />);
    await waitFor(() => expect(overlay(container, "f_parking").value).toBe(""));
    expect(overlay<HTMLTextAreaElement>(container, "f_terms").value).toBe("Terms");
    expect(isUnsaved()).toBe(true);
  });

  it("works in Fill & Sign too", async () => {
    const props: Partial<PDFEditorProps> = {
      mode: "edit",
      initialFieldValues: { parking: "Seeded" },
      resetFieldValues: { fields: ["parking"], nonce: 5 },
    };
    const { container, rerender } = await mountWith(props);
    await waitFor(() => expect(overlay(container, "f_parking").value).toBe("Seeded"));
    fireEvent.change(overlay(container, "f_parking"), { target: { value: "Mine" } });
    await waitFor(() => expect(overlay(container, "f_parking").value).toBe("Mine"));
    rerender(<Editor {...props} resetFieldValues={{ fields: ["parking"], nonce: 6 }} />);
    await waitFor(() => expect(overlay(container, "f_parking").value).toBe("Seeded"));
  });
});

type BuildSaveMock = ReturnType<
  typeof vi.fn<Parameters<NonNullable<PDFEditorProps["onBuildSave"]>>, void>
>;

describe("Prepare: assigning a signature makes it required", () => {
  const participants = [
    { id: "p1", label: "Alice" },
    { id: "p2", label: "Bob" },
  ];
  const parties = {
    seedKey: "seed-1",
    initial: {
      roles: { p1: "signer" as const, p2: "signer" as const },
      order: ["p1", "p2"],
      groupedWithPrevious: {},
    },
    onSelectionChange: vi.fn(),
  };
  const SIG = /^signature field: landlord_sig/;

  async function mountBuild(onBuildSave: BuildSaveMock) {
    const ref = React.createRef<PDFEditorRef>();
    renderWithChakra(
      <PDFEditor
        ref={ref}
        src="fake://form.pdf"
        mode="build"
        participants={participants}
        parties={parties}
        onBuildSave={onBuildSave}
      />
    );
    await waitFor(() => screen.getByRole("button", { name: SIG }));
    return ref;
  }

  async function save(
    ref: React.RefObject<PDFEditorRef>,
    onBuildSave: BuildSaveMock
  ) {
    // Let the assignment land before saving through the ref.
    await act(async () => {});
    await act(async () => {
      await ref.current!.save();
    });
    await waitFor(() => expect(onBuildSave).toHaveBeenCalled());
    const bytes = onBuildSave.mock.calls[onBuildSave.mock.calls.length - 1][0];
    return parseEditorMetadataValue((await PDFDocument.load(bytes)).getTitle());
  }

  it("marks the signature required on assignment; unassigning leaves it so", async () => {
    const onBuildSave: BuildSaveMock = vi.fn();
    const ref = await mountBuild(onBuildSave);
    expect(screen.getByRole("button", { name: SIG })).not.toHaveAccessibleName(/required/);

    fireEvent.click(screen.getByRole("button", { name: SIG }));
    fireEvent.click(await screen.findByRole("switch", { name: /assign alice/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: SIG })).toHaveAccessibleName(/required/)
    );
    fireEvent.click(screen.getByRole("switch", { name: /assign alice/i }));
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: /assign alice/i })).not.toBeChecked()
    );
    expect(screen.getByRole("button", { name: SIG })).toHaveAccessibleName(/required/);
    fireEvent.click(screen.getByRole("switch", { name: /assign bob/i }));
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: /assign bob/i })).toBeChecked()
    );

    const metadata = await save(ref, onBuildSave);
    expect(metadata.fieldAssignments.landlord_sig).toEqual(["p2"]);
    expect(metadata.requiredFields).toContain("landlord_sig");
  });

  it("leaves other field types' Required as it was", async () => {
    const onBuildSave: BuildSaveMock = vi.fn();
    const ref = await mountBuild(onBuildSave);
    fireEvent.click(screen.getByRole("button", { name: /^text field: smoking/ }));
    fireEvent.click(await screen.findByRole("switch", { name: /assign alice/i }));
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: /assign alice/i })).toBeChecked()
    );
    const metadata = await save(ref, onBuildSave);
    expect(metadata.fieldAssignments.smoking).toEqual(["p1"]);
    expect(metadata.requiredFields).not.toContain("smoking");
    expect(metadata.requiredFields).not.toContain("landlord_sig");
  });
});

describe("unknown top-level editor metadata keys survive every save", () => {
  async function withExtras(): Promise<Uint8Array> {
    const doc = await PDFDocument.load(sourceBytes);
    const known = JSON.parse(doc.getTitle()!.slice("REACT_PDF_EDITOR_METADATA:".length));
    doc.setTitle(
      `REACT_PDF_EDITOR_METADATA:${JSON.stringify({
        ...known,
        keraSignatures: "manual",
        hostCustom: { a: 1 },
      })}`
    );
    return doc.save();
  }
  const extrasOf = async (bytes: Uint8Array) => {
    const title = (await PDFDocument.load(bytes)).getTitle()!;
    const parsed = JSON.parse(title.slice("REACT_PDF_EDITOR_METADATA:".length));
    return { keraSignatures: parsed.keraSignatures, hostCustom: parsed.hostCustom };
  };

  it("keeps them through a Prepare save, with the known keys rewritten", async () => {
    fakeDocRef.current = makeFakeDoc(await withExtras());
    const ref = React.createRef<PDFEditorRef>();
    const onBuildSave: BuildSaveMock = vi.fn();
    renderWithChakra(
      <PDFEditor ref={ref} src="fake://form.pdf" mode="build" onBuildSave={onBuildSave} />
    );
    await waitFor(() => screen.getByRole("button", { name: /^signature field: landlord_sig/ }));
    await act(async () => {
      await ref.current!.save();
    });
    await waitFor(() => expect(onBuildSave).toHaveBeenCalled());
    const bytes = onBuildSave.mock.calls[0][0];
    expect(await extrasOf(bytes)).toEqual({ keraSignatures: "manual", hostCustom: { a: 1 } });
    const metadata = parseEditorMetadataValue((await PDFDocument.load(bytes)).getTitle());
    expect(metadata.signatureFields).toEqual(["landlord_sig"]);
    expect(metadata.requiredFields).toEqual(["parking", "tenant_name"]);
  });

  it("keeps them through a Fill & Sign save", async () => {
    fakeDocRef.current = makeFakeDoc(await withExtras());
    const ref = React.createRef<PDFEditorRef>();
    const onSave = vi.fn();
    const { container } = renderWithChakra(
      <PDFEditor ref={ref} src="fake://form.pdf" mode="edit" onSave={onSave} />
    );
    await waitFor(() => {
      if (!overlay(container, "f_parking")) throw new Error("no fields");
    });
    fireEvent.change(overlay(container, "f_parking"), { target: { value: "P1" } });
    await act(async () => {
      await ref.current!.save();
    });
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(await extrasOf(onSave.mock.calls[0][0] as Uint8Array)).toEqual({
      keraSignatures: "manual",
      hostCustom: { a: 1 },
    });
  });
});
