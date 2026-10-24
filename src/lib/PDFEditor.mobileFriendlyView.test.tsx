import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PDFDocument, PDFHexString, PDFName } from "pdf-lib";
import { renderWithChakra } from "./testUtils";
import type { PDFEditorProps } from "./PDFEditor";
import PDFEditor from "./PDFEditor";
import {
  fallbackResult,
  okResult,
} from "./mobileView/view/__fixtures__/sampleDocument";

/**
 * Mobile friendly view integration (spec §11.3). The converter is mocked:
 * these tests prove the editor wiring (opt-in, layouts, modes, fallback,
 * value sync both ways, gating, guided navigation, the review step and
 * form isolation) against a hand-built MobileDocument whose field ids
 * match the fake AcroForm below.
 */

const {
  getDocumentMock,
  fakeDocRef,
  pageRenderMock,
  extractPageMock,
  convertDocumentMock,
  metadataRef,
} = vi.hoisted(() => ({
  getDocumentMock: vi.fn(),
  fakeDocRef: { current: null as unknown },
  pageRenderMock: vi.fn(),
  extractPageMock: vi.fn(),
  convertDocumentMock: vi.fn(),
  metadataRef: {
    current: {
      version: 3 as const,
      fieldAssignments: {} as Record<string, string[]>,
      requiredFields: [] as string[],
      signatureFields: ["tenant_sig"] as string[],
    },
  },
}));

vi.mock("pdfjs-dist", () => ({
  AnnotationMode: { ENABLE_FORMS: 2 },
  GlobalWorkerOptions: { workerSrc: "" },
  RenderingCancelledException: class RenderingCancelledException extends Error {},
  version: "5.4.54",
  getDocument: (...args: unknown[]) => getDocumentMock(...args),
}));

vi.mock("./mobileView/convert", () => ({
  extractPage: (...args: unknown[]) => extractPageMock(...args),
  convertDocument: (...args: unknown[]) => convertDocumentMock(...args),
}));

vi.mock("./participantCompletion", async () => {
  const actual = await vi.importActual<
    typeof import("./participantCompletion")
  >("./participantCompletion");
  return {
    ...actual,
    extractEditorMetadata: vi.fn(async () => metadataRef.current),
  };
});

const base = {
  editable: true,
  hidden: false,
  multiline: false,
  page: 0,
  password: false,
  value: "",
  defaultValue: "",
};
const FIELDS = {
  tenant_name: [
    { ...base, id: "f_name", name: "tenant_name", type: "text", rect: [10, 700, 200, 720] },
    { ...base, id: "f_name2", name: "tenant_name", type: "text", rect: [10, 300, 200, 320] },
  ],
  phone: [{ ...base, id: "f_phone", name: "phone", type: "text", rect: [10, 650, 200, 670] }],
  parking: [
    { ...base, id: "f_park", name: "parking", type: "checkbox", exportValues: "Yes", value: "Off", defaultValue: "Off", rect: [10, 600, 22, 612] },
  ],
  heat: [
    { ...base, id: "f_heat_l", name: "heat", type: "radiobutton", exportValues: "Landlord", value: "Off", defaultValue: "Off", rect: [10, 550, 22, 562] },
    { ...base, id: "f_heat_t", name: "heat", type: "radiobutton", exportValues: "Tenant", value: "Off", defaultValue: "Off", rect: [60, 550, 72, 562] },
  ],
  province: [
    {
      ...base,
      id: "f_prov",
      name: "province",
      type: "combobox",
      value: "ON",
      defaultValue: "ON",
      items: [
        { exportValue: "ON", displayValue: "Ontario" },
        { exportValue: "NS", displayValue: "Nova Scotia" },
      ],
      rect: [10, 500, 200, 520],
    },
  ],
  tenant_sig: [{ ...base, id: "f_sig", name: "tenant_sig", type: "text", rect: [10, 100, 200, 140] }],
  // A same-name checkbox group, saved with "B" ticked: pdf.js gives every
  // widget the group's one value.
  deposit: [
    { ...base, id: "f_dep_a", name: "deposit", type: "checkbox", exportValues: "A", value: "B", defaultValue: "Off", rect: [10, 450, 22, 462] },
    { ...base, id: "f_dep_b", name: "deposit", type: "checkbox", exportValues: "B", value: "B", defaultValue: "Off", rect: [60, 450, 72, 462] },
  ],
};

/** Real AcroForm bytes with the same names, so a save can actually run. */
async function buildSourceDocument(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const form = doc.getForm();
  form.createTextField("tenant_name").addToPage(page, { x: 10, y: 700, width: 190, height: 20 });
  form.createTextField("phone").addToPage(page, { x: 10, y: 650, width: 190, height: 20 });
  form.createCheckBox("parking").addToPage(page, { x: 10, y: 600, width: 12, height: 12 });
  const heat = form.createRadioGroup("heat");
  heat.addOptionToPage("Landlord", page, { x: 10, y: 550, width: 12, height: 12 });
  heat.addOptionToPage("Tenant", page, { x: 60, y: 550, width: 12, height: 12 });
  const province = form.createDropdown("province");
  province.addOptions(["ON", "NS"]);
  province.addToPage(page, { x: 10, y: 500, width: 190, height: 20 });
  form.createTextField("tenant_sig").addToPage(page, { x: 10, y: 100, width: 190, height: 40 });
  return doc.save();
}

function makeFakePage() {
  return {
    pageNumber: 1,
    destroyed: false,
    view: [0, 0, 600, 800],
    getViewport: vi.fn((opts?: { scale?: number }) => ({
      width: 600 * (opts?.scale ?? 1),
      height: 800 * (opts?.scale ?? 1),
    })),
    getAnnotations: vi.fn(async () => [
      { subtype: "Widget", id: "f_phone", alternativeText: "Phone" },
    ]),
    render: pageRenderMock,
  };
}

const setWidth = (width: number) =>
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });

const originalWidth = window.innerWidth;

let sourceBytes: Uint8Array;

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

beforeEach(async () => {
  sourceBytes ??= await buildSourceDocument();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      // Every 2D call is a no-op (the signature pad draws into one too).
      const ctx: Record<string, unknown> = { ownerCanvasId: this.id, canvas: this };
      return new Proxy(ctx, {
        get: (target, key: string) =>
          key in target ? target[key] : (target[key] = vi.fn()),
        set: (target, key: string, value) => {
          target[key] = value;
          return true;
        },
      }) as unknown as CanvasRenderingContext2D;
    }
  );
  pageRenderMock.mockReset();
  pageRenderMock.mockImplementation(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
  const page = makeFakePage();
  fakeDocRef.current = {
    numPages: 1,
    fingerprints: ["fixture", null],
    getPage: vi.fn(async () => page),
    getFieldObjects: vi.fn(async () => FIELDS),
    getData: vi.fn(async () => sourceBytes),
    destroy: vi.fn(),
  };
  getDocumentMock.mockReset();
  getDocumentMock.mockImplementation(() => ({ promise: Promise.resolve(fakeDocRef.current) }));

  extractPageMock.mockReset();
  extractPageMock.mockImplementation(
    async (_page: unknown, pageIndex: number, widgets: unknown[]) => ({
      pageIndex,
      width: 600,
      height: 800,
      rotation: 0,
      items: [],
      widgets,
      structure: null,
    })
  );
  convertDocumentMock.mockReset();
  convertDocumentMock.mockImplementation(() => okResult());
  metadataRef.current = {
    version: 3,
    fieldAssignments: {},
    requiredFields: ["tenant_name", "tenant_sig"],
    signatureFields: ["tenant_sig"],
  };
  window.localStorage.clear();
  setWidth(390);
});

afterEach(() => {
  setWidth(originalWidth);
  vi.restoreAllMocks();
});

const reflowRoot = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-part="mobile-friendly-view"]');
const reflowControl = (container: HTMLElement, id: string) =>
  reflowRoot(container)?.querySelector<HTMLElement>(`[data-mf-field][data-field-id="${id}"]`) ?? null;
const originalControl = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLInputElement>(`[id^="page_div_container_"] [data-field-id="${id}"]`);
const pageWrapper = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("#page_div_container_1")!.parentElement!.parentElement!;

async function mount(props: Partial<PDFEditorProps> = {}) {
  const utils = renderWithChakra(
    <PDFEditor src="fake://document.pdf" mode="edit" {...props} />
  );
  await waitFor(() => {
    if (!originalControl(utils.container, "f_phone")) throw new Error("not mounted");
  });
  return utils;
}

async function mountReflow(props: Partial<PDFEditorProps> = {}) {
  const utils = await mount({ mobileFriendlyView: true, ...props });
  await waitFor(() => {
    if (!reflowControl(utils.container, "f_phone")) throw new Error("no reflow yet");
  });
  return utils;
}

const toggle = () => screen.getByRole("radiogroup", { name: "Document view" });
const segment = (name: "Mobile friendly" | "Original") =>
  within(toggle()).getByRole("radio", { name });

describe("field display names (/TU) in the mobile friendly view", () => {
  it("labels widgets by fieldLabels, then /TU, then pdf.js's annotation tooltip", async () => {
    const doc = await PDFDocument.load(sourceBytes);
    const form = doc.getForm();
    form
      .getField("tenant_name")
      .acroField.dict.set(PDFName.of("TU"), PDFHexString.fromText("Tenant's legal name"));
    form
      .getField("heat")
      .acroField.dict.set(PDFName.of("TU"), PDFHexString.fromText("Who pays for heat"));
    form
      .getField("parking")
      .acroField.dict.set(PDFName.of("TU"), PDFHexString.fromText("Parking (from /TU)"));
    const bytes = await doc.save();
    (fakeDocRef.current as { getData: () => Promise<Uint8Array> }).getData = vi.fn(
      async () => bytes
    );

    const { container } = await mountReflow({
      fieldLabels: { parking: "Parking spot", phone: "Best phone number" },
    });
    const widgets = extractPageMock.mock.calls[0][2] as { id: string; name: string; tooltip?: string }[];
    const tooltip = (id: string) => widgets.find((w) => w.id === id)?.tooltip;
    // /TU, read by the editor, on every widget of the field.
    expect(tooltip("f_name")).toBe("Tenant's legal name");
    expect(tooltip("f_name2")).toBe("Tenant's legal name");
    expect(tooltip("f_heat_l")).toBe("Who pays for heat");
    // The host's label beats both /TU and pdf.js's annotation tooltip.
    expect(tooltip("f_park")).toBe("Parking spot");
    expect(tooltip("f_phone")).toBe("Best phone number");
    // No label of any kind: no tooltip (the converter humanizes the ID).
    expect(tooltip("f_prov")).toBeUndefined();
    // The ID itself is untouched.
    expect(widgets.find((w) => w.id === "f_name")?.name).toBe("tenant_name");
    // The original overlay carries the same label as its hover title.
    expect(originalControl(container, "f_name")?.getAttribute("title")).toBe(
      "Tenant's legal name"
    );
    expect(originalControl(container, "f_name")?.getAttribute("name")).toBe("tenant_name");
  });
});

describe("opt-in, layouts and modes (S4, S5)", () => {
  it("adds nothing and converts nothing without the prop", async () => {
    const { container } = await mount();
    expect(screen.queryByRole("radiogroup", { name: "Document view" })).toBeNull();
    expect(reflowRoot(container)).toBeNull();
    expect(extractPageMock).not.toHaveBeenCalled();
    expect(convertDocumentMock).not.toHaveBeenCalled();
    expect(pageWrapper(container).style.display).toBe("");
  });

  it("is not offered on desktop", async () => {
    setWidth(1280);
    await mount({ mobileFriendlyView: true });
    expect(screen.queryByRole("radiogroup", { name: "Document view" })).toBeNull();
    expect(extractPageMock).not.toHaveBeenCalled();
  });

  it("is not offered in Prepare", async () => {
    const { container } = renderWithChakra(
      <PDFEditor src="fake://document.pdf" mode="build" mobileFriendlyView />
    );
    // Prepare renders no fill overlays; wait for the page itself.
    await waitFor(() => {
      if (!container.querySelector("#page_canvas_1")) throw new Error("not mounted");
    });
    expect(screen.queryByRole("radiogroup", { name: "Document view" })).toBeNull();
    expect(extractPageMock).not.toHaveBeenCalled();
  });

  it("defaults to Original on a tablet and converts only on request", async () => {
    setWidth(800);
    const user = userEvent.setup();
    const { container } = await mount({ mobileFriendlyView: true });
    expect(segment("Original")).toBeChecked();
    expect(extractPageMock).not.toHaveBeenCalled();
    await user.click(segment("Mobile friendly"));
    await waitFor(() => expect(reflowControl(container, "f_phone")).not.toBeNull());
    expect(extractPageMock).toHaveBeenCalledTimes(1);
    expect(convertDocumentMock).toHaveBeenCalledTimes(1);
  });

  it("opens a phone in the mobile friendly view, original kept mounted", async () => {
    const { container } = await mountReflow();
    expect(segment("Mobile friendly")).toBeChecked();
    expect(pageWrapper(container).style.display).toBe("none");
    expect(originalControl(container, "f_phone")).not.toBeNull();
    // Built SourceWidgets carry the tooltip from the page annotations.
    const widgets = extractPageMock.mock.calls[0][2] as { id: string; tooltip?: string; kind: string }[];
    expect(widgets.find((w) => w.id === "f_phone")?.tooltip).toBe("Phone");
    expect(widgets.find((w) => w.id === "f_sig")?.kind).toBe("signature");
  });

  it("shows the first-run hint once", async () => {
    const user = userEvent.setup();
    await mountReflow();
    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText(/Showing a mobile friendly version/)).toBeNull();
    expect(window.localStorage.getItem("rpe.mobileFriendlyHintSeen")).toBe("1");
  });
});

describe("unsaved Prepare fields notice (mobile friendly view spec §8.1)", () => {
  it.each([
    ["Fill & Sign", /fill & sign/i, "filled"],
    ["View", /^view/i, "shown"],
  ])(
    "in %s it stays at the top of the banner stack, above the toggle",
    async (_label, target, verb) => {
      // Fields are placed on desktop (the palette), then the window
      // narrows to a phone, where the mode opens mobile friendly.
      setWidth(1280);
      const user = userEvent.setup();
      const { container, getByRole } = renderWithChakra(
        <PDFEditor
          src="fake://document.pdf"
          mode="build"
          allowedModes={["build", "edit", "view"]}
          mobileFriendlyView
        />
      );
      await user.click(
        await waitFor(() => getByRole("button", { name: /add text field/i }))
      );
      await user.click(screen.getByRole("button", { name: /prepare/i }));
      await user.click(
        within(await screen.findByRole("menu")).getByRole("menuitemradio", {
          name: target,
        })
      );
      await user.click(
        await screen.findByRole("button", { name: "Continue without saving" })
      );

      act(() => {
        setWidth(390);
        window.dispatchEvent(new Event("resize"));
      });
      await waitFor(() => {
        if (!reflowRoot(container)?.querySelector("[data-mf-field]")) {
          throw new Error("no reflow yet");
        }
      });

      const notice = screen.getByText(
        new RegExp(`not saved yet, so they cannot be ${verb} here`)
      );
      expect(
        notice.compareDocumentPosition(toggle()) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  );
});

describe("fallback (S2)", () => {
  it("keeps the original with the notice and a disabled segment", async () => {
    convertDocumentMock.mockImplementation(() => fallbackResult());
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const { container } = await mount({ mobileFriendlyView: true });
    await screen.findByText("This document can't be shown in mobile-friendly view.");
    expect(reflowRoot(container)).toBeNull();
    expect(pageWrapper(container).style.display).toBe("");
    expect(segment("Mobile friendly")).toBeDisabled();
    expect(segment("Original")).toBeChecked();
    expect(debug).toHaveBeenCalledWith("rpe:mobileView fallback", ["textMissing: fixture"]);
  });

  it("falls back when extraction throws", async () => {
    extractPageMock.mockRejectedValue(new Error("pdf.js exploded"));
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const { container } = await mount({ mobileFriendlyView: true });
    await screen.findByText("This document can't be shown in mobile-friendly view.");
    expect(reflowRoot(container)).toBeNull();
  });

  it("skips extraction past the page limit and lets the converter fall back", async () => {
    const doc = fakeDocRef.current as { numPages: number; getPage: unknown };
    doc.numPages = 51;
    doc.getPage = vi.fn(async (n: number) => ({ ...makeFakePage(), pageNumber: n }));
    convertDocumentMock.mockImplementation(() => fallbackResult());
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    await mount({ mobileFriendlyView: true });
    await screen.findByText("This document can't be shown in mobile-friendly view.");
    expect(extractPageMock).not.toHaveBeenCalled();
    const pages = convertDocumentMock.mock.calls[0][0] as { items: unknown[] }[];
    expect(pages).toHaveLength(51);
    expect(pages.every((page) => page.items.length === 0)).toBe(true);
  });
});

describe("value sync both ways", () => {
  it("shares the fieldValues store with the original overlays", async () => {
    const user = userEvent.setup();
    const { container } = await mountReflow();
    await user.type(reflowControl(container, "f_phone")!, "4165550100");
    expect(originalControl(container, "f_phone")).toHaveValue("4165550100");

    await user.click(segment("Original"));
    expect(reflowRoot(container)).toBeNull();
    await user.type(originalControl(container, "f_phone")!, "9");
    await user.click(segment("Mobile friendly"));
    await waitFor(() =>
      expect(reflowControl(container, "f_phone")).toHaveValue("41655501009")
    );
    // Converted once; the toggle reuses the result.
    expect(convertDocumentMock).toHaveBeenCalledTimes(1);
  });

  it("writes checkbox export values, radio groups, selects and same-name copies", async () => {
    const user = userEvent.setup();
    const { container } = await mountReflow();
    await user.click(reflowControl(container, "f_park")!);
    expect(originalControl(container, "f_park")).toBeChecked();
    await user.click(reflowControl(container, "f_heat_t")!);
    expect(originalControl(container, "f_heat_t")).toBeChecked();
    expect(originalControl(container, "f_heat_l")).not.toBeChecked();
    await user.selectOptions(reflowControl(container, "f_prov") as HTMLSelectElement, "NS");
    expect(originalControl(container, "f_prov")).toHaveValue("NS");
    await user.type(reflowControl(container, "f_name")!, "Ann");
    expect(originalControl(container, "f_name")).toHaveValue("Ann");
    expect(originalControl(container, "f_name2")).toHaveValue("Ann");
    // Typing marked the session dirty (header Save shows the unsaved dot).
    expect(screen.getByTestId("dirty-dot")).toBeInTheDocument();
  });

  it("signs through the shared adoption modal", async () => {
    const user = userEvent.setup();
    // A saved signature makes adoption one click (jsdom can't draw).
    const { container } = await mountReflow({ savedSignature: TINY_PNG });
    await user.click(screen.getByRole("button", { name: /Tap to sign/ }));
    await user.click(await screen.findByRole("button", { name: /Use this signature/ }));
    await waitFor(() =>
      expect(
        within(reflowRoot(container)!).getByRole("img", { name: "Your signature" })
      ).toHaveAttribute("src", TINY_PNG)
    );
    expect(screen.getByRole("button", { name: /Change/ })).toBeInTheDocument();
    // The original overlay shows the same signature.
    expect(
      originalControl(container, "f_sig")?.querySelector("img")
    ).toHaveAttribute("src", TINY_PNG);
  });
});

describe("gating", () => {
  const gated = {
    participants: [
      { id: "tenant", label: "Tina Tenant" },
      { id: "landlord", label: "Lee Landlord" },
    ],
    activeParticipantId: "tenant",
    fieldAssignments: {
      tenant_name: ["tenant"],
      tenant_sig: ["tenant"],
      phone: ["landlord"],
      parking: ["tenant"],
      heat: ["tenant"],
      province: ["tenant"],
    },
  };

  it("shows another signer's field read-only with the existing label", async () => {
    const { container } = await mountReflow(gated);
    expect(within(reflowRoot(container)!).getByText("Assigned to Lee Landlord")).toBeInTheDocument();
    expect(reflowControl(container, "f_phone")?.tagName).not.toBe("INPUT");
  });

  it("omits the control when unassigned fields are hidden, keeping the text", async () => {
    const utils = await mount({ mobileFriendlyView: true, ...gated, unassignedVisibility: "hidden" });
    await waitFor(() => {
      if (!reflowControl(utils.container, "f_name")) throw new Error("no reflow yet");
    });
    expect(reflowControl(utils.container, "f_phone")).toBeNull();
    expect(within(reflowRoot(utils.container)!).getByText("Tenant phone number")).toBeInTheDocument();
  });
});

describe("guided bar", () => {
  it("counts the required fields and steps through the incomplete ones", async () => {
    const user = userEvent.setup();
    const { container } = await mountReflow({ savedSignature: TINY_PNG });
    const bar = screen.getByRole("region", { name: "Guided signing" });
    expect(within(bar).getByText("2 left")).toBeInTheDocument();
    expect(within(bar).getByText("Field 1 of 2")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Previous" })).toBeDisabled();
    // The page pill gives way to the bar.
    expect(screen.queryByTestId("mobile-page-pill")).toBeNull();

    await user.click(within(bar).getByRole("button", { name: /Next/ }));
    await waitFor(() => expect(document.activeElement).toBe(reflowControl(container, "f_name")));

    await user.type(reflowControl(container, "f_name")!, "Ann");
    expect(within(bar).getByText("1 left")).toBeInTheDocument();
    expect(within(bar).getByText("Field 1 of 2")).toBeInTheDocument();
    // Next skips the completed name and opens the signature modal.
    await user.click(within(bar).getByRole("button", { name: /Next/ }));
    const adopt = await screen.findByRole("button", { name: /Use this signature/ });
    // The field behind the modal never takes focus from it (the old
    // delayed focus fired 300ms later).
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(reflowControl(container, "f_sig")?.contains(document.activeElement)).toBe(false);
    await user.click(adopt);
    await waitFor(() =>
      expect(within(bar).getByText("All fields complete")).toBeInTheDocument()
    );
    expect(within(bar).queryByRole("button", { name: /Next/ })).toBeNull();
  });

  it("skips another signer's required fields", async () => {
    metadataRef.current = { ...metadataRef.current, requiredFields: ["tenant_name", "phone"] };
    await mountReflow({
      participants: [{ id: "t", label: "T" }, { id: "l", label: "L" }],
      activeParticipantId: "t",
      fieldAssignments: { tenant_name: ["t"], phone: ["l"] },
    });
    const bar = screen.getByRole("region", { name: "Guided signing" });
    expect(within(bar).getByText("1 left")).toBeInTheDocument();
    expect(within(bar).getByText("Field 1 of 1")).toBeInTheDocument();
  });

  it("is not shown in View mode, which is read-only", async () => {
    const utils = await mount({ mobileFriendlyView: true, mode: "view" });
    await waitFor(() => {
      if (!reflowRoot(utils.container)?.querySelector("[data-mf-field]")) throw new Error("no reflow");
    });
    expect(screen.queryByRole("region", { name: "Guided signing" })).toBeNull();
    expect(utils.container.querySelectorAll('[data-part="mobile-friendly-view"] input[type="text"]')).toHaveLength(0);
  });
});

describe("review the original before finishing (S3)", () => {
  it("Finish shows the original with a review bar and does not save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { container } = await mountReflow({ onSave });
    await user.click(screen.getByRole("button", { name: "Finish" }));
    const review = screen.getByRole("region", { name: "Review the original document" });
    expect(reflowRoot(container)).toBeNull();
    expect(pageWrapper(container).style.display).toBe("");
    expect(onSave).not.toHaveBeenCalled();
    expect(segment("Original")).toBeChecked();

    // The review's save is the existing save: incomplete required fields
    // still get the existing dialog.
    await user.click(within(review).getByRole("button", { name: "Finish" }));
    expect(await screen.findByText(/You still have 2 fields/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Back to edit returns to the mobile friendly view", async () => {
    const user = userEvent.setup();
    const { container } = await mountReflow();
    await user.click(screen.getByRole("button", { name: "Finish" }));
    await user.click(screen.getByRole("button", { name: "Back to edit" }));
    await waitFor(() => expect(reflowControl(container, "f_phone")).not.toBeNull());
    expect(screen.getByRole("region", { name: "Guided signing" })).toBeInTheDocument();
  });

  it("routes the header Save through the review too, then saves from it", async () => {
    metadataRef.current = { ...metadataRef.current, requiredFields: ["tenant_name"] };
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { container } = await mountReflow({ onSave, saveLabel: "Submit" });
    await user.type(reflowControl(container, "f_name")!, "Ann");
    const header = container.querySelector("header")!;
    await user.click(within(header).getByRole("button", { name: /Submit/ }));
    const review = screen.getByRole("region", { name: "Review the original document" });
    expect(onSave).not.toHaveBeenCalled();
    await user.click(within(review).getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it("saves straight away from the original, as before", async () => {
    metadataRef.current = { ...metadataRef.current, requiredFields: [] };
    setWidth(800);
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { container } = await mount({ mobileFriendlyView: true, onSave });
    const header = container.querySelector("header")!;
    await user.click(within(header).getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("region", { name: "Review the original document" })).toBeNull();
  });
});

describe("form isolation", () => {
  it("never adds reflow controls to a host form's FormData", async () => {
    const user = userEvent.setup();
    let form: HTMLFormElement | null = null;
    const { container } = renderWithChakra(
      <form ref={(node) => (form = node)}>
        <PDFEditor src="fake://document.pdf" mode="edit" mobileFriendlyView />
      </form>
    );
    await waitFor(() => {
      if (!reflowControl(container, "f_phone")) throw new Error("no reflow yet");
    });
    await user.click(reflowControl(container, "f_heat_t")!);
    await user.click(reflowControl(container, "f_park")!);
    const data = new FormData(form!);
    const keys = Array.from(data.keys());
    // Only the original overlays' AcroForm names, each radio group once
    // (the reflow's own radios and checkbox never join the form).
    keys.forEach((key) =>
      expect(["tenant_name", "phone", "parking", "heat", "province", "deposit"]).toContain(key)
    );
    expect(data.getAll("heat")).toHaveLength(1);
    expect(data.getAll("parking")).toHaveLength(1);
  });
});

describe("place keeping", () => {
  it("refocuses the same field in the other view", async () => {
    const user = userEvent.setup();
    const { container } = await mountReflow();
    await user.click(reflowControl(container, "f_phone")!);
    await act(async () => {
      await user.click(segment("Original"));
    });
    await waitFor(() =>
      expect(document.activeElement).toBe(originalControl(container, "f_phone"))
    );
  });
});

describe("review fixes", () => {
  it("the unsaved-changes guard's Save opens the review instead of saving", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();
    const { container } = await mountReflow({ onSave, onClose });
    await user.type(reflowControl(container, "f_phone")!, "4165550100");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await screen.findByRole("heading", { name: "Save your changes?" });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByRole("region", { name: "Review the original document" })
    ).toBeInTheDocument();
    expect(reflowRoot(container)).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Save your changes?" })).toBeNull();
  });

  it("Save and close from the guard closes once the review's save lands", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();
    const { container } = await mountReflow({ onSave, onClose });
    await user.type(reflowControl(container, "f_phone")!, "4165550100");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await screen.findByRole("heading", { name: "Save your changes?" });
    await user.click(screen.getByRole("button", { name: "Save" }));
    const review = await screen.findByRole("region", { name: "Review the original document" });
    // The signer already chose to save and close: no incomplete-fields
    // prompt, and the editor closes after the save.
    await user.click(within(review).getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/You still have/)).toBeNull();
  });

  it("a plain Finish from the review does not close", async () => {
    metadataRef.current = { ...metadataRef.current, requiredFields: ["tenant_name"] };
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();
    const { container } = await mountReflow({ onSave, onClose });
    await user.type(reflowControl(container, "f_name")!, "Ann");
    await user.click(screen.getByRole("button", { name: "Finish" }));
    const review = screen.getByRole("region", { name: "Review the original document" });
    await user.click(within(review).getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("leaving the phone layout ends the review", async () => {
    const user = userEvent.setup();
    const { container } = await mountReflow();
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(screen.getByRole("region", { name: "Review the original document" })).toBeInTheDocument();
    act(() => {
      setWidth(1280);
      window.dispatchEvent(new Event("resize"));
    });
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Review the original document" })).toBeNull()
    );
    act(() => {
      setWidth(390);
      window.dispatchEvent(new Event("resize"));
    });
    // Back on the phone: the mobile friendly view, not a stale review.
    await waitFor(() => expect(reflowControl(container, "f_phone")).not.toBeNull());
    expect(screen.queryByRole("region", { name: "Review the original document" })).toBeNull();
    expect(screen.getByRole("region", { name: "Guided signing" })).toBeInTheDocument();
  });

  it("writes every copy of a repeated field on desktop too", async () => {
    setWidth(1280);
    const user = userEvent.setup();
    const { container } = await mount({ mobileFriendlyView: true });
    await user.type(originalControl(container, "f_name")!, "Ann");
    expect(originalControl(container, "f_name2")).toHaveValue("Ann");
  });

  it("a checkbox group shows only its own ticked box, and ticks like radios", async () => {
    setWidth(1280);
    const user = userEvent.setup();
    const { container } = await mount();
    expect(originalControl(container, "f_dep_a")).not.toBeChecked();
    expect(originalControl(container, "f_dep_b")).toBeChecked();
    await user.click(originalControl(container, "f_dep_a")!);
    expect(originalControl(container, "f_dep_a")).toBeChecked();
    expect(originalControl(container, "f_dep_b")).not.toBeChecked();
  });

  it("the header Save during a Save-and-close review also closes", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();
    const { container } = await mountReflow({ onSave, onClose, saveLabel: "Submit" });
    await user.type(reflowControl(container, "f_phone")!, "4165550100");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await screen.findByRole("heading", { name: "Save your changes?" });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("region", { name: "Review the original document" });
    const header = container.querySelector("header")!;
    await user.click(within(header).getByRole("button", { name: /Submit/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("Back to edit cancels a pending Save and close", async () => {
    metadataRef.current = { ...metadataRef.current, requiredFields: [] };
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();
    const { container } = await mountReflow({ onSave, onClose });
    await user.type(reflowControl(container, "f_phone")!, "4165550100");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(await screen.findByRole("button", { name: "Save" }));
    await user.click(await screen.findByRole("button", { name: "Back to edit" }));
    // A later, ordinary Finish saves without closing.
    await user.click(screen.getByRole("button", { name: "Finish" }));
    const review = screen.getByRole("region", { name: "Review the original document" });
    await user.click(within(review).getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("leaves Progress to the guided bar: no header Progress button", async () => {
    metadataRef.current = { ...metadataRef.current, requiredFields: ["tenant_name"] };
    const { container } = await mountReflow();
    const header = container.querySelector("header")!;
    expect(within(header).queryByRole("button", { name: /Progress/ })).toBeNull();
    expect(screen.getByRole("region", { name: "Guided signing" })).toBeInTheDocument();
  });

  it("moves focus to the review when the guided bar's Finish unmounts", async () => {
    const user = userEvent.setup();
    await mountReflow();
    const bar = screen.getByRole("region", { name: "Guided signing" });
    await user.click(within(bar).getByRole("button", { name: "Finish" }));
    await waitFor(() =>
      expect(document.activeElement).toHaveTextContent("Review the original document")
    );
  });

  it("Keep signing from the review goes back to the mobile friendly view at the first open field", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { container } = await mountReflow({ onSave });
    await user.click(screen.getByRole("button", { name: "Finish" }));
    const review = screen.getByRole("region", { name: "Review the original document" });
    await user.click(within(review).getByRole("button", { name: "Finish" }));
    await screen.findByText(/You still have 2 fields/);
    await user.click(screen.getByRole("button", { name: "Keep signing" }));
    await waitFor(() => expect(reflowControl(container, "f_name")).not.toBeNull());
    expect(screen.queryByRole("region", { name: "Review the original document" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(reflowControl(container, "f_name")));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("a correction made on one copy during review moves every copy", async () => {
    const user = userEvent.setup();
    const { container } = await mountReflow();
    await user.type(reflowControl(container, "f_name")!, "Smyth");
    await user.click(screen.getByRole("button", { name: "Finish" }));
    const first = originalControl(container, "f_name")!;
    await user.clear(first);
    await user.type(first, "Smith");
    expect(originalControl(container, "f_name2")).toHaveValue("Smith");
  });

  it("a tap on the disabled Mobile friendly segment brings the notice back", async () => {
    convertDocumentMock.mockImplementation(() => fallbackResult());
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const user = userEvent.setup();
    await mount({ mobileFriendlyView: true });
    const notice = "This document can't be shown in mobile-friendly view.";
    await screen.findByText(notice);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(notice)).toBeNull();
    act(() => {
      segment("Mobile friendly").closest("label")!.click();
    });
    expect(await screen.findByText(notice)).toBeInTheDocument();
  });
});

describe("guided sign tour on a phone (guided tour spec §3.2)", () => {
  const tourDialog = () => screen.findByRole("alertdialog");
  const stepTitle = async () =>
    within(await tourDialog()).getByRole("heading").textContent;
  const waitForStep = (title: string) =>
    waitFor(async () => expect(await stepTitle()).toBe(title));
  const clickTour = async (
    user: ReturnType<typeof userEvent.setup>,
    name: string
  ) => user.click(within(await tourDialog()).getByRole("button", { name }));
  const popoverText = () =>
    document.querySelector('[data-part="tour-popover"]')?.textContent ?? "";
  const highlighted = () =>
    document.querySelector<HTMLElement>("[data-tour-highlighted]");
  const hint = () => screen.queryByText(/Showing a mobile friendly version/);
  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 50)));
  // Every run opens on the intro card; Start tour (found by its text: Ark
  // labels every "next" action Next) moves on to the first step.
  const startButton = async () =>
    within(await tourDialog()).getByText("Start tour").closest("button")!;
  const startTour = async (firstStep: string) => {
    await waitForStep("Quick tour: signing");
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)));
    await userEvent.setup().click(await startButton());
    await waitForStep(firstStep);
  };

  it("uses Variant B in the mobile friendly view, in place of the first-run hint", async () => {
    const user = userEvent.setup();
    const onTourEnd = vi.fn();
    await mountReflow({ tours: { sign: true }, onTourEnd, saveLabel: "Submit signature" });
    await waitForStep("Quick tour: signing");
    expect(popoverText()).toContain(
      "Three quick tips on finding your fields, signing and submitting."
    );
    // The intro takes the hint's place too.
    expect(hint()).toBeNull();
    await startTour("An easier-to-read version");
    expect(popoverText()).toContain("1 of 3");
    expect(popoverText()).toContain(
      "This is your document reformatted for your phone. Tap Original anytime to see the exact layout."
    );
    expect(highlighted()).toHaveAttribute("data-part", "mobile-view-toggle");
    expect(hint()).toBeNull();

    await clickTour(user, "Next");
    await waitForStep("Go field by field");
    expect(popoverText()).toContain(
      "Next takes you to each field you still need to fill. Signature fields open a pad to sign."
    );
    expect(highlighted()).toHaveAttribute("data-part", "mobile-guided-bar");

    await clickTour(user, "Next");
    await waitForStep("Review, then submit");
    expect(popoverText()).toContain(
      "Finish shows the original with your entries so you can check them, then select Submit signature."
    );
    expect(highlighted()).toHaveAttribute("data-pdfe-tour", "finish");
    expect(hint()).toBeNull();

    await clickTour(user, "Done");
    await waitFor(() => expect(onTourEnd).toHaveBeenCalledTimes(1));
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "completed", {
      replay: false,
      lastStep: 3,
    });
    // The hint never follows the tour, on this device or the next mount.
    expect(window.localStorage.getItem("rpe.mobileFriendlyHintSeen")).toBe("1");
    await settle();
    expect(hint()).toBeNull();
  });

  it("marks the hint seen when the tour is skipped too", async () => {
    const user = userEvent.setup();
    await mountReflow({ tours: { sign: true } });
    await startTour("An easier-to-read version");
    await clickTour(user, "Skip");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(window.localStorage.getItem("rpe.mobileFriendlyHintSeen")).toBe("1");
    expect(hint()).toBeNull();
  });

  it("leaves the hint as it was when the tour isn't eligible", async () => {
    await mountReflow({ tours: { sign: false } });
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(hint()).not.toBeNull();
    expect(window.localStorage.getItem("rpe.mobileFriendlyHintSeen")).toBeNull();
  });

  it("leaves the hint as it was when `tours` is omitted", async () => {
    await mountReflow();
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(hint()).not.toBeNull();
  });

  it("still shows the hint in View, where the sign tour never runs", async () => {
    const utils = await mount({ mobileFriendlyView: true, mode: "view", tours: { sign: true } });
    await waitFor(() => {
      if (!reflowRoot(utils.container)?.querySelector("[data-mf-field]")) throw new Error("no reflow");
    });
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(hint()).not.toBeNull();
  });

  it("marks the hint seen when the editor closes mid-tour", async () => {
    const onTourEnd = vi.fn();
    const { unmount } = await mountReflow({ tours: { sign: true }, onTourEnd });
    await startTour("An easier-to-read version");
    unmount();
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "dismissed", {
      replay: false,
      lastStep: 1,
    });
    expect(window.localStorage.getItem("rpe.mobileFriendlyHintSeen")).toBe("1");
  });

  it("waits for the conversion to settle", async () => {
    let finishExtract: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      finishExtract = resolve;
    });
    extractPageMock.mockImplementation(
      async (_page: unknown, pageIndex: number, widgets: unknown[]) => {
        await held;
        return { pageIndex, width: 600, height: 800, rotation: 0, items: [], widgets, structure: null };
      }
    );
    const { container } = await mount({ mobileFriendlyView: true, tours: { sign: true } });
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    finishExtract();
    await waitFor(() => expect(reflowControl(container, "f_phone")).not.toBeNull());
    await startTour("An easier-to-read version");
  });

  it("uses Variant A on a phone whose document fell back to the original", async () => {
    convertDocumentMock.mockImplementation(() => fallbackResult());
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    await mount({ mobileFriendlyView: true, tours: { sign: true } });
    await screen.findByText("This document can't be shown in mobile-friendly view.");
    await startTour("Your fields are highlighted");
    // The fallback notice stays as it is.
    expect(
      screen.getByText("This document can't be shown in mobile-friendly view.")
    ).toBeInTheDocument();
  });

  it("never starts during the review, and starts once back in the view", async () => {
    const user = userEvent.setup();
    const { rerender } = await mountReflow();
    await user.click(screen.getByRole("button", { name: "Finish" }));
    const review = screen.getByRole("region", { name: "Review the original document" });
    rerender(
      <PDFEditor src="fake://document.pdf" mode="edit" mobileFriendlyView tours={{ sign: true }} />
    );
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(within(review).getByRole("button", { name: /Back to edit/ }));
    await startTour("An easier-to-read version");
  });

  it("ends as dismissed when the view is toggled mid-tour", async () => {
    const user = userEvent.setup();
    const onTourEnd = vi.fn();
    const { container } = await mountReflow({ tours: { sign: true }, onTourEnd });
    await startTour("An easier-to-read version");
    await user.click(segment("Original"));
    await waitFor(() => expect(onTourEnd).toHaveBeenCalledTimes(1));
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "dismissed", {
      replay: false,
      lastStep: 1,
    });
    expect(reflowRoot(container)).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("ends as dismissed when Finish is tapped mid-tour", async () => {
    const user = userEvent.setup();
    const onTourEnd = vi.fn();
    await mountReflow({ tours: { sign: true }, onTourEnd });
    await startTour("An easier-to-read version");
    await clickTour(user, "Next");
    await clickTour(user, "Next");
    await waitForStep("Review, then submit");
    await user.click(
      within(screen.getByRole("region", { name: "Guided signing" })).getByRole("button", {
        name: "Finish",
      })
    );
    await waitFor(() => expect(onTourEnd).toHaveBeenCalledTimes(1));
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "dismissed", {
      replay: false,
      lastStep: 3,
    });
    expect(
      screen.getByRole("region", { name: "Review the original document" })
    ).toBeInTheDocument();
  });
});

describe("defaults mode", () => {
  it("fills only defaultable fields, with no guided bar or progress, and reports values", async () => {
    const user = userEvent.setup();
    const onDefaultsSave = vi.fn();
    const onSave = vi.fn();
    const { container } = await mountReflow({
      mode: "defaults",
      allowedModes: ["defaults"],
      defaultableFields: ["phone", "parking"],
      onDefaultsSave,
      onSave,
    });
    // Defaultable: editable. Everything else (a required name, the
    // signature): read-only, with no guided signing and no progress.
    expect(reflowControl(container, "f_phone")?.tagName).toBe("INPUT");
    expect(reflowControl(container, "f_name")?.tagName).not.toBe("INPUT");
    expect(reflowControl(container, "f_sig")?.tagName).not.toBe("BUTTON");
    expect(screen.queryByRole("region", { name: "Guided signing" })).toBeNull();
    expect(screen.queryByRole("button", { name: /progress/i })).toBeNull();

    await user.type(reflowControl(container, "f_phone")!, " 4165550100 ");
    await user.click(reflowControl(container, "f_park")!);
    // No review step: Save defaults reports straight away.
    await user.click(screen.getByRole("button", { name: /^Save defaults/ }));
    await waitFor(() =>
      expect(onDefaultsSave).toHaveBeenCalledWith({ phone: "4165550100", parking: true })
    );
    expect(onSave).not.toHaveBeenCalled();
  });
});
