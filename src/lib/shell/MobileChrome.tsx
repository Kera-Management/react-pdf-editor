import React from "react";
import { Box, VStack } from "@chakra-ui/react";
import { MobileDrawer } from "../components/Mobile/MobileDrawer";
import { PagePill } from "../components/Mobile/PagePill";
import {
  FieldActionBar,
  type FieldActionBarProps,
} from "../components/Mobile/FieldActionBar";
import {
  AddFieldList,
  FloatingActionButton,
} from "../components/Mobile/FloatingActionButton";
import {
  ProgressPanel,
  type ProgressPanelProps,
} from "../components/Panels/ProgressPanel";
import {
  PropertiesPanel,
  type PropertiesPanelProps,
} from "../components/Panels/PropertiesPanel";
import {
  PageThumbnails,
  type PageThumbnailsProps,
} from "../components/Panels/PageThumbnails";
import { PartiesPanel } from "../components/Panels/PartiesPanel";
import type { BuildModeFieldType } from "../PDFEditor";
import type {
  RightSidebarHostPanel,
  RightSidebarParties,
} from "./RightSidebar";

/** Which mobile drawer is open. Only one at a time (spec §3.11). */
export type MobileDrawer =
  | "progress"
  | "properties"
  | "parties"
  | "hostPanel"
  | "pages"
  | "addField"
  | null;

export interface MobileChromeProps {
  /** Owned by PDFEditor. Opening one drawer replaces the other. */
  openDrawer: MobileDrawer;
  onOpenDrawerChange: (drawer: MobileDrawer) => void;
  /** 1-indexed. */
  activePage: number;
  totalPages: number;
  /** PDFEditor's `handlePageSelect` (scrolls to the page). */
  onPageSelect: (pageNumber: number) => void;
  /** Pages drawer body. Omitted until pages exist. */
  pageThumbnailsProps?: PageThumbnailsProps;
  /** Progress drawer body (edit mode). */
  progress?: ProgressPanelProps;
  /** Properties drawer body (build mode). */
  properties?: PropertiesPanelProps;
  /** Parties drawer (no assign mode on mobile). */
  parties?: RightSidebarParties;
  /** Host `sidebarPanel` drawer. */
  hostPanel?: RightSidebarHostPanel;
  /** Prepare mode: show the "Add field" pill. */
  showAddField: boolean;
  /** PDFEditor's click-to-add handler (`handleFABFieldSelect`, A5). */
  onAddField: (type: BuildModeFieldType) => void;
  /**
   * Prepare: the selected field's docked action bar. Present only while a
   * field is selected; it takes the "Add field" pill's place.
   */
  fieldActions?: FieldActionBarProps;
}

/**
 * Mobile-only chrome (spec §3.11, §3.12): the floating page pill and
 * "Add field" pill, and one bottom drawer per panel. Presentational: the
 * open drawer lives in PDFEditor.
 */
export const MobileChrome: React.FC<MobileChromeProps> = ({
  openDrawer,
  onOpenDrawerChange,
  activePage,
  totalPages,
  onPageSelect,
  pageThumbnailsProps,
  progress,
  properties,
  parties,
  hostPanel,
  showAddField,
  onAddField,
  fieldActions,
}) => {
  const close = () => onOpenDrawerChange(null);
  const showPill = totalPages > 1;
  // Hidden while any drawer is open: the drawer covers the bottom of the
  // screen, so there is no offset juggling (C6).
  const showActionBar = !!fieldActions && openDrawer === null;
  const showFab = showAddField && openDrawer === null && !showActionBar;

  return (
    <>
      {(showPill || showFab || showActionBar) && (
        <VStack
          position="fixed"
          left={0}
          right={0}
          // The action bar sits flush on the bottom edge (it pads for the
          // home indicator itself); the pills float above it.
          bottom={
            showActionBar
              ? 0
              : "calc(var(--chakra-spacing-6) + env(safe-area-inset-bottom))"
          }
          gap={3}
          zIndex="sticky"
          // The column spans the gap between the pills; only the pills
          // themselves take taps.
          pointerEvents="none"
          css={{ "& > *": { pointerEvents: "auto" } }}
        >
          {showPill && (
            <PagePill
              activePage={activePage}
              totalPages={totalPages}
              onPageSelect={onPageSelect}
              onOpenPages={() => onOpenDrawerChange("pages")}
            />
          )}
          {showFab && (
            <FloatingActionButton
              onClick={() => onOpenDrawerChange("addField")}
            />
          )}
          {showActionBar && fieldActions && (
            <FieldActionBar {...fieldActions} />
          )}
        </VStack>
      )}

      {progress && (
        <MobileDrawer
          open={openDrawer === "progress"}
          onClose={close}
          title="Progress"
        >
          <ProgressPanel {...progress} />
        </MobileDrawer>
      )}

      {properties && (
        <MobileDrawer
          open={openDrawer === "properties"}
          onClose={close}
          title="Properties"
        >
          <PropertiesPanel {...properties} />
        </MobileDrawer>
      )}

      {parties && (
        <MobileDrawer
          open={openDrawer === "parties"}
          onClose={close}
          title={parties.title}
        >
          <PartiesPanel
            config={parties.config}
            participants={parties.participants}
          />
        </MobileDrawer>
      )}

      {hostPanel && (
        <MobileDrawer
          open={openDrawer === "hostPanel"}
          onClose={close}
          title={hostPanel.title}
        >
          {hostPanel.content}
        </MobileDrawer>
      )}

      {pageThumbnailsProps && (
        <MobileDrawer
          open={openDrawer === "pages"}
          onClose={close}
          title="Pages"
        >
          <Box data-testid="mobile-pages-drawer-body">
            <PageThumbnails
              {...pageThumbnailsProps}
              layout="grid"
              onPageSelect={(pageNumber) => {
                onPageSelect(pageNumber);
                close();
              }}
            />
          </Box>
        </MobileDrawer>
      )}

      {showAddField && (
        <MobileDrawer
          open={openDrawer === "addField"}
          onClose={close}
          title="Add a field"
        >
          <AddFieldList
            onSelect={(type) => {
              onAddField(type);
              close();
            }}
          />
        </MobileDrawer>
      )}
    </>
  );
};

export default MobileChrome;
