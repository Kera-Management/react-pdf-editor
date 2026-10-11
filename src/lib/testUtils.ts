/**
 * Shared test helpers. Test-only: never import this from library code
 * (it pulls in @testing-library/react).
 */
import { createElement, type ReactElement, type ReactNode } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";

export interface RenderWithChakraOptions extends Omit<RenderOptions, "wrapper"> {
  /**
   * "dark" adds the `.dark` class to the render container, the same way a
   * next-themes host puts `.dark` on <html>. Chakra semantic tokens and the
   * editor's `.dark .pdf-editor-root` canvas variables both key off it.
   */
  colorMode?: "light" | "dark";
}

const ChakraWrapper = ({ children }: { children?: ReactNode }) =>
  createElement(ChakraProvider, { value: defaultSystem, children });

/**
 * `render` inside a `ChakraProvider value={defaultSystem}`, mirroring how
 * both Kera hosts mount the editor (the library ships no provider).
 * `rerender` keeps the provider because it is passed as the wrapper.
 */
export function renderWithChakra(
  ui: ReactElement,
  { colorMode = "light", container, ...options }: RenderWithChakraOptions = {}
): RenderResult {
  let target = container;
  if (colorMode === "dark" && !target) {
    target = document.body.appendChild(document.createElement("div"));
  }
  if (colorMode === "dark" && target instanceof Element) {
    target.classList.add("dark");
  }
  return render(ui, {
    ...options,
    ...(target ? { container: target } : {}),
    wrapper: ChakraWrapper,
  });
}
