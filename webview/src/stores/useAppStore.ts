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

/**
 * Cable routing style. Blueprint §7.2 originally called for Manhattan by
 * default, but the locked bake-off verdict #2 (T9a) flips the default to
 * `bezier` — Glen's QA: "cabling hard angles are not conducive to a clean
 * workflow". Manhattan (orthogonal/`step`) stays explicitly selectable via the
 * Toolbar / Preferences routing toggle; cable routing is session-only (not
 * persisted, see `partialize` below) so this is a pure default flip with no
 * board migration — anyone who picks Manhattan keeps it for the session.
 */
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
  /**
   * Flow-Debug mode: when true, every Cable renders a live mid-cable chip —
   * audio dB / signed CV value / MIDI activity / dim "—" when no signal —
   * the "see what's passing where" overlay (logic-routing-flow-debug plan).
   * Session-only; never persisted.
   */
  flowDebug: boolean;
  /**
   * Transient one-line canvas coaching hint shown in the StatusBar's left
   * cluster — e.g. the live cable-drag affordance ("Drop on a port to connect ·
   * hold ⌥ and release to add a block") or the post-drop nudge ("Hold ⌥ next
   * time to add a block here"). `null` when nothing to show. The caller owns the
   * auto-clear timeout (T3). Session-only; never persisted.
   */
  canvasHint: string | null;
  /**
   * Auto-tidy-on-add (Feedback #3b, Glen Q3: "yes — and on by default"). When
   * true, dropping a NEW Block triggers a debounced animated relayout (Tidy) so
   * "blocks clean themselves up instinctively". OFF disables it (the toggle next
   * to the Tidy button). The no-fighting-the-user constraints (fire only on ADD,
   * never on a user drag, a drag cancels a pending pass) live in GraphCanvas;
   * this flag is just the on/off gate. Session-only; never persisted (it is a
   * workflow preference, not project state — matches cableRouting/flowDebug).
   */
  autoTidyOnAdd: boolean;
  /**
   * Session-local snap-to-grid for dragged Blocks (Feedback #3b). React Flow's
   * `snapToGrid` is driven from this OR the host canvas flag, so a user can flip
   * snapping from the toolbar without a host round-trip. Session-only.
   */
  snapToGrid: boolean;
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
  toggleFlowDebug: () => void;
  markHostReady: () => void;
  requestGraphStateRefresh: () => void;
  setEmbeddedEditorNodeId: (nodeId: string | null) => void;
  setCanvasHint: (hint: string | null) => void;
  toggleAutoTidyOnAdd: () => void;
  setAutoTidyOnAdd: (on: boolean) => void;
  toggleSnapToGrid: () => void;
  setSnapToGrid: (on: boolean) => void;
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
  cableRouting: "bezier",
  hostReady: false,
  refreshNonce: 0,
  embeddedEditorNodeId: null,
  flowDebug: false,
  canvasHint: null,
  // Glen Q3 — auto-tidy ships ON by default ("blocks should clean themselves up
  // instinctively"). The user can disable it via the toggle next to Tidy.
  autoTidyOnAdd: true,
  snapToGrid: false,

  markHostReady: () => set({ hostReady: true }),

  setCanvasHint: (hint) => set({ canvasHint: hint }),

  toggleAutoTidyOnAdd: () => set((s) => ({ autoTidyOnAdd: !s.autoTidyOnAdd })),

  setAutoTidyOnAdd: (on) => set({ autoTidyOnAdd: on }),

  toggleSnapToGrid: () => set((s) => ({ snapToGrid: !s.snapToGrid })),

  setSnapToGrid: (on) => set({ snapToGrid: on }),

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

  toggleFlowDebug: () => set((s) => ({ flowDebug: !s.flowDebug })),
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
