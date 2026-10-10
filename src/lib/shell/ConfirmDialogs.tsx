import React, { useRef } from "react";
import { Button, Dialog, Portal } from "@chakra-ui/react";
import { Modal } from "../components/Modal/Modal";
import {
  OptionsEditor,
  type ComboboxItem,
} from "../components/Panels/OptionsEditor";

export interface ConfirmDialogsProps {
  /** Unsaved-changes close guard (opened by requestClose while dirty). */
  unsaved: {
    open: boolean;
    isSaving: boolean;
    onKeepEditing: () => void;
    onDiscard: () => void;
    onSave: () => void;
  };
  /** Prepare -> Fill & Sign guard while prepared fields are unsaved. */
  prepare: {
    open: boolean;
    isSaving: boolean;
    onStay: () => void;
    onContinueWithoutSaving: () => void;
    onSaveAndContinue: () => void;
  };
  /** Decline-to-sign confirm (only reachable when `onDecline` is set). */
  decline: {
    open: boolean;
    isDeclining: boolean;
    onCancel: () => void;
    onConfirm: () => void;
  };
  /** Signer completion save gate (B3). */
  incomplete: {
    open: boolean;
    count: number;
    isSaving: boolean;
    onKeepSigning: () => void;
    onSaveAnyway: () => void;
  };
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  /** While true, Escape, outside clicks and the non-confirm buttons are off. */
  busy: boolean;
  /** The cancel-like action: Escape and backdrop clicks run it too. */
  onCancel: () => void;
  size?: "xs" | "sm";
  /** Footer buttons; the first one should take `cancelRef` (initial focus). */
  children: (cancelRef: React.RefObject<HTMLButtonElement>) => React.ReactNode;
}

/**
 * Shared confirm shell. Mirrors the app's `components/ConfirmationDialog`:
 * an alertdialog with the cancel-like button focused first, dismissal
 * blocked while the action is in flight (the promise keeps running, so a
 * vanishing dialog would read as "cancelled").
 */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  busy,
  onCancel,
  size = "xs",
  children,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog.Root
      role="alertdialog"
      placement="center"
      size={size}
      open={open}
      lazyMount
      unmountOnExit
      initialFocusEl={() => cancelRef.current}
      closeOnEscape={!busy}
      closeOnInteractOutside={!busy}
      onOpenChange={(details) => {
        if (!details.open && !busy) onCancel();
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title textStyle="md" fontWeight="medium">
                {title}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Dialog.Description>{description}</Dialog.Description>
            </Dialog.Body>
            <Dialog.Footer flexWrap="wrap" gap={2}>
              {children(cancelRef)}
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};

/** The four editor confirm dialogs. Presentational; state lives in PDFEditor. */
export const ConfirmDialogs: React.FC<ConfirmDialogsProps> = ({
  unsaved,
  prepare,
  decline,
  incomplete,
}) => (
  <>
    {/* Unsaved-changes close guard. The library's own close affordance
        (HeaderBar's X, wired to requestClose) opens this instead of calling
        the host's onClose straight through whenever the session is dirty. */}
    <ConfirmDialog
      open={unsaved.open}
      title="Save your changes?"
      description="You have changes that haven't been saved yet. Save them before closing, or discard them and close anyway."
      busy={unsaved.isSaving}
      onCancel={unsaved.onKeepEditing}
    >
      {(cancelRef) => (
        <>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={unsaved.onKeepEditing}
            disabled={unsaved.isSaving}
          >
            Keep editing
          </Button>
          <Button
            type="button"
            variant="outline"
            colorPalette="red"
            onClick={unsaved.onDiscard}
            disabled={unsaved.isSaving}
          >
            Discard
          </Button>
          <Button
            type="button"
            onClick={unsaved.onSave}
            loading={unsaved.isSaving}
          >
            Save
          </Button>
        </>
      )}
    </ConfirmDialog>

    {/* Prepare -> Fill & Sign guard: blocking, because the passive
        in-canvas notice alone is missable, and unsaved prepared fields
        being invisible in Fill & Sign reads as data loss. */}
    <ConfirmDialog
      open={prepare.open}
      title="Save your fields first?"
      description="The fields you added in Prepare are not saved yet, so they cannot be filled. Save them now, or continue without saving and they will stay hidden until you save in Prepare."
      busy={prepare.isSaving}
      onCancel={prepare.onStay}
      // sm, not xs: three full-word actions.
      size="sm"
    >
      {(cancelRef) => (
        <>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={prepare.onStay}
            disabled={prepare.isSaving}
          >
            Stay in Prepare
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={prepare.onContinueWithoutSaving}
            disabled={prepare.isSaving}
          >
            Continue without saving
          </Button>
          <Button
            type="button"
            onClick={prepare.onSaveAndContinue}
            loading={prepare.isSaving}
          >
            Save and continue
          </Button>
        </>
      )}
    </ConfirmDialog>

    {/* Decline-to-sign confirm, opened by the header's decline button. */}
    <ConfirmDialog
      open={decline.open}
      title="Decline to sign?"
      description="The sender will be notified and this document will be closed for signing."
      busy={decline.isDeclining}
      onCancel={decline.onCancel}
    >
      {(cancelRef) => (
        <>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={decline.onCancel}
            disabled={decline.isDeclining}
          >
            Cancel
          </Button>
          <Button
            type="button"
            colorPalette="red"
            onClick={decline.onConfirm}
            loading={decline.isDeclining}
          >
            Decline
          </Button>
        </>
      )}
    </ConfirmDialog>

    {/* SIGNER COMPLETION save gate (B3): opened by the header Save button
        (and Finish-and-save) instead of saving straight away when the active
        participant still has incomplete required fields. */}
    <ConfirmDialog
      open={incomplete.open}
      title={`You still have ${incomplete.count} field${
        incomplete.count === 1 ? "" : "s"
      } to complete`}
      description="You can save what you have now and finish the rest later, or keep signing until every field is complete."
      busy={incomplete.isSaving}
      onCancel={incomplete.onKeepSigning}
    >
      {(cancelRef) => (
        <>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={incomplete.onKeepSigning}
            disabled={incomplete.isSaving}
          >
            Keep signing
          </Button>
          <Button
            type="button"
            onClick={incomplete.onSaveAnyway}
            loading={incomplete.isSaving}
          >
            Save anyway
          </Button>
        </>
      )}
    </ConfirmDialog>
  </>
);

export interface OptionsEditorDialogProps {
  open: boolean;
  onClose: () => void;
  options: ComboboxItem[];
  onAddOption: (label: string) => void;
  onRemoveOption: (index: number) => void;
  /**
   * Show the A7 "no options" warning. Pass `isFieldMissingOptions(field)`:
   * an imported radio group with no editable options is still valid.
   */
  showEmptyWarning?: boolean;
}

/**
 * Desktop "Edit options" dialog for dropdown/radio fields, opened from the
 * field settings popover. Mobile keeps its options editor inline in the
 * Properties drawer. The body (list, add row, A7 warning) is the Panels'
 * `OptionsEditor`; this owns only the shell and the "Done" exit.
 */
export const OptionsEditorDialog: React.FC<OptionsEditorDialogProps> = ({
  open,
  onClose,
  options,
  onAddOption,
  onRemoveOption,
  showEmptyWarning = true,
}) => (
  <Modal
    isOpen={open}
    onClose={onClose}
    title="Edit options"
    size="sm"
    footer={
      <Button type="button" onClick={onClose}>
        Done
      </Button>
    }
  >
    <OptionsEditor
      options={options}
      onAddOption={onAddOption}
      onRemoveOption={onRemoveOption}
      showEmptyWarning={showEmptyWarning}
    />
  </Modal>
);

export default ConfirmDialogs;
