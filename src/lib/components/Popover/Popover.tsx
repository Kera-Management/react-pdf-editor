import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { positionFloatingElement } from "../shared/positionFloating";
import styles from "./Popover.module.css";

export interface PopoverProps {
  /** Whether the popover is open. Unmounts entirely when false. */
  isOpen: boolean;
  /** Called on Escape, outside click, or the close button. */
  onClose: () => void;
  /** Rect of the element the popover is anchored to. `null` keeps it closed. */
  anchorRect: DOMRect | null;
  /** Container the popover is clamped inside; falls back to the viewport. */
  containerRef?: React.RefObject<HTMLElement>;
  /** Header title, also wired to aria-labelledby. */
  title: string;
  /** Popover body content. */
  children: React.ReactNode;
  /** Optional footer content, typically action buttons. */
  footer?: React.ReactNode;
  /** Explicit width. Accepts a number (px) or any CSS length. Falls back to
   * the design system's default panel width when omitted. */
  width?: number | string;
}

// Mirrors --space-2 (8px) -- the gap between the anchor and the popover.
// positionFloatingElement takes this as a plain number (it does its own
// layout math, not CSS), so it can't reference the token directly.
const GAP = 8;

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((el) => !el.hasAttribute("disabled"));
}

/**
 * Non-modal floating panel primitive: anchored to a target rect (a field on
 * canvas, a toolbar button, ...), self-measuring, flip/clamp positioned via
 * the shared `positionFloatingElement` math. Storage- and domain-agnostic --
 * hosts decide what goes in `children`/`footer`.
 */
export const Popover: React.FC<PopoverProps> = ({
  isOpen,
  onClose,
  anchorRect,
  containerRef,
  title,
  children,
  footer,
  width,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [placement, setPlacement] = useState<"top" | "bottom">("bottom");

  const isVisible = isOpen && !!anchorRect;

  // Measure the popover's own rendered size and position it relative to the
  // anchor, flipping/clamping via the shared positioning math.
  useLayoutEffect(() => {
    if (!isVisible || !anchorRect || !popoverRef.current) return;

    const elementRect = popoverRef.current.getBoundingClientRect();
    const containerRect = containerRef?.current?.getBoundingClientRect();

    const result = positionFloatingElement(
      anchorRect,
      elementRect,
      containerRect,
      GAP
    );

    setCoords({ x: result.x, y: result.y });
    setPlacement(result.placement);
  }, [isVisible, anchorRect, containerRef]);

  // On open: remember the opener and move focus into the popover.
  // On close (or unmount): restore focus to the opener.
  useEffect(() => {
    if (!isVisible) return undefined;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const node = popoverRef.current;
    if (node) {
      const focusable = getFocusable(node);
      (focusable[0] ?? node).focus();
    }

    return () => {
      previouslyFocusedRef.current?.focus();
    };
  }, [isVisible]);

  // Escape closes, same as Modal.
  useEffect(() => {
    if (!isVisible) return undefined;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isVisible, onClose]);

  // Outside click closes. No focus trap here (unlike Modal) -- a popover is
  // a non-modal auxiliary panel anchored to a field/button, so Tab is
  // allowed to leave it and continue through the rest of the page.
  useEffect(() => {
    if (!isVisible) return undefined;

    const handleMouseDown = (e: MouseEvent) => {
      const node = popoverRef.current;
      if (node && node.contains(e.target as Node)) return;
      onClose();
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div
      ref={popoverRef}
      className={`${styles.popover} ${styles[placement]}`}
      style={{
        left: coords.x,
        top: coords.y,
        ...(width !== undefined
          ? { width: typeof width === "number" ? `${width}px` : width }
          : {}),
      }}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close"
        >
          <X weight="bold" size={16} />
        </button>
      </div>
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  );
};

export default Popover;
