import React, { useRef, useEffect, useCallback } from "react";
import styles from "./PageThumbnails.module.css";
import { PDFPageProxy, RenderTask } from "pdfjs-dist";

export interface PageThumbnailsProps {
  /** Array of PDF page proxies */
  pages: { proxy: PDFPageProxy }[];
  /** Currently active page (1-indexed) */
  activePage: number;
  /** Callback when a page is selected */
  onPageSelect: (pageNumber: number) => void;
  /** Whether the panel is collapsed */
  isCollapsed?: boolean;
  /** Toggle collapse */
  onToggleCollapse?: () => void;
}

const THUMBNAIL_SCALE = 0.2;

export const PageThumbnails: React.FC<PageThumbnailsProps> = ({
  pages,
  activePage,
  onPageSelect,
  isCollapsed = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderTasksRef = useRef<Map<number, RenderTask>>(new Map());
  const renderedPagesRef = useRef<Set<number>>(new Set());

  // Render thumbnails
  const renderThumbnail = useCallback(
    async (page: PDFPageProxy, canvas: HTMLCanvasElement) => {
      const pageNumber = page.pageNumber;

      // Skip if already rendered
      if (renderedPagesRef.current.has(pageNumber)) {
        return;
      }

      // Cancel any existing render task for this page
      const existingTask = renderTasksRef.current.get(pageNumber);
      if (existingTask) {
        existingTask.cancel();
        renderTasksRef.current.delete(pageNumber);
      }

      const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });
      const context = canvas.getContext("2d");

      if (!context) return;

      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = viewport.width * pixelRatio;
      canvas.height = viewport.height * pixelRatio;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      context.scale(pixelRatio, pixelRatio);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const renderTask = (page.render as any)({
          canvasContext: context,
          viewport,
        }) as RenderTask;

        renderTasksRef.current.set(pageNumber, renderTask);

        await renderTask.promise;
        renderedPagesRef.current.add(pageNumber);
        renderTasksRef.current.delete(pageNumber);
      } catch (error) {
        // Ignore cancellation errors
        if (
          error instanceof Error &&
          error.message.includes("Rendering cancelled")
        ) {
          return;
        }
        console.warn("Failed to render thumbnail:", error);
      }
    },
    []
  );

  // Render all thumbnails
  useEffect(() => {
    // Render sequentially to avoid concurrent canvas operations
    const renderSequentially = async () => {
      for (const page of pages) {
        const canvas = canvasRefs.current.get(page.proxy.pageNumber);
        if (canvas) {
          await renderThumbnail(page.proxy, canvas);
        }
      }
    };

    renderSequentially();

    // Cleanup on unmount
    return () => {
      renderTasksRef.current.forEach((task) => task.cancel());
      renderTasksRef.current.clear();
    };
  }, [pages, renderThumbnail]);

  // Scroll active page into view
  useEffect(() => {
    if (containerRef.current && activePage) {
      const activeElement = containerRef.current.querySelector(
        `[data-page="${activePage}"]`
      );
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [activePage]);

  if (isCollapsed) return null;

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.list}>
        {pages.map((page) => {
          const pageNumber = page.proxy.pageNumber;
          const isActive = pageNumber === activePage;

          return (
            <button
              key={pageNumber}
              type="button"
              className={`${styles.thumbnail} ${isActive ? styles.active : ""}`}
              onClick={() => onPageSelect(pageNumber)}
              data-page={pageNumber}
              aria-label={`Page ${pageNumber}`}
              aria-current={isActive ? "page" : undefined}
            >
              <div className={styles.canvasWrapper}>
                <canvas
                  ref={(el) => {
                    if (el) {
                      canvasRefs.current.set(pageNumber, el);
                    }
                  }}
                  className={styles.canvas}
                />
              </div>
              <span className={styles.pageNumber}>{pageNumber}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PageThumbnails;

