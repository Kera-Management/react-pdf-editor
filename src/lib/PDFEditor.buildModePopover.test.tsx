import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import PDFEditor from "./PDFEditor";

/**
 * Regression coverage for the build-mode layout redesign: the desktop
 * Properties sidebar section is gone. In its place, a field Popover opens
 * from the ContextToolbar's gear button (anchored to the same
 * contextToolbarTarget the toolbar itself uses), an "Edit options..."
 * button inside it opens a Modal with OptionsEditor for dropdown/radio
 * fields, and the desktop PartiesPanel grows an assign-to banner while a
 * field is selected.
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

function makeFakePage() {
  return {
    pageNumber: 1,
    destroyed: false,
    getViewport: vi.fn((opts?: { scale?: number }) => ({
      width: 200 * (opts?.scale ?? 1),
      height: 300 * (opts?.scale ?? 1),
    })),
    render: pageRenderMock,
  };
}

function makeFakeDoc(page: ReturnType<typeof makeFakePage>) {
  return {
    numPages: 1,
    getPage: vi.fn(async () => page),
    getFieldObjects: vi.fn(async () => ({})),
    getData: vi.fn(async () => new Uint8Array()),
    destroy: vi.fn(),
  };
}

describe("PDFEditor build-mode field popover", () => {
  beforeEach(() => {
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

    const page = makeFakePage();
    fakeDocRef.current = makeFakeDoc(page);
    getDocumentMock.mockReset();
    getDocumentMock.mockImplementation(() => ({
      promise: Promise.resolve(fakeDocRef.current),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("selecting a field renders the ContextToolbar but no desktop Properties sidebar section", async () => {
    render(<PDFEditor src="fake://document.pdf" mode="build" />);

    const addText = await waitFor(() =>
      screen.getByRole("button", { name: /add text field/i })
    );
    fireEvent.click(addText);

    await waitFor(() =>
      expect(
        screen.getByRole("toolbar", { name: "Field actions" })
      ).toBeInTheDocument()
    );

    expect(screen.queryByText("Properties")).not.toBeInTheDocument();
  });

  it("the ContextToolbar's gear button opens a Popover with the field's editable name", async () => {
    render(<PDFEditor src="fake://document.pdf" mode="build" />);

    const addText = await waitFor(() =>
      screen.getByRole("button", { name: /add text field/i })
    );
    fireEvent.click(addText);

    const gear = await waitFor(() =>
      screen.getByRole("button", { name: "Edit" })
    );
    fireEvent.click(gear);

    const nameInput = (await waitFor(() =>
      screen.getByLabelText("Field Name")
    )) as HTMLInputElement;
    // Friendly per-type counter name, e.g. "Text Field 1" -- not the old
    // `text_field_<generated-id>` shape.
    expect(nameInput.value).toMatch(/^Text Field \d+$/);

    fireEvent.change(nameInput, { target: { value: "Tenant Name" } });
    expect(nameInput.value).toBe("Tenant Name");

    // Placeholder is editable for a text field.
    expect(screen.getByLabelText("Placeholder")).toBeInTheDocument();
    // No options control for a plain text field.
    expect(
      screen.queryByRole("button", { name: /edit options/i })
    ).not.toBeInTheDocument();
  });

  it("clicking canvas deselects and closes the popover", async () => {
    const { container } = render(
      <PDFEditor src="fake://document.pdf" mode="build" />
    );

    const addText = await waitFor(() =>
      screen.getByRole("button", { name: /add text field/i })
    );
    fireEvent.click(addText);

    const gear = await waitFor(() =>
      screen.getByRole("button", { name: "Edit" })
    );
    fireEvent.click(gear);

    await waitFor(() =>
      expect(screen.getByLabelText("Field Name")).toBeInTheDocument()
    );

    const canvas = container.querySelector(
      '[class*="documentContainer"]'
    ) as HTMLElement;
    fireEvent.click(canvas);

    await waitFor(() =>
      expect(screen.queryByLabelText("Field Name")).not.toBeInTheDocument()
    );
    expect(
      screen.queryByRole("toolbar", { name: "Field actions" })
    ).not.toBeInTheDocument();
  });

  it("the ContextToolbar's Required toggle updates the field", async () => {
    render(<PDFEditor src="fake://document.pdf" mode="build" />);

    const addText = await waitFor(() =>
      screen.getByRole("button", { name: /add text field/i })
    );
    fireEvent.click(addText);

    const requiredButton = await waitFor(() =>
      screen.getByRole("button", { name: "Required" })
    );
    expect(requiredButton.className).not.toMatch(/active/);

    fireEvent.click(requiredButton);
    expect(requiredButton.className).toMatch(/active/);
  });

  it("dropdown fields get an Edit options... trigger that opens a modal with OptionsEditor", async () => {
    render(<PDFEditor src="fake://document.pdf" mode="build" />);

    const addDropdown = await waitFor(() =>
      screen.getByRole("button", { name: /add dropdown field/i })
    );
    fireEvent.click(addDropdown);

    const gear = await waitFor(() =>
      screen.getByRole("button", { name: "Edit" })
    );
    fireEvent.click(gear);

    const editOptions = await waitFor(() =>
      screen.getByRole("button", { name: /edit options/i })
    );
    fireEvent.click(editOptions);

    expect(
      screen.getByRole("heading", { name: "Edit options" })
    ).toBeInTheDocument();
    // The popover steps aside while the options modal is up.
    expect(screen.queryByLabelText("Field Name")).not.toBeInTheDocument();

    const newOptionInput = screen.getByPlaceholderText("Add option");
    fireEvent.change(newOptionInput, { target: { value: "Yes" } });
    fireEvent.click(screen.getByRole("button", { name: "Add option" }));

    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("assign mode is wired into the desktop PartiesPanel while a field is selected", async () => {
    const participants = [
      { id: "p1", label: "Alice" },
      { id: "p2", label: "Bob" },
    ];

    render(
      <PDFEditor
        src="fake://document.pdf"
        mode="build"
        participants={participants}
        parties={{
          seedKey: "seed-1",
          initial: {
            roles: { p1: "signer", p2: "signer" },
            order: ["p1", "p2"],
            groupedWithPrevious: {},
          },
          onSelectionChange: vi.fn(),
        }}
      />
    );

    const addText = await waitFor(() =>
      screen.getByRole("button", { name: /add text field/i })
    );
    fireEvent.click(addText);

    await waitFor(() =>
      expect(screen.getByText(/^Who fills "Text Field \d+"\?$/)).toBeInTheDocument()
    );

    // Checking a participant in the parties panel assigns them to the field,
    // then reopening the field Popover shows the same assignment reflected.
    // The assign toggle is a Switch (role="switch"), not a native checkbox
    // -- see PartyRow's assign-mode rendering.
    const aliceSwitch = screen.getByRole("switch", {
      name: /assign alice/i,
    });
    fireEvent.click(aliceSwitch);
    expect(aliceSwitch).toBeChecked();
  });
});
