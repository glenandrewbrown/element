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
  breadcrumbStack: string[];
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
  pushBreadcrumb: (boardId: string) => void;
  popBreadcrumb: () => void;
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
  commentBoxes: initialComments,
  minimapVisible: true,
  zoomTier: "standard",

  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),

  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

  clearSelection: () => set({ selectedNodeId: null, selectedEdgeId: null }),

  pushBreadcrumb: (boardId) =>
    set((s) => ({ breadcrumbStack: [...s.breadcrumbStack, boardId] })),

  popBreadcrumb: () =>
    set((s) => ({
      breadcrumbStack:
        s.breadcrumbStack.length > 1
          ? s.breadcrumbStack.slice(0, -1)
          : s.breadcrumbStack,
    })),

  navigateToBreadcrumb: (index) =>
    set((s) => ({
      breadcrumbStack: s.breadcrumbStack.slice(0, index + 1),
    })),

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

    set({
      nodes: data.nodes,
      edges: data.edges,
      selectedNodeId: null,
      selectedEdgeId: null,
      commentBoxes: data.commentBoxes ?? [],
      breadcrumbStack:
        data.breadcrumbs && data.breadcrumbs.length > 0
          ? data.breadcrumbs
          : ["Main Project"],
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

export const selectZoomTier = (s: GraphStore) => s.zoomTier;

export const selectNodeById = (id: string) => (s: GraphStore) =>
  s.nodes.find((n) => n.id === id);

export const selectSelectedNode = (s: GraphStore) =>
  s.selectedNodeId ? s.nodes.find((n) => n.id === s.selectedNodeId) : undefined;

export const selectSelectedEdge = (s: GraphStore) =>
  s.selectedEdgeId ? s.edges.find((e) => e.id === s.selectedEdgeId) : undefined;
