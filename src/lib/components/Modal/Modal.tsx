import React, { useCallback, useEffect, useId, useRef } from "react";
import { X } from "@phosphor-icons/react";
import { BottomSheet } from "../Mobile/BottomSheet";
import { useResponsive } from "../../hooks/useResponsive";
import styles from "./Modal.module.css";

export type ModalSize = "sm" | "md" | "lg";

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called on Escape, backdrop click, close button, or (mobile) sheet dismissal */
  onClose: () => void;
  /** Dialog title, also wired to aria-labelledby */
  title: string;
  /** Dialog content */
  children: React.ReactNode;
  /** Optional footer content, typically action buttons */
  footer?: React.ReactNode;
  /** Desktop dialog width preset */
  size?: ModalSize;
}

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
 * Native modal primitive: a centered focus-trapped dialog on desktop, the
 * existing BottomSheet on mobile. Storage- and domain-agnostic -- hosts
 * decide what goes in `children`/`footer`.
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
}) => {
  const { isMobile } = useResponsive();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // On open: remember the opener and move focus into the dialog.
  // On close (or unmount): restore focus to the opener.
  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const node = dialogRef.current;
    if (node) {
      const focusable = getFocusable(node);
      (focusable[0] ?? node).focus();
    }

    return () => {
      previouslyFocusedRef.current?.focus();
    };
  }, [isOpen]);

  // Escape closes regardless of desktop dialog vs mobile sheet.
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const handleTabTrap = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;

    const node = dialogRef.current;
    if (!node) return;

    const focusable = getFocusable(node);
    if (focusable.length === 0) {
      e.preventDefault();
      node.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || !node.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !node.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  const handleBackdropMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose} title={title} snapPoint="partial">
        <div className={styles.mobileBody}>{children}</div>
        {footer && <div className={styles.mobileFooter}>{footer}</div>}
      </BottomSheet>
    );
  }

  return (
    <div
      className={styles.backdrop}
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={dialogRef}
        className={`${styles.dialog} ${styles[size]}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleTabTrap}
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
            <X weight="bold" size={18} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
