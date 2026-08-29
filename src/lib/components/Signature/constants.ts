/**
 * Shared sizing/appearance constants for the Draw and Type signature
 * capture tabs. Both tabs render into a canvas of the same logical
 * dimensions so a signature adopted from either one drops into a PDF field
 * rect the same way.
 */

/**
 * Bundled font used by the Type tab, both for the on-screen preview and for
 * the exported PNG (the canvas re-renders the typed text in this face
 * before calling `toDataURL`).
 *
 * Font: Dancing Script (variable, Regular instance used here)
 * Source: https://github.com/google/fonts/tree/main/ofl/dancingscript
 * Copyright 2016 The Dancing Script Project Authors
 * License: SIL Open Font License, Version 1.1 -- full text bundled at
 * `./fonts/OFL.txt` beside the font file.
 *
 * Named generically here (not "Dancing Script") only because it is exposed
 * as a CSS custom property surface library-wide; the family itself is still
 * registered under its real name in the `@font-face` rule in
 * SignaturePad.module.css.
 */
export const SIGNATURE_FONT_FAMILY = "Signature Script";

/** Logical (CSS pixel) size of both the Draw and Type canvases. The actual
 * backing store is this times devicePixelRatio -- see `sizeSignatureCanvas`. */
export const SIGNATURE_CANVAS_WIDTH = 480;
export const SIGNATURE_CANVAS_HEIGHT = 180;

/** Ink is always this fixed dark color regardless of the host's light/dark
 * theme -- the exported PNG is stamped onto a document page, not displayed
 * in the app's own chrome, so it should read as ink, not as an accent color. */
export const INK_COLOR = "#1a1a1a";
