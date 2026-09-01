import React from "react";

import styles from "./SignaturePad.module.css";
import { DrawSignatureCanvas } from "./DrawSignatureCanvas";
import { TypeSignature } from "./TypeSignature";

export type SignatureTab = "draw" | "type";

export interface SignaturePadProps {
  /**
   * Which capture mode is showing. Controlled by the parent so a host (the
   * adoption modal) can remember and restore whichever tab produced the
   * current signature.
   */
  activeTab: SignatureTab;
  onTabChange: (tab: SignatureTab) => void;
  /** Pre-fills the Type tab's input. */
  signerName?: string;
  /**
   * Fires whenever the active tab's content becomes valid (a fresh PNG data
   * URL) or invalid (`null` -- blank, or below the Draw tab's near-blank
   * threshold).
   */
  onChange: (dataUrl: string | null) => void;
}

const TABS: { id: SignatureTab; label: string }[] = [
  { id: "draw", label: "Draw" },
  { id: "type", label: "Type" },
];

/**
 * Draw + Type signature capture, tab-switched. Only the active tab is
 * mounted at a time, so switching tabs naturally resets the other one's
 * in-progress content -- each tab reports its own current state via
 * `onChange` as soon as it mounts.
 */
export const SignaturePad: React.FC<SignaturePadProps> = ({
  activeTab,
  onTabChange,
  signerName,
  onChange,
}) => {
  return (
    <div className={styles.pad}>
      <div className={styles.tabList} role="tablist" aria-label="Signature style">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`signature-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`signature-tabpanel-${tab.id}`}
            className={
              activeTab === tab.id
                ? `${styles.tab} ${styles.tabActive}`
                : styles.tab
            }
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`signature-tabpanel-${activeTab}`}
        aria-labelledby={`signature-tab-${activeTab}`}
        className={styles.tabPanel}
      >
        {activeTab === "draw" ? (
          <DrawSignatureCanvas onChange={onChange} />
        ) : (
          <TypeSignature signerName={signerName} onChange={onChange} />
        )}
      </div>
    </div>
  );
};
