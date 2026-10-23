import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithChakra } from "./testUtils";
import { PDFDocument, PDFHexString, PDFName } from "pdf-lib";

import PDFEditor, { type BuildModeField, type PDFEditorRef } from "./PDFEditor";
import {
  createEditorMetadata,
  serializeEditorMetadata,
} from "./participantCompletion";
import { readDocumentFieldDisplayNames } from "./utils/fieldDisplayNames";

/**
 * Field display names (AcroForm /TU): a host writes a short label into /TU
 * while the field's ID (/T) never changes. The editor shows the label to
 * people and keeps the ID for every machine job, and its saves keep /TU.
 *
 * Real pdf-lib builds the source document and inspects every save; only
 * pdfjs-dist (the reading side) is mocked, as in the signature save tests.
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

const DISPLAY_NAMES = {
  landlord_name: "Landlord's legal name",
  tenant_name: "Tenant's legal name",
  province: "Province of the unit",
};

const RECTS = {
  landlord_name: { x: 10, y: 250, width: 150, height: 20 },
  tenant_name: { x: 10, y: 200, width: 150, height: 20 },
  province: { x: 10, y: 150, width: 150, height: 20 },
  pets: { x: 10, y: 100, width: 12, height: 12 },
};

const ASSIGNMENTS = {
  landlord_name: ["p1"],
  tenant_name: ["p1"],
  province: ["p1"],
  pets: ["p2"],
};

const PARTICIPANTS = [
  { id: "p1", label: "Lee Landlord" },
  { id: "p2", label: "Tara Tenant" },
];

/** Three fields with /TU, one (pets) without, plus editor metadata. */
async function buildSourceDocument(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const form = doc.getForm();
  const landlord = form.createTextField("landlord_name");
  landlord.addToPage(page, { ...RECTS.landlord_name, borderWidth: 0 });
  const tenant = form.createTextField("tenant_name");
  tenant.addToPage(page, { ...RECTS.tenant_name, borderWidth: 0 });
  const province = form.createDropdown("province");
  province.addOptions(["ON", "NS"]);
  province.addToPage(page, { ...RECTS.province, borderWidth: 0 });
  const pets = form.createCheckBox("pets");
  pets.addToPage(page, { ...RECTS.pets, borderWidth: 0 });
  (
    [
      [landlord, DISPLAY_NAMES.landlord_name],
      [tenant, DISPLAY_NAMES.tenant_name],
      [province, DISPLAY_NAMES.province],
    ] as const
  ).forEach(([field, tu]) =>
    field.acroField.dict.set(PDFName.of("TU"), PDFHexString.fromText(tu))
  );
  doc.setTitle(
    serializeEditorMetadata(
      createEditorMetadata({
        fieldAssignments: ASSIGNMENTS,
        requiredFields: ["landlord_name", "tenant_name"],
      })
    )
  );
  return doc.save();
}

const rawField = (
  id: string,
  name: keyof typeof RECTS,
  type: "text" | "combobox" | "checkbox",
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
      landlord_name: [rawField("f_landlord", "landlord_name", "text")],
      tenant_name: [rawField("f_tenant", "tenant_name", "text")],
      province: [
        rawField("f_province", "province", "combobox", {
          items: [
            { exportValue: "ON", displayValue: "ON" },
            { exportValue: "NS", displayValue: "NS" },
          ],
        }),
      ],
      pets: [
        rawField("f_pets", "pets", "checkbox", {
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

const overlay = <T extends HTMLElement>(container: HTMLElement, id: string) =>
  container.querySelector<T>(`[id^="page_div_container_"] [data-field-id="${id}"]`);

async function namesAndDisplayNames(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return {
    names: doc
      .getForm()
      .getFields()
      .map((f) => f.getName())
      .sort(),
    displayNames: readDocumentFieldDisplayNames(doc),
  };
}

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

describe("Fill & Sign: display names shown, IDs kept", () => {
  async function mountEdit(props: Partial<React.ComponentProps<typeof PDFEditor>> = {}) {
    const utils = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        activeParticipantId="p1"
        participants={PARTICIPANTS}
        {...props}
      />
    );
    await waitFor(() => {
      if (!overlay(utils.container, "f_landlord")) throw new Error("not mounted");
    });
    return utils;
  }

  it("titles each overlay with its display label; name and data attributes keep the ID", async () => {
    const { container } = await mountEdit();
    const landlord = overlay<HTMLInputElement>(container, "f_landlord")!;
    expect(landlord.getAttribute("title")).toBe("Landlord's legal name");
    expect(landlord.getAttribute("name")).toBe("landlord_name");
    expect(landlord.disabled).toBe(false);

    const province = overlay<HTMLSelectElement>(container, "f_province")!;
    expect(province.tagName).toBe("SELECT");
    expect(province.getAttribute("title")).toBe("Province of the unit");
    expect(province.getAttribute("name")).toBe("province");

    // No /TU: the humanized name, as before.
    const pets = overlay<HTMLInputElement>(container, "f_pets")!;
    expect(pets.getAttribute("name")).toBe("pets");
    // Another signer's field still says whose it is.
    await waitFor(() =>
      expect(pets.getAttribute("title")).toBe("Assigned to Tara Tenant")
    );
    expect(pets.disabled).toBe(true);
  });

  it("lists remaining fields by display name, with the host's fieldLabels winning", async () => {
    const { container } = await mountEdit({
      fieldLabels: { tenant_name: "Your full name" },
    });
    await waitFor(() =>
      expect(container.textContent).toContain("Landlord's legal name")
    );
    expect(screen.getByRole("button", { name: "Landlord's legal name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Your full name" })).toBeInTheDocument();
    expect(container.textContent).not.toContain("Tenant's legal name");
    expect(container.textContent).not.toContain("Landlord Name");
    // The override also reaches the overlay's hover title.
    expect(overlay(container, "f_tenant")!.getAttribute("title")).toBe(
      "Your full name"
    );
  });

  it("keeps every /TU and field name through a Fill & Sign save", async () => {
    const ref = React.createRef<PDFEditorRef>();
    const onSave = vi.fn();
    const { container } = await mountEdit({ ref, onSave });
    fireEvent.change(overlay(container, "f_landlord")!, {
      target: { value: "Lee Landlord Inc." },
    });
    await act(async () => {
      await ref.current!.save();
    });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const saved = onSave.mock.calls[0][0] as Uint8Array;
    const { names, displayNames } = await namesAndDisplayNames(saved);
    expect(names).toEqual(["landlord_name", "pets", "province", "tenant_name"]);
    expect(displayNames).toEqual(DISPLAY_NAMES);
    // Values stay keyed by the ID.
    expect(onSave.mock.calls[0][1]).toMatchObject({
      landlord_name: "Lee Landlord Inc.",
    });
  });
});

describe("Prepare: display names shown, IDs kept, /TU rebuilt on save", () => {
  async function mountBuild(props: Partial<React.ComponentProps<typeof PDFEditor>> = {}) {
    const utils = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="build"
        participants={PARTICIPANTS}
        parties={{
          seedKey: "seed-1",
          initial: {
            roles: { p1: "signer", p2: "signer" },
            order: ["p1", "p2"],
            groupedWithPrevious: {},
          },
          onSelectionChange: vi.fn(),
        }}
        {...props}
      />
    );
    const field = await waitFor(() =>
      screen.getByRole("button", { name: /^text field: Landlord's legal name/ })
    );
    return { ...utils, field };
  }

  it("names the selected field by its display name in the assign panel and toolbar", async () => {
    const { field } = await mountBuild();
    fireEvent.click(field);
    await waitFor(() =>
      expect(
        screen.getByText('Who fills "Landlord\'s legal name"?')
      ).toBeInTheDocument()
    );
    expect(
      screen.getByRole("switch", {
        name: "Assign Lee Landlord to Landlord's legal name",
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Field actions" }).textContent).toContain(
      "Landlord's legal name"
    );
    // A field without /TU keeps the raw name in Prepare.
    expect(screen.getByRole("button", { name: /^checkbox field: pets/ })).toBeInTheDocument();
  });

  it("rebuilds every field with its /TU and ID on a Prepare save", async () => {
    const ref = React.createRef<PDFEditorRef>();
    const onBuildSave = vi.fn();
    await mountBuild({ ref, onBuildSave });
    await act(async () => {
      await ref.current!.save();
    });
    await waitFor(() => expect(onBuildSave).toHaveBeenCalledTimes(1));

    const [saved, buildFields, assignments] = onBuildSave.mock.calls[0] as [
      Uint8Array,
      BuildModeField[],
      Record<string, string[]>,
    ];
    const { names, displayNames } = await namesAndDisplayNames(saved);
    expect(names).toEqual(["landlord_name", "pets", "province", "tenant_name"]);
    expect(displayNames).toEqual(DISPLAY_NAMES);
    // Build fields and assignments are keyed by the ID, never the label.
    expect(
      buildFields.find((f) => f.name === "landlord_name")?.displayName
    ).toBe("Landlord's legal name");
    expect(assignments).toEqual(ASSIGNMENTS);
  });
});
