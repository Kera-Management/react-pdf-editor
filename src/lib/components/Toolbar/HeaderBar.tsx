import React, { useId, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Circle,
  Flex,
  Float,
  HStack,
  Icon,
  IconButton,
  Menu,
  Span,
  Stack,
  Text,
  VisuallyHidden,
} from "@chakra-ui/react";
import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  CheckIcon,
  DotsThreeVerticalIcon,
  DownloadSimpleIcon,
  EyeIcon,
  FloppyDiskIcon,
  FrameCornersIcon,
  ListChecksIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  NotePencilIcon,
  SidebarSimpleIcon,
  SignatureIcon,
  UsersIcon,
  XIcon,
} from "@phosphor-icons/react";
import { PDFEditorMode } from "../../PDFEditor";
import { Tooltip } from "./Tooltip";

export type HeaderBarLayout = "mobile" | "tablet" | "desktop";

export interface HeaderBarProps {
  /** Current editor mode */
  mode: PDFEditorMode;
  /** Callback when mode changes */
  onModeChange?: (mode: PDFEditorMode) => void;
  /** Allowed modes to show in the selector. Defaults to all modes. */
  allowedModes?: PDFEditorMode[];
  /** Current zoom percentage */
  zoomPercentage: number;
  /** Callback for zoom in */
  onZoomIn: () => void;
  /** Callback for zoom out */
  onZoomOut: () => void;
  /** Whether zoom in is disabled */
  zoomInDisabled?: boolean;
  /** Whether zoom out is disabled */
  zoomOutDisabled?: boolean;
  /** Callback to fit the document to the available width. */
  onFitZoom?: () => void;
  /** Callback to reset zoom back to 100%. */
  onResetZoom?: () => void;
  /** Callback for save action */
  onSave: () => void;
  /** Whether save is in progress */
  isSaving?: boolean;
  /** Label for the Save button (and its aria-label). Defaults to "Save". */
  saveLabel?: string;
  /**
   * Whether there are unsaved changes. Shown as a small status dot on the
   * Save button and in its accessible name.
   */
  isDirty?: boolean;
  /**
   * Optional download action. Desktop: an outline button before Save.
   * Mobile and tablet: an item in the "More actions" menu.
   */
  onDownload?: () => void;
  /** Whether a download is in progress */
  isDownloading?: boolean;
  /**
   * When provided, a quiet "decline to sign" button renders before Save,
   * edit mode only, at every breakpoint. The click just opens PDFEditor's
   * built-in confirm.
   */
  onDecline?: () => void;
  /** Label for the decline button. Defaults to "I can't sign this". */
  declineLabel?: string;
  /** Callback for close action */
  onClose?: () => void;
  /** Document title */
  title?: string;
  /** Current page number */
  currentPage?: number;
  /** Total pages */
  totalPages?: number;
  /**
   * Responsive layout. Falls back to `isMobile ? "mobile" : "desktop"` when
   * omitted.
   */
  layout?: HeaderBarLayout;
  /** Whether on mobile. Superseded by `layout`; kept for compatibility. */
  isMobile?: boolean;
  /**
   * Whether the left (pages) sidebar is open. Drives the sidebar toggle's
   * label and `aria-pressed`, and shows the "3 of 12" page indicator when
   * the sidebar is hidden. When omitted the header tracks it locally
   * (open on desktop, closed on tablet).
   */
  leftSidebarOpen?: boolean;
  /** Shows/hides the left (pages) sidebar. Desktop and tablet only (A8). */
  onToggleLeftSidebar?: () => void;
  /**
   * Opens the recipients panel ("More actions" > Recipients). Mobile and
   * tablet.
   */
  onOpenParties?: () => void;
  /**
   * Opens the host-injected panel ("More actions" > {hostPanelTitle}).
   * Mobile and tablet.
   */
  onOpenHostPanel?: () => void;
  /** Title of the host-injected panel, used for its menu item label. */
  hostPanelTitle?: string;
  /**
   * Signer's field-completion count, e.g. { completed: 2, total: 5 }. Paired
   * with `onOpenProgress` to render the mobile "Progress" button (B1), edit
   * mode only. Rendered only when both are provided.
   */
  progressSummary?: { completed: number; total: number };
  /** Opens the progress drawer. See `progressSummary`. */
  onOpenProgress?: () => void;
}

// API values (build/edit/view) are unchanged; only the UI-facing labels
// are renamed.
const modeLabels: Record<PDFEditorMode, string> = {
  build: "Prepare",
  edit: "Fill & Sign",
  view: "View",
};

const modeDescriptions: Record<PDFEditorMode, string> = {
  build: "Place fields and choose who signs",
  edit: "Fill in and sign your fields",
  view: "Read-only",
};

const modeIcons: Record<PDFEditorMode, React.ReactElement> = {
  build: <NotePencilIcon />,
  edit: <SignatureIcon />,
  view: <EyeIcon />,
};

const allModes: PDFEditorMode[] = ["build", "edit", "view"];

interface OverflowItem {
  value: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}

interface ModeMenuProps {
  mode: PDFEditorMode;
  modes: PDFEditorMode[];
  onModeChange?: (mode: PDFEditorMode) => void;
}

const ModeMenu: React.FC<ModeMenuProps> = ({ mode, modes, onModeChange }) => (
  <Menu.Root positioning={{ strategy: "fixed", placement: "bottom-start" }}>
    <Menu.Trigger asChild>
      <Button type="button" size="sm" variant="outline" flexShrink={0}>
        {modeLabels[mode]}
        <Icon>
          <CaretDownIcon weight="bold" />
        </Icon>
      </Button>
    </Menu.Trigger>
    <Menu.Positioner>
      <Menu.Content minW="72" rounded="xl" p="2">
        {/* Each mode is a bordered option card (icon tile, label, hint),
            so the choices read as buttons rather than menu text. */}
        <Menu.RadioItemGroup
          value={mode}
          onValueChange={(e) => onModeChange?.(e.value as PDFEditorMode)}
          display="flex"
          flexDirection="column"
          gap="2"
        >
          {modes.map((m) => (
            <Menu.RadioItem
              key={m}
              value={m}
              rounded="l2"
              borderWidth="1px"
              borderColor="border"
              px="3"
              py="2.5"
              gap="3"
              alignItems="center"
              cursor="pointer"
              _highlighted={{ bg: "bg.muted", borderColor: "border.emphasized" }}
              _checked={{ borderColor: "fg", bg: "bg.muted" }}
            >
              <Circle size="8" bg="bg.emphasized" color="fg" flexShrink={0}>
                <Icon boxSize="4">{modeIcons[m]}</Icon>
              </Circle>
              <Stack gap="0" flex="1">
                <Text fontWeight="medium">{modeLabels[m]}</Text>
                <Text color="fg.muted">{modeDescriptions[m]}</Text>
              </Stack>
              {/* Own check on the right: Menu.ItemIndicator is pinned to
                  the item's start and would sit on top of the icon tile. */}
              {m === mode && (
                <Icon boxSize="4" flexShrink={0}>
                  <CheckIcon weight="bold" />
                </Icon>
              )}
            </Menu.RadioItem>
          ))}
        </Menu.RadioItemGroup>
      </Menu.Content>
    </Menu.Positioner>
  </Menu.Root>
);

const OverflowMenu: React.FC<{ items: OverflowItem[] }> = ({ items }) => {
  // Tooltip and Menu share one trigger element, so they must share its id.
  const triggerId = useId();
  return (
    <Menu.Root
      ids={{ trigger: triggerId }}
      positioning={{ strategy: "fixed", placement: "bottom-end" }}
    >
      <Tooltip content="More actions" ids={{ trigger: triggerId }}>
        <Menu.Trigger asChild>
          <IconButton
            type="button"
            aria-label="More actions"
            size="sm"
            variant="outline"
            rounded="full"
            flexShrink={0}
          >
            <DotsThreeVerticalIcon weight="bold" />
          </IconButton>
        </Menu.Trigger>
      </Tooltip>
      <Menu.Positioner>
        <Menu.Content minW="48" rounded="xl">
          {items.map((item) => (
            <Menu.Item
              key={item.value}
              value={item.value}
              rounded="lg"
              disabled={item.disabled}
              onSelect={item.onSelect}
            >
              <Icon color="fg.muted" boxSize="4">
                {item.icon}
              </Icon>
              <Box flex="1">{item.label}</Box>
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  );
};

interface ZoomButtonProps {
  label: string;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

const ZoomButton: React.FC<ZoomButtonProps> = ({
  label,
  tooltip,
  onClick,
  disabled,
  children,
}) => (
  <Tooltip content={tooltip}>
    <IconButton
      type="button"
      aria-label={label}
      size="2xs"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </IconButton>
  </Tooltip>
);

export const HeaderBar: React.FC<HeaderBarProps> = ({
  mode,
  onModeChange,
  allowedModes = allModes,
  zoomPercentage,
  onZoomIn,
  onZoomOut,
  zoomInDisabled,
  zoomOutDisabled,
  onFitZoom,
  onResetZoom,
  onSave,
  isSaving,
  isDirty,
  saveLabel = "Save",
  onDownload,
  isDownloading,
  onDecline,
  declineLabel = "I can't sign this",
  onClose,
  title,
  currentPage,
  totalPages,
  layout: layoutProp,
  isMobile,
  leftSidebarOpen,
  onToggleLeftSidebar,
  onOpenParties,
  onOpenHostPanel,
  hostPanelTitle,
  progressSummary,
  onOpenProgress,
}) => {
  const layout: HeaderBarLayout = layoutProp ?? (isMobile ? "mobile" : "desktop");
  const mobile = layout === "mobile";

  const availableModes = allModes.filter((m) => allowedModes.includes(m));
  const showModeSelector = availableModes.length > 1;

  // A8: desktop/tablet sidebar toggle. Controlled via leftSidebarOpen when
  // the host passes it; otherwise tracked locally from the layout default.
  const [localSidebarOpen, setLocalSidebarOpen] = useState(
    layout !== "tablet"
  );
  const sidebarOpen = leftSidebarOpen ?? localSidebarOpen;
  const handleToggleSidebar = () => {
    if (leftSidebarOpen === undefined) setLocalSidebarOpen((open) => !open);
    onToggleLeftSidebar?.();
  };

  const showDecline = mode === "edit" && !!onDecline;
  // B1: mobile and tablet reach the progress panel through this button
  // (desktop shows the right rail inline).
  const showProgress =
    layout !== "desktop" &&
    mode === "edit" &&
    !!progressSummary &&
    !!onOpenProgress;

  // C3: the page count only shows when nothing else does (Pages rail hidden).
  const showPageIndicator =
    !mobile &&
    !sidebarOpen &&
    currentPage !== undefined &&
    totalPages !== undefined &&
    totalPages > 0;

  // Mobile and tablet put the secondary actions in "More actions" (§3.10,
  // §3.13).
  const partiesHandler = onOpenParties;
  const hostPanelHandler = onOpenHostPanel;
  const overflowItems: OverflowItem[] = [];
  // Desktop shows everything inline, so it has no overflow menu.
  if (layout !== "desktop") {
    if (partiesHandler) {
      overflowItems.push({
        value: "recipients",
        label: "Recipients",
        icon: <UsersIcon />,
        onSelect: partiesHandler,
      });
    }
    if (hostPanelHandler) {
      overflowItems.push({
        value: "host-panel",
        label: hostPanelTitle || "Open panel",
        icon: <ListChecksIcon />,
        onSelect: hostPanelHandler,
      });
    }
    if (onDownload) {
      overflowItems.push({
        value: "download",
        label: "Download",
        icon: <DownloadSimpleIcon />,
        onSelect: onDownload,
        disabled: isDownloading,
      });
    }
    if (mobile && onFitZoom) {
      overflowItems.push({
        value: "fit",
        label: "Fit to width",
        icon: <FrameCornersIcon />,
        onSelect: onFitZoom,
      });
    }
  }

  const saveButton = (
    <Button
      type="button"
      size="sm"
      position="relative"
      flexShrink={mobile ? 1 : 0}
      minW={0}
      maxW={mobile ? "40vw" : undefined}
      onClick={onSave}
      loading={isSaving}
      loadingText="Saving"
      aria-label={isDirty ? `${saveLabel} (unsaved changes)` : saveLabel}
    >
      <FloppyDiskIcon />
      <Span truncate>{saveLabel}</Span>
      {isDirty && (
        <Float placement="top-end" aria-hidden="true" data-testid="dirty-dot">
          <Circle size="2" bg="orange.solid" />
        </Float>
      )}
    </Button>
  );

  const declineButton = showDecline && (
    <Button
      type="button"
      size="sm"
      variant="outline"
      flexShrink={mobile ? 1 : 0}
      minW={0}
      maxW={mobile ? "32vw" : undefined}
      onClick={onDecline}
    >
      <Span truncate>{declineLabel}</Span>
    </Button>
  );

  const closeButton = onClose && (
    <Tooltip content="Close">
      <IconButton
        type="button"
        aria-label="Close"
        size="sm"
        variant="outline"
        rounded="full"
        flexShrink={0}
        onClick={onClose}
      >
        <XIcon />
      </IconButton>
    </Tooltip>
  );

  const liveRegion = (
    <VisuallyHidden role="status" aria-live="polite">
      {isSaving ? "Saving" : isDirty ? "Unsaved changes" : "All changes saved"}
    </VisuallyHidden>
  );

  const progressButton = showProgress && progressSummary && (
    <Button
      type="button"
      size="sm"
      variant="outline"
      flexShrink={0}
      onClick={onOpenProgress}
    >
      Progress
      <Badge size="sm" variant="subtle" colorPalette="gray">
        {progressSummary.completed} of {progressSummary.total}
      </Badge>
    </Button>
  );

  if (mobile) {
    return (
      <Flex
        as="header"
        align="center"
        justify="space-between"
        gap={2}
        px={3}
        py={2}
        bg="bg.panel"
        borderBottomWidth="1px"
        borderColor="border"
        data-layout={layout}
      >
        <HStack gap={2} minW={0} flexShrink={1}>
          {progressButton}
          {showModeSelector && (
            <ModeMenu
              mode={mode}
              modes={availableModes}
              onModeChange={onModeChange}
            />
          )}
        </HStack>
        <HStack gap={2} minW={0} justify="flex-end">
          {declineButton}
          {saveButton}
          {liveRegion}
          {overflowItems.length > 0 && <OverflowMenu items={overflowItems} />}
          {closeButton}
        </HStack>
      </Flex>
    );
  }

  return (
    <Flex
      as="header"
      align="center"
      justify="space-between"
      gap={3}
      px={4}
      py={2}
      minH="14"
      bg="bg.panel"
      borderBottomWidth="1px"
      borderColor="border"
      data-layout={layout}
    >
      <HStack gap={2} flex="1" minW={0}>
        {onToggleLeftSidebar && (
          <Tooltip
            content={sidebarOpen ? "Hide pages panel" : "Show pages panel"}
          >
            <IconButton
              type="button"
              size="sm"
              variant="ghost"
              aria-label={sidebarOpen ? "Hide pages panel" : "Show pages panel"}
              aria-pressed={sidebarOpen}
              onClick={handleToggleSidebar}
            >
              <SidebarSimpleIcon />
            </IconButton>
          </Tooltip>
        )}
        {showModeSelector && (
          <ModeMenu
            mode={mode}
            modes={availableModes}
            onModeChange={onModeChange}
          />
        )}
        {title && (
          <Text fontWeight="medium" truncate minW={0}>
            {title}
          </Text>
        )}
      </HStack>

      <HStack gap={1} flexShrink={0}>
        {showPageIndicator && (
          <Text color="fg.muted" whiteSpace="nowrap" mr={2}>
            {currentPage} of {totalPages}
          </Text>
        )}
        <ZoomButton
          label="Zoom out"
          tooltip="Zoom out · Ctrl -"
          onClick={onZoomOut}
          disabled={zoomOutDisabled}
        >
          <MagnifyingGlassMinusIcon />
        </ZoomButton>
        <Text minW="10" textAlign="center" color="fg.muted">
          {zoomPercentage}%
        </Text>
        <ZoomButton
          label="Zoom in"
          tooltip="Zoom in · Ctrl +"
          onClick={onZoomIn}
          disabled={zoomInDisabled}
        >
          <MagnifyingGlassPlusIcon />
        </ZoomButton>
        {onFitZoom && (
          <ZoomButton label="Fit to width" tooltip="Fit to width" onClick={onFitZoom}>
            <FrameCornersIcon />
          </ZoomButton>
        )}
        {onResetZoom && (
          <ZoomButton
            label="Reset zoom to 100%"
            tooltip="Reset zoom to 100% · Ctrl 0"
            onClick={onResetZoom}
          >
            <ArrowCounterClockwiseIcon />
          </ZoomButton>
        )}
      </HStack>

      <HStack gap={2} flex="1" justify="flex-end" minW={0}>
        {layout === "desktop" && onDownload && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            flexShrink={0}
            onClick={onDownload}
            loading={isDownloading}
            aria-label={isDownloading ? "Downloading" : undefined}
          >
            <DownloadSimpleIcon />
            Download
          </Button>
        )}
        {progressButton}
        {declineButton}
        {saveButton}
        {liveRegion}
        {overflowItems.length > 0 && <OverflowMenu items={overflowItems} />}
        {closeButton}
      </HStack>
    </Flex>
  );
};

export default HeaderBar;
