import { create } from "zustand";
import type { AppMode } from "../data/types";
import { usePerformStore } from "./usePerformStore";

type PanelId = "left" | "right" | "bottom";

interface AppState {
  mode: AppMode;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  bottomPanelOpen: boolean;
  activeScene: number;
  openBlockTabs: string[];
}

interface AppActions {
  toggleMode: () => void;
  togglePanel: (panel: PanelId) => void;
  setScene: (index: number) => void;
  openBlockTab: (blockId: string) => void;
  closeBlockTab: (blockId: string) => void;
}

type AppStore = AppState & AppActions;

export const useAppStore = create<AppStore>()((set) => ({
  mode: "edit",
  leftPanelOpen: true,
  rightPanelOpen: true,
  bottomPanelOpen: false,
  activeScene: 0,
  openBlockTabs: [],

  toggleMode: () =>
    set((s) => ({
      mode: s.mode === "edit" ? "perform" : "edit",
    })),

  togglePanel: (panel) =>
    set((s) => {
      switch (panel) {
        case "left":
          return { leftPanelOpen: !s.leftPanelOpen };
        case "right":
          return { rightPanelOpen: !s.rightPanelOpen };
        case "bottom":
          return { bottomPanelOpen: !s.bottomPanelOpen };
      }
    }),

  setScene: (index) => {
    set({ activeScene: index });
    usePerformStore.getState().activateScene(index);
  },

  openBlockTab: (blockId) =>
    set((s) =>
      s.openBlockTabs.includes(blockId)
        ? s
        : { openBlockTabs: [...s.openBlockTabs, blockId] },
    ),

  closeBlockTab: (blockId) =>
    set((s) => ({
      openBlockTabs: s.openBlockTabs.filter((id) => id !== blockId),
    })),
}));

// ── Selectors ──

export const selectMode = (s: AppStore) => s.mode;
export const selectIsEditMode = (s: AppStore) => s.mode === "edit";
export const selectIsPerformMode = (s: AppStore) => s.mode === "perform";
export const selectLeftPanel = (s: AppStore) => s.leftPanelOpen;
export const selectRightPanel = (s: AppStore) => s.rightPanelOpen;
export const selectBottomPanel = (s: AppStore) => s.bottomPanelOpen;
export const selectActiveScene = (s: AppStore) => s.activeScene;
export const selectOpenBlockTabs = (s: AppStore) => s.openBlockTabs;
