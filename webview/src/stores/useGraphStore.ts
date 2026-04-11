import { create } from "zustand";
import type { BlockData, CableData, CommentBoxData } from "../data/types";
import { demoGraph } from "../data/demoGraph";
import {
  nativeGraphSetBypass,
  nativeGraphSetMute,
  nativeGraphSetMuteInput,
} from "../bridge/nativeGraph";

/** Standalone Vite: `VITE_USE_DEMO_GRAPH=1 npm run dev` seeds the demo board. Hosted Element starts empty until snapshot arrives. */
const useDemoSeed = import.meta.env.VITE_USE_DEMO_GRAPH === "1";

const initialNodes = useDemoSeed ? demoGraph.blocks : [];
const initialEdges = useDemoSeed ? demoGraph.cables : [];
const initialComments = useDemoSeed ? demoGraph.commentBoxes : [];

interface GraphState {
  nodes: BlockData[];
  edges: CableData[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  breadcrumbStack: string[];
  commentBoxes: CommentBoxData[];
  /** React Flow minimap visibility (Shift+M). */
  minimapVisible: boolean;
}

interface GraphActions {
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  clearSelection: () => void;
  pushBreadcrumb: (boardId: string) => void;
  popBreadcrumb: () => void;
  navigateToBreadcrumb: (index: number) => void;
  toggleMinimap: () => void;
  toggleBypass: (nodeId: string) => void;
  toggleMute: (nodeId: string) => void;
  toggleMuteInput: (nodeId: string) => void;
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

  toggleBypass: (nodeId) =>
    set((s) => {
      const node = s.nodes.find((n) => n.id === nodeId);
      const next = !(node?.bypassed ?? false);
      void nativeGraphSetBypass(nodeId, next);
      return {
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, bypassed: next } : n,
        ),
      };
    }),

  toggleMute: (nodeId) =>
    set((s) => {
      const node = s.nodes.find((n) => n.id === nodeId);
      const next = !(node?.muted ?? false);
      void nativeGraphSetMute(nodeId, next);
      return {
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, muted: next } : n,
        ),
      };
    }),

  toggleMuteInput: (nodeId) =>
    set((s) => {
      const node = s.nodes.find((n) => n.id === nodeId);
      const next = !(node?.muteInput ?? false);
      void nativeGraphSetMuteInput(nodeId, next);
      return {
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, muteInput: next } : n,
        ),
      };
    }),

  hydrateFromEngine: (data) =>
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
    }),

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
}));

// ── Selectors ──

export const selectNodes = (s: GraphStore) => s.nodes;
export const selectEdges = (s: GraphStore) => s.edges;
export const selectSelectedNodeId = (s: GraphStore) => s.selectedNodeId;
export const selectSelectedEdgeId = (s: GraphStore) => s.selectedEdgeId;
export const selectBreadcrumbs = (s: GraphStore) => s.breadcrumbStack;
export const selectCommentBoxes = (s: GraphStore) => s.commentBoxes;

export const selectNodeById = (id: string) => (s: GraphStore) =>
  s.nodes.find((n) => n.id === id);

export const selectSelectedNode = (s: GraphStore) =>
  s.selectedNodeId ? s.nodes.find((n) => n.id === s.selectedNodeId) : undefined;

export const selectSelectedEdge = (s: GraphStore) =>
  s.selectedEdgeId ? s.edges.find((e) => e.id === s.selectedEdgeId) : undefined;
