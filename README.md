# React PDF Editor

`@kera-management/react-pdf-editor` renders a PDF with [PDF.js](https://mozilla.github.io/pdf.js/), lets people place, fill and sign form fields on top of it, and saves the result with [pdf-lib](https://github.com/Hopding/pdf-lib.git).

The editor chrome (header, toolbars, panels, dialogs, drawers) is built with [Chakra UI v3](https://chakra-ui.com) and inherits the host app's Chakra theme and colour mode. The PDF canvas stays native DOM and CSS.

## Features

- **Prepare** (`mode="build"`): add, move, resize and configure fields; assign them to recipients; set the signing order.
- **Fill & Sign** (`mode="edit"`): fill the fields assigned to the active signer, with guided navigation, a progress panel and draw-or-type signatures.
- **View** (`mode="view"`): read-only.
- Field assignments are stored in the PDF metadata, so the document carries its own mapping.
- Responsive: desktop (1024px and up) shows inline side panels, tablet (640 to 1023px) shows them as overlay drawers, mobile (under 640px) uses bottom drawers, a page pill and an "Add field" pill.

## Installation

The package is published to GitHub Packages (`@kera-management` scope).

```bash
pnpm add @kera-management/react-pdf-editor
# or
yarn add @kera-management/react-pdf-editor
```

### Peer dependencies

Install these in the host app (4.0.0 moved Chakra, Emotion and Phosphor to peers):

| Package                 | Version   |
| ----------------------- | --------- |
| `@ark-ui/react`         | `^5.37.2` |
| `@chakra-ui/react`      | `^3.33.0` |
| `@emotion/react`        | `^11.0.0` |
| `@phosphor-icons/react` | `^2.1.10` |
| `pdf-lib`               | `^1.17.1` |
| `pdfjs-dist`            | `^5.4.0`  |
| `react`, `react-dom`    | `^18.0.0` |

`@ark-ui/react` (the guided tours) is the package Chakra itself is built on, so a host on Chakra 3.36 already has 5.37.2 installed. Use the version your Chakra resolves.

## Usage

The library ships **no** `ChakraProvider`. Render the editor inside the host's own provider, and import the stylesheet once:

```tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { PDFEditor } from "@kera-management/react-pdf-editor";
// Canvas styles (pages, overlay inputs, field boxes). Import once.
import "@kera-management/react-pdf-editor/dist/style.css";

export function App() {
  return (
    <ChakraProvider value={defaultSystem /* or your own system */}>
      <PDFEditor src="/form.pdf" mode="edit" onSave={handleSave} />
    </ChakraProvider>
  );
}
```

Rendering the editor outside a `ChakraProvider` throws Chakra's "forgot to wrap component within ChakraProvider" error.

### Colour mode

Dark mode follows the host's `.dark` class (the class [next-themes](https://github.com/pacocoursey/next-themes) puts on `<html>`). Chakra's semantic tokens and the editor's canvas variables both key off it. PDF pages, form inputs on the page and the signature pad stay white with dark ink in both modes.

The `theme` prop is **deprecated** and ignored since 4.0.0. It is kept only so existing hosts still type-check.

### Hosting inside a form or dialog

- Every editor button is `type="button"`, so wrapping the editor in a `<form>` doesn't submit it.
- Menus, popovers and tooltips render inline (not portaled), so Escape and focus stay inside a host Dialog. Confirm dialogs and drawers portal to `<body>` and stack above a host Dialog.
- Route every host-owned close path (a wrapping dialog's Escape, backdrop click or X) through `ref.current.requestClose()` so the unsaved-changes guard can run.

## Props

| Prop                   | Type                                                                                                    | Notes |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | ----- |
| `src`                  | `string \| URL \| TypedArray \| ArrayBuffer \| DocumentInitParameters`, required                        | URL, bytes, or a PDF.js parameter object. |
| `workerSrc`            | `string`                                                                                                | PDF.js worker URL. Defaults to the unpkg CDN build. |
| `mode`                 | `"view" \| "edit" \| "build" \| "defaults"`                                                            | Default `"edit"`. `"defaults"` is a standalone mode: see [Defaults mode](#defaults-mode). |
| `allowedModes`         | `("view" \| "edit" \| "build" \| "defaults")[]`                                                        | Modes offered in the header's mode menu. **Defaults to `[mode]`**, so the menu only appears when you pass two or more. (2.x defaulted to all modes; changed in 3.0.0.) |
| `onSave`               | `(pdfBytes, formFields) => void \| Promise<void>`                                                       | Fill & Sign save. A returned promise keeps the "Saving" state until it settles. Without it, Save downloads the PDF. |
| `onBuildSave`          | `(pdfBytes, buildSchema, fieldAssignments) => void \| Promise<void>`                                    | Prepare save. |
| `onClose`              | `() => void`                                                                                            | Shows the Close button. Goes through the unsaved-changes guard. |
| `participants`         | `{ id; label; role?; badge? }[]`                                                                        | Recipients available for assignment. |
| `activeParticipantId`  | `string`                                                                                                | In Fill & Sign, only this participant's fields are editable. |
| `unassignedVisibility` | `"readonly" \| "hidden"`                                                                                | How other people's fields render in Fill & Sign. Default `"readonly"`. |
| `fieldAssignments`     | `Record<string, string[]>`                                                                              | Overrides the assignments stored in the PDF metadata. |
| `parties`              | `PartiesConfig`                                                                                         | Native recipients panel (roles, signing order, expiry). Prepare by default. |
| `sidebarPanel`         | `{ title; content; modes? }`                                                                            | Host-owned panel shown in the side panel (desktop), side drawer (tablet) or a bottom drawer (mobile). |
| `onDownload`, `isDownloading` | `() => void`, `boolean`                                                                          | Shows a Download button (in "More actions" on tablet and mobile). |
| `onDecline`, `declineLabel` | `() => void \| Promise<void>`, `string`                                                            | Fill & Sign only. Shows "I can't sign this" with a confirm dialog. |
| `saveLabel`            | `string`                                                                                                | Save button label. Default "Save" ("Save defaults" in defaults mode). |
| `savedSignature`, `onSignatureAdopted` | `string`, `(dataUrl) => void`                                                           | Offer and capture a reusable signature (PNG data URL). The library never persists it. |
| `initialFieldValues`   | `Record<string, string \| boolean>`                                                                     | Values seeded once per document load, keyed by field name. A boolean ticks (true) or clears (false) a checkbox and is ignored for other fields. In defaults mode, locked fields follow it live: see [Defaults mode](#defaults-mode). |
| `resetFieldValues`     | `{ fields: string[]; nonce: number }`                                                                   | When `nonce` changes, the listed fields (by name) go back to their `initialFieldValues` value, or empty, and stop counting as unsaved changes. See [Defaults mode](#defaults-mode). |
| `defaultableFields`    | `string[]`                                                                                              | Defaults mode only: field names the person may fill. See [Defaults mode](#defaults-mode). |
| `fieldNotes`           | `Record<string, string>`                                                                                | Defaults mode only: a note per field name, shown on that field while it is locked. See [Defaults mode](#defaults-mode). |
| `exclusiveFieldGroups` | `string[][]`                                                                                            | Sets of checkbox field names of which at most one may be ticked, in every mode. See [Required choice groups](#required-choice-groups). |
| `onDefaultsSave`       | `(values: PDFEditorDefaultsValues) => void \| Promise<void>`                                            | Defaults mode's "Save defaults". No PDF is produced. |
| `rememberableFields`, `onRememberFieldValue` | `string[]`, `(fieldName, value: string \| boolean) => void \| Promise<void>`                     | Offer "Use on future documents" for these fields in Prepare and Fill & Sign. See [Use on future documents](#use-on-future-documents). |
| `signatureFieldNames`  | `string[]`                                                                                              | Extra field names to treat as signature fields. |
| `fieldLabels`          | `Record<string, string>`                                                                                | Friendly names, keyed by field name, wherever a field is named to a person. Wins over the PDF's own display name (AcroForm `/TU`), which wins over a humanized field name. |
| `mobileFriendlyView`   | `boolean`                                                                                               | Default `false`. Offers a reflowed, readable "Mobile friendly" view below 1024px in Fill & Sign and View. See [Mobile friendly view](#mobile-friendly-view). |
| `tours`                | `{ prepare?: boolean; sign?: boolean }`                                                                 | Guided tours this person hasn't seen yet. Omit it for no tours. See [Guided tours](#guided-tours). |
| `onTourEnd`            | `(tourId, reason, meta) => void`                                                                        | Called once each time a tour ends. See [Guided tours](#guided-tours). |
| `theme`                | `"light" \| "dark"`                                                                                     | **Deprecated, ignored.** Colour mode follows the host `.dark` class. |

## Mobile friendly view

On a phone a Letter page fits at about 55% zoom, which is too small to read or fill comfortably. With `mobileFriendlyView` on, the editor can show the document reflowed as readable text (16px, real headings, paragraphs and lists), with each fillable field as a full-width native control where it sits in the text. Values are shared with the original layout, so switching views never loses anything.

```tsx
<PDFEditor src="/lease.pdf" mode="edit" activeParticipantId="tenant1" mobileFriendlyView />
```

- **Where it shows.** Fill & Sign and View only; Prepare always uses the original layout. Layouts below 1024px only. Phones (< 640px) open in the mobile friendly view; tablets (640 to 1023px) open in the original and convert only when the signer picks Mobile friendly.
- **Original is always one tap away.** A "Mobile friendly | Original" toggle sits under the header whenever the view is available.
- **Fallback.** Before showing a converted document the editor checks that every character of the source text appears in it, unaltered and in order, and that every fillable field appears exactly once, next to its label. A document that fails the check (or has no text layer, a page with almost no text such as a scanned schedule, a large picture or a picture over text, an invisible OCR text layer, rotated text, more than 50 pages, and so on) stays in the original layout with the notice "This document can't be shown in mobile-friendly view." The reasons go to `console.debug` under `rpe:mobileView`.
- **Review before finishing.** In Fill & Sign, Finish (and the header Save, and the progress panel's finish) from the mobile friendly view first shows the original layout with the signer's values and a review bar. The save runs from that bar, through the normal save (the incomplete-fields confirm and `onSave` are unchanged). The unsaved-changes prompt's Save (header close, or `ref.requestClose()`) opens the same review instead of saving straight away.
- **`ref.save()` is not routed through the review.** It is host-initiated, so a host that drives saving itself owns showing the original first.
- **Guided signing.** A bottom bar shows "{i} of {total} · {n} remaining" with Previous, Next (to the next incomplete required field; signature fields open the signature dialog) and Finish.
- **Host forms.** The view's controls never add entries to a wrapping `<form>`'s `FormData`.
- **Off by default.** With the prop off there is no new UI and no conversion work.

## Guided tours

Short first-run tours that explain the editor before a user runs into it. The library owns the steps and decides **when** a tour runs; the host says **which** tours the person hasn't seen and records it when one ends. The library never stores who has seen a tour.

```tsx
<PDFEditor
  src="/lease.pdf"
  mode="edit"
  tours={{ prepare: !hasSeen("pdf_prepare"), sign: !hasSeen("pdf_sign") }}
  onTourEnd={(tourId, reason, { replay, lastStep }) => {
    if (!replay) markSeen(tourId);
  }}
/>
```

- **Tours follow the mode, never the account type.** `build` (Prepare) maps to `prepare` / `"pdf_prepare"`, `edit` (Fill & Sign) to `sign` / `"pdf_sign"`, and `view` has none. Pass what is unseen, not who the person is.
- **When a tour starts.** Automatically for the current mode's tour when `tours` says it is unseen, once per mounted editor, after the document has rendered (and, with `mobileFriendlyView`, after the conversion has settled). Never over the review step, a confirm dialog or a drawer. Omitting `tours` means no tour ever starts on its own.
- **Steps adapt to the screen.** A step whose target isn't showing is skipped (no signature field of yours, no progress panel, no parties panel). The Prepare tour has up to 5 steps: the modes (with the real mode menu opened, naming the mode you're in and only the modes offered), adding fields (the Fields panel on desktop, the Add field pill on a phone), choosing who fills each field, saving before switching, then Fill & Sign. With a single mode it is just the middle three, and the last step needs Fill & Sign among `allowedModes`. Prepare has no mobile friendly variant. The sign tour has two variants: the original layout (4 steps: your fields, Start / Next, tap to sign, `saveLabel`) and, on a phone showing the mobile friendly view, 3 steps (the view toggle, the guided bar, Finish then review). The decline sentence appears only with `onDecline`; the saved-signature wording only with `savedSignature`.
- **How it ends.** Next / Back / Skip, plus a close button. `reason` is `"completed"` only for Done on the last step. Skip, close, Esc, a click on the dimmed background, a mode switch, the Mobile friendly / Original toggle, Finish, a dialog or drawer opening, or the editor closing mid-tour are `"dismissed"`. `meta.lastStep` is the 1-based step showing when it ended.
- **Show tour.** When `tours` is passed and the current mode has a tour, "More actions" offers **Show tour** (on desktop it is that menu's only item). A replay reports `meta.replay: true`; hosts shouldn't record it.
- **The mobile friendly hint.** In Fill & Sign, while the sign tour may still start (or is running), the view's "Showing a mobile friendly version..." hint is held back. View has no tour, so its hint shows as before. The phone variant's first step says the same thing, and when that variant ends, however it ends (including the editor closing mid-tour), the hint is marked seen (`rpe.mobileFriendlyHintSeen`), so it never follows the tour. With `tours` omitted or the sign tour already seen, the hint behaves as before.
- **Inside a host dialog.** The tour isn't portaled: it renders inside the editor on a fixed full-viewport layer, so it stays clickable inside a host's modal Chakra Dialog, and a click on its dimmed background ends the tour without closing the dialog. Esc while a tour shows ends only the tour; the host dialog never sees it.
- **The unsaved-fields guard stays.** Completing or skipping the Prepare tour never affects the "Save your fields first?" dialog: any switch out of Prepare with unsaved fields still opens it, including picking a mode from the menu the tour opened.

## Required choice groups

Some forms ask one question with several separate checkbox fields, such as a yes/no pair ("Notices by email · yes" / "· no"). A choice group ties them together. The host declares groups in the editor's PDF Title metadata (`REACT_PDF_EDITOR_METADATA:` JSON, still version 3), next to `fieldAssignments`, `requiredFields` and `signatureFields`:

```ts
choiceGroups?: Array<{
  id: string;        // unique within the document
  fields: string[];  // member field NAMES, at least two
  required: boolean; // one answer is required
  label?: string;    // e.g. "Notices by email"
  help?: string;     // shown with the group
}>;
```

```ts
import { createEditorMetadata, serializeEditorMetadata } from "@kera-management/react-pdf-editor";

pdfDoc.setTitle(
  serializeEditorMetadata(
    createEditorMetadata({
      fieldAssignments: { email_yes: ["tenant1"], email_no: ["tenant1"] },
      requiredFields: [],
      choiceGroups: [
        { id: "notices_by_email", fields: ["email_yes", "email_no"], required: true, label: "Notices by email" },
      ],
    })
  )
);
```

- **Fill & Sign and the mobile friendly view.** Checking one member unchecks the others. Nothing is pre-selected by the editor.
- **One required item.** A required group is complete when exactly one member is checked: none, or more than one, is incomplete. It counts once in progress ("N of M"), blocks Save and Finish like a required field, and is one stop for guided navigation. Members are never required on their own, even if `requiredFields` lists them (a group with a listed member counts as required).
- **Display.** The Progress panel lists the group once, under `label` (else the members' display names joined with " / "), with `help` below it. Each member's hover title carries the help text, and the mobile friendly view shows the label, required mark and help above the first member.
- **Assignment.** A group is a participant's work when its members are assigned to them. Only that signer can answer it.
- **Saving.** Fill & Sign saves keep the title as is. A Prepare save writes the groups back, dropping a deleted member (and a group left with fewer than two). There is no Prepare UI for creating groups. A member's Required toggle in Prepare is its group's.
- **Host groups.** The `exclusiveFieldGroups` prop adds exclusive sets without touching the PDF: ticking one member unticks the others, in every mode (Fill & Sign, defaults, the mobile friendly view). They are merged with the document's groups (a field can be in both; ticking it unticks the members of each), but carry no label, help or required rule and are never written to the PDF. A member the person can't fill (another signer's, or locked in defaults mode) is never changed.
- **Absent means unchanged.** A PDF without `choiceGroups` behaves and saves exactly as before, and no `choiceGroups` key is written. Older readers ignore the key.

Pure helpers, for hosts and servers that need the same rule:

| Export | Does |
| ------ | ---- |
| `choiceGroupsFromMetadata(metadataOrTitle)` | The validated groups from parsed metadata or the raw PDF title string. `[]` if none. |
| `isChoiceGroupComplete(values, group)` | `true` when exactly one member is checked (`values` keyed by field name; `""` / `"Off"` is unchecked). |
| `isFieldOrChoiceGroupComplete(name, values, groups)` | Completion of one entry of a required-names list: a member answers with its group. |
| `normalizeChoiceGroups`, `pruneChoiceGroups`, `choiceGroupForField`, `choiceGroupLabel`, `isChoiceValueChecked` | Validation, keeping groups in step with existing fields, lookup and naming. |

`calculateParticipantCompletion` and `getParticipantCompletion` apply groups too: a group is one entry of `remainingRequiredFields` (under its first member's name), and `remainingChoiceGroups` lists the unanswered group ids (only for documents that have groups).

## Defaults mode

Defaults mode lets a person fill in the values a host keeps for later documents, on the document itself, without signing or producing a PDF. It is a standalone mode: pass it as the only allowed mode.

```tsx
<PDFEditor
  src={blankFormBytes}
  mode="defaults"
  allowedModes={["defaults"]}
  defaultableFields={["parking_spaces", "utilities_heat", "additional_terms"]}
  fieldNotes={{ tenant_name: "Filled in on each document" }}
  exclusiveFieldGroups={[["utilities_heat_landlord", "utilities_heat_tenant"]]}
  initialFieldValues={{ utilities_heat: true }}
  onDefaultsSave={async (values) => saveMyDefaults(values)}
/>
```

- **Which fields.** Only fields named in `defaultableFields` can be filled. Every other field renders locked with its value showing and is never reported; locked text boxes are disabled (dimmed, no focus, skipped by Tab) like locked checkboxes, so only the fillable fields look fillable. Signature fields are always read-only here and show no Sign prompt.
- **Changing the lists.** `defaultableFields` and `fieldNotes` are read on every render: change either prop and the form updates in place, with no remount. Values typed into fields that stay fillable are kept, a field that becomes locked keeps showing its value (it is no longer reported), and a field that unlocks can be filled straight away.
- **Notes on locked fields.** `fieldNotes` maps a field name to a short note saying why it can't be filled here. A locked field with a note gets it in its hover title (after the field's label) and, while the pointer is on the field, as a small muted label laid over the field's own box (it may run past a narrow box; near the page's right edge it grows leftwards). The label is hover-only on purpose: a long form has dozens of locked fields, and a permanent label on each would bury the form's own text and truncate on narrow boxes. In the mobile friendly view the note is helper text under the field. Notes on fillable fields, and outside defaults mode, are ignored.
- **Header.** With `allowedModes={["defaults"]}` there is no mode menu; a small muted "Defaults" label sits where it would be.
- **Starting values.** Fillable fields start from `initialFieldValues`, or the PDF's own value where it has none, once per document load; later changes to the prop don't touch them.
- **Locked fields follow `initialFieldValues`.** When the prop is passed, every locked field (not a signature) always shows its current `initialFieldValues` value, or empty (unticked) when the prop has no entry for it, even over a value in the PDF. This holds on every change of the prop or of `defaultableFields`: a field the person typed into and the host then locks shows the host's value, and its edit no longer counts as unsaved. Without the prop, locked fields show the PDF's values.
- **Resetting fields.** `resetFieldValues={{ fields, nonce }}` puts the listed fields, fillable or locked, back to their `initialFieldValues` value, or empty, each time `nonce` changes (the nonce on first mount is the starting point, not a reset). Their edits stop counting as unsaved; the session stays unsaved only if something else changed. It works in every mode. Typical use: after the host saves a change that cleared some values on its side, refetch, pass the new `initialFieldValues`, and bump the nonce for those fields.
- **Save defaults.** The header's primary button (label "Save defaults", or `saveLabel`) calls `onDefaultsSave(values)`. `values` (type `PDFEditorDefaultsValues = Record<string, string | boolean | null>`) has an entry for every defaultable field the document has: text, dropdown and radio fields give a trimmed string, or `null` when blank (cleared); checkboxes give `true` or `false`. Names the document doesn't have are left out. A returned promise keeps the "Saving" state until it settles; a rejection leaves the session unsaved. `ref.save()` and the unsaved-changes guard's "Save and close" do the same.
- **No signing UI.** No Progress panel, no required cues or Save gate, no guided signing, no parties or assignment, no tour. Display names (`/TU`) label fields as in other modes, and the mobile friendly view works (Save reports straight away, with no review step).

## Use on future documents

With `rememberableFields` and `onRememberFieldValue`, a listed field that has a value (non-blank text, a chosen option, a ticked checkbox) offers "Use on future documents":

- **Prepare:** in the selected field's toolbar, and in the field action bar on phones. The value is the field's current value in the document.
- **Fill & Sign:** in a small toolbar beside the field while it has focus (in the original layout and in the mobile friendly view). Pressing it keeps focus in the field.

Clicking it calls `onRememberFieldValue(fieldName, value)` with the field's name and its trimmed text, or `true` for a ticked checkbox. Once the callback settles, "Saved for future documents" shows in place of the field name for a moment; a rejection shows nothing (the host reports its own failure). The action is never offered for signature fields, another signer's field, a blank field, in View or defaults mode, or without both props. The editor stores nothing.

## Ref

```tsx
import { PDFEditor, type PDFEditorRef } from "@kera-management/react-pdf-editor";

const ref = useRef<PDFEditorRef>(null);
// ref.current.formFields: current form values
// ref.current.save(): runs the same save as the Save button
// ref.current.requestClose(): close, honouring the unsaved-changes guard
<PDFEditor ref={ref} src="/form.pdf" />;
```

## Examples

### Prepare a lease for signing

```tsx
<PDFEditor
  src="/lease.pdf"
  mode="build"
  allowedModes={["build", "edit"]}
  participants={[
    { id: "landlord", label: "Landlord", role: "landlord" },
    { id: "tenant1", label: "Tenant 1", role: "tenant" },
  ]}
  onBuildSave={async (pdfBytes, schema, fieldAssignments) => {
    await persist(pdfBytes, schema, fieldAssignments);
  }}
/>
```

A Prepare save rewrites the editor metadata in the PDF Title (`fieldAssignments`, `requiredFields`, `signatureFields`, `choiceGroups`, `signedFields`) and keeps any other top-level key a host put there verbatim; Fill & Sign saves leave them alone too.

A signature adopted in Fill & Sign is stamped into the page content when the document is saved, and the save records it in the metadata's `signedFields` as `{ field, participantId, at }`. The `participantId` is whoever was the `activeParticipantId` at the time. A stamped field counts as signed only for that participant, and only while they are still assigned to it: if a host later gives the field to someone else, it shows "Sign" for the new assignee and is incomplete for them until they sign. In Prepare, the assignment of a field that has a standing stamp is locked ("Signed by {name}. A signed field can't be reassigned."), because the ink can't be lifted off the page.

Assigning a signature field to someone in Prepare marks it required (it is saved in the metadata's `requiredFields`); unassigning leaves Required as it was, and the Required toggle still works either way.

### Sign as one participant

```tsx
<PDFEditor
  src="/lease.pdf"
  mode="edit"
  activeParticipantId="tenant1"
  saveLabel="Submit signature"
  onSave={async (pdfBytes, values) => submit(pdfBytes, values)}
  onDecline={async () => decline()}
/>
```

### Read only

```tsx
<PDFEditor src="/document.pdf" mode="view" />
```

## Development

This repo uses yarn classic.

```bash
yarn install
yarn dev     # demo app (index.tsx) inside a ChakraProvider with a dark-mode toggle
yarn test    # vitest
yarn lint
yarn build   # emits dist/index.js, dist/index.d.ts and dist/style.css
```

Tests render through `renderWithChakra` in `src/lib/testUtils.ts`. `src/lib/__tests__/noHardcodedColors.test.ts` fails the build on literal colours (hex, `rgb()`, `hsl()`) or green tokens anywhere in `src/lib`. Use Chakra semantic tokens in chrome and the `--pdfe-*` variables in `theme.css` on the canvas.

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Acknowledgments

[PDF.js](https://mozilla.github.io/pdf.js/) and [pdf-lib](https://github.com/Hopding/pdf-lib.git). Originally forked from [lengerrong/react-pdf-editor](https://github.com/lengerrong/react-pdf-editor).

## License

[Apache](LICENSE)
