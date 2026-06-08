import { create } from "zustand";
import type { BlockData, CableData, CommentBoxData } from "../data/types";
import { demoGraph } from "../data/demoGraph";
import {
  nativeGraphMoveNodes,
  nativeGraphSetBypass,
  nativeGraphSetMute,
  nativeGraphSetMuteInput,
  nativeGraphDisconnectNode,
  nativeGraphSetNodeColor,
  nativeGraphSetOversample,
  nativeGraphReplacePlugin,
  nativeGraphSetNodeHiddenParams,
  nativeGraphSetNodeCollapseTier,
  nativeEnterContainer,
  nativeExitContainer,
} from "../bridge/nativeGraph";
import { logBridgeError } from "../bridge/bridgeError";

// Reference dimensions for align center/middle math. Block.tsx renders at
// roughly these dimensions at standard zoom — exact pixel-precision is not
// required because the user can nudge afterwards; what matters is that the
// alignment is deterministic and looks correct.
const BLOCK_REF_WIDTH = 200;
const BLOCK_REF_HEIGHT = 100;

export type AlignDirection =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom";

export type DistributeAxis = "horizontal" | "vertical";
import { useBusStore } from "./useBusStore";

/**
 * Structural deep-equality for the JSON-derived snapshot models (BlockData /
 * CableData / CommentBoxData). They are plain data — primitives, nested plain
 * objects (position / size), and arrays of plain objects (ports) — never
 * functions / Dates / Maps — so a JSON-shaped recursive compare is exact and
 * survives schema growth without enumerating every field. Used by
 * {@link GraphActions.hydrateFromEngine} to reuse object identities across a
 * no-change engine snapshot (ledger #17): an idle re-push then produces ZERO
 * downstream re-renders because every reused element — and therefore the array
 * itself — keeps its previous reference.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null)
    return false;
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  if (aArr && bArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  const bKeys = Object.keys(bo);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

/**
 * Reconcile a freshly-parsed snapshot array against the previous one, reusing
 * object identities wherever content is unchanged (ledger #17). Per element:
 * if the new item is deep-equal to the OLD item at the same index, keep the old
 * object reference; otherwise take the new one. If EVERY element was reused and
 * the length is unchanged, the PREVIOUS array reference is returned verbatim so
 * an idle snapshot is a true no-op for `useSyncExternalStore` subscribers (the
 * canvas, meters, inspector) — they never even re-run their selectors.
 *
 * Position-aware by construction: a Block whose `position` moved is NOT
 * deep-equal, so it yields the NEW object at the NEW position — this never
 * fights a live drag (the snapshot echoes the dragged position back and we
 * adopt it), it only suppresses churn when nothing actually moved.
 */
function reconcileArray<T>(prev: readonly T[], next: readonly T[]): T[] {
  let allReused = prev.length === next.length;
  const out: T[] = new Array(next.length);
  for (let i = 0; i < next.length; i++) {
    const prevItem = i < prev.length ? prev[i] : undefined;
    if (prevItem !== undefined && deepEqual(prevItem, next[i])) {
      out[i] = prevItem;
    } else {
      out[i] = next[i];
      allReused = false;
    }
  }
  return allReused ? (prev as T[]) : out;
}

/**
 * Standalone Vite: `VITE_USE_DEMO_GRAPH=1 npm run dev` seeds the demo
 * board. Hosted Element starts empty until snapshot arrives.
 *
 * T-P1-1 hardening: also gate on `import.meta.env.DEV` so the demo
 * graph can never seed a production build even if the env var leaks
 * into a CI/release context. The demo's per-block `cpuLoad` /
 * `latencyMs` fields are hand-authored values — they would be
 * indistinguishable from real engine metrics if rendered in prod.
 */
const useDemoSeed =
  import.meta.env.DEV && import.meta.env.VITE_USE_DEMO_GRAPH === "1";

const initialNodes = useDemoSeed ? demoGraph.blocks : [];
const initialEdges = useDemoSeed ? demoGraph.cables : [];
const initialComments = useDemoSeed ? demoGraph.commentBoxes : [];

/** Zoom-level tier for semantic block rendering.
 * - compact  (zoom < 0.45):   category dot + name only, no ports
 * - standard (0.45–0.9):      current full block (ports visible)
 * - expanded (zoom > 0.9):    full block + embedded controls (BlockEmbed)
 *
 * The standard band is intentionally wide (0.45–0.9) so that normal
 * mouse-wheel steps land in it rather than skipping straight from
 * compact to expanded.
 */
export type ZoomTier = "compact" | "standard" | "expanded";

/** Derive the tier from a raw React Flow zoom value. */
export function zoomToTier(zoom: number): ZoomTier {
  if (zoom < 0.45) return "compact";
  if (zoom > 0.9) return "expanded";
  return "standard";
}

interface GraphState {
  nodes: BlockData[];
  edges: CableData[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  /**
   * REAL multi-level dive path, fed SOLELY by the engine snapshot via
   * {@link GraphActions.hydrateFromEngine}:
   * `[sessionName, activeGraphName, container1, container2, …]`. Never mutated
   * optimistically client-side — the breadcrumb can therefore never disagree
   * with the canvas (the dive-desync fix). "Is dived" = `length > 2`.
   */
  breadcrumbStack: string[];
  /**
   * Id of the nested Board currently shown, present ONLY when dived (mirrors
   * the snapshot's `currentBoardId`). `null` at the top level. A second honest
   * "is dived" signal alongside `breadcrumbStack.length > 2`.
   */
  currentBoardId: string | null;
  commentBoxes: CommentBoxData[];
  /** React Flow minimap visibility (Shift+M). */
  minimapVisible: boolean;
  /** Current semantic zoom tier — updated from React Flow viewport zoom. */
  zoomTier: ZoomTier;
}

interface GraphActions {
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  clearSelection: () => void;
  /**
   * Dive INTO a Container's nested Board. Calls the host bridge
   * (`nativeEnterContainer`); the new board's nodes/edges + the deeper
   * breadcrumb path arrive via the next engine snapshot — never faked. A no-op
   * `false` from the host leaves the breadcrumb untouched (desync-safe).
   */
  enterContainer: (nodeId: string) => Promise<void>;
  /**
   * Back out ONE level. Calls `nativeExitContainer`; the parent board +
   * shortened breadcrumb arrive via the snapshot. No-op at the top.
   */
  exitContainer: () => Promise<void>;
  /**
   * Exit UP to the breadcrumb segment at `targetIndex` (used by clickable
   * breadcrumb crumbs / the NestedChrome EXIT). Loops `nativeExitContainer`
   * `(breadcrumbStack.length − 1 − targetIndex)` times; surplus calls at the
   * top are honest no-ops. The breadcrumb redraws only from the snapshots the
   * host pushes back — so it can never disagree with the canvas.
   */
  exitToBreadcrumb: (targetIndex: number) => Promise<void>;
  /**
   * NEUTERED (dive-desync fix): the breadcrumb is now driven SOLELY by the
   * engine snapshot, so the old optimistic client push is a no-op. Kept on the
   * API for back-compat with callers/tests; use {@link enterContainer} to dive.
   */
  pushBreadcrumb: (boardId: string) => void;
  /**
   * NEUTERED (dive-desync fix): no-op. Use {@link exitContainer} to back out;
   * the breadcrumb follows the snapshot the host re-pushes.
   */
  popBreadcrumb: () => void;
  /**
   * NEUTERED (dive-desync fix): no-op. Use {@link exitToBreadcrumb} for
   * crumb-click navigation; the breadcrumb follows the engine snapshot.
   */
  navigateToBreadcrumb: (index: number) => void;
  toggleMinimap: () => void;
  /** Update semantic zoom tier from React Flow viewport zoom value. */
  setZoomTier: (tier: ZoomTier) => void;
  /**
   * Optimistically flip bypass then confirm with host. Rolls back local
   * flag on bridge failure (rejection or `false` return) and surfaces
   * the error via `logBridgeError` — matches usePerformStore pattern.
   */
  toggleBypass: (nodeId: string) => Promise<void>;
  toggleMute: (nodeId: string) => Promise<void>;
  toggleMuteInput: (nodeId: string) => Promise<void>;
  /**
   * G3-A — node-level disconnect (all matching cables in the given scope).
   * No optimistic edit: the host drives an authoritative snapshot after the
   * DisconnectNodeMessage, so cables disappear via hydrateFromEngine. We never
   * fake-remove cables locally. Logs on bridge failure.
   */
  disconnectNode: (
    nodeId: string,
    scope: "all" | "inputs" | "outputs" | "midi",
  ) => Promise<void>;
  /**
   * G3-A — set a user node colour ("#RRGGBB", or "" to clear → category
   * fallback). Optimistic-with-rollback (mirrors toggleBypass): the local
   * hostColor reverts if the bridge rejects, so a no-op never leaves a fake
   * colour on screen.
   */
  setNodeColor: (nodeId: string, color: string) => Promise<void>;
  /**
   * G3-A — set the oversampling factor (1|2|4|8). Optimistic-with-rollback.
   * Bridge returns false for Audio/MIDI-IO nodes → the local factor reverts.
   */
  setOversample: (nodeId: string, factor: 1 | 2 | 4 | 8) => Promise<void>;
  /**
   * Set the per-block hidden parameter-port set (Configure Parameters…
   * popover). Optimistic-with-rollback (mirrors setNodeColor): the local
   * `hiddenParams` array updates immediately, then the bridge persists the CSV
   * on the Node ValueTree; if the bridge rejects/throws, the local set reverts
   * so a no-op never leaves a fabricated hidden set on screen. The next
   * snapshot reconciles authoritatively. `hiddenIds` is the FULL desired hidden
   * set for the node (not a delta).
   */
  setHiddenParams: (nodeId: string, hiddenIds: string[]) => Promise<void>;
  /**
   * Set a Block's persisted collapse TIER (Wave-3 Task 2.0; widens the legacy
   * `collapsed` boolean). `tier` is "title" / "macro" (lean default) /
   * "expanded". Optimistic-with-rollback (mirrors setHiddenParams): the local
   * `collapseTier` flips immediately, then the bridge persists the string on the
   * Node ValueTree; if the bridge rejects/throws the tier reverts (via `prevTier`)
   * so a no-op never leaves a fabricated state on screen. The next snapshot
   * reconciles authoritatively. Write-on-click only ⇒ joins the coalesced push.
   */
  setCollapseTier: (
    nodeId: string,
    tier: "title" | "macro" | "expanded",
  ) => Promise<void>;
  /**
   * Back-compat shim (Wave-3 Task 2.0): the legacy boolean API delegates to
   * {@link setCollapseTier} (`true → 'title'`, `false → 'macro'`) so the existing
   * Block.tsx callsite keeps compiling until Task 2.4 replaces it with the
   * 3-way tier cycle. Prefer `setCollapseTier` in new code.
   */
  setCollapsed: (nodeId: string, collapsed: boolean) => Promise<void>;
  /**
   * G3-A — replace the plugin in a node in-place. No optimistic edit: the
   * replaced node's ports/name/params arrive via the next snapshot — never
   * fabricated locally. Logs on bridge failure.
   */
  replacePlugin: (nodeId: string, pluginIdentifier: string) => Promise<void>;
  /** Replace board state from C++ ValueTree / JSON snapshot (native host). */
  hydrateFromEngine: (data: {
    nodes: BlockData[];
    edges: CableData[];
    commentBoxes?: CommentBoxData[];
    breadcrumbs?: string[];
    /** Present only when dived; names the nested Board shown. */
    currentBoardId?: string | null;
  }) => void;
  /** Update block positions after user drag (local + optional native sync). */
  updateNodePositions: (
    updates: Array<{ id: string; x: number; y: number }>,
  ) => void;
  /** Local comment box layout after drag (native upsert fires separately). */
  updateCommentBoxLayout: (
    id: string,
    layout: { x: number; y: number; width: number; height: number },
  ) => void;
  /**
   * Align the given block IDs by edge or centerline.
   * No-op when fewer than 2 IDs are provided.
   * Engine ValueTree is updated via nativeGraphMoveNodes so the engine sees
   * the same authoritative positions the React side just rendered.
   */
  alignSelectedNodes: (
    direction: AlignDirection,
    selectedIds: string[],
  ) => void;
  /**
   * Evenly distribute the given block IDs along the chosen axis between the
   * two outermost. No-op when fewer than 3 IDs are provided.
   */
  distributeSelectedNodes: (
    axis: DistributeAxis,
    selectedIds: string[],
  ) => void;
}

type GraphStore = GraphState & GraphActions;

export const useGraphStore = create<GraphStore>()((set) => ({
  nodes: initialNodes,
  edges: initialEdges,
  selectedNodeId: null,
  selectedEdgeId: null,
  breadcrumbStack: ["Main Project"],
  currentBoardId: null,
  commentBoxes: initialComments,
  minimapVisible: true,
  zoomTier: "standard",

  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),

  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

  clearSelection: () => set({ selectedNodeId: null, selectedEdgeId: null }),

  // ── Container dive — engine-driven, NEVER optimistic ──────────────────────
  // The breadcrumb + canvas reflect ONLY the engine snapshot. These actions
  // call the host bridge; the host re-pushes an authoritative snapshot (nested
  // board nodes/edges + the new breadcrumb path) which hydrateFromEngine then
  // applies. So the breadcrumb can never disagree with the canvas (the
  // dive-desync fix), and a host no-op (`false`) changes nothing locally.

  enterContainer: async (nodeId) => {
    try {
      const ok = await nativeEnterContainer(nodeId);
      if (!ok) {
        logBridgeError(
          "useGraphStore.enterContainer",
          `host refused enter ${nodeId} (not a direct-child graph)`,
        );
      }
    } catch (err) {
      logBridgeError("useGraphStore.enterContainer", err);
    }
  },

  exitContainer: async () => {
    try {
      await nativeExitContainer();
    } catch (err) {
      logBridgeError("useGraphStore.exitContainer", err);
    }
  },

  exitToBreadcrumb: async (targetIndex) => {
    // Number of levels to back out = current path length − 1 − targetIndex.
    // (breadcrumbStack = [session, activeGraph, container1, …]; index 2 = the
    // first dived container.) Surplus exits at the top are honest no-ops.
    const steps = useGraphStore.getState().breadcrumbStack.length - 1 - targetIndex;
    for (let i = 0; i < steps; i++) {
      try {
        const ok = await nativeExitContainer();
        if (!ok) break; // already at top — stop early
      } catch (err) {
        logBridgeError("useGraphStore.exitToBreadcrumb", err);
        break;
      }
    }
  },

  // NEUTERED (dive-desync fix) — the breadcrumb is snapshot-driven now, so the
  // old optimistic push/pop/navigate are no-ops. Retained on the API for
  // back-compat. Dive via enterContainer / exitContainer / exitToBreadcrumb.
  pushBreadcrumb: () => {},

  popBreadcrumb: () => {},

  navigateToBreadcrumb: () => {},

  toggleMinimap: () => set((s) => ({ minimapVisible: !s.minimapVisible })),

  setZoomTier: (tier) => set({ zoomTier: tier }),

  toggleBypass: async (nodeId) => {
    let prev = false;
    set((s) => {
      const node = s.nodes.find((n) => n.id === nodeId);
      prev = node?.bypassed ?? false;
      return {
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, bypassed: !prev } : n,
        ),
      };
    });
    try {
      const ok = await nativeGraphSetBypass(nodeId, !prev);
      if (!ok) {
        logBridgeError(
          "useGraphStore.toggleBypass",
          `bridge rejected bypass ${nodeId} → ${!prev}`,
        );
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === nodeId ? { ...n, bypassed: prev } : n,
          ),
        }));
      }
    } catch (err) {
      logBridgeError("useGraphStore.toggleBypass", err);
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, bypassed: prev } : n,
        ),
      }));
    }
  },

  toggleMute: async (nodeId) => {
    let prev = false;
    set((s) => {
      const node = s.nodes.find((n) => n.id === nodeId);
      prev = node?.muted ?? false;
      return {
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, muted: !prev } : n,
        ),
      };
    });
    try {
      const ok = await nativeGraphSetMute(nodeId, !prev);
      if (!ok) {
        logBridgeError(
          "useGraphStore.toggleMute",
          `bridge rejected mute ${nodeId} → ${!prev}`,
        );
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === nodeId ? { ...n, muted: prev } : n,
          ),
        }));
      }
    } catch (err) {
      logBridgeError("useGraphStore.toggleMute", err);
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, muted: prev } : n,
        ),
      }));
    }
  },

  toggleMuteInput: async (nodeId) => {
    let prev = false;
    set((s) => {
      const node = s.nodes.find((n) => n.id === nodeId);
      prev = node?.muteInput ?? false;
      return {
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, muteInput: !prev } : n,
        ),
      };
    });
    try {
      const ok = await nativeGraphSetMuteInput(nodeId, !prev);
      if (!ok) {
        logBridgeError(
          "useGraphStore.toggleMuteInput",
          `bridge rejected muteInput ${nodeId} → ${!prev}`,
        );
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === nodeId ? { ...n, muteInput: prev } : n,
          ),
        }));
      }
    } catch (err) {
      logBridgeError("useGraphStore.toggleMuteInput", err);
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, muteInput: prev } : n,
        ),
      }));
    }
  },

  disconnectNode: async (nodeId, scope) => {
    // No optimistic local edit — the cables are removed authoritatively by the
    // next engine snapshot (GraphManager rebuilds after DisconnectNodeMessage).
    try {
      const ok = await nativeGraphDisconnectNode(nodeId, scope);
      if (!ok) {
        logBridgeError(
          "useGraphStore.disconnectNode",
          `bridge rejected disconnect ${nodeId} scope=${scope}`,
        );
      }
    } catch (err) {
      logBridgeError("useGraphStore.disconnectNode", err);
    }
  },

  setNodeColor: async (nodeId, color) => {
    let prev: string | undefined;
    const next = color === "" ? undefined : color;
    set((s) => {
      const node = s.nodes.find((n) => n.id === nodeId);
      prev = node?.hostColor;
      return {
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, hostColor: next } : n,
        ),
      };
    });
    try {
      const ok = await nativeGraphSetNodeColor(nodeId, color);
      if (!ok) {
        logBridgeError(
          "useGraphStore.setNodeColor",
          `bridge rejected color ${nodeId} → ${color || "(clear)"}`,
        );
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === nodeId ? { ...n, hostColor: prev } : n,
          ),
        }));
      }
    } catch (err) {
      logBridgeError("useGraphStore.setNodeColor", err);
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, hostColor: prev } : n,
        ),
      }));
    }
  },

  setOversample: async (nodeId, factor) => {
    let prev: number | undefined;
    set((s) => {
      const node = s.nodes.find((n) => n.id === nodeId);
      prev = node?.oversample;
      return {
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, oversample: factor } : n,
        ),
      };
    });
    try {
      const ok = await nativeGraphSetOversample(nodeId, factor);
      if (!ok) {
        logBridgeError(
          "useGraphStore.setOversample",
          `bridge rejected oversample ${nodeId} → ${factor}`,
        );
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === nodeId ? { ...n, oversample: prev } : n,
          ),
        }));
      }
    } catch (err) {
      logBridgeError("useGraphStore.setOversample", err);
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, oversample: prev } : n,
        ),
      }));
    }
  },

  setHiddenParams: async (nodeId, hiddenIds) => {
    let prev: string[] | undefined;
    const next = [...hiddenIds];
    set((s) => {
      const node = s.nodes.find((n) => n.id === nodeId);
      prev = node?.hiddenParams;
      return {
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, hiddenParams: next } : n,
        ),
      };
    });
    try {
      const ok = await nativeGraphSetNodeHiddenParams(nodeId, hiddenIds);
      if (!ok) {
        logBridgeError(
          "useGraphStore.setHiddenParams",
          `bridge rejected hiddenParams ${nodeId} → [${hiddenIds.join(",")}]`,
        );
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === nodeId ? { ...n, hiddenParams: prev } : n,
          ),
        }));
      }
    } catch (err) {
      logBridgeError("useGraphStore.setHiddenParams", err);
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, hiddenParams: prev } : n,
        ),
      }));
    }
  },

  setCollapseTier: async (nodeId, tier) => {
    let prevTier: "title" | "macro" | "expanded" | undefined;
    set((s) => {
      const node = s.nodes.find((n) => n.id === nodeId);
      prevTier = node?.collapseTier;
      return {
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, collapseTier: tier } : n,
        ),
      };
    });
    try {
      const ok = await nativeGraphSetNodeCollapseTier(nodeId, tier);
      if (!ok) {
        logBridgeError(
          "useGraphStore.setCollapseTier",
          `bridge rejected collapseTier ${nodeId} → ${tier}`,
        );
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === nodeId ? { ...n, collapseTier: prevTier } : n,
          ),
        }));
      }
    } catch (err) {
      logBridgeError("useGraphStore.setCollapseTier", err);
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, collapseTier: prevTier } : n,
        ),
      }));
    }
  },

  // Back-compat shim (Task 2.0) — the legacy boolean delegates to the tier
  // action so Block.tsx's existing callsite compiles unchanged until Task 2.4
  // swaps it for the 3-way cycle. true → 'title' (header only), false → 'macro'
  // (lean default). Mirrors the migration coercion used on both read paths.
  setCollapsed: async (nodeId, collapsed) => {
    await useGraphStore
      .getState()
      .setCollapseTier(nodeId, collapsed ? "title" : "macro");
  },

  replacePlugin: async (nodeId, pluginIdentifier) => {
    // No optimistic edit — replacing is structural; the new node's ports / name
    // / params arrive via the next snapshot. Never fabricate the new node.
    try {
      const ok = await nativeGraphReplacePlugin(nodeId, pluginIdentifier);
      if (!ok) {
        logBridgeError(
          "useGraphStore.replacePlugin",
          `bridge rejected replace ${nodeId} → ${pluginIdentifier}`,
        );
      }
    } catch (err) {
      logBridgeError("useGraphStore.replacePlugin", err);
    }
  },

  hydrateFromEngine: (data) => {
    // Phase 5B — repopulate useBusStore from any busName fields the engine
    // surfaced on the cables. The store is the visual source of truth, so
    // we replace its map atomically rather than merging — stale entries
    // for cables that no longer exist would otherwise leak forever.
    const busSeed: Record<string, string> = {};
    for (const edge of data.edges) {
      if (typeof edge.busName === "string" && edge.busName.length > 0)
        busSeed[edge.id] = edge.busName;
    }
    useBusStore.setState({ cableBus: busSeed });

    set((s) => {
      // Ledger #17 — reuse object/array identities for unchanged content so an
      // idle (no-change) snapshot causes ZERO downstream re-renders. Drag-safe:
      // a moved Block is not deep-equal → the new position is adopted (the
      // reconcile never suppresses a real move, only churn).
      const nextNodes = reconcileArray(s.nodes, data.nodes);
      const nextEdges = reconcileArray(s.edges, data.edges);
      const nextComments = reconcileArray(
        s.commentBoxes,
        data.commentBoxes ?? [],
      );
      const incomingBreadcrumbs =
        data.breadcrumbs && data.breadcrumbs.length > 0
          ? data.breadcrumbs
          : ["Main Project"];
      // Keep the previous breadcrumb array reference when its contents match.
      const nextBreadcrumbs = deepEqual(s.breadcrumbStack, incomingBreadcrumbs)
        ? s.breadcrumbStack
        : incomingBreadcrumbs;
      // Snapshot is the SOLE source of dive state. `currentBoardId` is present
      // only when dived; coerce undefined → null so the top level is honest.
      const nextBoardId = data.currentBoardId ?? null;

      // True no-op: every field referentially identical → return `s` so no
      // subscriber slice changes (the hydrate becomes a zero-render event).
      if (
        nextNodes === s.nodes &&
        nextEdges === s.edges &&
        nextComments === s.commentBoxes &&
        nextBreadcrumbs === s.breadcrumbStack &&
        nextBoardId === s.currentBoardId &&
        s.selectedNodeId === null &&
        s.selectedEdgeId === null
      ) {
        return s;
      }

      return {
        nodes: nextNodes,
        edges: nextEdges,
        selectedNodeId: null,
        selectedEdgeId: null,
        commentBoxes: nextComments,
        breadcrumbStack: nextBreadcrumbs,
        currentBoardId: nextBoardId,
      };
    });
  },

  updateNodePositions: (updates) =>
    set((s) => {
      const map = new Map(updates.map((u) => [u.id, u] as const));
      return {
        nodes: s.nodes.map((n) => {
          const u = map.get(n.id);
          return u ? { ...n, position: { x: u.x, y: u.y } } : n;
        }),
      };
    }),

  updateCommentBoxLayout: (id, layout) =>
    set((s) => ({
      commentBoxes: s.commentBoxes.map((c) =>
        c.id === id
          ? {
              ...c,
              position: { x: layout.x, y: layout.y },
              size: { width: layout.width, height: layout.height },
            }
          : c,
      ),
    })),

  alignSelectedNodes: (direction, selectedIds) =>
    set((s) => {
      if (selectedIds.length < 2) return s;
      const idSet = new Set(selectedIds);
      const targets = s.nodes.filter((n) => idSet.has(n.id));
      if (targets.length < 2) return s;

      const xs = targets.map((n) => n.position.x);
      const ys = targets.map((n) => n.position.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const centerX = (minX + maxX + BLOCK_REF_WIDTH) / 2;
      const middleY = (minY + maxY + BLOCK_REF_HEIGHT) / 2;

      const targetX = (n: BlockData): number => {
        switch (direction) {
          case "left":
            return minX;
          case "right":
            return maxX;
          case "center":
            return centerX - BLOCK_REF_WIDTH / 2;
          default:
            return n.position.x;
        }
      };
      const targetY = (n: BlockData): number => {
        switch (direction) {
          case "top":
            return minY;
          case "bottom":
            return maxY;
          case "middle":
            return middleY - BLOCK_REF_HEIGHT / 2;
          default:
            return n.position.y;
        }
      };

      const updates: Array<{ id: string; x: number; y: number }> = [];
      const next = s.nodes.map((n) => {
        if (!idSet.has(n.id)) return n;
        const x = targetX(n);
        const y = targetY(n);
        if (x === n.position.x && y === n.position.y) return n;
        updates.push({ id: n.id, x, y });
        return { ...n, position: { x, y } };
      });
      if (updates.length > 0) void nativeGraphMoveNodes(updates);
      return { nodes: next };
    }),

  distributeSelectedNodes: (axis, selectedIds) =>
    set((s) => {
      if (selectedIds.length < 3) return s;
      const idSet = new Set(selectedIds);
      const targets = s.nodes.filter((n) => idSet.has(n.id));
      if (targets.length < 3) return s;

      // Sort along the chosen axis; the two extremes anchor the spread and
      // every node in between is repositioned to evenly divide the gap.
      const sorted = [...targets].sort((a, b) =>
        axis === "horizontal"
          ? a.position.x - b.position.x
          : a.position.y - b.position.y,
      );
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const span =
        axis === "horizontal"
          ? last.position.x - first.position.x
          : last.position.y - first.position.y;
      const step = span / (sorted.length - 1);

      const newCoord = new Map<string, number>();
      sorted.forEach((n, i) => {
        if (i === 0 || i === sorted.length - 1) return;
        newCoord.set(
          n.id,
          (axis === "horizontal" ? first.position.x : first.position.y) +
            step * i,
        );
      });

      const updates: Array<{ id: string; x: number; y: number }> = [];
      const next = s.nodes.map((n) => {
        const coord = newCoord.get(n.id);
        if (coord === undefined) return n;
        const x = axis === "horizontal" ? coord : n.position.x;
        const y = axis === "vertical" ? coord : n.position.y;
        if (x === n.position.x && y === n.position.y) return n;
        updates.push({ id: n.id, x, y });
        return { ...n, position: { x, y } };
      });
      if (updates.length > 0) void nativeGraphMoveNodes(updates);
      return { nodes: next };
    }),
}));

// ── Selectors ──

export const selectNodes = (s: GraphStore) => s.nodes;
export const selectEdges = (s: GraphStore) => s.edges;
export const selectSelectedNodeId = (s: GraphStore) => s.selectedNodeId;
export const selectSelectedEdgeId = (s: GraphStore) => s.selectedEdgeId;
export const selectBreadcrumbs = (s: GraphStore) => s.breadcrumbStack;
export const selectCommentBoxes = (s: GraphStore) => s.commentBoxes;

/**
 * True when the canvas is showing a nested Container Board (i.e. the user has
 * dived in). Honest from EITHER engine signal: the snapshot's `currentBoardId`
 * is set, OR the breadcrumb path is deeper than `[session, activeGraph]`.
 */
export const selectIsDived = (s: GraphStore) =>
  s.currentBoardId != null || s.breadcrumbStack.length > 2;

export const selectZoomTier = (s: GraphStore) => s.zoomTier;

export const selectNodeById = (id: string) => (s: GraphStore) =>
  s.nodes.find((n) => n.id === id);

export const selectSelectedNode = (s: GraphStore) =>
  s.selectedNodeId ? s.nodes.find((n) => n.id === s.selectedNodeId) : undefined;

export const selectSelectedEdge = (s: GraphStore) =>
  s.selectedEdgeId ? s.edges.find((e) => e.id === s.selectedEdgeId) : undefined;
