import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, Portal } from "@chakra-ui/react";
import { renderWithChakra } from "./testUtils";
import type { PDFEditorProps } from "./PDFEditor";
import PDFEditor from "./PDFEditor";

/**
 * The Prepare tour (guided tour spec §3.1, §9): its five steps and their
 * copy, the real mode menu opened for step 1, steps dropped when the mode
 * switcher or the parties panel isn't there, the phone's Add field pill,
 * "Show tour" in Prepare, and (spec §6) that the tour never weakens the
 * "Save your fields first?" guard, whether it was completed or skipped.
 */

const { getDocumentMock, fakeDocRef, metadataRef } = vi.hoisted(() => ({
  getDocumentMock: vi.fn(),
  fakeDocRef: { current: null as unknown },
  metadataRef: {
    current: {
      version: 3 as const,
      fieldAssignments: {} as Record<string, string[]>,
      requiredFields: [] as string[],
      signatureFields: [] as string[],
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
  type: "text",
};
const FIELDS = {
  landlord_name: [{ ...base, id: "f_landlord", name: "landlord_name", rect: [10, 750, 200, 770] }],
  tenant_name: [{ ...base, id: "f_name", name: "tenant_name", rect: [10, 700, 200, 720] }],
  tenant_sig: [{ ...base, id: "f_sig", name: "tenant_sig", rect: [10, 100, 200, 140] }],
};

function makeFakePage() {
  return {
    pageNumber: 1,
    destroyed: false,
    view: [0, 0, 600, 800],
    getViewport: vi.fn((opts?: { scale?: number }) => ({
      width: 600 * (opts?.scale ?? 1),
      height: 800 * (opts?.scale ?? 1),
    })),
    getAnnotations: vi.fn(async () => []),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
  };
}

const setWidth = (width: number) =>
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
const originalWidth = window.innerWidth;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      new Proxy({} as Record<string, unknown>, {
        get: (target, key: string) => (key in target ? target[key] : (target[key] = vi.fn())),
        set: (target, key: string, value) => {
          target[key] = value;
          return true;
        },
      }) as unknown as CanvasRenderingContext2D
  );
  const page = makeFakePage();
  fakeDocRef.current = {
    numPages: 1,
    fingerprints: ["fixture", null],
    getPage: vi.fn(async () => page),
    getFieldObjects: vi.fn(async () => FIELDS),
    getData: vi.fn(async () => new Uint8Array()),
    destroy: vi.fn(),
  };
  getDocumentMock.mockReset();
  getDocumentMock.mockImplementation(() => ({ promise: Promise.resolve(fakeDocRef.current) }));
  metadataRef.current = {
    version: 3,
    fieldAssignments: {},
    requiredFields: ["tenant_name", "tenant_sig"],
    signatureFields: ["tenant_sig"],
  };
  window.localStorage.clear();
  setWidth(1280);
});

afterEach(() => {
  setWidth(originalWidth);
  vi.restoreAllMocks();
});

// A manager preparing for two parties, with every mode on offer.
const preparer: Partial<PDFEditorProps> = {
  allowedModes: ["build", "edit", "view"],
  participants: [
    { id: "tenant", label: "Tina Tenant" },
    { id: "landlord", label: "Lee Landlord" },
  ],
  parties: {
    seedKey: "seed-1",
    initial: {
      roles: { tenant: "signer", landlord: "signer" },
      order: ["tenant", "landlord"],
      groupedWithPrevious: {},
    },
    onSelectionChange: () => {},
  },
};

async function mount(props: Partial<PDFEditorProps> = {}) {
  const utils = renderWithChakra(
    <PDFEditor src="fake://document.pdf" mode="build" {...preparer} {...props} />
  );
  // Prepare is ready once the page is up (it renders no fill overlays).
  await waitFor(() => {
    if (!utils.container.querySelector('[id^="page_div_container_"] canvas'))
      throw new Error("not mounted");
  });
  return utils;
}

type User = ReturnType<typeof userEvent.setup>;

const popover = () =>
  document.querySelector<HTMLElement>('[data-part="tour-popover"]');
const tourDialog = () => screen.findByRole("alertdialog");
const stepTitle = async () =>
  within(await tourDialog()).getByRole("heading").textContent;
const clickTour = async (user: User, name: string | RegExp) =>
  user.click(within(await tourDialog()).getByRole("button", { name }));
const highlighted = () =>
  document.querySelector<HTMLElement>("[data-tour-highlighted]");
const waitForStep = (title: string) =>
  waitFor(async () => expect(await stepTitle()).toBe(title));
// The tour attaches its outside-click and step-action handling a moment
// after a step shows; wait for that before clicking around it.
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 150)));
const waitForTourEnd = () =>
  waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
const modeMenu = () => screen.queryByRole("menu");

/** Switches modes through the header's mode menu. */
async function switchMode(user: User, from: RegExp, to: RegExp) {
  await user.click(screen.getByRole("button", { name: from }));
  const menu = await screen.findByRole("menu");
  await user.click(within(menu).getByRole("menuitemradio", { name: to }));
}

/** Places a field from the palette: the Prepare fields are now unsaved. */
const addField = async () =>
  fireEvent.click(await screen.findByRole("button", { name: /add text field/i }));

const GUARD = "Save your fields first?";

describe("Prepare tour: when it starts", () => {
  it("starts in Prepare once the document has rendered, with the mode menu open", async () => {
    await mount({ tours: { prepare: true } });
    await waitForStep("Three modes");
    expect(within(popover()!).getByText("1 of 5")).toBeInTheDocument();
    // The real menu, with its mode cards, is what step 1 spotlights.
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(3);
    expect(highlighted()).toHaveAttribute("data-pdfe-tour", "mode-menu-content");
  });

  it("does not start when the host says it was seen, or passes only `sign`", async () => {
    await mount({ tours: { prepare: false, sign: true } });
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("does not start in Fill & Sign: `prepare` belongs to Prepare", async () => {
    renderWithChakra(
      <PDFEditor src="fake://document.pdf" mode="edit" {...preparer} tours={{ prepare: true }} />
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("Prepare tour: steps and copy", () => {
  it("walks the five steps with the spec's copy, and completes on Done", async () => {
    const user = userEvent.setup();
    const onTourEnd = vi.fn();
    await mount({ tours: { prepare: true }, onTourEnd });

    await waitForStep("Three modes");
    expect(popover()).toHaveTextContent(
      "You're in Prepare. Prepare places fields and picks signers. Fill & Sign completes your own fields. View is read-only. Switch here."
    );
    expect(modeMenu()).not.toBeNull();

    await clickTour(user, "Next");
    await waitForStep("Add fields");
    // The menu closes when its step ends.
    await waitFor(() => expect(modeMenu()).toBeNull());
    expect(popover()).toHaveTextContent(
      "Drag a field onto the page. Click a placed field to change its settings."
    );
    expect(highlighted()).toHaveAttribute("data-pdfe-tour", "field-palette");

    await clickTour(user, "Next");
    await waitForStep("Choose who fills each field");
    expect(popover()).toHaveTextContent(
      "Select a field, then pick the party who completes it."
    );
    expect(highlighted()).toHaveAttribute("data-pdfe-tour", "parties");

    await clickTour(user, "Next");
    await waitForStep("Save before switching");
    expect(popover()).toHaveTextContent(
      "New fields only appear in Fill & Sign and View after you save. Watch the status here."
    );
    expect(highlighted()).toHaveAttribute("data-pdfe-tour", "save");

    await clickTour(user, "Next");
    await waitForStep("Then fill and sign");
    expect(popover()).toHaveTextContent(
      "Once saved, switch to Fill & Sign to complete your own fields."
    );
    // The closed mode button this time.
    expect(highlighted()).toHaveAttribute("data-pdfe-tour", "mode-menu");
    expect(modeMenu()).toBeNull();

    await clickTour(user, "Done");
    await waitForTourEnd();
    expect(onTourEnd).toHaveBeenCalledTimes(1);
    expect(onTourEnd).toHaveBeenCalledWith("pdf_prepare", "completed", {
      replay: false,
      lastStep: 5,
    });
  });

  it("Back to step 1 opens the menu again", async () => {
    const user = userEvent.setup();
    await mount({ tours: { prepare: true } });
    await waitForStep("Three modes");
    await clickTour(user, "Next");
    await waitForStep("Add fields");
    await waitFor(() => expect(modeMenu()).toBeNull());
    await clickTour(user, "Back");
    await waitForStep("Three modes");
    await waitFor(() => expect(modeMenu()).not.toBeNull());
  });

  it("Esc on step 1 dismisses the tour and closes the menu", async () => {
    const user = userEvent.setup();
    const onTourEnd = vi.fn();
    await mount({ tours: { prepare: true }, onTourEnd });
    await waitForStep("Three modes");
    await user.keyboard("{Escape}");
    await waitForTourEnd();
    await waitFor(() => expect(modeMenu()).toBeNull());
    expect(onTourEnd).toHaveBeenCalledWith("pdf_prepare", "dismissed", {
      replay: false,
      lastStep: 1,
    });
  });

  it("drops the mode steps with a single mode: steps 2 to 4", async () => {
    const user = userEvent.setup();
    await mount({ tours: { prepare: true }, allowedModes: ["build"] });
    await waitForStep("Add fields");
    expect(within(popover()!).getByText("1 of 3")).toBeInTheDocument();
    await clickTour(user, "Next");
    await clickTour(user, "Next");
    await waitForStep("Save before switching");
    expect(within(popover()!).queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("names only the modes offered, and skips the parties step without a parties panel", async () => {
    await mount({
      tours: { prepare: true },
      allowedModes: ["build", "view"],
      parties: undefined,
    });
    await waitForStep("Two modes");
    expect(popover()).toHaveTextContent(
      "You're in Prepare. Prepare places fields and picks signers. View is read-only. Switch here."
    );
    // Modes, fields, save; no parties, and no Fill & Sign step.
    expect(within(popover()!).getByText("1 of 3")).toBeInTheDocument();
  });

  it("points at the Add field pill on a phone", async () => {
    setWidth(375);
    const user = userEvent.setup();
    await mount({ tours: { prepare: true } });
    await waitForStep("Three modes");
    await clickTour(user, "Next");
    await waitForStep("Add fields");
    expect(highlighted()).toHaveAttribute("data-pdfe-tour", "add-field");
    // Recipients live behind More actions on a phone: that step is skipped.
    await clickTour(user, "Next");
    await waitForStep("Save before switching");
  });
});

describe("Prepare tour: Show tour", () => {
  it("replays the Prepare tour in Prepare, with replay: true", async () => {
    const user = userEvent.setup();
    const onTourEnd = vi.fn();
    await mount({ tours: { prepare: false }, onTourEnd });
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Show tour" }));
    await waitForStep("Three modes");
    await settle();
    await clickTour(user, "Skip");
    await waitForTourEnd();
    expect(onTourEnd).toHaveBeenCalledWith("pdf_prepare", "dismissed", {
      replay: true,
      lastStep: 1,
    });
  });
});

describe("Prepare tour never weakens the unsaved-fields guard (spec §6)", () => {
  const finishTour = async (user: User, how: "completed" | "skipped") => {
    await waitForStep("Three modes");
    await settle();
    if (how === "skipped") {
      await clickTour(user, "Skip");
    } else {
      for (let i = 0; i < 4; i++) await clickTour(user, "Next");
      await waitForStep("Then fill and sign");
      await clickTour(user, "Done");
    }
    await waitForTourEnd();
  };

  it.each([
    ["completed", "Fill & Sign", /fill & sign/i],
    ["completed", "View", /^view/i],
    ["skipped", "Fill & Sign", /fill & sign/i],
    ["skipped", "View", /^view/i],
  ] as const)(
    "after the tour is %s, Prepare -> %s with unsaved fields still opens the dialog",
    async (how, _label, target) => {
      const user = userEvent.setup();
      const onTourEnd = vi.fn();
      await mount({ tours: { prepare: true }, onTourEnd });
      await finishTour(user, how);
      expect(onTourEnd).toHaveBeenCalledWith(
        "pdf_prepare",
        how === "completed" ? "completed" : "dismissed",
        expect.anything()
      );

      await addField();
      await switchMode(user, /prepare/i, target);
      expect(await screen.findByRole("heading", { name: GUARD })).toBeInTheDocument();
      // Still in Prepare until the user decides.
      expect(screen.getByRole("button", { name: /prepare/i })).toBeInTheDocument();
    }
  );

  it("picking a mode in the tour's open menu still hits the dialog", async () => {
    const user = userEvent.setup();
    const onTourEnd = vi.fn();
    await mount({ tours: { prepare: false }, onTourEnd });
    await addField();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Show tour" }));
    await waitForStep("Three modes");
    await settle();
    await user.click(
      within(screen.getByRole("menu")).getByRole("menuitemradio", { name: /^view/i })
    );
    expect(await screen.findByRole("heading", { name: GUARD })).toBeInTheDocument();
    // The dialog took over: the tour ended as dismissed and let go of the menu.
    await waitFor(() =>
      expect(onTourEnd).toHaveBeenCalledWith("pdf_prepare", "dismissed", {
        replay: true,
        lastStep: 1,
      })
    );
    await waitFor(() => expect(modeMenu()).toBeNull());
    expect(screen.getByRole("button", { name: /prepare/i })).toBeInTheDocument();
  });
});

// The manager's editor is a modal Chakra Dialog in the app (DocumentSignEditor).
describe("Prepare tour inside a host's modal Dialog", () => {
  async function mountInDialog(props: Partial<PDFEditorProps> = {}) {
    const onOpenChange = vi.fn();
    renderWithChakra(
      <Dialog.Root open onOpenChange={onOpenChange} size="full">
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <PDFEditor src="fake://document.pdf" mode="build" {...preparer} {...props} />
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    );
    await waitFor(() => {
      if (!document.querySelector('[id^="page_div_container_"] canvas'))
        throw new Error("not mounted");
    });
    return { onOpenChange };
  }

  it("takes clicks, and Esc on step 1 closes the tour and the menu but not the dialog", async () => {
    const user = userEvent.setup();
    const onTourEnd = vi.fn();
    const { onOpenChange } = await mountInDialog({ tours: { prepare: true }, onTourEnd });
    await waitForStep("Three modes");
    await settle();
    await clickTour(user, "Next");
    await waitForStep("Add fields");
    await clickTour(user, "Back");
    await waitForStep("Three modes");
    await screen.findByRole("menu");
    await settle();
    await user.keyboard("{Escape}");
    await waitForTourEnd();
    await waitFor(() => expect(modeMenu()).toBeNull());
    expect(onTourEnd).toHaveBeenCalledWith("pdf_prepare", "dismissed", {
      replay: false,
      lastStep: 1,
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
