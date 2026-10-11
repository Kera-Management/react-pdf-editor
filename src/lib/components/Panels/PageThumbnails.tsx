import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Box, SimpleGrid, Skeleton, Stack, Text } from "@chakra-ui/react";
import type { PDFPageProxy, RenderTask } from "pdfjs-dist";

export interface PageThumbnailsProps {
  /** Array of PDF page proxies */
  pages: { proxy: PDFPageProxy }[];
  /** Currently active page (1-indexed) */
  activePage: number;
  /** Callback when a page is selected */
  onPageSelect: (pageNumber: number) => void;
  /**
   * "list" (default): one column, and the list is its own scroll container
   * (the desktop rail). "grid": two columns that grow with their content, for
   * a parent that scrolls (the mobile Pages drawer, spec §3.11).
   */
  layout?: "list" | "grid";
}

/** Thumbnail render scale (PDF points to CSS px). Letter width 612pt -> 153px. */
const THUMBNAIL_SCALE = 0.25;
/** Prefetch thumbnails a little before they scroll into view. */
const ROOT_MARGIN = "200px 0px";

const isCancellation = (error: unknown) =>
  error instanceof Error &&
  (error.name === "RenderingCancelledException" ||
    error.message.includes("Rendering cancelled"));

/**
 * Page thumbnails (spec §3.3). Each thumbnail is a native `<canvas>` on a white
 * page card. C10: one IntersectionObserver renders a page's thumbnail the
 * first time it nears the viewport; a Skeleton at the page's aspect ratio
 * holds its place until the render finishes. Renders stay sequential.
 */
export const PageThumbnails: React.FC<PageThumbnailsProps> = ({
  pages,
  activePage,
  onPageSelect,
  layout = "list",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map());
  const renderTasksRef = useRef<Map<number, RenderTask>>(new Map());
  // In-flight render per page. A second request for the same page awaits the
  // first instead of cancelling it.
  const inFlightRef = useRef<Map<number, Promise<boolean>>>(new Map());
  // Pages that have entered the viewport at least once (never removed).
  const [visiblePages, setVisiblePages] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  // Pages whose thumbnail has finished rendering.
  const [renderedPages, setRenderedPages] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  // Mirrors renderedPages for the async render loop (no stale closure).
  const renderedRef = useRef<Set<number>>(new Set());

  // Aspect ratio per page, so the Skeleton and the card hold the right shape
  // before the canvas has any pixels.
  const aspectRatios = useMemo(() => {
    const map = new Map<number, number>();
    for (const page of pages) {
      try {
        const vp = page.proxy.getViewport({ scale: 1 });
        if (vp.width > 0 && vp.height > 0) {
          map.set(page.proxy.pageNumber, vp.width / vp.height);
        }
      } catch {
        // Fall back to the Letter ratio below.
      }
    }
    return map;
  }, [pages]);

  // A new document starts from scratch.
  useEffect(() => {
    renderTasksRef.current.forEach((task) => task.cancel());
    renderTasksRef.current.clear();
    inFlightRef.current.clear();
    renderedRef.current = new Set();
    setRenderedPages(new Set());
    setVisiblePages(new Set());
  }, [pages]);

  // C10: one observer for the whole list.
  useEffect(() => {
    const items = Array.from(itemRefs.current.entries());
    if (typeof IntersectionObserver === "undefined") {
      setVisiblePages(new Set(items.map(([n]) => n)));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entering: number[] = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const n = Number((entry.target as HTMLElement).dataset.page);
          if (Number.isFinite(n)) entering.push(n);
          observer.unobserve(entry.target);
        }
        if (entering.length === 0) return;
        setVisiblePages((prev) => {
          if (entering.every((n) => prev.has(n))) return prev;
          const next = new Set(prev);
          entering.forEach((n) => next.add(n));
          return next;
        });
      },
      {
        // The rail list scrolls itself; in the grid layout the parent
        // (drawer body) scrolls, and the implicit root clips by it.
        root: layout === "list" ? containerRef.current : null,
        rootMargin: ROOT_MARGIN,
      },
    );
    items.forEach(([, el]) => observer.observe(el));
    return () => observer.disconnect();
  }, [pages, layout]);

  const renderThumbnail = useCallback(
    (page: PDFPageProxy, canvas: HTMLCanvasElement): Promise<boolean> => {
      const pageNumber = page.pageNumber;
      const pending = inFlightRef.current.get(pageNumber);
      if (pending) return pending;

      const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });
      const context = canvas.getContext("2d");
      if (!context) return Promise.resolve(false);

      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      // Resizing the canvas above resets the transform, so this never compounds.
      context.scale(pixelRatio, pixelRatio);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const renderTask = (page.render as any)({
        canvasContext: context,
        viewport,
      }) as RenderTask;
      renderTasksRef.current.set(pageNumber, renderTask);
      const promise: Promise<boolean> = renderTask.promise
        .then(() => true)
        .finally(() => {
          if (renderTasksRef.current.get(pageNumber) === renderTask) {
            renderTasksRef.current.delete(pageNumber);
          }
          if (inFlightRef.current.get(pageNumber) === promise) {
            inFlightRef.current.delete(pageNumber);
          }
        });
      inFlightRef.current.set(pageNumber, promise);
      return promise;
    },
    [],
  );

  // Render newly visible pages, one at a time, in document order.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (const page of pages) {
        if (cancelled) return;
        const n = page.proxy.pageNumber;
        if (!visiblePages.has(n) || renderedRef.current.has(n)) continue;
        const canvas = canvasRefs.current.get(n);
        if (!canvas) continue;
        try {
          const ok = await renderThumbnail(page.proxy, canvas);
          if (!ok || cancelled) continue;
          renderedRef.current.add(n);
          setRenderedPages((prev) => {
            const next = new Set(prev);
            next.add(n);
            return next;
          });
        } catch (error) {
          if (!isCancellation(error)) {
            console.warn("Failed to render thumbnail:", error);
          }
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [pages, visiblePages, renderThumbnail]);

  // Cancel in-flight renders on unmount.
  useEffect(() => {
    const renderTasks = renderTasksRef.current;
    return () => {
      renderTasks.forEach((task) => task.cancel());
      renderTasks.clear();
    };
  }, []);

  // Scroll active page into view
  useEffect(() => {
    if (!activePage) return;
    const el = itemRefs.current.get(activePage);
    el?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [activePage]);

  const items = pages.map((page) => {
    const pageNumber = page.proxy.pageNumber;
    const isActive = pageNumber === activePage;
    const isRendered = renderedPages.has(pageNumber);
    const ratio = aspectRatios.get(pageNumber) ?? 8.5 / 11;

    return (
      <Box
        asChild
        key={pageNumber}
        display="flex"
        flexDirection="column"
        alignItems="center"
        gap={2}
        p={2}
        w="full"
        cursor="pointer"
        rounded="l3"
        borderWidth="2px"
        borderColor={isActive ? "fg" : "transparent"}
        bg={isActive ? "bg.emphasized" : "transparent"}
        transition="background 0.15s, border-color 0.15s"
        _hover={isActive ? undefined : { bg: "bg.muted" }}
        focusRing="outside"
      >
        <button
          ref={(el) => {
            if (el) itemRefs.current.set(pageNumber, el);
            else itemRefs.current.delete(pageNumber);
          }}
          type="button"
          onClick={() => onPageSelect(pageNumber)}
          data-page={pageNumber}
          data-state={isRendered ? "rendered" : "loading"}
          aria-label={`Page ${pageNumber}`}
          aria-current={isActive ? "page" : undefined}
        >
          <Box
            position="relative"
            w="full"
            maxW={layout === "list" ? "120px" : undefined}
            aspectRatio={ratio}
            data-thumb=""
            data-active={isActive ? "" : undefined}
            bg="white"
            borderWidth="1px"
            borderColor="border"
            rounded="l2"
            overflow="hidden"
          >
            <canvas
              ref={(el) => {
                if (el) canvasRefs.current.set(pageNumber, el);
                else canvasRefs.current.delete(pageNumber);
              }}
              aria-hidden="true"
              style={{ display: "block", width: "100%", height: "100%" }}
            />
            {!isRendered && (
              <Skeleton
                data-testid={`thumbnail-skeleton-${pageNumber}`}
                position="absolute"
                inset={0}
                rounded="0"
                variant="pulse"
              />
            )}
          </Box>
          <Text
            as="span"
            color={isActive ? "fg" : "fg.muted"}
            fontWeight={isActive ? "medium" : undefined}
            textAlign="center"
          >
            {pageNumber}
          </Text>
        </button>
      </Box>
    );
  });

  if (layout === "grid") {
    return (
      <SimpleGrid ref={containerRef} columns={2} gap={3} data-layout="grid">
        {items}
      </SimpleGrid>
    );
  }

  return (
    <Stack
      ref={containerRef}
      data-layout="list"
      gap={1}
      px={3}
      py={3}
      flex="1"
      minH={0}
      overflowY="auto"
      overflowX="hidden"
    >
      {items}
    </Stack>
  );
};

export default PageThumbnails;
