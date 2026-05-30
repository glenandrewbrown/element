import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AppMode } from "../data/types";
import { usePerformStore } from "./usePerformStore";

type PanelId = "left" | "right" | "bottom";

interface SpatialBookmark {
  x: number;
  y: number;
  zoom: number;
}

/** Cable routing style — blueprint §7.2 calls for Manhattan by default with bezier toggle. */
export type CableRouting = "manhattan" | "bezier";

interface AppState {
  mode: AppMode;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  bottomPanelOpen: boolean;
  virtualKeyboardOpen: boolean;
  activeScene: number;
  openBlockTabs: string[];
  spatialBookmarks: Record<string, SpatialBookmark>;
  cableRouting: CableRouting;
  /**
   * True once the boot effect in `useJuceBridge` has finished its
   * initial round-trip with the host (graph snapshot + plugin list).
   * Distinct from `useSessionStore.sessionLoaded` (which signals a
   * successful snapshot apply): `hostReady` means "the boot procedure
   * ran to completion", whether it resulted in hydrated data or not.
   * Consumers can gate startup loading-state UI on this. (T-P6-5)
   */
  hostReady: boolean;
  /**
   * Monotonic counter incremented whenever a consumer requests a full
   * graph-state re-fetch (e.g. after a mode toggle). `useJuceBridge`
   * subscribes to this and re-issues `elementGetGraphState` on every
   * tick. Loosely coupled to avoid circular imports between the store
   * and the bridge hook. (T-P6-4)
   */
  refreshNonce: number;
}

interface AppActions {
  toggleMode: () => void;
  togglePanel: (panel: PanelId) => void;
  toggleVirtualKeyboard: () => void;
  setScene: (index: number) => void;
  openBlockTab: (blockId: string) => void;
  closeBlockTab: (blockId: string) => void;
  saveSpatialBookmark: (slot: string, bookmark: SpatialBookmark) => void;
  getSpatialBookmark: (slot: string) => SpatialBookmark | undefined;
  toggleCableRouting: () => void;
  setCableRouting: (routing: CableRouting) => void;
  markHostReady: () => void;
  requestGraphStateRefresh: () => void;
}

type AppStore = AppState & AppActions;

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
  mode: "edit",
  leftPanelOpen: true,
  rightPanelOpen: true,
  bottomPanelOpen: true,
  virtualKeyboardOpen: false,
  activeScene: 0,
  openBlockTabs: [],
  spatialBookmarks: {},
  cableRouting: "manhattan",
  hostReady: false,
  refreshNonce: 0,

  markHostReady: () => set({ hostReady: true }),

  requestGraphStateRefresh: () =>
    set((s) => ({ refreshNonce: s.refreshNonce + 1 })),

  toggleMode: () =>
    set((s) => {
      const next = s.mode === "edit" ? "perform" : "edit";
      return { mode: next, refreshNonce: s.refreshNonce + 1 };
    }),

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

  toggleVirtualKeyboard: () =>
    set((s) => ({ virtualKeyboardOpen: !s.virtualKeyboardOpen })),

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

  saveSpatialBookmark: (slot, bookmark) =>
    set((s) => ({
      spatialBookmarks: { ...s.spatialBookmarks, [slot]: bookmark },
    })),

  getSpatialBookmark: (slot): SpatialBookmark | undefined =>
    useAppStore.getState().spatialBookmarks[slot],

  toggleCableRouting: () =>
    set((s) => ({
      cableRouting: s.cableRouting === "manhattan" ? "bezier" : "manhattan",
    })),

  setCableRouting: (routing) => set({ cableRouting: routing }),
    }),
    {
      // G-19: persist the Edit/Perform mode so it survives reload instead of
      // snapping back to "edit". Narrow partialize — only `mode` is stored;
      // panel/scene/bookmark state stays session-local.
      //
      // NOTE: in the embedded JUCE WKWebView, localStorage MAY be cleared on
      // a full plugin reload depending on the data-store config — if Glen's
      // "flips back" symptom persists at runtime, the durable fix is to back
      // this with the C++ ValueTree via the bridge (tracked follow-up). This
      // fixes Storybook/dev-build and standalone immediately.
      name: "element-app-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ mode: s.mode }),
    },
  ),
);

export const selectCableRouting = (s: AppStore) => s.cableRouting;

// ── Selectors ──

export const selectMode = (s: AppStore) => s.mode;
export const selectIsEditMode = (s: AppStore) => s.mode === "edit";
export const selectIsPerformMode = (s: AppStore) => s.mode === "perform";
export const selectLeftPanel = (s: AppStore) => s.leftPanelOpen;
export const selectRightPanel = (s: AppStore) => s.rightPanelOpen;
export const selectBottomPanel = (s: AppStore) => s.bottomPanelOpen;
export const selectVirtualKeyboardOpen = (s: AppStore) => s.virtualKeyboardOpen;
export const selectActiveScene = (s: AppStore) => s.activeScene;
export const selectOpenBlockTabs = (s: AppStore) => s.openBlockTabs;
