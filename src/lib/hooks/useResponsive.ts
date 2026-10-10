import { useState, useEffect, useCallback } from "react";

export type Breakpoint = "mobile" | "tablet" | "desktop" | "wide";

export interface ResponsiveState {
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWide: boolean;
  isTouchDevice: boolean;
  width: number;
  height: number;
}

/**
 * Lower bound (inclusive, CSS px) of each breakpoint. Mobile is `< 640`,
 * tablet `640-1023`, desktop `>= 1024` (spec §3.13, Q5).
 */
export const BREAKPOINTS = {
  mobile: 0,
  tablet: 640,
  desktop: 1024,
  wide: 1280,
} as const;

/**
 * Media queries that agree exactly with `getBreakpoint`. Use these instead of
 * hand-written `max-width: 640px` / `max-width: 1024px`, which also match
 * the first tablet / desktop pixel (640 and 1024) and so disagree with the JS
 * layout at exactly those widths. The `.98` upper bounds leave no gap for
 * fractional viewport widths (zoomed browsers) and no overlap.
 */
export const MEDIA_QUERIES = {
  mobile: `(max-width: ${BREAKPOINTS.tablet - 0.02}px)`,
  tablet: `(min-width: ${BREAKPOINTS.tablet}px) and (max-width: ${
    BREAKPOINTS.desktop - 0.02
  }px)`,
  desktop: `(min-width: ${BREAKPOINTS.desktop}px)`,
} as const;

export function getBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS.wide) return "wide";
  if (width >= BREAKPOINTS.desktop) return "desktop";
  if (width >= BREAKPOINTS.tablet) return "tablet";
  return "mobile";
}

function isTouchCapable(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-expect-error - msMaxTouchPoints is IE-specific
    navigator.msMaxTouchPoints > 0
  );
}

export function useResponsive(): ResponsiveState {
  const [state, setState] = useState<ResponsiveState>(() => {
    // SSR-safe initial state
    if (typeof window === "undefined") {
      return {
        breakpoint: "desktop",
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        isWide: false,
        isTouchDevice: false,
        width: 1024,
        height: 768,
      };
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    const breakpoint = getBreakpoint(width);

    return {
      breakpoint,
      isMobile: breakpoint === "mobile",
      isTablet: breakpoint === "tablet",
      isDesktop: breakpoint === "desktop" || breakpoint === "wide",
      isWide: breakpoint === "wide",
      isTouchDevice: isTouchCapable(),
      width,
      height,
    };
  });

  const handleResize = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const breakpoint = getBreakpoint(width);

    setState({
      breakpoint,
      isMobile: breakpoint === "mobile",
      isTablet: breakpoint === "tablet",
      isDesktop: breakpoint === "desktop" || breakpoint === "wide",
      isWide: breakpoint === "wide",
      isTouchDevice: isTouchCapable(),
      width,
      height,
    });
  }, []);

  useEffect(() => {
    // Set initial state on mount
    handleResize();

    // Debounced resize handler
    let timeoutId: ReturnType<typeof setTimeout>;
    const debouncedResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleResize, 100);
    };

    window.addEventListener("resize", debouncedResize);
    window.addEventListener("orientationchange", handleResize);

    // Crossing a breakpoint updates immediately rather than after the resize
    // debounce, so the JS layout never lags the CSS that keys off the same
    // boundaries (MEDIA_QUERIES).
    const boundaryQueries =
      typeof window.matchMedia === "function"
        ? [
            window.matchMedia(MEDIA_QUERIES.mobile),
            window.matchMedia(MEDIA_QUERIES.desktop),
          ]
        : [];
    boundaryQueries.forEach((mq) =>
      mq.addEventListener?.("change", handleResize)
    );

    return () => {
      window.removeEventListener("resize", debouncedResize);
      window.removeEventListener("orientationchange", handleResize);
      boundaryQueries.forEach((mq) =>
        mq.removeEventListener?.("change", handleResize)
      );
      clearTimeout(timeoutId);
    };
  }, [handleResize]);

  return state;
}

// Hook for checking specific breakpoints
export function useBreakpoint(breakpoint: Breakpoint): boolean {
  const { width } = useResponsive();
  return width >= BREAKPOINTS[breakpoint];
}

// Hook for media query
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

export default useResponsive;



