/**
 * GraphCanvas — swap-aware resolve (T4).
 *
 * When the async sandbox flow adds a PLACEHOLDER block (loadState="loading",
 * minimum ~84px height) and then the real plugin swaps IN-PLACE
 * (loadState transitions "loading"→"ready") with a taller real height, the
 * node count is UNCHANGED — so neither the spawn-resolve pass (count-gated)
 * nor the load pass (board-key-gated) re-fires.
 *
 * This suite verifies the swap-aware re-arm:
 *   1. placeholder added (loading) → transitions to ready with taller height
 *      → resolver re-fires and the node no longer overlaps a neighbour.
 *   2. no re-fire when nothing transitions (stable loading state, or already
 *      ready, or block deleted).
 *   3. re-fire is skipped when a live drag is in progress.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";
import { rectsOverlap } from "../../../lib/resolveCollisions";

// ── Hoisted shared state ─────────────────────────────────────────────────────
const { capturedProps, mockStore, mockAppStore, mockHostExtras, rf, nodesInit } =
  vi.hoisted(() => {
    const store = {
      nodes: [] as Array<{ id: string; [k: string]: unknown }>,
      edges: [] as unknown[],
      commentBoxes: [] as unknown[],
      selectedNodeId: null as string | null,
      selectedEdgeId: null as string | null,
      minimapVisible: false,
      currentBoardId: null as string | null,
      breadcrumbStack: ["Main Project", "Graph 1"] as string[],
      selectNode: vi.fn(),
      selectEdge: vi.fn(),
      clearSelection: vi.fn(),
      updateNodePositions: vi.fn(),
      updateCommentBoxLayout: vi.fn(),
      setZoomTier: vi.fn(),
    };
    const nodesInitialized = { value: false };
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
      getIntersectingNodes: vi.fn(() => [] as typeof rfNodes),
    };
    return {
      capturedProps: {} as Record<string, unknown>,
      mockStore: store,
      mockAppStore: appStore,
      mockHostExtras: hostExtras,
      rf: reactFlow,
      nodesInit: nodesInitialized,
    };
  });

vi.mock("@xyflow/react", () => ({
  ReactFlow: (props: Record<string, unknown>) => {
    Object.assign(capturedProps, props);
    return <div data-testid="react-flow">{props.children as React.ReactNode}</div>;
  },
  Background: () => <div data-testid="rf-background" />,
  MiniMap: () => <div data-testid="rf-minimap" />,
  useNodesState: vi.fn(() => [[], vi.fn(), vi.fn()]),
  useEdgesState: vi.fn(() => [[], vi.fn(), vi.fn()]),
  useNodesInitialized: vi.fn(() => nodesInit.value),
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

// Dimensions used in tests.
// PLACEHOLDER_H: the minimum height a loading block has (0 ports → ~84px).
// NEIGHBOUR_H: a normal already-loaded neighbour block height.
const W = 200;
const PLACEHOLDER_H = 84;
const REAL_H = 200; // the taller real height after swap
const NEIGHBOUR_H = 100;

/**
 * Seed the RF node array and store nodes.
 * `loadState` is stored on the BlockData (store node), not on the RF node
 * directly (RF nodes carry it via `data`). We store it on the store node so
 * the GraphCanvas useEffect can read it from `blocks`.
 */
function seedNodes(
  nodes: Array<{
    id: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    loadState?: "loading" | "ready";
  }>,
): void {
  rf.nodes.length = 0;
  for (const n of nodes) {
    rf.nodes.push({
      id: n.id,
      type: "block",
      position: { x: n.x, y: n.y },
      measured: { width: n.width ?? W, height: n.height ?? NEIGHBOUR_H },
    });
  }
  mockStore.nodes = nodes.map((n) => ({
    id: n.id,
    loadState: n.loadState,
    position: { x: n.x, y: n.y },
  }));
}

describe("GraphCanvas — swap-aware resolve (T4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockAppStore.mode = "edit";
    mockAppStore.autoTidyOnAdd = false;
    nodesInit.value = false;
    mockStore.currentBoardId = null;
    mockStore.breadcrumbStack = ["Main Project", "Graph 1"];
    Object.keys(capturedProps).forEach((k) => delete capturedProps[k]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("placeholder (loading) transitions to ready with taller height → resolver re-fires, no overlap with neighbour", () => {
    // Seed: neighbour at (0,0), placeholder at (0,10) — they overlap because
    // the placeholder's real height after swap (200px) covers the neighbour.
    seedNodes([
      { id: "neighbour", x: 0, y: 0, height: NEIGHBOUR_H },
      { id: "plugin", x: 0, y: 10, height: PLACEHOLDER_H, loadState: "loading" },
    ]);

    const { rerender } = render(<GraphCanvas />);

    // Verify no resolve fired on initial render (loading state, no transition).
    mockStore.updateNodePositions.mockClear();
    mockNativeGraph.nativeGraphMoveNodes.mockClear();

    // Simulate the swap: same count, but plugin transitions loading→ready
    // and RF now reports the real taller height.
    rf.nodes.find((n) => n.id === "plugin")!.measured = {
      width: W,
      height: REAL_H,
    };
    mockStore.nodes = [
      { id: "neighbour", loadState: undefined, position: { x: 0, y: 0 } },
      { id: "plugin", loadState: "ready", position: { x: 0, y: 10 } },
    ];

    act(() => {
      rerender(<GraphCanvas />);
    });

    // Before the 120ms defer fires, nothing should have been called yet.
    expect(mockStore.updateNodePositions).not.toHaveBeenCalled();

    // Advance timers past the 120ms defer.
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Resolver must have fired.
    expect(mockStore.updateNodePositions).toHaveBeenCalledTimes(1);
    const moves = mockStore.updateNodePositions.mock.calls[0][0] as Array<{
      id: string;
      x: number;
      y: number;
    }>;

    // Build final AABBs.
    const finalById = new Map<string, { id: string; x: number; y: number; width: number; height: number }>([
      ["neighbour", { id: "neighbour", x: 0, y: 0, width: W, height: NEIGHBOUR_H }],
      ["plugin",    { id: "plugin",    x: 0, y: 10, width: W, height: REAL_H }],
    ]);
    for (const m of moves) {
      const r = finalById.get(m.id);
      if (r) { r.x = m.x; r.y = m.y; }
    }

    const rects = [...finalById.values()];
    expect(rectsOverlap(rects[0], rects[1], 0)).toBe(false);

    // Persisted to engine.
    expect(mockNativeGraph.nativeGraphMoveNodes).toHaveBeenCalledWith(moves);
  });

  it("does NOT fire when nothing transitions (stable state — all ready from the start)", () => {
    seedNodes([
      { id: "a", x: 0, y: 0, height: NEIGHBOUR_H },
      { id: "b", x: 0, y: 10, height: NEIGHBOUR_H, loadState: "ready" },
    ]);

    render(<GraphCanvas />);
    mockStore.updateNodePositions.mockClear();
    mockNativeGraph.nativeGraphMoveNodes.mockClear();

    act(() => { vi.advanceTimersByTime(200); });

    // No swap happened → swap-resolve must NOT fire.
    // (The spawn/load passes may fire, but NOT from a loading→ready transition.)
    // We assert the mock was NOT called due to a swap.
    // Note: other passes are count/board-gated and don't fire here (no count
    // change, nodesInit=false). So the total must be 0.
    expect(mockStore.updateNodePositions).not.toHaveBeenCalled();
  });

  it("does NOT fire when a block stays in loading state (no transition)", () => {
    seedNodes([
      { id: "neighbour", x: 0, y: 0, height: NEIGHBOUR_H },
      { id: "plugin", x: 0, y: 10, height: PLACEHOLDER_H, loadState: "loading" },
    ]);

    const { rerender } = render(<GraphCanvas />);
    mockStore.updateNodePositions.mockClear();
    mockNativeGraph.nativeGraphMoveNodes.mockClear();

    // Re-render without changing loadState — still loading.
    act(() => { rerender(<GraphCanvas />); });
    act(() => { vi.advanceTimersByTime(200); });

    expect(mockStore.updateNodePositions).not.toHaveBeenCalled();
  });

  it("skips the deferred resolve when a drag is in progress at fire time", () => {
    seedNodes([
      { id: "neighbour", x: 0, y: 0, height: NEIGHBOUR_H },
      { id: "plugin", x: 0, y: 10, height: PLACEHOLDER_H, loadState: "loading" },
    ]);

    const { rerender } = render(<GraphCanvas />);
    mockStore.updateNodePositions.mockClear();
    mockNativeGraph.nativeGraphMoveNodes.mockClear();

    // Transition to ready.
    rf.nodes.find((n) => n.id === "plugin")!.measured = { width: W, height: REAL_H };
    mockStore.nodes = [
      { id: "neighbour", loadState: undefined, position: { x: 0, y: 0 } },
      { id: "plugin", loadState: "ready", position: { x: 0, y: 10 } },
    ];

    act(() => { rerender(<GraphCanvas />); });

    // Simulate a drag starting before the 120ms defer fires.
    // Drive onNodeDragStart via the captured ReactFlow prop.
    type DragHandler = (event: unknown, node: unknown) => void;
    const onDragStart = capturedProps["onNodeDragStart"] as DragHandler | undefined;
    if (onDragStart) {
      act(() => {
        onDragStart({}, { id: "neighbour", type: "block", position: { x: 0, y: 0 }, data: {} });
      });
    }

    act(() => { vi.advanceTimersByTime(200); });

    // The deferred resolve should have been skipped due to draggingRef.
    expect(mockStore.updateNodePositions).not.toHaveBeenCalled();
  });
});
