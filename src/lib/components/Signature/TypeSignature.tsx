import React, { useEffect, useRef, useState } from "react";
import { Box, Input, Stack } from "@chakra-ui/react";

import styles from "./SignaturePad.module.css";
import { sizeSignatureCanvas } from "./canvasSetup";
import {
  INK_COLOR,
  SIGNATURE_CANVAS_HEIGHT,
  SIGNATURE_CANVAS_WIDTH,
  SIGNATURE_FONT_FAMILY,
} from "./constants";
import { exportTrimmedSignature } from "./trimmedExport";

export interface TypeSignatureProps {
  /** Pre-fills the input on mount. The signer can still edit it. */
  signerName?: string;
  /**
   * Fires with a PNG data URL for non-blank text, and with `null` once the
   * field is blank (including on mount if no `signerName` is given).
   */
  onChange: (dataUrl: string | null) => void;
}

const MAX_FONT_SIZE = 56;
const MIN_FONT_SIZE = 22;
const FONT_STEP = 2;
const HORIZONTAL_PADDING = 24;

type FontFaceSetLike = { load: (font: string) => Promise<unknown> };

function fontFaceSetOf(doc: Document): FontFaceSetLike | undefined {
  return (doc as Document & { fonts?: FontFaceSetLike }).fonts;
}

/**
 * Type tab: an editable name input, rendered large into a canvas in the
 * bundled cursive font. The canvas doubles as both the visual preview and
 * the export source (`toDataURL` on the same element the signer sees).
 */
export const TypeSignature: React.FC<TypeSignatureProps> = ({
  signerName,
  onChange,
}) => {
  const [text, setText] = useState(signerName ?? "");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Backing-store sizing, once on mount.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    sizeSignatureCanvas(canvas, ctx);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const render = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      ctx.clearRect(0, 0, SIGNATURE_CANVAS_WIDTH, SIGNATURE_CANVAS_HEIGHT);

      const trimmed = text.trim();
      if (!trimmed) {
        onChange(null);
        return;
      }

      ctx.fillStyle = INK_COLOR;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";

      let fontSize = MAX_FONT_SIZE;
      const maxWidth = SIGNATURE_CANVAS_WIDTH - HORIZONTAL_PADDING * 2;
      ctx.font = `${fontSize}px "${SIGNATURE_FONT_FAMILY}"`;
      while (
        ctx.measureText(trimmed).width > maxWidth &&
        fontSize > MIN_FONT_SIZE
      ) {
        fontSize -= FONT_STEP;
        ctx.font = `${fontSize}px "${SIGNATURE_FONT_FAMILY}"`;
      }

      ctx.fillText(trimmed, HORIZONTAL_PADDING, SIGNATURE_CANVAS_HEIGHT / 2);
      // Trim to the rendered text's ink -- same reason as the Draw tab.
      onChange(exportTrimmedSignature(canvas) ?? canvas.toDataURL("image/png"));
    };

    // Make sure the cursive face is actually loaded before painting the
    // export canvas -- otherwise the PNG can silently bake in a fallback
    // font. Environments without the Font Loading API skip straight to
    // render() with whatever font is available.
    const fonts = fontFaceSetOf(document);
    if (fonts?.load) {
      fonts
        .load(`${MAX_FONT_SIZE}px "${SIGNATURE_FONT_FAMILY}"`)
        .then(render)
        .catch(render);
    } else {
      render();
    }

    return () => {
      cancelled = true;
    };
  }, [text, onChange]);

  return (
    <Stack gap={3}>
      <Input
        type="text"
        size="lg"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Type your name"
        aria-label="Signature text"
      />
      {/* Preview canvas: white with dark ink in both colour modes. */}
      <Box
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
          className={styles.typeCanvas}
          role="img"
          aria-label="Signature preview"
        />
      </Box>
    </Stack>
  );
};
