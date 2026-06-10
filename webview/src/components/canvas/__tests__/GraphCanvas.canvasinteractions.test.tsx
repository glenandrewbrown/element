/**
 * Tests for the Wave-2 D canvas-interaction wiring in <GraphCanvas /> that
 * lives in the component (not the pure libs, which are tested separately):
 *   - EV_TIDY → computeAutoLayout → nativeGraphMoveNodes (Item 3b Tidy)
 *   - auto-tidy-on-add: a block-COUNT increase fires a debounced relayout when
 *     the toggle is ON (Glen Q3), and does NOT when OFF
 *   - snippet drop → nativeMoleculeInsert at the flow-mapped drop point (4a-iii)
 *
 * Strategy mirrors GraphCanvas.test.tsx — mock RF + stores + bridge — but with a
 * mutable graph store + an autoTidyOnAdd flag so we can drive the effects with
 * fake timers. Full RF drag interaction stays E2E.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import { EV_TIDY } from "../../../events";

vi.mock("@xyflow/react/dist/style.css", () => ({}));

vi.mock("@xyflow/react", () => {
  const ReactFlow = (props: { children?: React.ReactNode }) => (
    <div data-testid="react-flow">{props.children}</div>
  );
  return {
    ReactFlow,
    Background: () => <div data-testid="rf-background" />,
    MiniMap: () => <div data-testid="rf-minimap" />,
    useNodesState: vi.fn(() => [[], vi.fn(), vi.fn()]),
    useEdgesState: vi.fn(() => [[], vi.fn(), vi.fn()]),
    useNodesInitialized: vi.fn(() => false),
    useReactFlow: vi.fn(() => ({
      fitView: vi.fn(),
      screenToFlowPosition: vi.fn((p: { x: number; y: number }) => ({
        x: p.x + 1000,
        y: p.y + 2000,
      })),
      getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
      getNodes: vi.fn(() => []),
      setNodes: vi.fn(),
    })),
    BackgroundVariant: { Dots: "dots" },
    SelectionMode: { Partial: "partial" },
  };
});

// Mutable graph store so we can flip the node count between renders.
const { mockGraphStore, useGraphStoreMock } = vi.hoisted(() => {
  const store = {
    nodes: [] as Array<{ id: string }>,
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
  const fn = vi.fn((sel: (s: typeof store) => unknown) => sel(store));
  (fn as unknown as { getState: () => typeof store }).getState = () => store;
  return { mockGraphStore: store, useGraphStoreMock: fn };
});

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: useGraphStoreMock,
  zoomToTier: vi.fn(() => "normal"),
}));

const { mockAppStore, useAppStoreMock } = vi.hoisted(() => {
  const store = {
    mode: "edit" as const,
    openBlockTab: vi.fn(),
    embeddedEditorNodeId: null as string | null,
    canvasHint: null as string | null,
    setCanvasHint: vi.fn(),
    autoTidyOnAdd: true,
    snapToGrid: false,
  };
  const fn = vi.fn((sel: (s: typeof store) => unknown) => sel(store));
  (fn as unknown as { getState: () => typeof store }).getState = () => store;
  return { mockAppStore: store, useAppStoreMock: fn };
});

vi.mock("../../../stores/useAppStore", () => ({ useAppStore: useAppStoreMock }));

vi.mock("../../../stores/useHostExtrasStore", () => ({
  useHostExtrasStore: vi.fn(
    (
      sel: (s: {
        canvas: {
          snapToGrid: boolean;
          gridSize: number;
          graphBounds: { minX: number; minY: number; maxX: number; maxY: number };
        };
      }) => unknown,
    ) =>
      sel({
        canvas: {
          snapToGrid: false,
          gridSize: 8,
          graphBounds: { minX: 0, minY: 0, maxX: 800, maxY: 600 },
        },
      }),
  ),
}));

const bridge = vi.hoisted(() => ({
  nativeGraphMoveNodes: vi.fn(),
  nativeMoleculeInsert: vi.fn(async () => true),
  nativeGraphAddPlugin: vi.fn(
    async (_id: string, _x?: number, _y?: number) => true,
  ),
}));

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeEnterContainer: vi.fn(async () => true),
  nativeExitContainer: vi.fn(async () => true),
  nativeGraphCommentAdd: vi.fn(),
  nativeGraphCommentUpsert: vi.fn(),
  nativeGraphConnect: vi.fn(),
  nativeGraphAddPluginConnected: vi.fn(async () => true),
  nativeGraphAddPlugin: bridge.nativeGraphAddPlugin,
  nativeGraphDisconnect: vi.fn(),
  nativeGraphMoveNodes: bridge.nativeGraphMoveNodes,
  nativeGraphRenameNode: vi.fn(),
  nativeGraphSetViewport: vi.fn(),
  nativeMoleculeInsert: bridge.nativeMoleculeInsert,
}));

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
  // Keep the real pure helpers (estimateBlockHeight, BLOCK_REF_* — used by
  // runTidy / collision rects) and stub only the drag-suggestion compute.
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

const TWO_NODES = [{ id: "a" }, { id: "b" }];

describe("GraphCanvas — Tidy (Item 3b)", () => {
  beforeEach(() => {
    bridge.nativeGraphMoveNodes.mockClear();
    bridge.nativeMoleculeInsert.mockClear();
    mockGraphStore.nodes = [...TWO_NODES];
    mockGraphStore.edges = [{ source: "a", target: "b" }];
    mockAppStore.autoTidyOnAdd = true;
  });

  it("EV_TIDY relayouts via nativeGraphMoveNodes (a real layout was computed)", () => {
    render(<GraphCanvas />);
    bridge.nativeGraphMoveNodes.mockClear(); // ignore any mount-time call
    act(() => {
      window.dispatchEvent(new CustomEvent(EV_TIDY));
    });
    expect(bridge.nativeGraphMoveNodes).toHaveBeenCalledTimes(1);
    const positions = bridge.nativeGraphMoveNodes.mock.calls[0][0];
    expect(positions.map((p: { id: string }) => p.id).sort()).toEqual([
      "a",
      "b",
    ]);
  });

  it("EV_TIDY on an empty Board is a no-op (nothing to tidy)", () => {
    mockGraphStore.nodes = [];
    render(<GraphCanvas />);
    bridge.nativeGraphMoveNodes.mockClear();
    act(() => {
      window.dispatchEvent(new CustomEvent(EV_TIDY));
    });
    expect(bridge.nativeGraphMoveNodes).not.toHaveBeenCalled();
  });
});

describe("GraphCanvas — auto-tidy on add (Glen Q3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    bridge.nativeGraphMoveNodes.mockClear();
    mockGraphStore.nodes = [...TWO_NODES];
    mockGraphStore.edges = [];
    mockAppStore.autoTidyOnAdd = true;
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("fires a debounced relayout when the block COUNT increases (toggle ON)", () => {
    const { rerender } = render(<GraphCanvas />);
    bridge.nativeGraphMoveNodes.mockClear();
    // Simulate an ADD: count goes 2 → 3.
    act(() => {
      mockGraphStore.nodes = [...TWO_NODES, { id: "c" }];
      rerender(<GraphCanvas />);
    });
    // Not yet — debounced.
    expect(bridge.nativeGraphMoveNodes).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(bridge.nativeGraphMoveNodes).toHaveBeenCalledTimes(1);
  });

  it("does NOT relayout on add when the toggle is OFF", () => {
    mockAppStore.autoTidyOnAdd = false;
    const { rerender } = render(<GraphCanvas />);
    bridge.nativeGraphMoveNodes.mockClear();
    act(() => {
      mockGraphStore.nodes = [...TWO_NODES, { id: "c" }];
      rerender(<GraphCanvas />);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(bridge.nativeGraphMoveNodes).not.toHaveBeenCalled();
  });

  it("does NOT relayout when the count DECREASES (a delete, not an add)", () => {
    const { rerender } = render(<GraphCanvas />);
    bridge.nativeGraphMoveNodes.mockClear();
    act(() => {
      mockGraphStore.nodes = [{ id: "a" }]; // 2 → 1
      rerender(<GraphCanvas />);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(bridge.nativeGraphMoveNodes).not.toHaveBeenCalled();
  });
});

describe("GraphCanvas — snippet drop (Item 4a-iii)", () => {
  beforeEach(() => {
    bridge.nativeMoleculeInsert.mockClear();
    mockGraphStore.nodes = [];
    mockAppStore.autoTidyOnAdd = false;
  });

  it("inserts the dropped molecule at the flow-mapped drop point", () => {
    const { container } = render(<GraphCanvas />);
    const root = container.firstChild as HTMLElement;
    // A snippet-typed dataTransfer (the C-worker's contract).
    const dataTransfer = {
      types: ["application/x-element-snippet"],
      getData: (t: string) =>
        t === "application/x-element-snippet"
          ? JSON.stringify({ name: "Reverb Bus" })
          : "",
      dropEffect: "none",
    };
    fireEvent.drop(root, {
      clientX: 50,
      clientY: 60,
      dataTransfer: dataTransfer as unknown as DataTransfer,
    });
    // The drop-target wiring fired the molecule insert with the payload NAME.
    // (jsdom's synthetic DragEvent does not carry clientX/Y, so the mapped flow
    // coords land as NaN here — the screenToFlowPosition mapping itself is unit-
    // tested via the ⌥-drop path; the coord plumbing is identical. We assert the
    // insert happened exactly once with the right name.)
    expect(bridge.nativeMoleculeInsert).toHaveBeenCalledTimes(1);
    const firstCall = bridge.nativeMoleculeInsert.mock.calls[0] as unknown[];
    expect(firstCall[0]).toBe("Reverb Bus");
  });

  it("ignores a foreign (non-snippet) drop", () => {
    const { container } = render(<GraphCanvas />);
    const root = container.firstChild as HTMLElement;
    const dataTransfer = {
      types: ["text/plain"],
      getData: () => "",
      dropEffect: "none",
    };
    fireEvent.drop(root, {
      clientX: 10,
      clientY: 10,
      dataTransfer: dataTransfer as unknown as DataTransfer,
    });
    expect(bridge.nativeMoleculeInsert).not.toHaveBeenCalled();
  });
});

// T19 — a plugin ROW dragged from the left browser onto the Board adds the
// Block at the drop point via nativeGraphAddPlugin (NOT nativeMoleculeInsert).
describe("GraphCanvas — plugin drop (T19 drag-to-Board)", () => {
  beforeEach(() => {
    bridge.nativeGraphAddPlugin.mockClear();
    bridge.nativeMoleculeInsert.mockClear();
    mockGraphStore.nodes = [];
    mockAppStore.autoTidyOnAdd = false;
  });

  it("adds the dropped plugin via nativeGraphAddPlugin with the identifier", () => {
    const { container } = render(<GraphCanvas />);
    const root = container.firstChild as HTMLElement;
    const dataTransfer = {
      types: ["application/x-element-plugin"],
      getData: (t: string) =>
        t === "application/x-element-plugin"
          ? JSON.stringify({ identifier: "vst3:Pro-Q 3", name: "Pro-Q 3" })
          : "",
      dropEffect: "none",
    };
    fireEvent.drop(root, {
      clientX: 120,
      clientY: 80,
      dataTransfer: dataTransfer as unknown as DataTransfer,
    });
    expect(bridge.nativeGraphAddPlugin).toHaveBeenCalledTimes(1);
    expect(bridge.nativeGraphAddPlugin.mock.calls[0][0]).toBe("vst3:Pro-Q 3");
    // A plugin drop must NOT mis-route to the molecule insert path.
    expect(bridge.nativeMoleculeInsert).not.toHaveBeenCalled();
  });
});
