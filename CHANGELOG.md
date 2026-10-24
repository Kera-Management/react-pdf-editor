# Changelog

## 4.3.0

### Added

- **`resetFieldValues?: { fields: string[]; nonce: number }`**: each time
  `nonce` changes (not on first mount), the listed fields, fillable or
  locked, in any mode, go back to their `initialFieldValues` value or to
  empty (unticked), and no longer count as unsaved changes. The session
  stays unsaved if anything else changed.
- Defaults mode: when `initialFieldValues` is passed, locked fields follow
  it live. A locked field (not a signature) always shows its current
  value there, or empty when it has no entry, even over the PDF's value,
  including a field that was typed into and then locked; its edit stops
  counting as unsaved. Fillable fields still seed once per load.
- Prepare: assigning a signature field to a participant makes it required
  (saved in `requiredFields`). Unassigning leaves Required as it was.
- `useFieldValues` gains `assign(entries, asSeed)`.
- **Defaults mode** (`mode="defaults"`, passed as the only allowed mode).
  The person fills only the fields the host lists in `defaultableFields`;
  every other field renders locked with its value (a locked text box is
  disabled, dimmed and out of the tab order like a locked checkbox, so it
  never looks fillable), and signature fields are always read-only with
  no Sign prompt. The primary
  button, "Save defaults" (or `saveLabel`), calls
  `onDefaultsSave(values)` instead of producing a PDF: `values` has every
  defaultable field the document has, text, dropdown and radio as a
  trimmed string or `null` when blank, checkboxes as `true` / `false`.
  Awaited like `onSave`. No Progress panel, required cues or Save gate,
  guided signing, parties or assignment UI, or tour. Display names (`/TU`)
  and the mobile friendly view work as elsewhere. New type
  `PDFEditorDefaultsValues`; `"defaults"` joins `PDFEditorMode` (and the
  `ProgressPanel` `mode` prop type, which renders nothing for it).
- Defaults mode: `defaultableFields` and the new `fieldNotes?:
  Record<string, string>` follow the props live (no remount): typed
  values in fields that stay fillable are kept, and a field that becomes
  locked keeps showing its value. A locked field with a note gets it in
  its hover title and, while the pointer is on it, as a small muted label
  over the field's own box (helper text in the mobile friendly view).
  `FieldControlModel` gains `note?`.
- With `allowedModes={["defaults"]}` the header shows a small "Defaults"
  label where the mode menu would be.
- **`exclusiveFieldGroups?: string[][]`**: ticking one checkbox in a set
  unticks the others, in every mode, merged with the document's own choice
  groups. Members another signer owns or that are locked are left alone
  (now true of choice groups too).
- **"Use on future documents"** (`rememberableFields`,
  `onRememberFieldValue(fieldName, value)`). In Prepare, the selected
  field's toolbar (and the phone field action bar) offers it for a listed
  field that has a value; in Fill & Sign, a small toolbar beside the
  focused field does. The callback gets the trimmed text, or `true` for a
  ticked checkbox; "Saved for future documents" shows briefly once it
  settles. Never for signature fields, another signer's field, blank
  fields, View or defaults mode. `ContextToolbar` gains `onRemember?` /
  `rememberDisabled?`; `FieldActionBar` gains `onRemember?`,
  `rememberDisabled?`, `rememberFeedback?`.
- `initialFieldValues` accepts booleans for checkboxes
  (`Record<string, string | boolean>`): true ticks the box, false clears
  it; a boolean for any other field is ignored. Strings work as before.

- **Field display names (AcroForm `/TU`).** A PDF field can carry a short
  human label in its standard alternate name, `/TU` (e.g. "Landlord's
  legal name"), while its ID (`/T`, the full name) never changes. The
  editor reads `/TU` for every field when a document loads and shows it,
  never the raw ID, wherever a field is named to a person: the Progress
  panel's remaining fields, the hover title of every Fill & Sign/View
  overlay (text, multiline, select, checkbox, radio, signature), the
  Prepare assign banner ('Who fills "..."?') and its switches, the field
  toolbar and mobile field action bar, the Prepare field previews and
  their accessible names, and the mobile friendly view's fallback labels
  (a field the page has no text for, a choice with no label, a radio
  group's legend). One rule everywhere: a host `fieldLabels` entry, then
  `/TU`, then the previous fallback (`humanizeFieldName`, or the raw name
  in Prepare). The ID still drives assignments, values, saving and the
  `name` / `data-field-name` attributes. PDFs without `/TU` look as
  before, except that Fill & Sign overlays now always carry a hover title
  (the humanized name).
- `/TU` survives saving. Fill & Sign saves edit the loaded form in place,
  so every field keeps its `/TU`; a Prepare save rebuilds each field and
  writes its display name back. A duplicated field's display name gets the
  same suffix as its name (" copy", " (page 3)").
- `BuildModeField.displayName?`; `ProgressPanel`: `fieldDisplayNames?`
  prop; `fieldLabels` now applies beyond the Progress panel.

- **Required choice groups** for questions asked as several checkbox
  fields (e.g. Ontario 2229E Section 3, "Notices by email · yes" / "·
  no"). Optional `choiceGroups: { id, fields, required, label?, help? }[]`
  in the editor's title metadata (still v3; absent = unchanged behaviour,
  and no key is written). In Fill & Sign and the mobile friendly view the
  members are mutually exclusive; a required group is ONE required item,
  complete when exactly one member is checked, that blocks Save/Finish and
  guided navigation like any required field. Members are never required on
  their own. The Progress panel lists the group once by `label` (fallback:
  the members' display names joined with " / ") with its `help`; member
  hover titles carry the help, and the mobile friendly view shows label,
  required mark and help above the first member. Assignment gating applies.
  Fill & Sign saves keep the metadata; Prepare saves write it back, drop a
  deleted member and a group left with fewer than two members.
- Pure helpers: `choiceGroupsFromMetadata`, `isChoiceGroupComplete`,
  `isFieldOrChoiceGroupComplete`, `normalizeChoiceGroups`,
  `pruneChoiceGroups`, `choiceGroupForField`, `choiceGroupLabel`,
  `isChoiceValueChecked`; type `PDFEditorChoiceGroup`.
  `PDFEditorMetadata.choiceGroups?`, `createEditorMetadata({ choiceGroups })`,
  `ParticipantCompletion.remainingChoiceGroups?` (only for documents with
  groups) and the `ProgressPanel` `choiceGroups?` prop.
  `calculateParticipantCompletion` /
  `getRequiredAssignedFieldNames` count a group once, under its first
  member's name.

### Changed

- **No "Not assigned to a signer" text.** A field assigned to no one (once
  any assignment exists) is still locked in Fill & Sign, read-only or
  hidden per `unassignedVisibility`, but gets no title, aria-label, chip or
  mobile note. Another signer's field still says "Assigned to {name}".
  When gating lifts, the overlay's own hover title comes back.

### Fixed

- A Prepare save no longer drops top-level editor metadata keys it doesn't
  know (a host's or server's own stamp, e.g. `"keraSignatures": "manual"`):
  they are kept verbatim next to the rewritten known keys.
  `serializeEditorMetadata(metadata, previousTitle?)` takes the previous
  Title to do the same. Fill & Sign saves already kept them.
- **The Progress panel's Remaining list matches its count.** The count and
  Finish have always measured the signer's REQUIRED fields, but Remaining
  listed every assigned field still empty, so a signer with an optional
  field of their own (a lease's date beside the signature) read "0 of 1"
  over two Remaining items, and after signing read "You've completed all
  your fields" with that field still listed above it. Remaining now lists
  the required work only (what Start/Next walk); the signer's other empty
  fields are listed under "Optional" after the finished state, which then
  says "You've completed all your required fields." New `ProgressPanel`
  prop `requiredFieldNames?` (PDFEditor passes
  `getRequiredAssignedFieldNames`); without it the panel lists as before.
- **No required ring on another signer's field.** The dashed required ring
  marked every empty required field, including ones gated to someone else
  (a tenant's signature, and with choice groups the tenant's yes/no boxes,
  for the manager signing first). It now marks only fields the active
  signer can fill, and it is also applied after switching from Prepare to
  Fill & Sign, where it used to be missing until the next zoom.
- **A signed signature stays signed after saving.** A drawn or adopted
  signature is stamped onto the page as an image, and the signature
  field's own AcroForm value stays empty (by design, since 2.9.0). Nothing
  in the saved PDF said the field was signed, so reopening the saved bytes
  (which a host does after every save) showed "Sign" again and the Progress
  panel counted it as remaining, and `getParticipantCompletion` on the
  saved file reported it as a missing required field. This affected every
  signature field, whether a Prepare save created it or a server wrote it.
  Saves now record each stamped field in the title metadata's new optional
  `signedFields` (v3; written only when non-empty, limited to
  `signatureFields`). Fill & Sign saves add to it and keep every other
  metadata key as it was; a document without editor metadata keeps its
  Title. Prepare saves carry it through renames. `calculateParticipantCompletion`
  and `getParticipantCompletion` count a stamped field as complete. On
  reopening, a stamped field shows as signed, with the stamp visible
  through it, and can't be signed again (a second stamp would land on the
  first). Hosts still receive `""` for it in `onSave` formFields and
  `ref.formFields`. A document signed before this version has no record
  and still asks again. `PDFEditorMetadata.signedFields?`,
  `createEditorMetadata({ signedFields })`, `withSignedFieldsInTitle`.
- **A stamped signature belongs to the signer who stamped it.** Each
  `signedFields` entry is now a record, `{ field, participantId, at? }`
  (`PDFEditorSignedField`): the active participant at the save that
  stamped it (`""` with no `activeParticipantId`) and when. A record
  counts as complete only for that participant, and only while they are
  still assigned to the field. Before this, the record was the field name
  alone, so a field signed by A and then reassigned to B (a host passing
  different `fieldAssignments`) read as already signed for B: B's
  completion said done and B could not sign it.
  - Completion (`calculateParticipantCompletion`,
    `getParticipantCompletion`): a stamp is complete for its signer while
    assigned; with no participant, while its signer is still assigned. The
    editor's internal stamped marker in `formFields` never counts by
    itself.
  - Fill & Sign, desktop and the mobile friendly view: a field the signer
    at the keyboard is assigned to shows as signed (and is locked) only
    when their own stamp stands. A field reassigned to them shows "Sign"
    and they can sign it; their stamp then replaces the earlier record.
    The Progress panel, guided Next, the Save gate and the field controls
    all follow from the same rule. Another signer's stamped field still
    shows as signed for everyone else.
  - Prepare: a stamped signature is drawn into the page content (pdf-lib
    `drawImage`), not an annotation, so it can't be removed. The
    assignment of a field with a standing stamp is locked: the
    Recipients panel says "Signed by {name}. A signed field can't be
    reassigned." and its switches are disabled, and assignee changes to
    that field are ignored whatever path makes them. A Prepare save
    carries each record, with its signer, to the field's new name; a
    duplicate of a signed field gets neither the record nor the lock.
  - Legacy entries (bare names, written by 4.3.0 pre-releases) are read as
    signed by the field's assignee in the document's own metadata when it
    has exactly one, and dropped otherwise (the field asks again).
  - New exports: `PDFEditorSignedField`, `normalizeSignedFields`,
    `isSignatureRecordedFor`, `standingSignatureRecord`.
    `withSignedFieldsInTitle(title, records)` takes records.
    `PartiesPanelAssignMode` gains `lockedReason?`.

## 4.2.0

### Fixed

- **Prepare -> View with unsaved fields is now guarded.** The "Save your
  fields first?" dialog guarded only Prepare -> Fill & Sign; switching to
  View left newly placed fields missing with no explanation. Any switch out
  of Prepare while prepared fields are unsaved now opens the dialog, and
  "Save and continue" / "Continue without saving" land on the mode the user
  picked. The dialog copy is generic ("...so they won't appear in Fill &
  Sign or View..."). The dialog stays the permanent guard: it fires every
  time, whatever the user has seen before. Spec:
  `agent-docs/specs/PDF_EDITOR_GUIDED_TOUR_SPEC.md` §6.
- The in-canvas "Fields added in Prepare are not saved yet" notice now also
  shows in View ("...cannot be shown here"), still first in the banner
  stack, above the Mobile friendly / Original toggle.

### Added

- **Unsaved-fields note in the mode menu** (Prepare only). While prepared
  fields are unsaved, the mode menu opens with a warning, "Your new fields
  aren't saved yet. They won't appear in Fill & Sign or View until you
  save.", and a Save action that runs the Prepare save and keeps the menu
  open. It warns before a mode is picked; the dialog above still guards the
  switch itself. Spec §5.4. `HeaderBar`: `hasUnsavedBuildChanges` prop
  (internal).
- **Guided sign tour** (minor: new props only). `tours?: { prepare?;
  sign? }` says which tours the person hasn't seen; `onTourEnd(tourId,
  reason, { replay, lastStep })` reports each end so the host can record
  it. The library picks the tour from the mode alone (`edit` -> `pdf_sign`)
  and decides when it runs: once per mounted editor, after the document
  has rendered and the mobile friendly conversion has settled, never over
  the review, a dialog or a drawer. Two variants: the original layout (4
  steps) and phones in the mobile friendly view (3 steps), which takes the
  place of the view's first-run hint and marks it seen when it ends.
  "Show tour" in More actions replays the current mode's tour (on desktop
  the menu appears for it). Built on Ark UI's tour, styled with Chakra
  tokens. The tour renders inside the editor (not portaled to `<body>`),
  so it stays clickable inside a host's modal Chakra Dialog; Esc and a
  click on its dimmed background end the tour, never the host dialog. In
  View (no tour) the first-run hint shows as in 4.1. Omitting `tours`
  leaves existing hosts unchanged. Spec:
  `agent-docs/specs/PDF_EDITOR_GUIDED_TOUR_SPEC.md` §3.2, §3.3, §5.
- **Guided Prepare tour** (`build` -> `pdf_prepare`, `tours.prepare`).
  Up to 5 steps: the three modes (the real mode menu opens for this step
  and closes when it ends; the copy names the current mode and only the
  modes offered), adding fields (Fields panel on desktop, Add field pill
  on phones), choosing who fills each field, saving before switching, then
  Fill & Sign. The mode steps appear only with more than one mode, the
  last only when Fill & Sign is offered, and the parties step only when
  the parties panel is showing. Same start and end rules as the sign
  tour; "Show tour" replays it in Prepare. It never bypasses the "Save
  your fields first?" dialog, completed or skipped. Spec §3.1.
  `HeaderBar`: `modeMenuOpen` prop (internal) holds the mode menu open.
- `data-pdfe-tour` anchors on the mode menu (button and open menu), Save, Decline, Progress
  (rail section and header button), field palette, mobile Add field,
  parties (rail section and mobile drawer), the document area and the
  guided bar's Finish. Spec §5.2.
- New peer dependency `@ark-ui/react` `^5.37.2` (the version Chakra
  3.36 depends on; hosts on Chakra already have it).
- **Tour intro card.** Every tour opens on a centred card ("Quick tour",
  a title, one line on what it covers, Start tour / Skip) before anything
  is highlighted. "1 of N" counts only the steps after it, step 1 has no
  Back, and `meta.lastStep` is 0 when a run ends on the intro.
- **The editor is blocked while a tour runs.** Presses on the highlighted
  control do nothing (elsewhere they end the tour, as on the backdrop),
  and mode switches are ignored, so a mid-tour switch can no longer start
  the other mode's tour.
- **No second automatic tour after a skip.** Once a tour ends as
  dismissed, no other tour starts on its own in that mounted editor;
  "Show tour" still replays. Finishing a tour (Done) still lets the next
  mode's tour start.

### Fixed (tour)

- The tour popover could render under the dimmed backdrop (Ark copies the
  content's z-index onto the positioner, and the content had none).
- Spotlight corners are rounded (16px) to follow the cards they frame.

## 4.1.0

### Added

- **Mobile friendly view** (opt-in `mobileFriendlyView` prop, default
  `false`). Below 1024px, in Fill & Sign and View, the document can be shown
  reflowed as readable text with each fillable field as a full-width native
  control. Spec: `agent-docs/specs/PDF_EDITOR_MOBILE_FRIENDLY_VIEW_SPEC.md`.
  - "Mobile friendly | Original" toggle under the header; phones open in the
    mobile friendly view, tablets in the original. Switching keeps the
    focused field (or the reading position).
  - Legal text fidelity: a document that fails the converter's coverage
    check stays in the original layout with the notice "This document can't
    be shown in mobile-friendly view."
  - Fill & Sign: a guided bar replaces the page pill: a filling progress
    circle with the completed count, "{n} left" and "Field {i} of {total}",
    then Previous, Next and Finish. Next and the counts use the same list of
    the signer's required fields; on an optional field, Next carries on from
    there. A signature stop opens the signature dialog.
  - Finish shows the original with the signer's values for review before
    the existing save runs. "Keep signing" from the incomplete-fields
    prompt goes back to the mobile friendly view at the first open field.
  - View mode renders every value read-only; the page pill follows the
    reflowed pages.
  - Both views share the same value store, assignment gating, required and
    progress data and signature dialog. Reflow controls are dissociated from
    a host `<form>`.
  - With the mobile friendly view showing, the unsaved-changes prompt's
    "Save and close" opens the review first; its save (the review bar or
    the header Save) then closes the editor. Leaving the phone/tablet
    layouts during that review brings the prompt back.
- `HeaderBar`: `zoomControlsHidden` prop (hides the zoom cluster and Fit to
  width while the reflowed view shows). `EditorLayout`: `canvasFooter` slot.
  `MobileChrome`: `showPagePill` prop. All internal.

### Changed

- The original layout's field overlays now read and write values through a
  shared field-control model (also used by the mobile friendly view).
- **Same-name fields are one value everywhere** (with or without
  `mobileFriendlyView`, at every width): editing one copy of a repeated
  text, dropdown or list field writes every copy, and adopting a signature
  fills every copy of that signature field. Before, only the edited copy
  changed and a stale copy elsewhere could win on save.
- **Same-name checkbox groups** (boxes sharing a name, each with its own
  export value) behave like the PDF defines them: ticking one unticks the
  others, a box shows ticked only when the group's value is its own export
  value, and the save ticks that exact box (pdf-lib's `check()` always
  ticked the first). The field's value for completion and `onSave` is the
  ticked box's export value.
- In the mobile header the Progress button no longer shows a "0 of 0" count
  (any layout) and in the mobile friendly view leaves progress to the
  guided bar.

### Fixed

- Prepare-mode saves no longer tick a checkbox whose value is "Off".
- A host `onSave` that rejects from the header Save no longer surfaces as an
  unhandled promise rejection.

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
