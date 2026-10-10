import * as React from "react";
import { Tooltip as ChakraTooltip } from "@chakra-ui/react";

export interface TooltipProps
  extends Omit<ChakraTooltip.RootProps, "positioning"> {
  /** Tooltip text. When empty (or `disabled`), the child renders bare. */
  content: React.ReactNode;
  showArrow?: boolean;
  disabled?: boolean;
  positioning?: ChakraTooltip.RootProps["positioning"];
  contentProps?: ChakraTooltip.ContentProps;
}

/**
 * The editor's thin equivalent of the app's `components/ui/tooltip.tsx`,
 * always used with `portalled={false}` there. The editor never portals
 * tooltips (spec §2.1): content stays inline under `.pdf-editor-root`, and
 * `strategy: "fixed"` keeps it from being clipped by the host Dialog.
 */
export const Tooltip = React.forwardRef<HTMLDivElement, TooltipProps>(
  function Tooltip(props, ref) {
    const {
      content,
      showArrow = true,
      disabled,
      positioning,
      contentProps,
      children,
      ...rest
    } = props;

    if (disabled || !content) return <>{children}</>;

    return (
      <ChakraTooltip.Root
        openDelay={400}
        closeDelay={0}
        lazyMount
        unmountOnExit
        positioning={{ strategy: "fixed", ...positioning }}
        {...rest}
      >
        <ChakraTooltip.Trigger asChild>{children}</ChakraTooltip.Trigger>
        <ChakraTooltip.Positioner>
          <ChakraTooltip.Content ref={ref} {...contentProps}>
            {showArrow && (
              <ChakraTooltip.Arrow>
                <ChakraTooltip.ArrowTip />
              </ChakraTooltip.Arrow>
            )}
            {content}
          </ChakraTooltip.Content>
        </ChakraTooltip.Positioner>
      </ChakraTooltip.Root>
    );
  }
);

export default Tooltip;
