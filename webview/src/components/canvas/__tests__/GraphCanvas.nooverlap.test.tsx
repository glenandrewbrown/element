/**
 * GraphCanvas — Task 2.3 "Blocks must NEVER overlap" interaction wiring.
 *
 * Covers the GraphCanvas-side glue around the pure `resolveCollisions` lib
 * (which is unit-tested separately in lib/__tests__/resolveCollisions.test.ts):
 *   - onNodeDragStop resolves a Block dropped ON another and persists a NUDGED,
 *     non-overlapping position (the one-shot collision resolve).
 *   - the resolve is ONE-SHOT: onNodeDrag (per-tick) NEVER persists positions
 *     (no per-tick resolve — that would be a perf regression + fight ELK).
 *   - the live "intersecting" glow is a CLASS toggle driven by
 *     getIntersectingNodes (applied during drag, cleared on stop) — never a
 *     per-frame inline style.
 *
 * Strategy mirrors GraphCanvas.gaps.test.tsx: mock RF (capturing the handler
 * props) + the stores + the bridge, and drive onNodeDrag/onNodeDragStop
 * directly. The RF mock provides getNodes/setNodes/getIntersectingNodes so the
 * collision + glow paths actually run.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";
import { rectsOverlap } from "../../../lib/resolveCollisions";

// ── Hoisted shared state ─────────────────────────────────────────────────────
const { capturedProps, mockStore, mockAppStore, mockHostExtras, rf } = vi.hoisted(
  () => {
    const store = {
      nodes: [] as Array<{ id: string; [k: string]: unknown }>,
      edges: [] as unknown[],
      commentBoxes: [] as unknown[],
      selectedNodeId: null as string | null,
      selectedEdgeId: null as string | null,
      minimapVisible: false,
      selectNode: vi.fn(),
      selectEdge: vi.fn(),
      clearSelection: vi.fn(),
      updateNodePositions: vi.fn(),
      updateCommentBoxLayout: vi.fn(),
      setZoomTier: vi.fn(),
    };
    const appStore = {
      mode: "edit" as "edit" | "perform",
      openBlockTab: vi.fn(),
      embeddedEditorNodeId: null as string | null,
      canvasHint: null as string | null,
      setCanvasHint: vi.fn(),
      autoTidyOnAdd: false,
      snapToGrid: false,
    };
    const hostExtras = {
      canvas: {
        snapToGrid: false,
        gridSize: 8,
        graphBounds: { minX: 0, minY: 0, maxX: 800, maxY: 600 },
      },
    };
    // Live RF node array the mock serves (with measured sizes). Tests mutate it.
    const rfNodes: Array<{
      id: string;
      type: string;
      position: { x: number; y: number };
      measured?: { width: number; height: number };
      className?: string;
    }> = [];
    const reactFlow = {
      nodes: rfNodes,
      fitView: vi.fn(),
      screenToFlowPosition: vi.fn((p: { x: number; y: number }) => p),
      flowToScreenPosition: vi.fn((p: { x: number; y: number }) => p),
      getNodes: vi.fn(() => rfNodes),
      setNodes: vi.fn(
        (updater: (n: typeof rfNodes) => typeof rfNodes) => {
          const next = updater(rfNodes);
          rfNodes.length = 0;
          rfNodes.push(...next);
        },
      ),
      // The intersection set the test wants returned for a given dragged node.
      getIntersectingNodes: vi.fn(() => [] as typeof rfNodes),
    };
    return {
      capturedProps: {} as Record<string, unknown>,
      mockStore: store,
      mockAppStore: appStore,
      mockHostExtras: hostExtras,
      rf: reactFlow,
    };
  },
);

vi.mock("@xyflow/react", () => ({
  ReactFlow: (props: Record<string, unknown>) => {
    Object.assign(capturedProps, props);
    return <div data-testid="react-flow">{props.children as React.ReactNode}</div>;
  },
  Background: () => <div data-testid="rf-background" />,
  MiniMap: () => <div data-testid="rf-minimap" />,
  useNodesState: vi.fn(() => [[], vi.fn(), vi.fn()]),
  useEdgesState: vi.fn(() => [[], vi.fn(), vi.fn()]),
  useReactFlow: vi.fn(() => rf),
  useStoreApi: vi.fn(() => ({
    getState: () => ({ nodeLookup: new Map(), transform: [0, 0, 1] }),
  })),
  BackgroundVariant: { Dots: "dots" },
  SelectionMode: { Partial: "partial" },
}));
vi.mock("@xyflow/react/dist/style.css", () => ({}));

vi.mock("../../../stores/useGraphStore", () => {
  const fn = vi.fn((sel: (s: typeof mockStore) => unknown) => sel(mockStore));
  (fn as unknown as { getState: () => typeof mockStore }).getState = () =>
    mockStore;
  return {
    useGraphStore: fn,
    zoomToTier: vi.fn(() => "normal"),
    selectBreadcrumbs: () => [],
  };
});

vi.mock("../../../stores/useAppStore", () => {
  const fn = vi.fn((sel: (s: typeof mockAppStore) => unknown) => sel(mockAppStore));
  (fn as unknown as { getState: () => typeof mockAppStore }).getState = () =>
    mockAppStore;
  return { useAppStore: fn };
});

vi.mock("../../../stores/useHostExtrasStore", () => ({
  useHostExtrasStore: vi.fn((sel: (s: typeof mockHostExtras) => unknown) =>
    sel(mockHostExtras),
  ),
}));

const mockNativeGraph = vi.hoisted(() => ({
  nativeEnterContainer: vi.fn(async () => true),
  nativeExitContainer: vi.fn(async () => true),
  nativeGraphCommentAdd: vi.fn(),
  nativeGraphCommentUpsert: vi.fn(),
  nativeGraphConnect: vi.fn(),
  nativeGraphAddPluginConnected: vi.fn(async () => true),
  nativeGraphDisconnect: vi.fn(),
  nativeGraphSpliceCable: vi.fn(),
  nativeGraphMoveNodes: vi.fn(),
  nativeGraphRenameNode: vi.fn(),
  nativeGraphSetViewport: vi.fn(),
  nativeMoleculeInsert: vi.fn(async () => true),
}));
vi.mock("../../../bridge/nativeGraph", () => mockNativeGraph);
vi.mock("../../../bridge/nativePluginEditor", () => ({
  nativePluginEditorOpen: vi.fn(),
  nativePluginEditorClose: vi.fn(),
}));

vi.mock("../Block", () => ({ Block: () => <div data-testid="block" /> }));
vi.mock("../Cable", () => ({ Cable: () => null }));
vi.mock("../CommentFrame", () => ({ CommentFrame: () => null }));
vi.mock("../QuickAddPopup", () => ({ QuickAddPopup: () => null }));
vi.mock("../CanvasContextMenu", () => ({ CanvasContextMenu: () => null }));
vi.mock("../NodeContextMenu", () => ({ NodeContextMenu: () => null }));
vi.mock("../EdgeContextMenu", () => ({ EdgeContextMenu: () => null }));
vi.mock("../GhostEdge", () => ({ GhostEdge: () => null }));
vi.mock("../NestedChrome", () => ({ NestedChrome: () => null }));
vi.mock("../autoRouteSuggestions", async () => {
  const actual = await vi.importActual<
    typeof import("../autoRouteSuggestions")
  >("../autoRouteSuggestions");
  return {
    ...actual,
    computeRouteSuggestions: vi.fn(() => []),
    buildRouteSuggestionCache: vi.fn(() => null),
  };
});

import { GraphCanvas } from "../GraphCanvas";

const W = 200;
const H = 100;

/**
 * Read a handler captured off the mocked <ReactFlow> as a typed callable, so
 * driving it directly stays type-safe (no `as Function`). The handlers we drive
 * here all take (event, node[, draggedNodes]).
 */
type RfHandler = (
  event: unknown,
  node: unknown,
  draggedNodes?: unknown,
) => void;
const handler = (name: string): RfHandler => capturedProps[name] as RfHandler;

/** Seed the RF node array the mock serves. */
function seedNodes(
  nodes: Array<{ id: string; x: number; y: number }>,
): void {
  rf.nodes.length = 0;
  for (const n of nodes) {
    rf.nodes.push({
      id: n.id,
      type: "block",
      position: { x: n.x, y: n.y },
      measured: { width: W, height: H },
    });
  }
  mockStore.nodes = nodes.map((n) => ({ id: n.id }));
}

describe("GraphCanvas — Task 2.3 no-overlap on drop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppStore.mode = "edit";
    mockAppStore.autoTidyOnAdd = false;
    Object.keys(capturedProps).forEach((k) => delete capturedProps[k]);
  });

  it("drops a Block EXACTLY on another → persists a NON-overlapping nudged position", () => {
    // Two Blocks; `b` is dropped right on top of the pinned `a`.
    seedNodes([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 0, y: 0 },
    ]);
    render(<GraphCanvas />);
    mockNativeGraph.nativeGraphMoveNodes.mockClear();
    mockStore.updateNodePositions.mockClear();

    const dropped = { id: "b", type: "block", position: { x: 0, y: 0 }, data: {} };
    act(() =>
      handler("onNodeDragStop")({}, dropped, [dropped]),
    );

    // The dropped Block's persisted position was nudged off (0,0).
    expect(mockStore.updateNodePositions).toHaveBeenCalledTimes(1);
    const moves = mockStore.updateNodePositions.mock.calls[0][0] as Array<{
      id: string;
      x: number;
      y: number;
    }>;
    expect(moves).toHaveLength(1);
    expect(moves[0].id).toBe("b");
    const nudged = { id: "b", x: moves[0].x, y: moves[0].y, width: W, height: H };
    const anchor = { id: "a", x: 0, y: 0, width: W, height: H };
    // No longer overlapping the Block it was dropped on (≥15px gutter).
    expect(rectsOverlap(nudged, anchor, 15)).toBe(false);
    // The SAME nudged positions were pushed to the engine.
    expect(mockNativeGraph.nativeGraphMoveNodes).toHaveBeenCalledWith(moves);
  });

  it("a clear drop (no overlap) persists the dropped position UNCHANGED", () => {
    seedNodes([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 600, y: 0 },
    ]);
    render(<GraphCanvas />);
    mockStore.updateNodePositions.mockClear();

    const dropped = {
      id: "b",
      type: "block",
      position: { x: 600, y: 0 },
      data: {},
    };
    act(() =>
      handler("onNodeDragStop")({}, dropped, [dropped]),
    );
    expect(mockStore.updateNodePositions).toHaveBeenCalledWith([
      { id: "b", x: 600, y: 0 },
    ]);
  });

  it("the resolve is ONE-SHOT: onNodeDrag NEVER persists positions (no per-tick resolve)", () => {
    seedNodes([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 10 }, // overlapping during the drag
    ]);
    render(<GraphCanvas />);
    mockStore.updateNodePositions.mockClear();
    mockNativeGraph.nativeGraphMoveNodes.mockClear();

    const dragging = {
      id: "b",
      type: "block",
      position: { x: 10, y: 10 },
      data: {},
    };
    // Fire several per-tick drag events (throttle is time-based; the assertion
    // is simply that NONE of them persist a position).
    act(() => {
      handler("onNodeDrag")({}, dragging);
      handler("onNodeDrag")({}, dragging);
    });
    expect(mockStore.updateNodePositions).not.toHaveBeenCalled();
    expect(mockNativeGraph.nativeGraphMoveNodes).not.toHaveBeenCalled();
  });

  it("onNodeDrag toggles the `.node-intersecting` class on overlapped nodes (painter-safe glow)", () => {
    seedNodes([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 10 },
    ]);
    // The mock reports `a` as intersecting with the dragged `b`.
    rf.getIntersectingNodes.mockImplementation(() => [
      { id: "a", type: "block", position: { x: 0, y: 0 } },
    ]);
    render(<GraphCanvas />);
    rf.setNodes.mockClear();

    const dragging = {
      id: "b",
      type: "block",
      position: { x: 10, y: 10 },
      data: {},
    };
    act(() => handler("onNodeDrag")({}, dragging));

    // The class was applied via setNodes (a CLASS toggle, never an inline style).
    expect(rf.setNodes).toHaveBeenCalled();
    const a = rf.nodes.find((n) => n.id === "a");
    const b = rf.nodes.find((n) => n.id === "b");
    expect(a?.className ?? "").toContain("node-intersecting");
    expect(b?.className ?? "").toContain("node-intersecting"); // both sides glow

    // Drag-stop clears the glow (and resolves the overlap).
    rf.setNodes.mockClear();
    act(() => handler("onNodeDragStop")({}, dragging, [dragging]));
    const aAfter = rf.nodes.find((n) => n.id === "a");
    expect(aAfter?.className ?? "").not.toContain("node-intersecting");
  });

  it("repeated rapid drag ticks do NOT re-write nodes (no per-tick churn)", () => {
    // Whether via the drag throttle or the intersection-set diff guard, a burst
    // of per-tick onNodeDrag calls with an unchanged overlap must not keep
    // re-writing the node array — the painter/perf rule.
    seedNodes([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 10 },
    ]);
    rf.getIntersectingNodes.mockImplementation(() => [
      { id: "a", type: "block", position: { x: 0, y: 0 } },
    ]);
    render(<GraphCanvas />);

    const dragging = {
      id: "b",
      type: "block",
      position: { x: 10, y: 10 },
      data: {},
    };
    act(() => handler("onNodeDrag")({}, dragging));
    rf.setNodes.mockClear();
    // Same set on the next tick → must NOT write nodes again.
    act(() => handler("onNodeDrag")({}, dragging));
    expect(rf.setNodes).not.toHaveBeenCalled();
  });
});
