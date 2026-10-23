import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import type { PDFEditorMode } from "../PDFEditor";
import { useEditorTour, type UseEditorTourOptions } from "./useEditorTour";
import { TOUR_FOR_MODE, presentSteps, type EditorTourContext } from "./steps";

/**
 * Start/stop rules of the tour controller (guided tour spec §5.3), against
 * a bare set of anchors rather than a whole editor.
 */

let root: HTMLDivElement;

beforeEach(() => {
  root = document.createElement("div");
  root.innerHTML = `
    <div data-pdfe-tour="canvas">
      <div id="page_div_container_1">
        <input data-field-id="f_name" />
        <button data-field-id="f_sig" data-field-name="sig"></button>
      </div>
    </div>
    <section data-pdfe-tour="progress"></section>
    <button data-pdfe-tour="save">Save</button>
  `;
  document.body.appendChild(root);
});

afterEach(() => {
  root.remove();
});

const context = (overrides: Partial<EditorTourContext> = {}): EditorTourContext => ({
  root,
  saveLabel: "Save",
  canDecline: false,
  hasSavedSignature: false,
  signVariant: "original",
  mode: "edit",
  modes: ["build", "edit", "view"],
  openModeMenu: () => {},
  ...overrides,
});

type Props = Partial<UseEditorTourOptions> & { mode: PDFEditorMode };

const setup = (initial: Props) => {
  const onTourEnd = vi.fn();
  const onEnded = vi.fn();
  const hook = renderHook((props: Props) =>
    useEditorTour({
      ready: true,
      blocked: false,
      getContext: () => context(),
      onTourEnd,
      onEnded,
      ...props,
    }),
    { initialProps: initial }
  );
  return { ...hook, onTourEnd, onEnded };
};

describe("mode to tour", () => {
  it("maps modes to tours and nothing else", () => {
    expect(TOUR_FOR_MODE).toEqual({
      build: "pdf_prepare",
      edit: "pdf_sign",
      view: null,
      // Defaults mode has no tour.
      defaults: null,
    });
  });

  it("has no tour in View", () => {
    const view = setup({ mode: "view", tours: { sign: true, prepare: true } });
    expect(view.result.current.active).toBeNull();
    expect(view.result.current.canReplay).toBe(false);
  });

  it("runs the Prepare tour in Prepare, and only when `prepare` is unseen", () => {
    root.innerHTML += `<button data-pdfe-tour="mode-menu">Prepare</button>`;
    const build = setup({ mode: "build", tours: { prepare: true } });
    expect(build.result.current.active?.tourId).toBe("pdf_prepare");
    expect(build.result.current.isPending("pdf_sign")).toBe(false);
    // `sign` unseen says nothing about the Prepare tour.
    expect(setup({ mode: "build", tours: { sign: true } }).result.current.active).toBeNull();
    expect(setup({ mode: "build", tours: {} }).result.current.canReplay).toBe(true);
  });
});

describe("automatic start", () => {
  it("starts the mode's tour when the host says it is unseen", () => {
    const { result } = setup({ mode: "edit", tours: { sign: true } });
    expect(result.current.active?.tourId).toBe("pdf_sign");
    expect(result.current.active?.replay).toBe(false);
    expect(result.current.active?.steps.map((s) => s.id)).toEqual([
      "pdf_sign-intro",
      "sign-fields",
      "sign-progress",
      "sign-signature",
      "sign-finish",
    ]);
  });

  it("does not start without `tours`, or with the tour marked seen", () => {
    expect(setup({ mode: "edit" }).result.current.active).toBeNull();
    expect(setup({ mode: "edit", tours: { sign: false } }).result.current.active).toBeNull();
    // `prepare` unseen says nothing about the sign tour.
    expect(setup({ mode: "edit", tours: { prepare: true } }).result.current.active).toBeNull();
  });

  it("waits until the editor is ready and nothing blocks it", () => {
    const { result, rerender } = setup({
      mode: "edit",
      tours: { sign: true },
      ready: false,
    });
    expect(result.current.active).toBeNull();
    rerender({ mode: "edit", tours: { sign: true }, ready: true, blocked: true });
    expect(result.current.active).toBeNull();
    rerender({ mode: "edit", tours: { sign: true }, ready: true, blocked: false });
    expect(result.current.active?.tourId).toBe("pdf_sign");
  });

  it("runs once per mounted editor, even if the host still says unseen", () => {
    const { result, rerender, onTourEnd } = setup({ mode: "edit", tours: { sign: true } });
    act(() => result.current.end("completed"));
    // Ended before any step change: still on the intro card, step 0.
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "completed", {
      replay: false,
      lastStep: 0,
    });
    rerender({ mode: "view", tours: { sign: true } });
    rerender({ mode: "edit", tours: { sign: true } });
    expect(result.current.active).toBeNull();
    expect(result.current.isPending("pdf_sign")).toBe(false);
  });

  it("starts no other tour after one is skipped, until the editor remounts", () => {
    root.innerHTML += `<button data-pdfe-tour="mode-menu">Prepare</button>`;
    const tours = { prepare: true, sign: true };
    const { result, rerender, onTourEnd } = setup({ mode: "build", tours });
    expect(result.current.active?.tourId).toBe("pdf_prepare");
    act(() => result.current.end("dismissed"));
    rerender({ mode: "edit", tours });
    expect(result.current.active).toBeNull();
    // Not pending either, so the mobile friendly hint isn't held for it.
    expect(result.current.isPending("pdf_sign")).toBe(false);
    expect(onTourEnd).toHaveBeenCalledTimes(1);
    // Show tour still replays it.
    act(() => result.current.replay());
    expect(result.current.active?.tourId).toBe("pdf_sign");
  });

  it("still starts the next mode's tour after one is completed", () => {
    root.innerHTML += `<button data-pdfe-tour="mode-menu">Prepare</button>`;
    const tours = { prepare: true, sign: true };
    const { result, rerender } = setup({ mode: "build", tours });
    act(() => result.current.end("completed"));
    rerender({ mode: "edit", tours });
    expect(result.current.active?.tourId).toBe("pdf_sign");
  });

  it("starts nothing, and reports nothing, when no step has an anchor", () => {
    root.innerHTML = "";
    const { result, onTourEnd } = setup({ mode: "edit", tours: { sign: true } });
    expect(result.current.active).toBeNull();
    expect(onTourEnd).not.toHaveBeenCalled();
  });
});

describe("ending", () => {
  it("ends as dismissed on a mode switch, with the last step shown", () => {
    const { result, rerender, onTourEnd } = setup({ mode: "edit", tours: { sign: true } });
    act(() => result.current.onStepChange(3));
    rerender({ mode: "view", tours: { sign: true } });
    expect(result.current.active).toBeNull();
    expect(onTourEnd).toHaveBeenCalledTimes(1);
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "dismissed", {
      replay: false,
      lastStep: 3,
    });
  });

  it("ends as dismissed when a dialog, drawer or the review takes over", () => {
    const { result, rerender, onTourEnd } = setup({ mode: "edit", tours: { sign: true } });
    rerender({ mode: "edit", tours: { sign: true }, blocked: true });
    expect(result.current.active).toBeNull();
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "dismissed", expect.anything());
  });

  it("reports a tour cut short by the editor closing", () => {
    const { unmount, onTourEnd } = setup({ mode: "edit", tours: { sign: true } });
    unmount();
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "dismissed", {
      replay: false,
      lastStep: 0,
    });
  });

  it("reports each run once, and tells the editor which run ended", () => {
    const { result, onTourEnd, onEnded } = setup({ mode: "edit", tours: { sign: true } });
    const run = result.current.active;
    act(() => {
      result.current.dismiss();
      result.current.dismiss();
    });
    expect(onTourEnd).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith(run);
  });
});

describe("replay", () => {
  it("is offered only when the host opted into tours and the mode has one", () => {
    expect(setup({ mode: "edit" }).result.current.canReplay).toBe(false);
    expect(setup({ mode: "edit", tours: {} }).result.current.canReplay).toBe(true);
    expect(setup({ mode: "view", tours: {} }).result.current.canReplay).toBe(false);
  });

  it("replays a seen tour with replay: true", () => {
    const { result, onTourEnd } = setup({ mode: "edit", tours: { sign: false } });
    act(() => result.current.replay());
    expect(result.current.active?.replay).toBe(true);
    act(() => result.current.end("dismissed"));
    expect(onTourEnd).toHaveBeenCalledWith("pdf_sign", "dismissed", {
      replay: true,
      lastStep: 0,
    });
  });

  it("can replay after the automatic run in the same editor", () => {
    const { result } = setup({ mode: "edit", tours: { sign: true } });
    act(() => result.current.end("completed"));
    act(() => result.current.replay());
    expect(result.current.active?.replay).toBe(true);
  });
});

describe("intro card", () => {
  it("opens every tour, points at nothing and is the only intro", () => {
    root.innerHTML += `<button data-pdfe-tour="mode-menu">Prepare</button>`;
    for (const tourId of ["pdf_sign", "pdf_prepare"] as const) {
      const all = presentSteps(tourId, context({ mode: tourId === "pdf_sign" ? "edit" : "build" }));
      expect(all[0]).toMatchObject({ id: `${tourId}-intro`, kind: "intro" });
      expect(all[0].target()).toBeNull();
      expect(all.filter((s) => s.kind === "intro")).toHaveLength(1);
    }
  });

  it("titles the Prepare intro", () => {
    root.innerHTML += `<button data-pdfe-tour="mode-menu">Prepare</button>`;
    const [intro] = presentSteps("pdf_prepare", context({ mode: "build" }));
    expect(intro.title).toBe("Quick tour: preparing a document");
  });

  it("counts the sign tour's tips in its intro", () => {
    const [intro] = presentSteps("pdf_sign", context());
    expect(intro.title).toBe("Quick tour: signing");
    expect(intro.body).toBe(
      "Four quick tips on finding your fields, signing and submitting."
    );
    root.querySelector("[data-field-id='f_sig']")!.setAttribute("disabled", "");
    expect(presentSteps("pdf_sign", context())[0].body).toMatch(/^Three quick tips/);
  });

  it("is left out with the tour when no step has an anchor", () => {
    root.innerHTML = "";
    expect(presentSteps("pdf_sign", context())).toEqual([]);
  });
});

describe("sign tour steps (Variant A)", () => {
  // The steps after the intro card.
  const signSteps = (overrides: Partial<EditorTourContext> = {}) =>
    presentSteps("pdf_sign", context(overrides)).filter((s) => s.kind !== "intro");
  const ids = (overrides: Partial<EditorTourContext> = {}) =>
    signSteps(overrides).map((s) => s.id);

  it("skips the signature step when there is no signature field of yours", () => {
    root.querySelector("[data-field-id='f_sig']")!.setAttribute("disabled", "");
    expect(ids()).toEqual(["sign-fields", "sign-progress", "sign-finish"]);
  });

  it("skips the progress step when its panel isn't showing", () => {
    (root.querySelector("[data-pdfe-tour='progress']") as HTMLElement).hidden = true;
    expect(ids()).toEqual(["sign-fields", "sign-signature", "sign-finish"]);
  });

  it("points the first step at your first field, skipping others' fields", () => {
    root.querySelector("input")!.setAttribute("data-pdfe-gated", "");
    const [first] = signSteps();
    // f_name is gated; the next fillable overlay is the signature.
    expect(first.target()?.dataset.fieldId).toBe("f_sig");
  });

  it("falls back to the document when none of your fields can be filled", () => {
    root.querySelectorAll("[data-field-id]").forEach((el) => el.setAttribute("disabled", ""));
    const [first] = signSteps();
    expect(first.target()?.dataset.pdfeTour).toBe("canvas");
  });
});

describe("Prepare tour steps", () => {
  beforeEach(() => {
    root.innerHTML = `
      <button data-pdfe-tour="mode-menu">Prepare</button>
      <div data-pdfe-tour="mode-menu-content" hidden></div>
      <section data-pdfe-tour="field-palette"></section>
      <section data-pdfe-tour="parties"></section>
      <button data-pdfe-tour="save">Save</button>
    `;
  });

  // The steps after the intro card.
  const steps = (overrides: Partial<EditorTourContext> = {}) =>
    presentSteps("pdf_prepare", context({ mode: "build", ...overrides })).filter(
      (s) => s.kind !== "intro"
    );
  const ids = (overrides: Partial<EditorTourContext> = {}) =>
    steps(overrides).map((s) => s.id);

  it("has five steps when the mode switcher shows", () => {
    expect(ids()).toEqual([
      "prepare-modes",
      "prepare-fields",
      "prepare-parties",
      "prepare-save",
      "prepare-fill-sign",
    ]);
  });

  it("drops the mode steps (1 and 5) with a single mode", () => {
    expect(ids({ modes: ["build"] })).toEqual([
      "prepare-fields",
      "prepare-parties",
      "prepare-save",
    ]);
  });

  it("drops step 5 when Fill & Sign isn't offered", () => {
    expect(ids({ modes: ["build", "view"] })).toEqual([
      "prepare-modes",
      "prepare-fields",
      "prepare-parties",
      "prepare-save",
    ]);
  });

  it("skips the parties step when its panel isn't showing", () => {
    root.querySelector("[data-pdfe-tour='parties']")!.remove();
    expect(ids()).not.toContain("prepare-parties");
  });

  it("points step 2 at the palette, else the mobile Add field pill", () => {
    expect(steps()[1].target()?.dataset.pdfeTour).toBe("field-palette");
    (root.querySelector("[data-pdfe-tour='field-palette']") as HTMLElement).hidden = true;
    root.innerHTML += `<button data-pdfe-tour="add-field">Add field</button>`;
    const fields = steps().find((s) => s.id === "prepare-fields")!;
    expect(fields.target()?.dataset.pdfeTour).toBe("add-field");
  });

  it("step 1 opens the mode menu, shows once it is open, and closes it after", async () => {
    const openModeMenu = vi.fn((open: boolean) => {
      (root.querySelector("[data-pdfe-tour='mode-menu-content']") as HTMLElement).hidden =
        !open;
    });
    const [first] = steps({ openModeMenu });
    // Closed menu: the step still has the button to point at.
    expect(first.target()?.dataset.pdfeTour).toBe("mode-menu");
    const show = vi.fn();
    const undo = first.prepare!(show);
    expect(openModeMenu).toHaveBeenLastCalledWith(true);
    await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(1));
    expect(first.target()?.dataset.pdfeTour).toBe("mode-menu-content");
    undo();
    expect(openModeMenu).toHaveBeenLastCalledWith(false);
  });

  it("names the mode the editor is in and only the modes offered", () => {
    const { container } = render(<>{steps({ modes: ["build", "edit"] })[0].body}</>);
    expect(steps({ modes: ["build", "edit"] })[0].title).toBe("Two modes");
    expect(container.textContent).toBe(
      "You're in Prepare. Prepare places fields and picks signers. Fill & Sign completes your own fields. Switch here."
    );
  });
});
