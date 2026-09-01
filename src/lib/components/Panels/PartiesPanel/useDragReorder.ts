import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

/**
 * Hand-rolled drag-to-reorder for a vertical list of rows, matching the
 * document-level pointer-listener idiom used by BuildModeFieldRenderer
 * (mouse/touch via Pointer Events, 10px move threshold before a touch
 * gesture engages so taps still work). No dnd dependency.
 *
 * Consumers mark each row with `data-reorder-id={id}` so the hook can look
 * up row bounding rects during a gesture; it never touches the DOM itself.
 */

const TOUCH_ENGAGE_THRESHOLD = 10;

/**
 * Fraction of a hovered row's height treated as its top/bottom "reorder"
 * band when `onJoin` is provided. The middle band between them means "drop
 * onto this person" (join their step) rather than "slot past them" -- the
 * classic tree-dnd drop-on vs drop-between split. Live reorder alone cannot
 * express drop-onto: the dragged row follows the pointer, so at release the
 * pointer is always over the dragged row itself.
 */
const REORDER_EDGE_BAND = 0.25;

export interface UseDragReorderParams {
  /** Row ids in on-screen order. */
  ids: string[];
  /** Called when the dragged row should move to occupy `overId`'s slot. */
  onReorder: (activeId: string, overId: string) => void;
  /**
   * When provided, hovering the middle of another row stops reordering and
   * arms a join instead; releasing there calls this with the row dropped on.
   * Omit it and every hover position reorders, exactly as before.
   */
  onJoin?: (activeId: string, targetId: string) => void;
}

export interface UseDragReorderResult {
  /** Attach to each row: onPointerDown={(e) => onPointerDown(id, e)} */
  onPointerDown: (id: string, event: ReactPointerEvent) => void;
  /** Attach to each row: onKeyDown={(e) => onKeyDown(id, e)} */
  onKeyDown: (id: string, event: ReactKeyboardEvent) => void;
  /** Whether `id` is the row currently being dragged. */
  isDragging: (id: string) => boolean;
  /** Id of the row currently under the pointer during a drag, else null. */
  dropTargetId: string | null;
  /**
   * Id of the row a release would JOIN (pointer in its middle band), else
   * null. Mutually exclusive with `dropTargetId` so consumers can style
   * "will join" and "will slot past" differently.
   */
  joinTargetId: string | null;
}

interface RowRect {
  id: string;
  top: number;
  bottom: number;
}

interface Gesture {
  activeId: string;
  pointerId: number;
  isTouch: boolean;
  startX: number;
  startY: number;
  engaged: boolean;
  lastOverId: string | null;
  /** Row a release would join; mirrored into state for rendering. */
  joinTargetId: string | null;
}

export function useDragReorder({
  ids,
  onReorder,
  onJoin,
}: UseDragReorderParams): UseDragReorderResult {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [joinTargetId, setJoinTargetId] = useState<string | null>(null);

  // Refs so the document-level listeners bound for the life of a single
  // gesture always see the latest ids/callback without being re-bound.
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const onJoinRef = useRef(onJoin);
  onJoinRef.current = onJoin;

  const gestureRef = useRef<Gesture | null>(null);

  const getRowRects = useCallback((): RowRect[] => {
    const currentIds = idsRef.current;
    const nodes = document.querySelectorAll<HTMLElement>("[data-reorder-id]");
    const rects: RowRect[] = [];
    nodes.forEach((node) => {
      const id = node.getAttribute("data-reorder-id");
      if (!id || !currentIds.includes(id)) return;
      const rect = node.getBoundingClientRect();
      rects.push({ id, top: rect.top, bottom: rect.bottom });
    });
    return rects;
  }, []);

  const findHoveredRow = useCallback(
    (clientY: number, rects: RowRect[]): RowRect | undefined => {
      if (rects.length === 0) return undefined;
      const within = rects.find(
        (rect) => clientY >= rect.top && clientY <= rect.bottom
      );
      if (within) return within;
      // Clamp to the first/last row when the pointer drags past either end.
      if (clientY < rects[0].top) return rects[0];
      if (clientY > rects[rects.length - 1].bottom) {
        return rects[rects.length - 1];
      }
      return undefined;
    },
    []
  );

  const endGesture = useCallback(() => {
    gestureRef.current = null;
    setDraggingId(null);
    setDropTargetId(null);
    setJoinTargetId(null);
  }, []);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) return;

      if (!gesture.engaged) {
        const deltaX = event.clientX - gesture.startX;
        const deltaY = event.clientY - gesture.startY;
        if (gesture.isTouch) {
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          if (distance < TOUCH_ENGAGE_THRESHOLD) return;
        }
        gesture.engaged = true;
        setDraggingId(gesture.activeId);
      }

      const hovered = findHoveredRow(event.clientY, getRowRects());
      if (!hovered) return;

      // Middle band of ANOTHER row = "drop onto this person" (join). Only
      // when the pointer is genuinely inside the rect -- a clamped result
      // (pointer past either end of the list) always means reorder.
      const height = hovered.bottom - hovered.top;
      const wantsJoin =
        !!onJoinRef.current &&
        hovered.id !== gesture.activeId &&
        event.clientY >= hovered.top + height * REORDER_EDGE_BAND &&
        event.clientY <= hovered.bottom - height * REORDER_EDGE_BAND;

      if (wantsJoin) {
        gesture.joinTargetId = hovered.id;
        setJoinTargetId(hovered.id);
        setDropTargetId(null);
        return;
      }

      gesture.joinTargetId = null;
      setJoinTargetId(null);
      setDropTargetId(hovered.id);

      if (hovered.id !== gesture.activeId && hovered.id !== gesture.lastOverId) {
        gesture.lastOverId = hovered.id;
        onReorderRef.current(gesture.activeId, hovered.id);
      }
    },
    [findHoveredRow, getRowRects]
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
      // Join commits on release (a real pointerup, not pointercancel) so the
      // whole hover stays a preview until the user lets go.
      if (event.type === "pointerup" && gesture.engaged && gesture.joinTargetId) {
        onJoinRef.current?.(gesture.activeId, gesture.joinTargetId);
      }
      endGesture();
    },
    [handlePointerMove, endGesture]
  );

  useEffect(() => {
    // Safety net if a component unmounts mid-gesture (pointerup never fires).
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const onPointerDown = useCallback(
    (id: string, event: ReactPointerEvent) => {
      if (event.button !== 0) return;

      const isTouch = event.pointerType === "touch";

      gestureRef.current = {
        activeId: id,
        pointerId: event.pointerId,
        isTouch,
        startX: event.clientX,
        startY: event.clientY,
        engaged: !isTouch,
        lastOverId: null,
        joinTargetId: null,
      };

      if (!isTouch) {
        setDraggingId(id);
      }

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
      document.addEventListener("pointercancel", handlePointerUp);
    },
    [handlePointerMove, handlePointerUp]
  );

  const onKeyDown = useCallback((id: string, event: ReactKeyboardEvent) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();

    const currentIds = idsRef.current;
    const index = currentIds.indexOf(id);
    if (index === -1) return;

    const targetIndex = event.key === "ArrowUp" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentIds.length) return;

    onReorderRef.current(id, currentIds[targetIndex]);
  }, []);

  const isDragging = useCallback(
    (id: string) => draggingId === id,
    [draggingId]
  );

  return { onPointerDown, onKeyDown, isDragging, dropTargetId, joinTargetId };
}
