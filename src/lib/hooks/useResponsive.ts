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

const BREAKPOINTS = {
  mobile: 0,
  tablet: 640,
  desktop: 1024,
  wide: 1280,
} as const;

function getBreakpoint(width: number): Breakpoint {
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

    return () => {
      window.removeEventListener("resize", debouncedResize);
      window.removeEventListener("orientationchange", handleResize);
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



