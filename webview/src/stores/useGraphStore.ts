import { create } from "zustand";
import type { BlockData, CableData, CommentBoxData } from "../data/types";
import { demoGraph } from "../data/demoGraph";

interface GraphState {
  nodes: BlockData[];
  edges: CableData[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  breadcrumbStack: string[];
  commentBoxes: CommentBoxData[];
}

interface GraphActions {
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  clearSelection: () => void;
  pushBreadcrumb: (boardId: string) => void;
  popBreadcrumb: () => void;
  navigateToBreadcrumb: (index: number) => void;
  toggleBypass: (nodeId: string) => void;
}

type GraphStore = GraphState & GraphActions;

export const useGraphStore = create<GraphStore>()((set) => ({
  nodes: demoGraph.blocks,
  edges: demoGraph.cables,
  selectedNodeId: null,
  selectedEdgeId: null,
  breadcrumbStack: ["Main Project"],
  commentBoxes: demoGraph.commentBoxes,

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

  toggleBypass: (nodeId) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, bypassed: !n.bypassed } : n,
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
