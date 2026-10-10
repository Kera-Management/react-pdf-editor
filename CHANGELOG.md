# Changelog

## 4.0.0

Chakra UI redesign. The editor chrome (header, toolbars, side panels, field
settings, dialogs, mobile and tablet drawers) is rebuilt with Chakra UI v3 and
inherits the host's theme and colour mode. The PDF canvas stays native; only
its colours and the audit fixes below change. Spec:
`agent-docs/specs/PDF_EDITOR_CHAKRA_REDESIGN_SPEC.md`.

### Breaking

- **Chakra peer dependencies.** `@chakra-ui/react ^3.33`, `@emotion/react ^11`
  and `@phosphor-icons/react ^2.1.10` are now peer dependencies (Phosphor moved
  from `dependencies`). The library ships no provider: the host must render the
  editor inside its own `ChakraProvider`. This includes the public
  `ProgressPanel` export (its props are unchanged).
- **No global CSS.** `theme.css` no longer defines `:root` variables, global
  classes or `[data-theme]` rules. Every variable is scoped under
  `.pdf-editor-root`, and the 3.x chrome variables (`--text-primary`,
  `--accent-primary`, `--panel-bg` and so on) are gone. `dist/style.css` is
  still emitted and still needs importing once; it now holds canvas styles only.
- **`theme` prop deprecated and ignored.** Colour mode follows the host's
  `.dark` class (next-themes). The prop stays in the types so hosts still
  compile.
- **`allowedModes` defaults to `[mode]`.** Unchanged since 3.0.0; noted here
  for hosts upgrading from 2.x, where it defaulted to all modes.
- **Brand green removed.** Primary actions are a plain Chakra `Button` and take
  the host theme's default palette. Recipient colours move to Chakra hues
  (blue, teal, purple, pink, orange, cyan); none are green. On the canvas they
  stay on the light-mode values in dark mode, because the page is always white.
- **Mobile bottom sheet replaced.** `BottomSheet` (with snap points and drag)
  is now a Chakra bottom `Drawer`: one drawer per panel, no snap points, closes
  via X, backdrop or Escape. No prop exposed the snap points.

### Audit fixes (`agent-docs/audits/PDF_EDITOR_UX_AUDIT_2026-08-28.md`)

- **A1** The parties assign banner always shows the field's display name, never its id (test added).
- **A2** Duplicate is a split button: "Duplicate" acts on this page; the menu offers "On this page" and "On every page".
- **A4** The field palette sizes to its content and Pages fills the rest of the rail.
- **A5** Click-to-add (palette and mobile "Add field") places the field centred in the visible part of the active page, clamped inside it, at any zoom.
- **A6** Multi-select: Shift-click adds or removes fields; the toolbar shows "N selected" and applies Required and Delete to all; Escape on the canvas clears the selection without closing a host Dialog. Drag, resize and nudge still act on one field.
- **A7** Dropdowns and radios with no options are flagged: a "No options" chip and red outline on the canvas, a warning in the Properties panel, the field popover and the Options dialog.
- **A8** Desktop and tablet get a "Hide pages panel" / "Show pages panel" toggle; the dead mobile hamburger is removed.
- **A9** Dead code removed: `ResponsiveDrawer`, `FloatingPanel`, `icons/*`, `useGestures`, `BottomSheet`, `Popover`, the panels' `isCollapsed` props and every chrome CSS module.
- **B1** The mobile and tablet Progress button shows a "2 of 5" badge.
- **B6** Fields gated to another signer show a visible "Assigned to X" chip in Fill & Sign.
- **B7 / C4** Fit to width picks the largest zoom step that fits (never the old 125% fallback) and re-fits on resize or sidebar toggle until the user zooms by hand.
- **C3** The header page count is removed on mobile, and on desktop while the Pages panel is visible.
- **C5** Ctrl/Cmd + wheel zooms (deltas accumulate, so a trackpad pinch steps gradually); Ctrl/Cmd `+`/`=`, `-` and `0` zoom in, out and reset (ignored while typing in an input). Zoom tooltips show the shortcuts.
- **C6** The jump-to-field flash uses a token ring (`data-flash`) instead of an inline teal shadow; the round FAB becomes an "Add field" pill.
- **C7** Loading shows a progress bar with "Loading document"; the error state has "Try again" (re-runs the load) and Close.
- **C8** The mobile page pill is interactive: Previous, Next and "3 of 12", which opens a Pages drawer.
- **C9** Tablet (640 to 1023px) shows the side panels as overlay drawers, closed by default.
- **C10** Page thumbnails render lazily as they scroll into view, with a skeleton until then.
- **C11** One shared `PanelHeader` for every side-panel section.
- **C12** Every icon-only button has an `aria-label` and a matching tooltip.
- **C13** Dialogs and drawers trap focus, close on Escape and return focus to their trigger.
- Breakpoints: 640px now counts as tablet and 1024px as desktop in both CSS and JS (they disagreed by one pixel).

### Copy changes

| Where | Old | New |
|---|---|---|
| Mobile header | Hamburger "Toggle menu" | Removed |
| Desktop/tablet header | none | "Hide pages panel" / "Show pages panel" |
| Header page indicator | "3 / 12" | Removed on mobile and while the Pages panel shows; otherwise "3 of 12" |
| Header mode label (single mode) | "Fill & Sign" | Nothing shown |
| Zoom controls | `title` "Fit to width", "Reset zoom to 100%" | Tooltips "Zoom in · Ctrl +", "Zoom out · Ctrl -", "Fit to width", "Reset zoom to 100% · Ctrl 0" |
| Mobile header progress | "2/5" | "Progress" + badge "2 of 5" (also on tablet) |
| Mobile header | Recipients, host panel and Download buttons | Inside "More actions" (Decline stays visible) |
| Mobile page indicator | "3 / 12" | "3 of 12" button with Previous/Next; opens "Pages" |
| Mobile FAB | Round "+" with radial menu | "Add field" pill opening "Add a field" |
| Progress panel | "2 / 5" | Badge "2 of 5" |
| Progress panel | "40% complete" | Removed |
| Progress panel | "5 fields remaining" | "Remaining" + badge "5" |
| Progress panel | "You've completed all your fields!" | "You've completed all your fields." |
| Properties panel | "W", "H" | "Width", "Height" with a "pt" addon |
| Properties panel | "Required field" checkbox | "Required" switch, "Signer must fill this field" |
| Properties panel | "Close" button | Removed (the drawer has its own close) |
| Field popover / Properties | "Field Name" | "Field name" |
| Field popover | "Edit options..." | "Edit options" + count badge |
| Popover / Properties / Options dialog / canvas | none | "No options" + "Add at least one option so signers can choose." |
| Options dialog | No footer | "Done" |
| Field palette | "Drag fields onto the document" | "Drag onto the page or click to add" |
| Parties | Two buttons "All at once" / "One after another" | Same labels as a segmented control |
| Unsaved changes dialog | Discard · Keep editing · Save | Keep editing · Discard · Save |
| Prepare guard dialog | Continue without saving · Stay in Prepare · Save and continue | Stay in Prepare · Continue without saving · Save and continue |
| Error state | "...Try reloading the page or choosing a different file." | "...Try again, or choose a different file." + "Try again" and Close |
| Loading state | `aria-label` only | Visible "Loading document" + Close |
| Gated field | Tooltip "Assigned to X" | Visible chip with the same text |
| Context toolbar | none | "N selected" |
| Mobile drawers | One shared "Properties"/"Progress" sheet | Separate "Properties", "Progress", "Pages", "Add a field" drawers |
| Signature field | "✍ Signature" | Signature icon + "Signature" |

### Also in 4.0.0 (design review and code-review rounds)

- **Desktop pages rail slides open and shut**, and the canvas scales with it
  toward the new fit-to-width zoom, then re-renders sharp (snapshots cover
  the repaint). Off when the OS asks for reduced motion.
- **Mobile Prepare: a tap selects, it never opens a sheet.** The "Add field"
  pill becomes a docked action bar for the selected field (Required, Edit,
  Duplicate, Delete; X deselects). Edit opens the Properties drawer. The
  canvas scrolls the field clear of the bar.
- **Mobile fields are drawn at their true size** (a 44px minimum stacked
  fields over each other at phone zoom).
- **Avatars match the app's `UserAvatar`**: squircle, name-hashed hue, same
  palette (green included, so a person keeps one colour app-wide).
- **Rail polish:** banded section headers (Fields, Pages, Recipients, host
  panel) instead of dividers; field palette cards with an icon tile and a
  permanent grip; the current page tile is filled and outlined; empty
  recipient groups show a dashed placeholder.
- **Multi-select:** Delete/Backspace on a multi-selection deletes all of it;
  Cmd/Ctrl+D does nothing then (matching the toolbar). Deleting the primary
  keeps the rest selected. Shift-click closes the field settings popover.
- **Gating:** "Assigned to X" sits inside its field (never over the row
  above). Gating is undone when the active participant is cleared or the
  mode leaves Fill & Sign. Assignments are resolved once per change and
  shared by gating, progress, completion and the save gate.
- **Keys:** Esc and Ctrl/Cmd zoom only act on `<body>` focus when the last
  click was inside the editor, so the host page keeps its own Esc and
  browser zoom. One Firefox wheel notch is one zoom step.
- **Field size inputs** never apply a value under 20pt while typing; leaving
  the box clamps to 20.
- **Tablet** right drawer shows every section and no longer writes the
  persisted desktop panel state.
- Prepare-mode field boxes carry `data-build-field-id`, so `data-field-id`
  again marks only fillable PDF overlays.

| Where | Old | New |
|---|---|---|
| Recipients, empty "Also gets a copy" | "No one yet." | "Choose Copy on anyone who should get the signed document." |
| Recipients, empty "Not included" | "No one yet." | "Everyone is included." |
| Mobile Prepare, field tap | Opens "Properties" | Selects; docked bar with "Required", "Edit", "Duplicate", "Delete", "Deselect field" |

### Unchanged host contract

`PDFEditorProps`, `PDFEditorRef` (`formFields`, `save`, `requestClose`), the
public exports in `src/index.ts`, `dist/style.css`, `data-field-id`,
`data-reorder-id` and `data-drag-handle`. No props were added or removed
(`onFinish` was considered and not added; Finish still calls `onSave`).


## 3.0.0

Signing-native editor release. Supersedes the unpublished 2.9.x/2.10.x line —
everything below ships together in this major.

### Breaking

- `ProgressPanel` (and `ProgressPanelProps`) now re-export the component the
  editor actually renders, under `lib/components/Panels/`. The previous export
  pointed at a legacy implementation `PDFEditor` never mounted. Same export
  name, different component and props — consumers rendering it directly must
  re-check their props against `ProgressPanelProps`.

### Added

- **Parties panel** — native recipient management in Prepare: assign roles,
  reorder signing steps, drag a signer into another's step to sign together,
  optional expiry input. Renders in `build` mode by default; opt other modes in
  via `parties.modes` (never `view`).
- **Signature capture** — draw or type, adopt a saved signature, stamped onto
  the page as an image rather than written into the AcroForm as a data URL.
- **Guided signing** — remaining-field checklist with Start/Next navigation and
  auto-scroll to the signer's first incomplete required field on load.
- **`fieldLabels`** prop: host-supplied friendly names per field, replacing the
  humanized guess. `humanizeFieldName` also now reduces XFA-style hierarchical
  names (`form1[0].#subform[2].RFirstName[0]`) to their leaf.
- **Awaitable `onSave` / `onBuildSave`** — returning a promise keeps the
  "Saving" state up until the host's own persistence settles. A rejection
  clears it and leaves the document dirty.
- **Unrendered-field surfacing** — a field assigned to the signer that never
  renders (read-only or hidden in the AcroForm) is excluded from remaining and
  required counts and surfaced as its own warning, so a signer who completed
  everything they can see is never silently blocked.

### Fixed

- **Assignment resolution unified.** The interactivity gate, progress counter,
  and completion math now resolve field ownership through one shared
  `resolveEffectiveFieldAssignments`: the host `fieldAssignments` prop wins
  whenever non-empty, embedded PDF metadata is the fallback. These three had
  drifted apart and could disagree about whose field a given box was.
- **Unmapped fields lock when a mapping exists.** Once any field carries an
  assignment, a field with no entry is nobody's in particular — not everyone's.
  Previously every unassigned field in a prepared document was editable by any
  signer. A wholly empty mapping still means unrestricted, so plain fill & sign
  is unchanged.
- **Empty-mapping checklist.** With no per-field assignment at all, the
  remaining-fields list and guided navigation stayed empty while the header
  count showed work outstanding.
- **Out-of-order navigation.** Completing a field reached by clicking the
  remaining list no longer sends "Next field" back to the top.
- **Failed saves keep their guard.** The unsaved-changes and
  Prepare-before-Fill dialogs stay open when the host's save rejects, instead
  of dismissing as though it succeeded.
- **Party removal preserves signing steps.** A party dropped from
  `participants` no longer silently re-chains the following signer into the
  step above.
- Participant matching is normalized (trimmed, case-folded) everywhere, so
  identity drift between a baked-in id and the host's `activeParticipantId`
  can't exclude a signer from their own fields.
