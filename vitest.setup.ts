import "@testing-library/jest-dom/vitest";

// jsdom has no IntersectionObserver -- PDFEditor's live page-tracking
// effect (LIVE PAGE TRACKING) constructs one on mount, which would throw
// "IntersectionObserver is not defined" in every test that renders the
// editor. This stub never actually reports intersections; it only has to
// exist and be harmless so `new IntersectionObserver(...)` and its
// `observe`/`disconnect` calls don't crash. Tests that need activePage to
// move still drive it directly via the thumbnail click path.
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  // No constructor: PDFEditor's real call site passes a callback/options
  // pair (per the real IntersectionObserver signature), but this stub never
  // uses either -- omitting the constructor entirely avoids unused-param
  // lint noise while staying callable the same way (extra runtime args to
  // a zero-arg constructor are simply ignored).
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
}

// jsdom also has no Element.scrollTo (unlike scrollIntoView, which
// individual test files already stub per-file where they need it).
// PDFEditor's guided-navigation jump (handleFieldFocus) -- now also
// triggered automatically by the SIGNER COMPLETION auto-scroll effect on
// document load, not just by an explicit Start/Next click -- calls it on
// the scroll container. A no-op default here keeps every test environment
// working without each test file having to know about this.
if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollTo !== "function"
) {
  Element.prototype.scrollTo = function scrollTo() {};
}

// jsdom has no ResizeObserver. Chakra's floating parts (Popover, Menu,
// Tooltip) start floating-ui's autoUpdate, SegmentGroup measures its
// indicator, and PDFEditor's fit-to-width re-fit (B7/C4) observes the
// scroller; all construct one. Without this the run ends with unhandled
// "ResizeObserver is not defined" errors. Inert: it never reports a resize
// (tests drive layout changes through window "resize" events instead).
class InertResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver =
    InertResizeObserver as unknown as typeof ResizeObserver;
}
