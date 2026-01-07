import React, { useState } from "react";
import styles from "./FloatingActionButton.module.css";
import {
  Plus,
  TextAa,
  CheckSquare,
  RowsPlusBottom,
  RadioButton,
  Signature,
  TextAlignJustify,
} from "@phosphor-icons/react";
import { BuildModeFieldType } from "../../PDFEditor";

export interface FABAction {
  id: BuildModeFieldType;
  label: string;
  icon: React.ReactNode;
}

export interface FloatingActionButtonProps {
  /** Callback when a field type is selected */
  onFieldSelect: (fieldType: BuildModeFieldType) => void;
  /** Whether the FAB is visible */
  isVisible?: boolean;
  /** Position from bottom */
  bottomOffset?: number;
}

const fieldActions: FABAction[] = [
  {
    id: "signature",
    label: "Signature",
    icon: <Signature weight="duotone" size={20} />,
  },
  {
    id: "text",
    label: "Text",
    icon: <TextAa weight="duotone" size={20} />,
  },
  {
    id: "multiline",
    label: "Text Area",
    icon: <TextAlignJustify weight="duotone" size={20} />,
  },
  {
    id: "checkbox",
    label: "Checkbox",
    icon: <CheckSquare weight="duotone" size={20} />,
  },
  {
    id: "dropdown",
    label: "Dropdown",
    icon: <RowsPlusBottom weight="duotone" size={20} />,
  },
  {
    id: "radio",
    label: "Radio",
    icon: <RadioButton weight="duotone" size={20} />,
  },
];

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  onFieldSelect,
  isVisible = true,
  bottomOffset = 24,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const handleSelect = (fieldType: BuildModeFieldType) => {
    onFieldSelect(fieldType);
    setIsExpanded(false);
  };

  if (!isVisible) return null;

  return (
    <div
      className={styles.container}
      style={{ bottom: bottomOffset }}
      data-expanded={isExpanded}
    >
      {/* Backdrop when expanded */}
      {isExpanded && (
        <div
          className={styles.backdrop}
          onClick={() => setIsExpanded(false)}
          aria-hidden="true"
        />
      )}

      {/* Speed dial menu */}
      <div className={`${styles.menu} ${isExpanded ? styles.expanded : ""}`}>
        {fieldActions.map((action, index) => (
          <button
            key={action.id}
            type="button"
            className={styles.menuItem}
            onClick={() => handleSelect(action.id)}
            style={{
              transitionDelay: isExpanded ? `${index * 30}ms` : "0ms",
            }}
            aria-label={action.label}
          >
            <span className={styles.menuIcon}>{action.icon}</span>
            <span className={styles.menuLabel}>{action.label}</span>
          </button>
        ))}
      </div>

      {/* Main FAB button */}
      <button
        type="button"
        className={`${styles.fab} ${isExpanded ? styles.active : ""}`}
        onClick={handleToggle}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? "Close menu" : "Add field"}
      >
        <Plus
          weight="bold"
          size={24}
          className={styles.fabIcon}
        />
      </button>
    </div>
  );
};

export default FloatingActionButton;

