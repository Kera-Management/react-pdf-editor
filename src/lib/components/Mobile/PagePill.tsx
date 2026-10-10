import React from "react";
import { Button, Flex, Icon, IconButton } from "@chakra-ui/react";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Tooltip } from "../Toolbar/Tooltip";

export interface PagePillProps {
  /** 1-indexed. */
  activePage: number;
  totalPages: number;
  /** Go to a page (PDFEditor's `handlePageSelect`). */
  onPageSelect: (pageNumber: number) => void;
  /** Open the Pages drawer. */
  onOpenPages: () => void;
}

/**
 * Mobile page pill (spec §3.12, C8): previous / "3 of 12" / next. The middle
 * button opens the Pages drawer. Styled after the app's compact
 * `Pagination` pill. Renders nothing for a single-page document.
 */
export const PagePill: React.FC<PagePillProps> = ({
  activePage,
  totalPages,
  onPageSelect,
  onOpenPages,
}) => {
  if (totalPages <= 1) return null;

  const isFirst = activePage <= 1;
  const isLast = activePage >= totalPages;

  return (
    <Flex
      align="center"
      p={1.5}
      gap={2}
      rounded="full"
      borderWidth="0.5px"
      borderColor="border"
      bg="bg.panel/80"
      backdropFilter="blur(5px)"
      w="fit-content"
      data-testid="mobile-page-pill"
    >
      <Tooltip content="Previous page">
        <IconButton
          type="button"
          size="sm"
          variant="outline"
          aria-label="Previous page"
          disabled={isFirst}
          onClick={() => onPageSelect(activePage - 1)}
        >
          <Icon asChild boxSize="4">
            <CaretLeftIcon weight="bold" />
          </Icon>
        </IconButton>
      </Tooltip>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={`Go to page, current page ${activePage} of ${totalPages}`}
        onClick={onOpenPages}
      >
        {activePage} of {totalPages}
      </Button>
      <Tooltip content="Next page">
        <IconButton
          type="button"
          size="sm"
          variant="outline"
          aria-label="Next page"
          disabled={isLast}
          onClick={() => onPageSelect(activePage + 1)}
        >
          <Icon asChild boxSize="4">
            <CaretRightIcon weight="bold" />
          </Icon>
        </IconButton>
      </Tooltip>
    </Flex>
  );
};

export default PagePill;
