import React, { useEffect, useRef, useState } from "react";
import { Box, Button, Image, Stack, Text } from "@chakra-ui/react";

import { Modal } from "../Modal/Modal";
import { SignaturePad, SignatureTab } from "./SignaturePad";

export interface SignatureAdoptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-fills the Type tab and labels the saved-signature preview. */
  signerName?: string;
  /** A previously adopted signature (PNG data URL), offered as a one-click reuse option. */
  savedSignature?: string;
  /**
   * Fires with a PNG data URL once the signer adopts -- either the saved
   * signature as-is, or a freshly drawn/typed one.
   */
  onAdopt: (dataUrl: string) => void;
}

type View = "saved" | "capture";

/**
 * Adoption modal built on the Modal primitive (Chakra Dialog, bottom Drawer
 * on mobile). Two views:
 *
 * - "saved": shown first whenever `savedSignature` is provided -- a
 *   preview plus a one-click "Use this signature" action, with a "Draw a
 *   new one" escape hatch into capture.
 * - "capture": the Draw/Type SignaturePad, gating Adopt on a valid draft.
 *
 * `isOpen` toggling unmounts and remounts the Modal's own children (see
 * Modal.tsx), but this component itself stays mounted across opens, so its
 * `lastAdoptedRef` can restore "whichever tab produced the current
 * savedSignature" the next time the modal opens with that same value.
 */
export const SignatureAdoptionModal: React.FC<SignatureAdoptionModalProps> = ({
  isOpen,
  onClose,
  signerName,
  savedSignature,
  onAdopt,
}) => {
  const [view, setView] = useState<View>(savedSignature ? "saved" : "capture");
  const [activeTab, setActiveTab] = useState<SignatureTab>("draw");
  const [draftDataUrl, setDraftDataUrl] = useState<string | null>(null);
  const lastAdoptedRef = useRef<{ dataUrl: string; tab: SignatureTab } | null>(
    null
  );

  useEffect(() => {
    if (!isOpen) return;

    setView(savedSignature ? "saved" : "capture");
    setDraftDataUrl(null);
    setActiveTab(
      lastAdoptedRef.current && lastAdoptedRef.current.dataUrl === savedSignature
        ? lastAdoptedRef.current.tab
        : "draw"
    );
  }, [isOpen, savedSignature]);

  const handleUseSaved = () => {
    if (!savedSignature) return;
    onAdopt(savedSignature);
    onClose();
  };

  const handleRedo = () => {
    setView("capture");
  };

  const handleAdoptDraft = () => {
    if (!draftDataUrl) return;
    lastAdoptedRef.current = { dataUrl: draftDataUrl, tab: activeTab };
    onAdopt(draftDataUrl);
    onClose();
  };

  const hint =
    view === "capture" && draftDataUrl === null
      ? activeTab === "draw"
        ? "Draw your signature to continue."
        : "Type your name to continue."
      : null;

  const footer =
    view === "saved" && savedSignature ? (
      <>
        <Button type="button" variant="outline" onClick={handleRedo}>
          Draw a new one
        </Button>
        <Button type="button" onClick={handleUseSaved}>
          Use this signature
        </Button>
      </>
    ) : (
      <>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleAdoptDraft}
          disabled={!draftDataUrl}
        >
          Adopt
        </Button>
      </>
    );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add your signature"
      size="md"
      footer={footer}
    >
      {view === "saved" && savedSignature ? (
        <Stack gap={3}>
          <Text fontWeight="medium">Your saved signature</Text>
          {/* The signature image sits on white in both colour modes. */}
          <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            p={4}
            bg="white"
            borderWidth="1px"
            borderColor="border"
            rounded="lg"
          >
            <Image
              src={savedSignature}
              alt="Your saved signature"
              maxW="full"
              maxH="120px"
              objectFit="contain"
            />
          </Box>
        </Stack>
      ) : (
        <Stack gap={2}>
          <SignaturePad
            activeTab={activeTab}
            onTabChange={setActiveTab}
            signerName={signerName}
            onChange={setDraftDataUrl}
          />
          {hint && <Text color="fg.muted">{hint}</Text>}
        </Stack>
      )}
    </Modal>
  );
};
