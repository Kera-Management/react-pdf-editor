import { useState, useCallback, useEffect } from "react";

export type PanelId =
  | "thumbnails"
  | "fieldPalette"
  | "properties"
  | "progress"
  | "mobileSheet";

export interface PanelConfig {
  id: PanelId;
  isOpen: boolean;
  isCollapsed: boolean;
  width?: number;
  height?: number;
  position?: { x: number; y: number };
}

export interface PanelStateOptions {
  /** Persist state to localStorage */
  persist?: boolean;
  /** Storage key prefix */
  storageKey?: string;
}

const STORAGE_KEY = "pdf-editor-panel-state";

const defaultPanelConfigs: Record<PanelId, PanelConfig> = {
  thumbnails: {
    id: "thumbnails",
    isOpen: true,
    isCollapsed: false,
  },
  fieldPalette: {
    id: "fieldPalette",
    isOpen: true,
    isCollapsed: false,
  },
  properties: {
    id: "properties",
    isOpen: false,
    isCollapsed: false,
  },
  progress: {
    id: "progress",
    isOpen: true,
    isCollapsed: false,
  },
  mobileSheet: {
    id: "mobileSheet",
    isOpen: false,
    isCollapsed: true,
    height: 80, // collapsed height
  },
};

function loadFromStorage(storageKey: string): Record<PanelId, PanelConfig> | null {
  if (typeof window === "undefined") return null;
  
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

function saveToStorage(storageKey: string, state: Record<PanelId, PanelConfig>) {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export function usePanelState(options: PanelStateOptions = {}) {
  const { persist = true, storageKey = STORAGE_KEY } = options;

  const [panels, setPanels] = useState<Record<PanelId, PanelConfig>>(() => {
    if (persist) {
      const stored = loadFromStorage(storageKey);
      if (stored) return { ...defaultPanelConfigs, ...stored };
    }
    return defaultPanelConfigs;
  });

  // Save to storage when panels change
  useEffect(() => {
    if (persist) {
      saveToStorage(storageKey, panels);
    }
  }, [panels, persist, storageKey]);

  const openPanel = useCallback((id: PanelId) => {
    setPanels((prev) => ({
      ...prev,
      [id]: { ...prev[id], isOpen: true },
    }));
  }, []);

  const closePanel = useCallback((id: PanelId) => {
    setPanels((prev) => ({
      ...prev,
      [id]: { ...prev[id], isOpen: false },
    }));
  }, []);

  const togglePanel = useCallback((id: PanelId) => {
    setPanels((prev) => ({
      ...prev,
      [id]: { ...prev[id], isOpen: !prev[id].isOpen },
    }));
  }, []);

  const collapsePanel = useCallback((id: PanelId) => {
    setPanels((prev) => ({
      ...prev,
      [id]: { ...prev[id], isCollapsed: true },
    }));
  }, []);

  const expandPanel = useCallback((id: PanelId) => {
    setPanels((prev) => ({
      ...prev,
      [id]: { ...prev[id], isCollapsed: false },
    }));
  }, []);

  const toggleCollapse = useCallback((id: PanelId) => {
    setPanels((prev) => ({
      ...prev,
      [id]: { ...prev[id], isCollapsed: !prev[id].isCollapsed },
    }));
  }, []);

  const updatePanelSize = useCallback(
    (id: PanelId, size: { width?: number; height?: number }) => {
      setPanels((prev) => ({
        ...prev,
        [id]: { ...prev[id], ...size },
      }));
    },
    []
  );

  const updatePanelPosition = useCallback(
    (id: PanelId, position: { x: number; y: number }) => {
      setPanels((prev) => ({
        ...prev,
        [id]: { ...prev[id], position },
      }));
    },
    []
  );

  const resetPanels = useCallback(() => {
    setPanels(defaultPanelConfigs);
    if (persist) {
      localStorage.removeItem(storageKey);
    }
  }, [persist, storageKey]);

  const isPanelOpen = useCallback(
    (id: PanelId) => panels[id]?.isOpen ?? false,
    [panels]
  );

  const isPanelCollapsed = useCallback(
    (id: PanelId) => panels[id]?.isCollapsed ?? false,
    [panels]
  );

  return {
    panels,
    openPanel,
    closePanel,
    togglePanel,
    collapsePanel,
    expandPanel,
    toggleCollapse,
    updatePanelSize,
    updatePanelPosition,
    resetPanels,
    isPanelOpen,
    isPanelCollapsed,
  };
}

export default usePanelState;


