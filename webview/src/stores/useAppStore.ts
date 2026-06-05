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
  /**
   * UUID of the Block whose native plugin editor is currently embedded by
   * the host, or `null` when none is open. Single source of truth for the
   * webview side of the C++ `pluginEmbedEditor` — set on open / cleared on
   * close from the `nativePluginEditorOpen`/`nativePluginEditorClose` choke
   * points so every caller (canvas double-click toggle, InspectorHub embed,
   * Esc, ✕ affordance) stays in sync. Transient — never persisted (an editor
   * is never open immediately after reload). (P1-A)
   */
  embeddedEditorNodeId: string | null;
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
  setEmbeddedEditorNodeId: (nodeId: string | null) => void;
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
  embeddedEditorNodeId: null,

  markHostReady: () => set({ hostReady: true }),

  setEmbeddedEditorNodeId: (nodeId) => set({ embeddedEditorNodeId: nodeId }),

  requestGraphStateRefresh: () =>
    set((s) => ({ refreshNonce: s.refreshNonce + 1 })),

  // SHELVED (D3, hide-UI keep-code) — see FINISH-APP-PLAN. Perform mode is
  // removed from the MVP UI; the app is locked to "edit". toggleMode is kept
  // as a no-op (rather than deleted) so the action stays on the store API and
  // any residual caller can't flip the UI into the now-unmounted Perform tree.
  // To restore Perform mode, revert this to the edit/perform swap.
  toggleMode: () => {},

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
      // SHELVED (D3, hide-UI keep-code) — see FINISH-APP-PLAN. Perform mode is
      // removed from the MVP UI, so there is no longer any Edit/Perform state
      // worth persisting (G-19 persisted `mode` to survive reload). Partialize
      // now persists nothing, and `merge` coerces any legacy persisted
      // `mode: "perform"` back to "edit" so a previously-saved Perform layout
      // can't resurrect the now-unmounted perform panels. To restore Perform
      // mode, re-add `partialize: (s) => ({ mode: s.mode })` and drop the merge
      // coercion.
      name: "element-app-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: () => ({}),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<AppStore>),
        mode: "edit",
      }),
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
export const selectEmbeddedEditorNodeId = (s: AppStore) =>
  s.embeddedEditorNodeId;
