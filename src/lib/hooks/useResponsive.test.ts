import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  BREAKPOINTS,
  MEDIA_QUERIES,
  getBreakpoint,
  useResponsive,
} from "./useResponsive";

describe("getBreakpoint", () => {
  it.each([
    [320, "mobile"],
    [639, "mobile"],
    [639.5, "mobile"],
    [640, "tablet"],
    [800, "tablet"],
    [1023, "tablet"],
    [1024, "desktop"],
    [1279, "desktop"],
    [1280, "wide"],
  ] as const)("%spx is %s", (width, expected) => {
    expect(getBreakpoint(width)).toBe(expected);
  });
});

describe("MEDIA_QUERIES", () => {
  // The old CSS used `max-width: 640px` / `max-width: 1024px`, which also
  // match 640 and 1024, where the JS already says tablet / desktop.
  it("does not include the first tablet or desktop pixel in the range below it", () => {
    expect(MEDIA_QUERIES.mobile).toBe("(max-width: 639.98px)");
    expect(MEDIA_QUERIES.tablet).toBe(
      "(min-width: 640px) and (max-width: 1023.98px)"
    );
    expect(MEDIA_QUERIES.desktop).toBe("(min-width: 1024px)");
    expect(BREAKPOINTS.tablet).toBe(640);
    expect(BREAKPOINTS.desktop).toBe(1024);
  });
});

describe("useResponsive", () => {
  const original = window.innerWidth;
  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: original,
    });
    vi.useRealTimers();
  });

  const setWidth = (w: number) =>
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: w,
    });

  it("reports tablet at exactly 640px and desktop at exactly 1024px", () => {
    vi.useFakeTimers();
    setWidth(640);
    const { result } = renderHook(() => useResponsive());
    expect(result.current.isTablet).toBe(true);
    expect(result.current.isMobile).toBe(false);

    setWidth(1024);
    act(() => {
      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(150);
    });
    expect(result.current.isDesktop).toBe(true);
    expect(result.current.isTablet).toBe(false);

    setWidth(639);
    act(() => {
      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(150);
    });
    expect(result.current.isMobile).toBe(true);
  });
});
