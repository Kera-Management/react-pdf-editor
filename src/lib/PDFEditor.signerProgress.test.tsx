import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithChakra } from "./testUtils";
import { PDFDocument } from "pdf-lib";

import PDFEditor from "./PDFEditor";
import {
  createEditorMetadata,
  serializeEditorMetadata,
} from "./participantCompletion";

/**
 * The manager signing a rendered Ontario standard lease (2229E) shape: their
 * signature is required, the date beside it is theirs but optional, and the
 * tenant's signature plus a required yes/no choice group belong to the
 * tenant. The Progress panel must never list more "Remaining" work than its
 * count, nor say "completed" while still listing remaining work, and no
 * field the manager can't fill may carry the required ring.
 * Real pdf-lib builds the document; only pdfjs-dist is mocked.
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

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const MANAGER = "org-admin@kera.test";
const TENANT = "sam.tenant@kera.test";
const PARTICIPANTS = [
  { id: MANAGER, label: "Avery Admin" },
  { id: TENANT, label: "Sam Rivera" },
];

const RECTS = {
  email_yes: { x: 10, y: 260, width: 12, height: 12 },
  email_no: { x: 40, y: 260, width: 12, height: 12 },
  kera_sig_landlord_1: { x: 10, y: 150, width: 150, height: 24 },
  landlord_date: { x: 170, y: 150, width: 100, height: 24 },
  kera_sig_tenant_1: { x: 10, y: 80, width: 150, height: 24 },
};
type FieldName = keyof typeof RECTS;
const IDS: Record<FieldName, string> = {
  email_yes: "f_yes",
  email_no: "f_no",
  kera_sig_landlord_1: "f_sig_ll",
  landlord_date: "f_date_ll",
  kera_sig_tenant_1: "f_sig_t",
};
const CHECKBOXES: FieldName[] = ["email_yes", "email_no"];

const LABELS = {
  kera_sig_landlord_1: "Signature · landlord 1",
  landlord_date: "Date · landlord 1",
  kera_sig_tenant_1: "Signature · tenant 1",
};

async function buildSourceDocument(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const form = doc.getForm();
  (Object.keys(RECTS) as FieldName[]).forEach((name) => {
    const field = CHECKBOXES.includes(name)
      ? form.createCheckBox(name)
      : form.createTextField(name);
    field.addToPage(page, { ...RECTS[name], borderWidth: 0 });
  });
  doc.setTitle(
    serializeEditorMetadata(
      createEditorMetadata({
        fieldAssignments: {
          kera_sig_landlord_1: [MANAGER],
          landlord_date: [MANAGER],
          kera_sig_tenant_1: [TENANT],
          email_yes: [TENANT],
          email_no: [TENANT],
        },
        requiredFields: ["kera_sig_landlord_1", "kera_sig_tenant_1"],
        signatureFields: ["kera_sig_landlord_1", "kera_sig_tenant_1"],
        choiceGroups: [
          {
            id: "notices_by_email",
            fields: ["email_yes", "email_no"],
            required: true,
            label: "Notices by email",
          },
        ],
      })
    )
  );
  return doc.save();
}

const rawField = (name: FieldName) => {
  const r = RECTS[name];
  const checkbox = CHECKBOXES.includes(name);
  return {
    editable: true,
    hidden: false,
    id: IDS[name],
    multiline: false,
    name,
    page: 0,
    password: false,
    rect: [r.x, r.y, r.x + r.width, r.y + r.height],
    type: checkbox ? ("checkbox" as const) : ("text" as const),
    ...(checkbox
      ? { exportValues: "Yes", value: "Off", defaultValue: "Off" }
      : { value: "", defaultValue: "" }),
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
    getFieldObjects: vi.fn(async () =>
      Object.fromEntries(
        (Object.keys(RECTS) as FieldName[]).map((name) => [name, [rawField(name)]])
      )
    ),
    getData: vi.fn(async () => bytes),
    destroy: vi.fn(),
  };
}

const overlay = (container: HTMLElement, name: FieldName) =>
  container.querySelector<HTMLElement>(
    `[id^="page_div_container_"] [data-field-id="${IDS[name]}"]`
  );

/** The Progress panel's section under `title` ("Remaining" / "Optional"):
 * the heading's PanelHeader row, then the section stack around it. */
const panelSection = (title: string): HTMLElement | null =>
  screen.queryByRole("heading", { name: title })?.parentElement?.parentElement
    ?.parentElement ?? null;

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

const mount = (mode: "edit" | "build") =>
  renderWithChakra(
    <PDFEditor
      src="fake://document.pdf"
      mode={mode}
      allowedModes={["build", "edit", "view"]}
      activeParticipantId={MANAGER}
      participants={PARTICIPANTS}
      fieldLabels={LABELS}
      savedSignature={TINY_PNG}
      onSave={vi.fn()}
      onBuildSave={vi.fn()}
    />
  );

const waitForSignOverlays = (container: HTMLElement) =>
  waitFor(() => {
    if (!overlay(container, "kera_sig_landlord_1")) throw new Error("not mounted");
  });

const sign = async (container: HTMLElement) => {
  fireEvent.click(overlay(container, "kera_sig_landlord_1")!);
  fireEvent.click(
    await waitFor(() => screen.getByRole("button", { name: /use this signature/i }))
  );
};

const remainingButtons = () => {
  const section = panelSection("Remaining");
  return section
    ? within(section).getAllByRole("button").map((b) => b.textContent)
    : [];
};
const optionalButtons = () => {
  const section = panelSection("Optional");
  return section
    ? within(section).getAllByRole("button").map((b) => b.textContent)
    : [];
};

describe("Fill & Sign progress for a signer with an optional field of their own", () => {
  it("lists only required work as Remaining, matching the count", async () => {
    const { container } = mount("edit");
    await waitForSignOverlays(container);
    await waitFor(() => expect(container.textContent).toContain("0 of 1"));
    expect(remainingButtons()).toEqual(["Signature · landlord 1"]);
    expect(optionalButtons()).toEqual(["Date · landlord 1"]);
  });

  it("after signing: complete, nothing listed as Remaining, the date still findable as Optional", async () => {
    const { container } = mount("edit");
    await waitForSignOverlays(container);
    await sign(container);

    await waitFor(() =>
      expect(overlay(container, "kera_sig_landlord_1")).toHaveAttribute(
        "data-complete",
        "true"
      )
    );
    expect(container.textContent).toContain("1 of 1");
    expect(panelSection("Remaining")).toBeNull();
    expect(screen.getByText("You've completed all your required fields.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /finish and save/i })).toBeInTheDocument();
    expect(optionalButtons()).toEqual(["Date · landlord 1"]);
  });

  it("puts the required ring on the signer's own field, never on another signer's", async () => {
    const { container } = mount("edit");
    await waitForSignOverlays(container);
    await waitFor(() =>
      expect(overlay(container, "kera_sig_landlord_1")).toHaveAttribute(
        "data-required",
        "true"
      )
    );
    // The tenant's signature and the tenant's yes/no group: gated for the
    // manager, so no "you still have to do this" ring.
    (["kera_sig_tenant_1", "email_yes", "email_no"] as const).forEach((name) => {
      expect(overlay(container, name)).toBeDisabled();
      expect(overlay(container, name)).not.toHaveAttribute("data-required");
    });
  });

  it("keeps the required ring after switching from Prepare to Fill & Sign", async () => {
    const { container } = mount("build");
    await waitFor(() => {
      if (!container.querySelector("[data-build-field-id]")) {
        throw new Error("not mounted");
      }
    });
    fireEvent.click(screen.getByRole("button", { name: /prepare/i }));
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: /fill & sign/i })
    );
    await waitForSignOverlays(container);
    await waitFor(() =>
      expect(overlay(container, "kera_sig_landlord_1")).toHaveAttribute(
        "data-required",
        "true"
      )
    );
    expect(overlay(container, "email_yes")).not.toHaveAttribute("data-required");
    expect(remainingButtons()).toEqual(["Signature · landlord 1"]);

    await sign(container);
    await waitFor(() => expect(container.textContent).toContain("1 of 1"));
    expect(panelSection("Remaining")).toBeNull();
  });
});
