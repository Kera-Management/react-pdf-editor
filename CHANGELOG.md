# Changelog

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
