import React from "react";
import { Box, Icon } from "@chakra-ui/react";

/**
 * An icon that sits beside wrapping text, centred on the text's FIRST line.
 *
 * Box-centring the icon in a `1lh` row lands it a little high, because the
 * font's glyphs sit low in their line box. Instead the icon is laid out
 * inline next to a zero-width space with `vertical-align: middle`, which
 * the browser centres on the line's x-height (baseline + 0.5ex). That
 * tracks the font, size and line height. Use inside a row with
 * `align="flex-start"`.
 */
export const LeadingIcon: React.FC<{
  children: React.ReactElement;
  boxSize?: string;
}> = ({ children, boxSize = "4" }) => (
  <Box as="span" display="block" flexShrink={0} aria-hidden="true">
    {"​"}
    <Icon boxSize={boxSize} verticalAlign="middle">
      {children}
    </Icon>
  </Box>
);

export default LeadingIcon;
