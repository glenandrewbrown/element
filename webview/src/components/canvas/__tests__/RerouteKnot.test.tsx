/**
 * Tests for Wave-3 Task 5.1 — RerouteNode as a first-class cable gesture (knot).
 *
 * Two gestures, both asserted against the mocked native bridge:
 *  1. Double-click a Cable → nativeGraphInsertReroute(aId, aOut, bId, bIn,
 *     signalType, flowX, flowY) with the CURSOR flow point and the
 *     SIGNAL-CORRECT reroute type chosen host-side (we pass the cable's
 *     signalType through and assert it). Audio + MIDI cases.
 *  2. Drag off a port → empty canvas → "Add Reroute" → nativeGraphAddPluginConnected
 *     with the signal-correct reroute IDENTIFIER + the origin port + flow point.
 *
 * Strategy mirrors GraphCanvas.test.tsx: mock @xyflow/react, the stores and the
 * bridge, capture the RF handlers (onEdgeDoubleClick / onConnectStart /
 * onConnectEnd), and surface the QuickAddPopup's onAddReroute via a button so an
 * ⌥+drop test can fire it. Full pointer interaction is E2E (Playwright).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// ── Mock @xyflow/react ──────────────────────────────────────────────────────
type RFProps = {
  children?: React.ReactNode;
  onEdgeDoubleClick?: (e: unknown, edge: unknown) => void;
  onConnectStart?: (e: unknown, params: unknown) => void;
  onConnectEnd?: (e: unknown, state: unknown) => void;
};
const rfHandlers: {
  onEdgeDoubleClick?: RFProps["onEdgeDoubleClick"];
  onConnectStart?: RFProps["onConnectStart"];
  onConnectEnd?: RFProps["onConnectEnd"];
} = {};

vi.mock("@xyflow/react", () => {
  const ReactFlow = (props: RFProps) => {
    rfHandlers.onEdgeDoubleClick = props.onEdgeDoubleClick;
    rfHandlers.onConnectStart = props.onConnectStart;
    rfHandlers.onConnectEnd = props.onConnectEnd;
    return <div data-testid="react-flow">{props.children}</div>;
  };
  return {
    ReactFlow,
    Background: () => <div data-testid="rf-background" />,
    MiniMap: () => <div data-testid="rf-minimap" />,
    useNodesState: vi.fn(() => [[], vi.fn(), vi.fn()]),
    useEdgesState: vi.fn(() => [[], vi.fn(), vi.fn()]),
    useNodesInitialized: vi.fn(() => false),
    useReactFlow: vi.fn(() => ({
      fitView: vi.fn(),
      // Echo a deterministic flow transform (screen → flow) so the cursor point
      // handed to the bridge is assertable: (clientX+1000, clientY+2000).
      screenToFlowPosition: vi.fn((p: { x: number; y: number }) => ({
        x: p.x + 1000,
        y: p.y + 2000,
      })),
      getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
      getNodes: vi.fn(() => []),
    })),
    useStoreApi: vi.fn(() => ({
      getState: vi.fn(() => ({ addSelectedNodes: vi.fn() })),
    })),
    BackgroundVariant: { Dots: "dots" },
    SelectionMode: { Partial: "partial" },
  };
});

vi.mock("@xyflow/react/dist/style.css", () => ({}));

// ── Mock stores ─────────────────────────────────────────────────────────────
const { useGraphStoreMock, mockGraphStore } = vi.hoisted(() => {
  const store = {
    nodes: [] as unknown[],
    edges: [] as unknown[],
    commentBoxes: [] as unknown[],
    selectedNodeId: null as string | null,
    selectedEdgeId: null as string | null,
    minimapVisible: true,
    selectNode: vi.fn(),
    selectEdge: vi.fn(),
    clearSelection: vi.fn(),
    pushBreadcrumb: vi.fn(),
    popBreadcrumb: vi.fn(),
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
  selectBreadcrumbs: (s: { breadcrumbStack?: string[] }) =>
    s.breadcrumbStack ?? [],
}));

const mockAppStore = {
  mode: "edit" as "edit" | "perform",
  setMode: vi.fn(),
  openBlockTab: vi.fn(),
  embeddedEditorNodeId: null as string | null,
  canvasHint: null as string | null,
  setCanvasHint: vi.fn((hint: string | null) => {
    mockAppStore.canvasHint = hint;
  }),
};

vi.mock("../../../stores/useAppStore", () => {
  const fn = vi.fn((sel: (s: typeof mockAppStore) => unknown) =>
    sel(mockAppStore),
  );
  (fn as unknown as { getState: () => typeof mockAppStore }).getState = () =>
    mockAppStore;
  return { useAppStore: fn };
});

const mockHostExtras = {
  canvas: {
    snapToGrid: false,
    gridSize: 8,
    graphBounds: { minX: 0, minY: 0, maxX: 800, maxY: 600 },
  },
};

vi.mock("../../../stores/useHostExtrasStore", () => ({
  useHostExtrasStore: vi.fn((sel: (s: typeof mockHostExtras) => unknown) =>
    sel(mockHostExtras),
  ),
}));

// ── Mock bridge ───────────────────────────────────────────────────────────────
vi.mock("../../../bridge/nativeGraph", () => ({
  nativeEnterContainer: vi.fn(async () => true),
  nativeExitContainer: vi.fn(async () => true),
  nativeGraphCommentAdd: vi.fn(),
  nativeGraphCommentUpsert: vi.fn(),
  nativeGraphConnect: vi.fn(),
  nativeGraphAddPluginConnected: vi.fn(async () => true),
  nativeGraphDisconnect: vi.fn(),
  nativeGraphSpliceCable: vi.fn(async () => true),
  nativeGraphInsertReroute: vi.fn(async () => true),
  nativeGraphMoveNodes: vi.fn(),
  nativeGraphRenameNode: vi.fn(),
  nativeGraphSetViewport: vi.fn(),
  nativeMoleculeInsert: vi.fn(),
}));

vi.mock("../../../bridge/nativePluginEditor", () => ({
  nativePluginEditorOpen: vi.fn(),
  nativePluginEditorClose: vi.fn(),
}));

// ── Mock child components ─────────────────────────────────────────────────────
vi.mock("../Block", () => ({ Block: () => <div data-testid="block" /> }));
vi.mock("../Cable", () => ({ Cable: () => null }));
vi.mock("../CommentFrame", () => ({ CommentFrame: () => null }));
// QuickAddPopup mock surfaces the onAddReroute affordance so the ⌥+drop "Add
// Reroute" test can fire it. (The real first-class row is covered by the
// QuickAddPopup unit tests; here we only assert GraphCanvas wires the callback.)
vi.mock("../QuickAddPopup", () => ({
  QuickAddPopup: ({
    portType,
    onAddReroute,
  }: {
    portType?: string;
    onAddReroute?: () => void;
  }) => (
    <div data-testid="quick-add-popup" data-port-type={portType ?? ""}>
      {onAddReroute && (
        <button
          type="button"
          data-testid="quick-add-reroute"
          onClick={() => onAddReroute()}
        />
      )}
    </div>
  ),
}));
vi.mock("../CanvasContextMenu", () => ({
  CanvasContextMenu: () => <div data-testid="canvas-context-menu" />,
}));
vi.mock("../NodeContextMenu", () => ({
  NodeContextMenu: () => null,
}));
vi.mock("../EdgeContextMenu", () => ({
  EdgeContextMenu: () => null,
}));

import { GraphCanvas } from "../GraphCanvas";
import {
  nativeGraphInsertReroute,
  nativeGraphAddPluginConnected,
} from "../../../bridge/nativeGraph";

// ─────────────────────────────────────────────────────────────────────────────

/** Fire an RF edge double-click with a synthetic edge + cursor. */
const dblClickCable = (
  edge: Record<string, unknown>,
  clientX: number,
  clientY: number,
) => {
  act(() => {
    rfHandlers.onEdgeDoubleClick?.(
      { stopPropagation: vi.fn(), clientX, clientY },
      edge,
    );
  });
};

const audioEdge = {
  id: "c-1",
  source: "n-a",
  sourceHandle: "out-0",
  target: "n-b",
  targetHandle: "in-0",
  data: {
    id: "c-1",
    source: "n-a",
    sourcePort: "out-0",
    target: "n-b",
    targetPort: "in-0",
    signalType: "audio",
  },
};

const midiEdge = {
  ...audioEdge,
  id: "c-2",
  sourceHandle: "out-3",
  targetHandle: "in-2",
  data: { ...audioEdge.data, id: "c-2", signalType: "midi" },
};

describe("Reroute knot — Task 5.1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppStore.mode = "edit";
    mockGraphStore.nodes = [];
  });

  // ── Gesture #1 — double-click cable → atomic insert at cursor ──────────────

  it("double-click an AUDIO cable → nativeGraphInsertReroute with cursor point + audio", () => {
    render(<GraphCanvas />);
    dblClickCable(audioEdge, 120, 90);
    // screenToFlowPosition echoes (clientX+1000, clientY+2000).
    expect(nativeGraphInsertReroute).toHaveBeenCalledWith(
      "n-a",
      "out-0",
      "n-b",
      "in-0",
      "audio",
      1120,
      2090,
    );
  });

  it("double-click a MIDI cable → nativeGraphInsertReroute with midi signal type + its handles", () => {
    render(<GraphCanvas />);
    dblClickCable(midiEdge, 200, 150);
    expect(nativeGraphInsertReroute).toHaveBeenCalledWith(
      "n-a",
      "out-3",
      "n-b",
      "in-2",
      "midi",
      1200,
      2150,
    );
  });

  it("does NOT insert a reroute on cable double-click in perform mode", () => {
    mockAppStore.mode = "perform";
    render(<GraphCanvas />);
    // In perform mode onEdgeDoubleClick is not wired (undefined), so the handler
    // never fires — assert no bridge call even if a stray edge dbl-click arrives.
    rfHandlers.onEdgeDoubleClick?.(
      { stopPropagation: vi.fn(), clientX: 10, clientY: 10 },
      audioEdge,
    );
    expect(nativeGraphInsertReroute).not.toHaveBeenCalled();
  });

  // ── Gesture #2 — drag off port → empty canvas → "Add Reroute" ──────────────

  const startDragOffAudioOutput = () => {
    mockGraphStore.nodes = [
      {
        id: "n-src",
        ports: [
          { id: "out-0", type: "audio" },
          { id: "in-0", type: "audio" },
        ],
      },
    ];
    act(() => {
      rfHandlers.onConnectStart?.(
        { type: "mousedown" },
        { nodeId: "n-src", handleId: "out-0", handleType: "source" },
      );
    });
  };

  const endDragOnEmptyCanvasWithAlt = (clientX: number, clientY: number) => {
    act(() => {
      rfHandlers.onConnectEnd?.(
        { altKey: true, clientX, clientY },
        { isValid: null, fromHandle: { type: "source" } },
      );
    });
  };

  it("drag off an AUDIO port → empty canvas → Add Reroute → nativeGraphAddPluginConnected with the audio reroute id", () => {
    render(<GraphCanvas />);
    startDragOffAudioOutput();
    endDragOnEmptyCanvasWithAlt(120, 90);
    // The QuickAdd popup is mounted (port-typed). Fire its Add Reroute option.
    fireEvent.click(screen.getByTestId("quick-add-reroute"));
    // Reuses the atomic ⌥+drop add+connect path, with the signal-correct id.
    expect(nativeGraphAddPluginConnected).toHaveBeenCalledWith(
      "element.audioReroute",
      1120,
      2090,
      "n-src",
      "out-0",
      true, // origin handle was a source (output)
    );
  });
});
