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

/**
 * Drag-resize geometry for the side panels (Task 3.F / brief §4.1, §4.4).
 *
 * - `PANEL_MIN_W` / `PANEL_MAX_W` — the sane clamp an OPEN panel's width is held
 *   within while dragging and when committed to the store.
 * - `PANEL_SNAP_W` — drag the inner edge narrower than this (~120px, the
 *   tldraw/Figma threshold from brief §4.1 item 5) and releasing SNAPS the panel
 *   to its icon rail (collapse) instead of committing a sliver width.
 *
 * Exported so AppShell's resize handle and any test reference ONE source of
 * truth (no drift between the clamp the store enforces and the handle applies).
 */
export const PANEL_MIN_W = 180;
export const PANEL_MAX_W = 560;
export const PANEL_SNAP_W = 120;

/** Clamp an open-panel width to the sane [MIN, MAX] range. */
export const clampPanelWidth = (w: number): number =>
  Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, w));

interface AppState {
  mode: AppMode;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  bottomPanelOpen: boolean;
  /**
   * Persisted panel widths (px). Defaulted to 260 / 280 to match the prior
   * hardcoded AppShell constants. State (not constants) so a future drag-to-
   * resize can write them; for now they are stable defaults that round-trip
   * through persistence (Task 3.B / brief §4.4). (W3)
   */
  leftWidth: number;
  rightWidth: number;
  /**
   * Did the user EXPLICITLY collapse the inspector (chevron / keybind), as
   * opposed to it being auto-collapsed because nothing is selected? Tracked
   * separately from `rightPanelOpen` so a selection-driven auto-expand can
   * respect a deliberate user collapse and not "fight the user" (brief §4.3).
   * Persisted. (W3)
   */
  inspectorUserCollapsed: boolean;
  /**
   * Monotonic nonce bumped whenever something asks the browser search input to
   * take focus (Cmd+F, opening the browser via Cmd+1/Cmd+\). ToolPalette
   * subscribes and focuses its real `<input>` on change — replacing the brittle
   * `document.querySelector('aside input[placeholder*="Search"]')` DOM query
   * that broke the moment the markup changed and was invisible to tests
   * (brief §4.2, Task 3.C). Session-only — never persisted. (W3)
   */
  focusBrowserSearch: number;
  /**
   * Snapshot of {left,right,bottom}PanelOpen captured the moment `hideAllPanels`
   * fires, so `restorePanels` (Cmd+. pressed again) can put the prior layout
   * back instead of blindly re-opening everything. `null` when not in the
   * hide-all state. Session-only — never persisted (a reload starts from the
   * persisted per-panel state, not mid-hide). (W3)
   */
  panelsHiddenSnapshot: {
    left: boolean;
    right: boolean;
    bottom: boolean;
  } | null;
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
   * REAL native pixel size of the currently-embedded plugin editor, or `null`
   * when none is open. Single global slot for the ONE open editor (the host
   * only ever embeds one plugin editor at a time, keyed by
   * `embeddedEditorNodeId`) — per-node is unnecessary. Set by the host pushes
   * `onEmbeddedEditorReady(nodeId, w, h)` (first mount) and
   * `onEmbeddedEditorResize(nodeId, w, h)` (plugin self-resizes), cleared to
   * `null` on `onEmbeddedEditorClosed` in lock-step with `embeddedEditorNodeId`.
   * The CANVAS lane (GraphCanvas/EditorDragHandle) reads this to size the docked
   * overlay box + drag-handle at the editor's true size — NOTHING-fake: no
   * hardcoded 720×480 once the host has reported a real size. Transient — never
   * persisted (no editor is open immediately after reload). (CONTRACT 1)
   */
  embeddedEditorSize: { w: number; h: number } | null;
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
  /**
   * Hide ALL panels → full-bleed canvas (Cmd+. — brief §4.2). Captures the
   * current per-panel open state in `panelsHiddenSnapshot` so it can be
   * restored. Idempotent: if a snapshot already exists (we are already hidden)
   * it does nothing, so a held key / double-fire can't lose the real layout.
   */
  hideAllPanels: () => void;
  /**
   * Restore the layout captured by `hideAllPanels` (Cmd+. pressed again).
   * No-op when there is no snapshot.
   */
  restorePanels: () => void;
  /**
   * Set a panel's open/collapsed state DIRECTLY, WITHOUT recording a deliberate
   * user-collapse. Unlike {@link togglePanel} (which flips state AND sets
   * `inspectorUserCollapsed` so a manual right-panel toggle is remembered), this
   * is the SELECTION-DRIVEN setter (Task 3.E / brief §4.3): InspectorHub opens the
   * right panel on selection and collapses it to the rail on deselection — an
   * AUTOMATIC behaviour that must NOT masquerade as the user explicitly collapsing
   * the inspector, so it leaves `inspectorUserCollapsed` untouched. Idempotent (a
   * no-op `set` to the same value yields the same reference for the slice). Clears
   * any hide-all snapshot, consistent with the per-panel actions. (W3)
   */
  setPanelOpen: (panel: PanelId, open: boolean) => void;
  /** Bump the focus-browser-search nonce (Cmd+F, open-browser). (Task 3.C) */
  requestFocusBrowserSearch: () => void;
  /**
   * Set a persisted panel width (px), clamped to [PANEL_MIN_W, PANEL_MAX_W].
   * Committed ONCE on pointer-up by AppShell's drag-resize handle — the live
   * per-pointermove width is written straight to the DOM (no store churn, no
   * render storm; brief §4.4 / §4.5, Task 3.F). Sub-threshold drags collapse
   * the panel via `togglePanel` instead of calling this. (W3)
   */
  setPanelWidth: (panel: "left" | "right", width: number) => void;
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
  /** Set the REAL native editor size (host ready/resize push), or `null` to
   *  clear it (host close). (CONTRACT 1) */
  setEmbeddedEditorSize: (size: { w: number; h: number } | null) => void;
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
  leftWidth: 260,
  rightWidth: 280,
  inspectorUserCollapsed: false,
  focusBrowserSearch: 0,
  panelsHiddenSnapshot: null,
  virtualKeyboardOpen: false,
  activeScene: 0,
  openBlockTabs: [],
  spatialBookmarks: {},
  cableRouting: "bezier",
  hostReady: false,
  refreshNonce: 0,
  embeddedEditorNodeId: null,
  embeddedEditorSize: null,
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

  setEmbeddedEditorSize: (size) => set({ embeddedEditorSize: size }),

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
      // Any explicit per-panel toggle exits the "hide-all" state — the user is
      // taking manual control again, so the stale snapshot must not linger and
      // later resurrect a layout they've since edited.
      switch (panel) {
        case "left":
          return { leftPanelOpen: !s.leftPanelOpen, panelsHiddenSnapshot: null };
        case "right": {
          // #4b — a manual toggle puts the user in DELIBERATE control of the
          // inspector, which the selection-driven auto-collapse effect
          // (InspectorHub :2419) must then stop fighting. That effect early-
          // returns when `inspectorUserCollapsed` is true, so:
          //   • OPENING  (rightPanelOpen false→true) MUST set the flag TRUE so
          //     the effect doesn't immediately re-collapse it when nothing is
          //     selected (the old `s.rightPanelOpen`=false bug: rail/Cmd+2/chevron
          //     open did nothing because the effect re-slammed it shut).
          //   • CLOSING  (true→false) sets the flag FALSE so auto-follow resumes
          //     — selecting a Block re-opens; deselecting collapses to the rail.
          // i.e. the flag tracks "panel is now open by my hand" = !rightPanelOpen
          // at toggle time (the post-toggle open state).
          const willOpen = !s.rightPanelOpen;
          return {
            rightPanelOpen: willOpen,
            inspectorUserCollapsed: willOpen,
            panelsHiddenSnapshot: null,
          };
        }
        case "bottom":
          return {
            bottomPanelOpen: !s.bottomPanelOpen,
            panelsHiddenSnapshot: null,
          };
      }
    }),

  hideAllPanels: () =>
    set((s) => {
      // Idempotent — already hidden (snapshot present) → no-op so a repeat / held
      // key can't overwrite the real layout with the all-hidden one.
      if (s.panelsHiddenSnapshot) return s;
      return {
        panelsHiddenSnapshot: {
          left: s.leftPanelOpen,
          right: s.rightPanelOpen,
          bottom: s.bottomPanelOpen,
        },
        leftPanelOpen: false,
        rightPanelOpen: false,
        bottomPanelOpen: false,
      };
    }),

  restorePanels: () =>
    set((s) => {
      const snap = s.panelsHiddenSnapshot;
      if (!snap) return s;
      return {
        leftPanelOpen: snap.left,
        rightPanelOpen: snap.right,
        bottomPanelOpen: snap.bottom,
        panelsHiddenSnapshot: null,
      };
    }),

  // Selection-driven open/collapse (Task 3.E / brief §4.3). Sets the panel's
  // open flag WITHOUT touching `inspectorUserCollapsed` — an automatic
  // open-on-select / collapse-on-deselect must not be remembered as a deliberate
  // user collapse (that flag is only set by the explicit `togglePanel`). Idempotent:
  // returns the prior state unchanged when the flag already matches, so a redundant
  // call causes zero re-renders.
  setPanelOpen: (panel, open) =>
    set((s) => {
      switch (panel) {
        case "left":
          return s.leftPanelOpen === open
            ? s
            : { leftPanelOpen: open, panelsHiddenSnapshot: null };
        case "right":
          return s.rightPanelOpen === open
            ? s
            : { rightPanelOpen: open, panelsHiddenSnapshot: null };
        case "bottom":
          return s.bottomPanelOpen === open
            ? s
            : { bottomPanelOpen: open, panelsHiddenSnapshot: null };
      }
    }),

  requestFocusBrowserSearch: () =>
    set((s) => ({ focusBrowserSearch: s.focusBrowserSearch + 1 })),

  setPanelWidth: (panel, width) =>
    set(() => {
      const w = clampPanelWidth(width);
      return panel === "left" ? { leftWidth: w } : { rightWidth: w };
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
      // Panel layout persistence (Task 3.B / brief §4.4): collapse state, widths
      // and the explicit-inspector-collapse flag survive reload (localStorage,
      // per-app — per-project is a later nice-to-have). NOT persisted: the
      // session-only signals (focusBrowserSearch nonce, panelsHiddenSnapshot —
      // a reload should start from the saved per-panel state, never mid-hide)
      // and everything that was already session-only (cableRouting, flowDebug,
      // canvasHint, autoTidyOnAdd, snapToGrid, openBlockTabs, …).
      //
      // SHELVED (D3, hide-UI keep-code) — see FINISH-APP-PLAN. Perform mode is
      // removed from the MVP UI, so `mode` is NOT persisted, and `merge` coerces
      // any legacy persisted `mode: "perform"` back to "edit" so a previously-
      // saved Perform layout can't resurrect the now-unmounted perform panels.
      name: "element-app-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        leftPanelOpen: s.leftPanelOpen,
        rightPanelOpen: s.rightPanelOpen,
        bottomPanelOpen: s.bottomPanelOpen,
        leftWidth: s.leftWidth,
        rightWidth: s.rightWidth,
        inspectorUserCollapsed: s.inspectorUserCollapsed,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppStore>;
        // #4b normalization — never strand a user with an un-openable inspector.
        // The right panel is driven by BOTH `rightPanelOpen` and the manual-
        // control flag `inspectorUserCollapsed` (the auto-follow effect early-
        // returns when the flag is true). If a previous build persisted the
        // panel CLOSED with the flag TRUE, the auto-follow stays suppressed AND
        // the panel is shut → selecting a Block can't open it. Coerce: a
        // persisted-closed right panel must hydrate with the flag FALSE so
        // auto-follow + manual open both work. (Opening always re-sets the flag
        // true via togglePanel, so an open panel keeps its persisted flag.)
        const inspectorUserCollapsed =
          p.rightPanelOpen === false ? false : p.inspectorUserCollapsed;
        return {
          ...current,
          ...p,
          ...(inspectorUserCollapsed !== undefined
            ? { inspectorUserCollapsed }
            : {}),
          mode: "edit",
        };
      },
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
export const selectLeftWidth = (s: AppStore) => s.leftWidth;
export const selectRightWidth = (s: AppStore) => s.rightWidth;
export const selectInspectorUserCollapsed = (s: AppStore) =>
  s.inspectorUserCollapsed;
export const selectFocusBrowserSearch = (s: AppStore) => s.focusBrowserSearch;
export const selectPanelsHidden = (s: AppStore) =>
  s.panelsHiddenSnapshot !== null;
export const selectVirtualKeyboardOpen = (s: AppStore) => s.virtualKeyboardOpen;
export const selectActiveScene = (s: AppStore) => s.activeScene;
export const selectOpenBlockTabs = (s: AppStore) => s.openBlockTabs;
export const selectEmbeddedEditorNodeId = (s: AppStore) =>
  s.embeddedEditorNodeId;
/** CONTRACT 1 — CANVAS lane reads this to size the docked editor overlay +
 *  drag-handle at the plugin editor's REAL native size. `null` until the host
 *  reports a size via onEmbeddedEditorReady/Resize. */
export const selectEmbeddedEditorSize = (s: AppStore) => s.embeddedEditorSize;
