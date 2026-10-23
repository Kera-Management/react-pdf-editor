import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithChakra } from "./testUtils";
import { PDFDocument } from "pdf-lib";

import PDFEditor, { type PDFEditorRef } from "./PDFEditor";
import {
  createEditorMetadata,
  parseEditorMetadataValue,
  serializeEditorMetadata,
  type PDFEditorChoiceGroup,
} from "./participantCompletion";

/**
 * REQUIRED CHOICE GROUPS in the editor: a yes/no question asked as two
 * checkbox fields (Ontario 2229E Section 3). Real pdf-lib builds and
 * inspects the documents; only pdfjs-dist (the reading side) is mocked.
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

const HELP = "Choose yes to receive notices and documents by email.";
const EMAIL_GROUP: PDFEditorChoiceGroup = {
  id: "notices_by_email",
  fields: ["email_yes", "email_no"],
  required: true,
  label: "Notices by email",
  help: HELP,
};

const RECTS = {
  tenant_name: { x: 10, y: 250, width: 150, height: 20 },
  email_yes: { x: 10, y: 200, width: 12, height: 12 },
  email_no: { x: 40, y: 200, width: 12, height: 12 },
  pets: { x: 10, y: 150, width: 12, height: 12 },
};
type FieldName = keyof typeof RECTS;

const ASSIGNMENTS = {
  tenant_name: ["p1"],
  email_yes: ["p1"],
  email_no: ["p1"],
  pets: ["p2"],
};

const PARTICIPANTS = [
  { id: "p1", label: "Tara Tenant" },
  { id: "p2", label: "Lee Landlord" },
];

async function buildSourceDocument(withGroups: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const form = doc.getForm();
  form
    .createTextField("tenant_name")
    .addToPage(page, { ...RECTS.tenant_name, borderWidth: 0 });
  (["email_yes", "email_no", "pets"] as const).forEach((name) =>
    form.createCheckBox(name).addToPage(page, { ...RECTS[name], borderWidth: 0 })
  );
  doc.setTitle(
    serializeEditorMetadata(
      createEditorMetadata({
        fieldAssignments: ASSIGNMENTS,
        requiredFields: ["tenant_name"],
        ...(withGroups ? { choiceGroups: [EMAIL_GROUP] } : {}),
      })
    )
  );
  return doc.save();
}

const rawField = (
  id: string,
  name: FieldName,
  type: "text" | "checkbox"
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
    ...(type === "checkbox"
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
    getFieldObjects: vi.fn(async () => ({
      tenant_name: [rawField("f_name", "tenant_name", "text")],
      email_yes: [rawField("f_yes", "email_yes", "checkbox")],
      email_no: [rawField("f_no", "email_no", "checkbox")],
      pets: [rawField("f_pets", "pets", "checkbox")],
    })),
    getData: vi.fn(async () => bytes),
    destroy: vi.fn(),
  };
}

const overlay = <T extends HTMLElement = HTMLInputElement>(
  container: HTMLElement,
  id: string
) =>
  container.querySelector<T>(`[id^="page_div_container_"] [data-field-id="${id}"]`);

const titleMetadata = async (bytes: Uint8Array) =>
  parseEditorMetadataValue((await PDFDocument.load(bytes)).getTitle());

let groupedBytes: Uint8Array;
let plainBytes: Uint8Array;

beforeEach(async () => {
  groupedBytes ??= await buildSourceDocument(true);
  plainBytes ??= await buildSourceDocument(false);
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
  fakeDocRef.current = makeFakeDoc(groupedBytes);
  getDocumentMock.mockReset();
  getDocumentMock.mockImplementation(() => ({
    promise: Promise.resolve(fakeDocRef.current),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

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
    if (!overlay(utils.container, "f_yes")) throw new Error("not mounted");
  });
  return utils;
}

describe("Fill & Sign: a required yes/no choice group", () => {
  it("makes the members mutually exclusive", async () => {
    const { container } = await mountEdit();
    const yes = overlay(container, "f_yes")!;
    const no = overlay(container, "f_no")!;
    expect(yes.checked).toBe(false);
    expect(no.checked).toBe(false);

    fireEvent.click(yes);
    await waitFor(() => expect(overlay(container, "f_yes")!.checked).toBe(true));
    expect(overlay(container, "f_no")!.checked).toBe(false);

    fireEvent.click(overlay(container, "f_no")!);
    await waitFor(() => expect(overlay(container, "f_no")!.checked).toBe(true));
    expect(overlay(container, "f_yes")!.checked).toBe(false);

    // Unchecking the answer leaves the question unanswered again.
    fireEvent.click(overlay(container, "f_no")!);
    await waitFor(() => expect(overlay(container, "f_no")!.checked).toBe(false));
    expect(overlay(container, "f_yes")!.checked).toBe(false);
  });

  it("lists the group once, by its label, with its help; members not on their own", async () => {
    const { container } = await mountEdit();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notices by email" })).toBeInTheDocument()
    );
    expect(screen.getAllByRole("button", { name: "Notices by email" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Email Yes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Email No" })).toBeNull();
    expect(screen.getByText(HELP)).toBeInTheDocument();
    // tenant_name + the group: two required items, not three.
    expect(container.textContent).toContain("0 of 2");

    // Answering completes the ONE item; both members read complete.
    fireEvent.click(overlay(container, "f_yes")!);
    await waitFor(() => expect(container.textContent).toContain("1 of 2"));
    expect(screen.queryByRole("button", { name: "Notices by email" })).toBeNull();
    expect(overlay(container, "f_no")!.getAttribute("data-complete")).toBe("true");
  });

  it("falls back to the members' display names joined with ' / ' without a label", async () => {
    const unlabelled: PDFEditorChoiceGroup = { ...EMAIL_GROUP };
    delete unlabelled.label;
    const doc = await PDFDocument.load(groupedBytes);
    doc.setTitle(
      serializeEditorMetadata(
        createEditorMetadata({
          fieldAssignments: ASSIGNMENTS,
          requiredFields: ["tenant_name"],
          choiceGroups: [unlabelled],
        })
      )
    );
    fakeDocRef.current = makeFakeDoc(await doc.save());
    await mountEdit({ fieldLabels: { email_yes: "Yes", email_no: "No" } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Yes / No" })).toBeInTheDocument()
    );
  });

  it("carries the help text in the members' hover titles and shows the required cue", async () => {
    const { container } = await mountEdit({
      fieldLabels: { email_yes: "Yes, by email", email_no: "No" },
    });
    await waitFor(() =>
      expect(overlay(container, "f_yes")!.getAttribute("title")).toBe(
        `Yes, by email — ${HELP}`
      )
    );
    expect(overlay(container, "f_no")!.getAttribute("title")).toBe(`No — ${HELP}`);
    expect(overlay(container, "f_yes")!.getAttribute("data-required")).toBe("true");
    expect(overlay(container, "f_no")!.getAttribute("data-required")).toBe("true");
  });

  it("blocks Save until the group is answered, like any required field", async () => {
    const onSave = vi.fn();
    const { container } = await mountEdit({ onSave });
    fireEvent.change(overlay(container, "f_name")!, { target: { value: "Tara" } });

    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "You still have 1 field to complete",
    });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep signing" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).toBeNull()
    );

    fireEvent.click(overlay(container, "f_no")!);
    await waitFor(() => expect(container.textContent).toContain("2 of 2"));
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onSave.mock.calls[0][1]).toMatchObject({
      email_yes: "Off",
      email_no: "Yes",
    });
  });

  it("only the assigned signer can answer; it is not another signer's work", async () => {
    const { container } = await mountEdit({ activeParticipantId: "p2" });
    await waitFor(() => expect(overlay(container, "f_yes")!.disabled).toBe(true));
    expect(overlay(container, "f_no")!.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Notices by email" })).toBeNull();
    expect(screen.queryByText(HELP)).toBeNull();
  });

  it("keeps choiceGroups unchanged through a Fill & Sign save", async () => {
    const ref = React.createRef<PDFEditorRef>();
    const onSave = vi.fn();
    const { container } = await mountEdit({ ref, onSave });
    fireEvent.click(overlay(container, "f_yes")!);
    await act(async () => {
      await ref.current!.save();
    });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const metadata = await titleMetadata(onSave.mock.calls[0][0] as Uint8Array);
    expect(metadata.choiceGroups).toEqual([EMAIL_GROUP]);
    expect(metadata.requiredFields).toEqual(["tenant_name"]);
  });

  it("leaves a PDF without choiceGroups exactly as before", async () => {
    fakeDocRef.current = makeFakeDoc(plainBytes);
    const ref = React.createRef<PDFEditorRef>();
    const onSave = vi.fn();
    const { container } = await mountEdit({ ref, onSave });
    // Independent checkboxes: checking one leaves the other alone.
    fireEvent.click(overlay(container, "f_yes")!);
    fireEvent.click(overlay(container, "f_no")!);
    await waitFor(() => expect(overlay(container, "f_no")!.checked).toBe(true));
    expect(overlay(container, "f_yes")!.checked).toBe(true);
    expect(screen.queryByRole("button", { name: "Notices by email" })).toBeNull();
    // Only tenant_name is required.
    expect(container.textContent).toContain("0 of 1");
    expect(overlay(container, "f_yes")!.hasAttribute("data-required")).toBe(false);

    await act(async () => {
      await ref.current!.save();
    });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = await PDFDocument.load(onSave.mock.calls[0][0] as Uint8Array);
    const source = await PDFDocument.load(plainBytes);
    expect(saved.getTitle()).toBe(source.getTitle());
    expect(saved.getTitle()).not.toContain("choiceGroups");
  });
});

describe("Prepare: choiceGroups preserved on save", () => {
  async function mountBuild(props: Partial<React.ComponentProps<typeof PDFEditor>> = {}) {
    const utils = renderWithChakra(
      <PDFEditor
        src="fake://document.pdf"
        mode="build"
        participants={PARTICIPANTS}
        {...props}
      />
    );
    await waitFor(() => screen.getByRole("button", { name: /^checkbox field: email_no/ }));
    return utils;
  }

  async function saveBuild(onBuildSave: ReturnType<typeof vi.fn>, ref: React.RefObject<PDFEditorRef>) {
    await act(async () => {
      await ref.current!.save();
    });
    await waitFor(() => expect(onBuildSave).toHaveBeenCalledTimes(1));
    return titleMetadata(onBuildSave.mock.calls[0][0] as Uint8Array);
  }

  it("writes the groups back unchanged (rebuild + flatten save); members stay out of requiredFields", async () => {
    const ref = React.createRef<PDFEditorRef>();
    const onBuildSave = vi.fn();
    await mountBuild({ ref, onBuildSave });
    // Members show their group's Required state in Prepare.
    expect(
      screen.getByRole("button", { name: /^checkbox field: email_yes/ })
    ).toHaveAccessibleName(/required/);
    const metadata = await saveBuild(onBuildSave, ref);
    expect(metadata.choiceGroups).toEqual([EMAIL_GROUP]);
    expect(metadata.requiredFields).toEqual(["tenant_name"]);
    expect(metadata.fieldAssignments).toEqual(ASSIGNMENTS);
  });

  it("drops a deleted member, and the group once fewer than two remain", async () => {
    const ref = React.createRef<PDFEditorRef>();
    const onBuildSave = vi.fn();
    await mountBuild({ ref, onBuildSave });
    fireEvent.click(screen.getByRole("button", { name: /^checkbox field: email_no/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^checkbox field: email_no/ })).toBeNull()
    );
    const metadata = await saveBuild(onBuildSave, ref);
    expect(metadata.choiceGroups).toBeUndefined();
    // The surviving member is not suddenly required on its own.
    expect(metadata.requiredFields).toEqual(["tenant_name"]);
  });

  it("writes no choiceGroups for a PDF that had none", async () => {
    fakeDocRef.current = makeFakeDoc(plainBytes);
    const ref = React.createRef<PDFEditorRef>();
    const onBuildSave = vi.fn();
    await mountBuild({ ref, onBuildSave });
    const metadata = await saveBuild(onBuildSave, ref);
    expect("choiceGroups" in metadata).toBe(false);
    expect(metadata.requiredFields).toEqual(["tenant_name"]);
  });
});
