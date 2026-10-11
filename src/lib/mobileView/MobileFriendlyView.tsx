import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  Box,
  HStack,
  Separator,
  Skeleton,
  SkeletonText,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import type { MobileDocument, SourceOrigin } from "./types";
import { Block } from "./view/Blocks";
import { MobileViewContext, type MobileViewContextValue } from "./view/context";
import { groupByPage, pageAnchorId } from "./view/documentModel";
import type { GetFieldControl } from "./view/fieldControlModel";

export interface MobileFriendlyViewProps {
  /** "loading" while the document converts (skeleton + "Preparing mobile
   * friendly view"); "ready" renders `document`. */
  status: "loading" | "ready";
  /** Only ever a document that passed the fidelity check (the converter
   * withholds it on fallback). */
  document: MobileDocument | null;
  /** Fill & Sign ("edit") or read-only View. Prepare never gets here. */
  mode: "edit" | "view";
  /** Value, setters, gating and required state for a field id, resolved by
   * the editor from the same store the original overlays use. */
  getFieldControl: GetFieldControl;
  /** Opens the editor's shared signature adoption modal. */
  onOpenSignature: (fieldId: string) => void;
  /** A control took focus. */
  onFieldFocus?: (fieldId: string) => void;
  /** "View original" on a block the converter kept as a placeholder. */
  onShowOriginal?: (origin: SourceOrigin | null) => void;
}

/** No layout effects on the server (SSR hosts). */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Controls the Enter key and guided navigation can land on, in DOM
 * (= reading) order. */
const FOCUSABLE_CONTROLS =
  "input[data-mf-field]:not([disabled]), select[data-mf-field]:not([disabled]), textarea[data-mf-field]:not([disabled]), button[data-mf-field]:not([disabled])";

/**
 * The Mobile friendly view (spec §8): the PDF reflowed into a readable
 * document, real text at 16px with every fillable field as a full-width
 * native control where it sits in the text. Values, gating and signatures
 * all go through the editor (`getFieldControl`, `onOpenSignature`), so this
 * view and the original layout always agree.
 */
export const MobileFriendlyView = forwardRef<
  HTMLDivElement,
  MobileFriendlyViewProps
>(function MobileFriendlyView(
  {
    status,
    document: mobileDocument,
    mode,
    getFieldControl,
    onOpenSignature,
    onFieldFocus,
    onShowOriginal,
  },
  forwardedRef
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const setRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef]
  );

  // Enter on a single-line input moves to the next control in reading
  // order (spec §8.3), skipping the rest of the same field (radio options).
  const onAdvance = useCallback((fromFieldId: string) => {
    const root = rootRef.current;
    if (!root) return;
    const controls = Array.from(
      root.querySelectorAll<HTMLElement>(FOCUSABLE_CONTROLS)
    );
    const from = controls.findIndex((el) => el.dataset.fieldId === fromFieldId);
    const next = controls
      .slice(from + 1)
      .find((el) => el.dataset.fieldId !== fromFieldId);
    if (!next) {
      (globalThis.document.activeElement as HTMLElement | null)?.blur?.();
      return;
    }
    next.focus();
    next.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, []);

  // The editor hands in fresh callbacks on every render (every keystroke).
  // Reading them through refs keeps the context value stable, so the
  // memoized blocks don't re-render; field controls subscribe to their own
  // field instead (useFieldControl).
  const latest = useRef({ getFieldControl, onOpenSignature, onFieldFocus, onShowOriginal });
  latest.current = { getFieldControl, onOpenSignature, onFieldFocus, onShowOriginal };
  const listeners = useRef(new Set<() => void>());
  const subscribe = useCallback((onChange: () => void) => {
    listeners.current.add(onChange);
    return () => {
      listeners.current.delete(onChange);
    };
  }, []);
  // After every render of the editor: let each control re-check its field.
  useIsomorphicLayoutEffect(() => {
    listeners.current.forEach((onChange) => onChange());
  });
  const hasShowOriginal = !!onShowOriginal;

  const contextValue = useMemo<MobileViewContextValue>(
    () => ({
      mode,
      getFieldControl: (fieldId) => latest.current.getFieldControl(fieldId),
      subscribe,
      onOpenSignature: (fieldId) => latest.current.onOpenSignature(fieldId),
      onFieldFocus: (fieldId) => latest.current.onFieldFocus?.(fieldId),
      onAdvance,
      onShowOriginal: hasShowOriginal
        ? (origin) => latest.current.onShowOriginal?.(origin)
        : undefined,
    }),
    [mode, subscribe, onAdvance, hasShowOriginal]
  );

  const sections = useMemo(
    () => (mobileDocument ? groupByPage(mobileDocument) : []),
    [mobileDocument]
  );

  return (
    <Box
      ref={setRootRef}
      data-part="mobile-friendly-view"
      data-mode={mode}
      // Fills the editor's scroller edge to edge (PDFEditor.module.css
      // pulls it over the scroller's padding).
      alignSelf="stretch"
      minH="full"
      bg="bg"
      color="fg"
      // Above the canvas-area grid pseudo-element.
      position="relative"
    >
      <Box maxW="640px" mx="auto" px="4" pt="4" pb="10">
        {status === "loading" || !mobileDocument ? (
          <Stack gap="4" role="status" aria-live="polite" aria-busy="true">
            <HStack gap="2" color="fg.muted">
              <Spinner size="sm" />
              <Text fontSize="14px">Preparing mobile friendly view</Text>
            </HStack>
            <Skeleton h="6" w="60%" />
            <SkeletonText noOfLines={4} gap="3" />
            <Skeleton h="11" />
            <SkeletonText noOfLines={3} gap="3" />
          </Stack>
        ) : (
          <MobileViewContext.Provider value={contextValue}>
            <Stack gap="0">
              {sections.map((section) => (
                <Box
                  as="section"
                  key={section.pageIndex}
                  data-mf-page={section.pageIndex}
                  aria-label={
                    section.pageBreak
                      ? `Page ${section.pageBreak.pageNumber} of ${section.pageBreak.pageCount}`
                      : undefined
                  }
                >
                  {section.pageBreak && (
                    <HStack
                      id={pageAnchorId(section.pageIndex)}
                      gap="3"
                      py="4"
                      // Scroll target for page navigation.
                      scrollMarginTop="2"
                      aria-hidden="true"
                    >
                      <Separator flex="1" />
                      <Text
                        fontSize="xs"
                        color="fg.muted"
                        flexShrink={0}
                        whiteSpace="nowrap"
                      >
                        Page {section.pageBreak.pageNumber} of{" "}
                        {section.pageBreak.pageCount}
                      </Text>
                      <Separator flex="1" />
                    </HStack>
                  )}
                  <Stack gap="4">
                    {section.blocks.map((block) => (
                      <Block key={block.id} block={block} />
                    ))}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </MobileViewContext.Provider>
        )}
      </Box>
    </Box>
  );
});

export default MobileFriendlyView;
