import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, Portal } from "@chakra-ui/react";
import { renderWithChakra } from "./testUtils";
import type { PDFEditorProps } from "./PDFEditor";
import PDFEditor from "./PDFEditor";

/**
 * Guided tours (guided tour spec §3, §5, §9): when the sign tour starts and
 * stops, which steps it shows on the original layout (Variant A), how it
 * reports its end, and "Show tour". The phone variant (Variant B) and its
 * hand-off with the mobile friendly view's first-run hint are covered in
 * PDFEditor.mobileFriendlyView.test.tsx.
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

// The tenant signs; the landlord's name is someone else's (gated).
const signer: Partial<PDFEditorProps> = {
  participants: [
    { id: "tenant", label: "Tina Tenant" },
    { id: "landlord", label: "Lee Landlord" },
  ],
  activeParticipantId: "tenant",
  fieldAssignments: {
    landlord_name: ["landlord"],
    tenant_name: ["tenant"],
    tenant_sig: ["tenant"],
  },
};

const fieldEl = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLElement>(`[id^="page_div_container_"] [data-field-id="${id}"]`);

async function mount(props: Partial<PDFEditorProps> = {}) {
  const utils = renderWithChakra(
    <PDFEditor src="fake://document.pdf" mode="edit" {...signer} {...props} />
  );
  await waitFor(() => {
    if (!fieldEl(utils.container, "f_name")) throw new Error("not mounted");
  });
  return utils;
}

const popover = () =>
  document.querySelector<HTMLElement>('[data-part="tour-popover"]');
const tourDialog = () => screen.findByRole("alertdialog");
const stepTitle = async () =>
  within(await tourDialog()).getByRole("heading").textContent;
const clickTour = async (user: ReturnType<typeof userEvent.setup>, name: string | RegExp) =>
  user.click(within(await tourDialog()).getByRole("button", { name }));
const highlighted = () =>
  document.querySelector<HTMLElement>("[data-tour-highlighted]");
const waitForStep = (title: string) =>
  waitFor(async () => expect(await stepTitle()).toBe(title));
// The tour attaches its outside-click and step-action handling a moment
// after a step shows; give it that moment before a test clicks around it
// (otherwise a slow run can click before anything is listening).
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 150)));

describe("sign tour: when it starts", () => {
  it("starts in Fill & Sign once the document has rendered", async () => {
    await mount({ tours: { sign: true } });
    await waitForStep("Your fields are highlighted");
    expect(within(popover()!).getByText("1 of 4")).toBeInTheDocument();
    // Your first field, not the landlord's (gated) one above it.
    expect(highlighted()?.dataset.fieldId).toBe("f_name");
  });

  it("does nothing for a host that doesn't pass `tours`", async () => {
    await mount();
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    // No "Show tour" either: desktop keeps its header as it was.
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });

  it("does not start when the host says it was seen", async () => {
    await mount({ tours: { sign: false } });
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("never starts in View, which has no tour", async () => {
    await mount({ mode: "view", tours: { sign: true, prepare: true } });
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });

  it("waits for a confirm dialog to close", async () => {
    const user = userEvent.setup();
    const { rerender } = await mount({ onDecline: vi.fn() });
    await user.click(screen.getByRole("button", { name: "I can't sign this" }));
    await screen.findByRole("heading", { name: "Decline to sign?" });
    rerender(
      <PDFEditor
        src="fake://document.pdf"
        mode="edit"
        {...signer}
        onDecline={vi.fn()}
        tours={{ sign: true }}
      />
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByRole("alertdialog", { name: /Your fields/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitForStep("Your fields are highlighted");
  });

  it("starts on a tablet in the original layout (Variant A)", async () => {
    setWidth(800);
    await mount({ tours: { sign: true }, mobileFriendlyView: true });
    await waitForStep("Your fields are highlighted");
    const user = userEvent.setup();
    await clickTour(user, "Next");
    await waitForStep("Go field by field");
    // The header's Progress button stands in for the desktop rail.
    expect(highlighted()?.tagName).toBe("BUTTON");
    expect(highlighted()).toHaveAttribute("data-pdfe-tour", "progress");
  });
});

describe("sign tour: steps and copy (Variant A)", () => {
  it("walks the four steps with the spec's copy", async () => {
    const user = userEvent.setup();
    await mount({ tours: { sign: true } });
    await waitForStep("Your fields are highlighted");
    expect(popover()).toHaveTextContent(
      "Only highlighted fields are yours. Other parties' entries are shown but locked."
    );
    await clickTour(user, "Next");
    await waitForStep("Go field by field");
    expect(popover()).toHaveTextContent(
      "Use Start and Next to jump to each field you still need to fill."
    );
    expect(highlighted()).toHaveAttribute("data-pdfe-tour", "progress");
    await clickTour(user, "Next");
    await waitForStep("Tap to sign");
    expect(popover()).toHaveTextContent("Tap a signature field to draw your signature.");
    expect(highlighted()?.dataset.fieldId).toBe("f_sig");
    await clickTour(user, "Next");
    await waitForStep("Finish");
    expect(popover()).toHaveTextContent("Select Save when you're done.");
    expect(popover()).not.toHaveTextContent("decline");
    expect(highlighted()).toHaveAttribute("data-pdfe-tour", "save");
    // Back returns a step.
    await clickTour(user, "Back");
    await waitForStep("Tap to sign");
  });

  it("uses the host's save label, the decline sentence and the saved-signature wording", async () => {
    const user = userEvent.setup();
    await mount({
      tours: { sign: true },
      saveLabel: "Submit signature",
      onDecline: vi.fn(),
      savedSignature: "data:image/png;base64,AAAA",
    });
    await waitForStep("Your fields are highlighted");
    await clickTour(user, "Next");
    await clickTour(user, "Next");
    await waitForStep("Tap to sign");
    expect(popover()).toHaveTextContent(
      "Tap a signature field to add your saved signature or draw a new one."
    );
    await clickTour(user, "Next");
    await waitForStep("Finish");
    expect(popover()).toHaveTextContent(
      "Select Submit signature when you're done. You can also decline to sign here."
    );
  });

  it("skips the signature step when no signature field is yours", async () => {
    metadataRef.current = { ...metadataRef.current, signatureFields: [] };
    const user = userEvent.setup();
    await mount({ tours: { sign: true } });
    await waitForStep("Your fields are highlighted");
    expect(within(popover()!).getByText("1 of 3")).toBeInTheDocument();
    await clickTour(user, "Next");
    await clickTour(user, "Next");
    await waitForStep("Finish");
  });
});

describe("sign tour: how it ends", () => {
  it("Done on the last step completes it", async () => {
    const user = userEvent.setup();
    const onTourEnd = vi.fn();
    await mount({ tours: { sign: true }, onTourEnd });
    await waitForStep("Your fields are highlighted");
    for (let i = 0; i < 3; i++) await clickTour(user, "Next");
    await waitForStep("Finish");
    await clickTour(user, "Done");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onTourEnd).toHaveBeenCalledTimes(1);
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "completed", {
      replay: false,
      lastStep: 4,
    });
  });

  it.each([
    ["Skip", async (user: ReturnType<typeof userEvent.setup>) => clickTour(user, "Skip")],
    ["the close button", async (user: ReturnType<typeof userEvent.setup>) => clickTour(user, "Close tour")],
    ["Esc", async (user: ReturnType<typeof userEvent.setup>) => user.keyboard("{Escape}")],
  ])("%s dismisses it", async (_label, act) => {
    const user = userEvent.setup();
    const onTourEnd = vi.fn();
    await mount({ tours: { sign: true }, onTourEnd });
    await waitForStep("Your fields are highlighted");
    await clickTour(user, "Next");
    await waitForStep("Go field by field");
    await act(user);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onTourEnd).toHaveBeenCalledTimes(1);
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "dismissed", {
      replay: false,
      lastStep: 2,
    });
  });

  it("Esc on the last step is still a dismissal, not a completion", async () => {
    const user = userEvent.setup();
    const onTourEnd = vi.fn();
    await mount({ tours: { sign: true }, onTourEnd });
    await waitForStep("Your fields are highlighted");
    for (let i = 0; i < 3; i++) await clickTour(user, "Next");
    await waitForStep("Finish");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onTourEnd).toHaveBeenCalledTimes(1));
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "dismissed", {
      replay: false,
      lastStep: 4,
    });
  });

  it("a click on the dimmed background dismisses it", async () => {
    const user = userEvent.setup();
    const onTourEnd = vi.fn();
    await mount({ tours: { sign: true }, onTourEnd });
    await waitForStep("Your fields are highlighted");
    await settle();
    const backdrop = document.querySelector<HTMLElement>('[data-scope="tour"][data-part="backdrop"]')!;
    await user.pointer({
      keys: "[MouseLeft]",
      target: backdrop,
      coords: { clientX: 400, clientY: 400 },
    });
    await waitFor(() => expect(onTourEnd).toHaveBeenCalledTimes(1));
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "dismissed", {
      replay: false,
      lastStep: 1,
    });
  });

  it("a click on the mode menu dismisses it, and switching modes doesn't restart it", async () => {
    const user = userEvent.setup();
    const onTourEnd = vi.fn();
    await mount({ tours: { sign: true }, onTourEnd, allowedModes: ["edit", "view"] });
    await waitForStep("Your fields are highlighted");
    // A real click lands away from the spotlight (jsdom rects are all 0).
    await user.pointer({
      keys: "[MouseLeft]",
      target: screen.getByRole("button", { name: /fill & sign/i }),
      coords: { clientX: 400, clientY: 400 },
    });
    await waitFor(() => expect(onTourEnd).toHaveBeenCalledTimes(1));
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "dismissed", expect.anything());
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    // The same click went on to open the menu. Pick View, then come back
    // to Fill & Sign: no second automatic run in this editor.
    await user.click(
      within(await screen.findByRole("menu")).getByRole("menuitemradio", { name: /^view/i })
    );
    // The switch re-renders the header; a slow run needs a moment.
    await user.click(await screen.findByRole("button", { name: /^view/i }));
    await user.click(
      within(await screen.findByRole("menu")).getByRole("menuitemradio", { name: /fill & sign/i })
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onTourEnd).toHaveBeenCalledTimes(1);
  });

  it("closing the editor mid-tour reports it as dismissed", async () => {
    const onTourEnd = vi.fn();
    const { unmount } = await mount({ tours: { sign: true }, onTourEnd });
    await waitForStep("Your fields are highlighted");
    unmount();
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "dismissed", {
      replay: false,
      lastStep: 1,
    });
  });

  it("stores nothing itself: the host records what was seen", async () => {
    const user = userEvent.setup();
    await mount({ tours: { sign: true } });
    await waitForStep("Your fields are highlighted");
    const before = { ...window.localStorage };
    await clickTour(user, "Skip");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect({ ...window.localStorage }).toEqual(before);
    expect(Object.keys(window.localStorage).some((key) => /tour/i.test(key))).toBe(false);
  });
});

describe("Show tour", () => {
  it("replays the current mode's tour from More actions, with replay: true", async () => {
    const user = userEvent.setup();
    const onTourEnd = vi.fn();
    await mount({ tours: { sign: false }, onTourEnd });
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Show tour" }));
    await waitForStep("Your fields are highlighted");
    await settle();
    await clickTour(user, "Skip");
    await waitFor(() => expect(onTourEnd).toHaveBeenCalledTimes(1));
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "dismissed", {
      replay: true,
      lastStep: 1,
    });
  });

  it("is not offered in a mode without a tour", async () => {
    await mount({ mode: "view", allowedModes: ["edit", "view"], tours: {} });
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });
});

// Both Kera hosts that open Prepare mount the editor inside a modal Chakra
// Dialog, which blocks pointer events on <body> and closes on Esc or on a
// click outside its content. The tour has to live inside that dialog.
describe("inside a host's modal Dialog", () => {
  async function mountInDialog(props: Partial<PDFEditorProps> = {}) {
    const onOpenChange = vi.fn();
    renderWithChakra(
      <Dialog.Root open onOpenChange={onOpenChange} size="full">
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <PDFEditor src="fake://document.pdf" mode="edit" {...signer} {...props} />
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    );
    await waitFor(() => {
      if (!fieldEl(document.body, "f_name")) throw new Error("not mounted");
    });
    return { onOpenChange };
  }

  it("renders inside the dialog, so its buttons take clicks", async () => {
    // user-event refuses to click anything with `pointer-events: none`.
    const user = userEvent.setup();
    const onTourEnd = vi.fn();
    await mountInDialog({ tours: { sign: true }, onTourEnd });
    await waitForStep("Your fields are highlighted");
    await settle();
    expect(document.body.style.pointerEvents).toBe("none");
    expect(popover()!.closest(".pdf-editor-root")).not.toBeNull();
    await clickTour(user, "Next");
    await waitForStep("Go field by field");
    await clickTour(user, "Back");
    await waitForStep("Your fields are highlighted");
    await clickTour(user, "Skip");
    await waitFor(() => expect(onTourEnd).toHaveBeenCalledTimes(1));
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "dismissed", {
      replay: false,
      lastStep: 1,
    });
  });

  it("Esc ends the tour without closing the host dialog", async () => {
    const user = userEvent.setup();
    const onTourEnd = vi.fn();
    const { onOpenChange } = await mountInDialog({ tours: { sign: true }, onTourEnd });
    await waitForStep("Your fields are highlighted");
    await settle();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onTourEnd).toHaveBeenCalledTimes(1));
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "dismissed", {
      replay: false,
      lastStep: 1,
    });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onOpenChange).not.toHaveBeenCalled();
    // With the tour gone, Esc is the host's again.
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(onOpenChange).toHaveBeenCalledWith(expect.objectContaining({ open: false }))
    );
  });

  it("a click on the dimmed background ends the tour, not the host dialog", async () => {
    const user = userEvent.setup();
    const onTourEnd = vi.fn();
    const { onOpenChange } = await mountInDialog({ tours: { sign: true }, onTourEnd });
    await waitForStep("Your fields are highlighted");
    await settle();
    const backdrop = document.querySelector<HTMLElement>('[data-scope="tour"][data-part="backdrop"]')!;
    await user.pointer({
      keys: "[MouseLeft]",
      target: backdrop,
      coords: { clientX: 400, clientY: 400 },
    });
    await waitFor(() => expect(onTourEnd).toHaveBeenCalledTimes(1));
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "dismissed", {
      replay: false,
      lastStep: 1,
    });
    await settle();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
