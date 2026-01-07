import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./ResponsiveDrawer.module.css";

export interface ResponsiveDrawerProps {
  /** Content to render inside the drawer */
  children: React.ReactNode;
  /** Title shown in the drawer header */
  title: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Icon to show in the mobile collapsed state */
  icon?: React.ReactNode;
  /** Position of the drawer - left sidebar or right sidebar on desktop */
  position?: "left" | "right";
  /** Whether the drawer is open (controlled mode) */
  isOpen?: boolean;
  /** Callback when drawer open state changes */
  onOpenChange?: (isOpen: boolean) => void;
  /** Whether to show the drawer at all */
  visible?: boolean;
  /** Additional class name */
  className?: string;
  /** Badge count to show on collapsed mobile state */
  badgeCount?: number;
}

const MOBILE_BREAKPOINT = 768;

export const ResponsiveDrawer: React.FC<ResponsiveDrawerProps> = ({
  children,
  title,
  subtitle,
  icon,
  position = "left",
  isOpen: controlledIsOpen,
  onOpenChange,
  visible = true,
  className = "",
  badgeCount,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const touchCurrentY = useRef<number>(0);
  const isDragging = useRef(false);

  // Use controlled state if provided, otherwise internal
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = useCallback(
    (value: boolean) => {
      if (onOpenChange) {
        onOpenChange(value);
      } else {
        setInternalIsOpen(value);
      }
    },
    [onOpenChange]
  );

  // Check for mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Close drawer when clicking outside on mobile
  useEffect(() => {
    if (!isMobile || !isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMobile, isOpen, setIsOpen]);

  // Handle touch gestures for swipe to close
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchCurrentY.current = e.touches[0].clientY;
    const deltaY = touchCurrentY.current - touchStartY.current;
    
    // Only start dragging if moving downward significantly
    if (deltaY > 10) {
      isDragging.current = true;
    }

    // Apply transform while dragging
    if (isDragging.current && drawerRef.current) {
      const translateY = Math.max(0, deltaY);
      drawerRef.current.style.transform = `translateY(${translateY}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!drawerRef.current) return;

    const deltaY = touchCurrentY.current - touchStartY.current;
    
    // Reset transform
    drawerRef.current.style.transform = "";

    // Close if swiped down more than 100px
    if (isDragging.current && deltaY > 100) {
      setIsOpen(false);
    }

    isDragging.current = false;
  }, [setIsOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, setIsOpen]);

  if (!visible) return null;

  // Desktop sidebar
  if (!isMobile) {
    return (
      <aside
        ref={drawerRef}
        className={`${styles.sidebar} ${styles[position]} ${className}`}
        role="complementary"
        aria-label={title}
      >
        <div className={styles.sidebarHeader}>
          <div className={styles.headerContent}>
            {icon && <span className={styles.headerIcon}>{icon}</span>}
            <div className={styles.headerText}>
              <h2 className={styles.title}>{title}</h2>
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
          </div>
        </div>
        <div className={styles.sidebarContent}>{children}</div>
      </aside>
    );
  }

  // Mobile bottom drawer
  return (
    <>
      {/* Collapsed trigger button */}
      {!isOpen && (
        <button
          className={`${styles.mobileTrigger} ${styles[position]}`}
          onClick={() => setIsOpen(true)}
          aria-label={`Open ${title}`}
          aria-expanded={false}
        >
          {icon && <span className={styles.triggerIcon}>{icon}</span>}
          <span className={styles.triggerLabel}>{title}</span>
          {badgeCount !== undefined && badgeCount > 0 && (
            <span className={styles.badge}>{badgeCount}</span>
          )}
        </button>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          className={styles.backdrop}
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ""} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className={styles.dragHandle}>
          <div className={styles.dragBar} />
        </div>

        {/* Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.headerContent}>
            {icon && <span className={styles.headerIcon}>{icon}</span>}
            <div className={styles.headerText}>
              <h2 className={styles.title}>{title}</h2>
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
          </div>
          <button
            className={styles.closeButton}
            onClick={() => setIsOpen(false)}
            aria-label="Close drawer"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className={styles.drawerContent}>{children}</div>
      </div>
    </>
  );
};

export default ResponsiveDrawer;



