import { useRef, useEffect, useCallback } from "react";

export interface GestureState {
  isPinching: boolean;
  isPanning: boolean;
  scale: number;
  panX: number;
  panY: number;
}

export interface UseGesturesOptions {
  /** Target element ref */
  targetRef: React.RefObject<HTMLElement>;
  /** Called when pinch gesture changes zoom */
  onZoomChange?: (delta: number) => void;
  /** Called when pan gesture moves */
  onPan?: (deltaX: number, deltaY: number) => void;
  /** Called when swipe detected (left/right) */
  onSwipe?: (direction: "left" | "right" | "up" | "down") => void;
  /** Minimum distance for swipe detection */
  swipeThreshold?: number;
  /** Enable pinch to zoom */
  enablePinch?: boolean;
  /** Enable pan gesture */
  enablePan?: boolean;
  /** Enable swipe gesture */
  enableSwipe?: boolean;
}

export function useGestures(options: UseGesturesOptions) {
  const {
    targetRef,
    onZoomChange,
    onPan,
    onSwipe,
    swipeThreshold = 50,
    enablePinch = true,
    enablePan = true,
    enableSwipe = true,
  } = options;

  // Pinch state
  const lastPinchDistance = useRef(0);
  const isPinching = useRef(false);

  // Pan state
  const isPanning = useRef(false);
  const lastPanX = useRef(0);
  const lastPanY = useRef(0);

  // Swipe state
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);

  const getDistance = useCallback((touch1: Touch, touch2: Touch) => {
    return Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    );
  }, []);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length === 2 && enablePinch) {
        // Pinch start
        isPinching.current = true;
        lastPinchDistance.current = getDistance(e.touches[0], e.touches[1]);
      } else if (e.touches.length === 1) {
        // Single touch - potential pan or swipe
        const touch = e.touches[0];
        touchStartX.current = touch.clientX;
        touchStartY.current = touch.clientY;
        touchStartTime.current = Date.now();

        if (enablePan) {
          isPanning.current = true;
          lastPanX.current = touch.clientX;
          lastPanY.current = touch.clientY;
        }
      }
    },
    [enablePinch, enablePan, getDistance]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length === 2 && isPinching.current && enablePinch) {
        e.preventDefault();
        const distance = getDistance(e.touches[0], e.touches[1]);
        const delta = distance - lastPinchDistance.current;
        const threshold = 30;

        if (Math.abs(delta) > threshold) {
          onZoomChange?.(delta > 0 ? 1 : -1);
          lastPinchDistance.current = distance;
        }
      } else if (e.touches.length === 1 && isPanning.current && enablePan) {
        const touch = e.touches[0];
        const deltaX = touch.clientX - lastPanX.current;
        const deltaY = touch.clientY - lastPanY.current;

        onPan?.(deltaX, deltaY);

        lastPanX.current = touch.clientX;
        lastPanY.current = touch.clientY;
      }
    },
    [enablePinch, enablePan, getDistance, onZoomChange, onPan]
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (isPinching.current) {
        isPinching.current = false;
        lastPinchDistance.current = 0;
      }

      if (isPanning.current) {
        isPanning.current = false;
      }

      // Check for swipe
      if (enableSwipe && e.changedTouches.length === 1) {
        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - touchStartX.current;
        const deltaY = touch.clientY - touchStartY.current;
        const elapsed = Date.now() - touchStartTime.current;

        // Must be fast and far enough
        if (elapsed < 300) {
          const absX = Math.abs(deltaX);
          const absY = Math.abs(deltaY);

          if (absX > swipeThreshold && absX > absY) {
            onSwipe?.(deltaX > 0 ? "right" : "left");
          } else if (absY > swipeThreshold && absY > absX) {
            onSwipe?.(deltaY > 0 ? "down" : "up");
          }
        }
      }
    },
    [enableSwipe, swipeThreshold, onSwipe]
  );

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    target.addEventListener("touchstart", handleTouchStart, { passive: false });
    target.addEventListener("touchmove", handleTouchMove, { passive: false });
    target.addEventListener("touchend", handleTouchEnd);

    return () => {
      target.removeEventListener("touchstart", handleTouchStart);
      target.removeEventListener("touchmove", handleTouchMove);
      target.removeEventListener("touchend", handleTouchEnd);
    };
  }, [targetRef, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    isPinching: isPinching.current,
    isPanning: isPanning.current,
  };
}

export default useGestures;



