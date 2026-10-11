import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, HStack, Icon, Stack } from "@chakra-ui/react";
import { ArrowCounterClockwiseIcon, TrashIcon } from "@phosphor-icons/react";

import styles from "./SignaturePad.module.css";
import { sizeSignatureCanvas } from "./canvasSetup";
import { INK_COLOR, SIGNATURE_CANVAS_HEIGHT, SIGNATURE_CANVAS_WIDTH } from "./constants";
import { hasEnoughInk } from "./pixelCoverage";
import { exportTrimmedSignature } from "./trimmedExport";

export interface DrawSignatureCanvasProps {
  /**
   * Fires with a fresh PNG data URL whenever the canvas's ink coverage
   * clears the near-blank threshold, and with `null` whenever it doesn't
   * (on mount, right after Clear, or after an Undo that empties the
   * canvas).
   */
  onChange: (dataUrl: string | null) => void;
}

interface Point {
  x: number;
  y: number;
}

interface Gesture {
  pointerId: number;
  points: Point[];
}

/** Client coordinates -> logical canvas coordinates, accounting for the
 * canvas possibly being CSS-scaled smaller than its logical size (e.g. a
 * narrow mobile sheet). */
function getCanvasPoint(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): Point {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width === 0 ? 1 : SIGNATURE_CANVAS_WIDTH / rect.width;
  const scaleY = rect.height === 0 ? 1 : SIGNATURE_CANVAS_HEIGHT / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function configureStrokeStyle(ctx: CanvasRenderingContext2D): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // 3.25, not 2.5: the stamp scales the drawing DOWN into a ~36pt-tall box
  // on the signature line, and thinner strokes turn wispy at that size.
  ctx.lineWidth = 3.25;
  ctx.strokeStyle = INK_COLOR;
  ctx.fillStyle = INK_COLOR;
}

function drawStroke(ctx: CanvasRenderingContext2D, points: Point[]): void {
  if (points.length === 0) return;

  if (points.length === 1) {
    // A tap with no movement -- draw a dot so it still registers as ink.
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
}

/**
 * Draw tab: hand-rolled pointer capture matching the document-level
 * pointerdown/move/up idiom in useDragReorder.ts:108-183 (bind on
 * pointerdown, remove on pointerup/cancel/unmount). Each completed stroke
 * is committed to `strokes` state so Undo/Clear can redraw from scratch;
 * every redraw re-checks pixel coverage and reports the result up.
 */
export const DrawSignatureCanvas: React.FC<DrawSignatureCanvasProps> = ({
  onChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [strokes, setStrokes] = useState<Point[][]>([]);

  const getContext = useCallback((): CanvasRenderingContext2D | null => {
    return canvasRef.current?.getContext("2d") ?? null;
  }, []);

  // Backing-store sizing, once on mount.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    sizeSignatureCanvas(canvas, ctx);
    configureStrokeStyle(ctx);
  }, []);

  // Re-render from the committed stroke list whenever it changes (a
  // just-finished stroke committing, an Undo, or a Clear) and re-check
  // coverage against the result.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, SIGNATURE_CANVAS_WIDTH, SIGNATURE_CANVAS_HEIGHT);
    configureStrokeStyle(ctx);
    strokes.forEach((points) => drawStroke(ctx, points));

    const imageData = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );
    onChange(
      hasEnoughInk(imageData)
        ? // Trim to the ink so the PNG's dimensions describe the signature,
          // not the whole canvas; untrimmed fallback covers environments
          // without canvas readback.
          exportTrimmedSignature(canvas) ?? canvas.toDataURL("image/png")
        : null
    );
  }, [strokes, getContext, onChange]);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const gesture = gestureRef.current;
      const canvas = canvasRef.current;
      const ctx = getContext();
      if (!gesture || !canvas || !ctx || event.pointerId !== gesture.pointerId) {
        return;
      }

      const point = getCanvasPoint(canvas, event.clientX, event.clientY);
      const last = gesture.points[gesture.points.length - 1];
      gesture.points.push(point);

      // Live incremental segment for responsiveness; the authoritative
      // redraw + coverage check happens once the stroke commits on
      // pointerup, via the `strokes` effect above.
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    },
    [getContext]
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) return;

      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
      gestureRef.current = null;

      setStrokes((prev) => [...prev, gesture.points]);
    },
    [handlePointerMove]
  );

  useEffect(() => {
    // Safety net if the component unmounts mid-gesture (pointerup never fires).
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0) return;
      const canvas = canvasRef.current;
      const ctx = getContext();
      if (!canvas || !ctx) return;

      const point = getCanvasPoint(canvas, event.clientX, event.clientY);
      gestureRef.current = { pointerId: event.pointerId, points: [point] };

      // Seed a dot at the down point so a tap with no movement still paints.
      ctx.beginPath();
      ctx.arc(point.x, point.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
      document.addEventListener("pointercancel", handlePointerUp);
    },
    [getContext, handlePointerMove, handlePointerUp]
  );

  const handleUndo = useCallback(() => {
    setStrokes((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setStrokes([]);
  }, []);

  const hasStrokes = strokes.length > 0;

  return (
    <Stack gap={2}>
      {/* The pad is the canvas, not chrome: white with dark ink in both
          colour modes. The frame and baseline are chrome tokens. */}
      <Box
        position="relative"
        w="fit-content"
        maxW="full"
        bg="white"
        borderWidth="1px"
        borderColor="border"
        rounded="lg"
        overflow="hidden"
      >
        <canvas
          ref={canvasRef}
          className={styles.drawCanvas}
          onPointerDown={onPointerDown}
          role="img"
          aria-label="Signature drawing area"
        />
        <Box
          aria-hidden="true"
          position="absolute"
          insetX={6}
          bottom="25%"
          borderBottomWidth="1px"
          borderBottomStyle="dashed"
          borderColor="border.emphasized"
          pointerEvents="none"
        />
      </Box>
      <HStack gap={2}>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={handleUndo}
          disabled={!hasStrokes}
        >
          <Icon boxSize={4}>
            <ArrowCounterClockwiseIcon />
          </Icon>
          Undo
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={handleClear}
          disabled={!hasStrokes}
        >
          <Icon boxSize={4}>
            <TrashIcon />
          </Icon>
          Clear
        </Button>
      </HStack>
    </Stack>
  );
};
