/**
 * Tests for <GraphCanvas /> — the React Flow board surface.
 *
 * Strategy: mock all external deps (ReactFlow, stores, bridges) to keep
 * tests fast and deterministic. We test:
 *  - renders without crashing (happy path)
 *  - QuickAddPopup appears on right-click empty canvas
 *  - NodeContextMenu not shown on initial render
 *  - edit-mode guard (QuickAdd disabled in perform mode)
 *
 * Full drag/connection interaction is left to E2E (Playwright).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// ── Mock @xyflow/react ──────────────────────────────────────────────────────
// We capture onNodeDoubleClick / onDoubleClick so dive-gesture tests can invoke
// them directly with a synthetic node/event (full RF interaction is E2E).
type RFProps = {
  children?: React.ReactNode;
  onPaneContextMenu?: (e: React.MouseEvent) => void;
  onNodeDoubleClick?: (e: unknown, node: unknown) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onConnectStart?: (e: unknown, params: unknown) => void;
  onConnectEnd?: (e: unknown, state: unknown) => void;
  minZoom?: number;
  maxZoom?: number;
};
const rfHandlers: {
  onNodeDoubleClick?: RFProps["onNodeDoubleClick"];
  onDoubleClick?: RFProps["onDoubleClick"];
  onConnectStart?: RFProps["onConnectStart"];
  onConnectEnd?: RFProps["onConnectEnd"];
} = {};
// Last full prop bag passed to <ReactFlow> — for asserting config (zoom range).
let rfLastProps: RFProps = {};

vi.mock("@xyflow/react", () => {
  const ReactFlow = (props: RFProps) => {
    const {
      children,
      onPaneContextMenu,
      onNodeDoubleClick,
      onDoubleClick,
      onConnectStart,
      onConnectEnd,
    } = props;
    rfHandlers.onNodeDoubleClick = onNodeDoubleClick;
    rfHandlers.onDoubleClick = onDoubleClick;
    rfHandlers.onConnectStart = onConnectStart;
    rfHandlers.onConnectEnd = onConnectEnd;
    rfLastProps = props;
    return (
      <div
        data-testid="react-flow"
        onContextMenu={onPaneContextMenu}
        onDoubleClick={onDoubleClick}
      >
        {children}
      </div>
    );
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
      // Echo a deterministic flow transform of the screen point so add-and-
      // connect tests can assert the flow coords handed to the bridge.
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

// ── Mock @xyflow/react/dist/style.css ────────────────────────────────────────
vi.mock("@xyflow/react/dist/style.css", () => ({}));

// ── Mock stores ──────────────────────────────────────────────────────────────
// `vi.mock` factories are hoisted above top-level `const`s, so the mock state
// and the store-mock fn must be created inside `vi.hoisted()` to exist when
// the hoisted factory runs (avoids the
// "Cannot access 'useGraphStoreMock' before initialization" ReferenceError).
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
  // Zustand stores expose .getState() as a static method.
  (fn as unknown as { getState: () => typeof store }).getState = () => store;
  return { mockGraphStore: store, useGraphStoreMock: fn };
});

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: useGraphStoreMock,
  zoomToTier: vi.fn(() => "normal"),
  selectBreadcrumbs: (s: { breadcrumbStack?: string[] }) => s.breadcrumbStack ?? [],
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
    sel(mockAppStore)
  );
  // Zustand stores expose .getState() as a static method.
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
  useHostExtrasStore: vi.fn(
    (sel: (s: typeof mockHostExtras) => unknown) => sel(mockHostExtras)
  ),
}));

// ── Mock bridge calls ────────────────────────────────────────────────────────
vi.mock("../../../bridge/nativeGraph", () => ({
  nativeEnterContainer: vi.fn(async () => true),
  nativeExitContainer: vi.fn(async () => true),
  nativeGraphCommentAdd: vi.fn(),
  nativeGraphCommentUpsert: vi.fn(),
  nativeGraphConnect: vi.fn(),
  nativeGraphAddPlugin: vi.fn(async () => true),
  nativeGraphAddPluginAt: vi.fn(async () => true),
  nativeGraphAddPluginConnected: vi.fn(async () => true),
  nativeGraphDisconnect: vi.fn(),
  nativeGraphMoveNodes: vi.fn(),
  nativeGraphRenameNode: vi.fn(),
  nativeGraphSetViewport: vi.fn(),
}));

vi.mock("../../../bridge/nativePluginEditor", () => ({
  nativePluginEditorOpen: vi.fn(),
  nativePluginEditorClose: vi.fn(),
}));

// ── Mock child components ────────────────────────────────────────────────────
vi.mock("../Block", () => ({ Block: () => <div data-testid="block" /> }));
vi.mock("../Cable", () => ({ Cable: () => null }));
vi.mock("../CommentFrame", () => ({ CommentFrame: () => null }));
// GraphCanvas mounts QuickAddPopup only while a pane context menu is active
// (`{contextMenu && <QuickAddPopup .../>}`, GraphCanvas.tsx:532) — there is no
// `open` prop, so the mock renders whenever it is mounted.
vi.mock("../QuickAddPopup", () => ({
  // Surface the port-type + a "pick" trigger so ⌥+drop tests can assert the
  // popup is port-typed and that picking routes through the onPick override.
  QuickAddPopup: ({
    portType,
    onPick,
  }: {
    portType?: string;
    onPick?: (id: string) => void;
  }) => (
    <div data-testid="quick-add-popup" data-port-type={portType ?? ""}>
      <button
        type="button"
        data-testid="quick-add-pick"
        onClick={() => onPick?.("com.vendor.Reverb")}
      />
    </div>
  ),
}));
vi.mock("../CanvasContextMenu", () => ({
  CanvasContextMenu: () => <div data-testid="canvas-context-menu" />,
}));
vi.mock("../NodeContextMenu", () => ({
  NodeContextMenu: ({ open }: { open: boolean }) =>
    open ? <div data-testid="node-context-menu" /> : null,
}));
vi.mock("../EdgeContextMenu", () => ({
  EdgeContextMenu: ({ open }: { open: boolean }) =>
    open ? <div data-testid="edge-context-menu" /> : null,
}));

import { GraphCanvas } from "../GraphCanvas";
import {
  nativeEnterContainer,
  nativeExitContainer,
  nativeGraphAddPluginConnected,
} from "../../../bridge/nativeGraph";
import { nativePluginEditorOpen } from "../../../bridge/nativePluginEditor";

// ─────────────────────────────────────────────────────────────────────────────

describe("GraphCanvas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppStore.mode = "edit";
    mockAppStore.embeddedEditorNodeId = null;
    mockAppStore.canvasHint = null;
    // Reset the graph store nodes to a single Block with real ports for the
    // ⌥+drop signal-type resolution tests; other tests use mockGraphStore.nodes
    // = [] (Block is mocked so a stray node never renders a real component).
    mockGraphStore.nodes = [];
  });

  // ── Happy path ────────────────────────────────────────────────────────────
  it("renders without crashing", () => {
    render(<GraphCanvas />);
    expect(screen.getByTestId("react-flow")).toBeInTheDocument();
  });

  it("renders the RF Background", () => {
    render(<GraphCanvas />);
    expect(screen.getByTestId("rf-background")).toBeInTheDocument();
  });

  it("renders the RF MiniMap", () => {
    render(<GraphCanvas />);
    expect(screen.getByTestId("rf-minimap")).toBeInTheDocument();
  });

  // ── Context menu: pane right-click (Glen QA 2026-06-06, reverses A2) ───────
  // Plain right-click on the EMPTY canvas = FULL board context menu
  // (Comment/Paste/zoom… with "Add Block…" as its top item).
  // Shift+right-click = QuickAdd directly at the cursor (speed path).
  it("shows the board CanvasContextMenu on plain pane right-click in edit mode", () => {
    render(<GraphCanvas />);
    const pane = screen.getByTestId("react-flow");
    fireEvent.contextMenu(pane, { clientX: 100, clientY: 200 });
    expect(screen.getByTestId("canvas-context-menu")).toBeInTheDocument();
    expect(screen.queryByTestId("quick-add-popup")).not.toBeInTheDocument();
  });

  it("shows QuickAddPopup directly on SHIFT+right-click (not the board menu)", () => {
    render(<GraphCanvas />);
    const pane = screen.getByTestId("react-flow");
    fireEvent.contextMenu(pane, { clientX: 100, clientY: 200, shiftKey: true });
    expect(screen.getByTestId("quick-add-popup")).toBeInTheDocument();
    expect(
      screen.queryByTestId("canvas-context-menu"),
    ).not.toBeInTheDocument();
  });

  it("does NOT show QuickAddPopup in perform mode", () => {
    mockAppStore.mode = "perform";
    render(<GraphCanvas />);
    const pane = screen.getByTestId("react-flow");
    fireEvent.contextMenu(pane, { clientX: 100, clientY: 200 });
    expect(screen.queryByTestId("quick-add-popup")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("canvas-context-menu"),
    ).not.toBeInTheDocument();
  });

  // ── T3: ⌥(Alt)+drop a cable on empty canvas → port-typed QuickAdd ──────────
  // RF fires onConnectStart (stash origin) then onConnectEnd (isValid===null
  // for an empty-canvas release). With ⌥ held we open a PORT-TYPED QuickAdd and
  // route its pick to a positioned add+connect; without ⌥ we just nudge.

  const startDragOffOutputPort = () => {
    // A Block carrying real ports so signal-type resolves to "audio".
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

  const endDrag = (state: unknown, event: Record<string, unknown>) => {
    act(() => {
      rfHandlers.onConnectEnd?.(event, state);
    });
  };

  it("⌥+drop on empty canvas opens a PORT-TYPED QuickAdd at the flow drop point", () => {
    render(<GraphCanvas />);
    startDragOffOutputPort();
    // Empty-canvas release WITH ⌥: isValid === null (RF's "no valid handle").
    endDrag(
      { isValid: null, fromHandle: { type: "source" } },
      { altKey: true, clientX: 120, clientY: 90 },
    );
    const popup = screen.getByTestId("quick-add-popup");
    expect(popup).toBeInTheDocument();
    // Origin port type "audio" flowed through to the popup's portType filter.
    expect(popup.getAttribute("data-port-type")).toBe("audio");
  });

  it("picking in the ⌥+drop QuickAdd routes to nativeGraphAddPluginConnected with flow coords + origin port", () => {
    render(<GraphCanvas />);
    startDragOffOutputPort();
    endDrag(
      { isValid: null, fromHandle: { type: "source" } },
      { altKey: true, clientX: 120, clientY: 90 },
    );
    fireEvent.click(screen.getByTestId("quick-add-pick"));
    // screenToFlowPosition echoes (clientX+1000, clientY+2000).
    expect(nativeGraphAddPluginConnected).toHaveBeenCalledWith(
      "com.vendor.Reverb",
      1120,
      2090,
      "n-src",
      "out-0",
      true, // origin handle was a "source" (output)
    );
  });

  it("plain drop (no ⌥) does NOT mutate and sets a transient hint", () => {
    render(<GraphCanvas />);
    startDragOffOutputPort();
    endDrag(
      { isValid: null, fromHandle: { type: "source" } },
      { altKey: false, clientX: 120, clientY: 90 },
    );
    expect(screen.queryByTestId("quick-add-popup")).not.toBeInTheDocument();
    expect(nativeGraphAddPluginConnected).not.toHaveBeenCalled();
    expect(mockAppStore.setCanvasHint).toHaveBeenCalledWith(
      "Hold ⌥ next time to add a block here",
    );
  });

  it("a VALID drop is left untouched (RF owns the real connect via onConnect)", () => {
    render(<GraphCanvas />);
    startDragOffOutputPort();
    endDrag(
      { isValid: true, fromHandle: { type: "source" } },
      { altKey: true, clientX: 120, clientY: 90 },
    );
    // No QuickAdd, no add-and-connect, no nudge — onConnect handles the cable.
    expect(screen.queryByTestId("quick-add-popup")).not.toBeInTheDocument();
    expect(nativeGraphAddPluginConnected).not.toHaveBeenCalled();
  });

  it("connect-start sets the live cable-drag affordance hint", () => {
    render(<GraphCanvas />);
    startDragOffOutputPort();
    expect(mockAppStore.setCanvasHint).toHaveBeenCalledWith(
      "Drop on a port to connect · hold ⌥ and release to add a block",
    );
  });

  // ── Zoom range (A3/F2 — surgical zoom) ─────────────────────────────────────
  it("configures React Flow with minZoom 0.1 and maxZoom 3.0", () => {
    render(<GraphCanvas />);
    expect(rfLastProps.minZoom).toBe(0.1);
    expect(rfLastProps.maxZoom).toBe(3.0);
  });

  // ── Context menus hidden on initial render ────────────────────────────────
  it("NodeContextMenu not shown initially", () => {
    render(<GraphCanvas />);
    expect(screen.queryByTestId("node-context-menu")).not.toBeInTheDocument();
  });

  it("EdgeContextMenu not shown initially", () => {
    render(<GraphCanvas />);
    expect(screen.queryByTestId("edge-context-menu")).not.toBeInTheDocument();
  });

  it("QuickAddPopup not shown initially", () => {
    render(<GraphCanvas />);
    expect(screen.queryByTestId("quick-add-popup")).not.toBeInTheDocument();
  });

  // ── Empty nodes/edges ─────────────────────────────────────────────────────
  it("renders with zero nodes and zero edges", () => {
    render(<GraphCanvas />);
    // Should not throw or show any blocks
    expect(screen.queryByTestId("block")).not.toBeInTheDocument();
  });

  // ── Container dive gestures (the dive-desync fix) ───────────────────────────
  // Double-clicking a real local Container dives IN via the engine bridge; the
  // breadcrumb/canvas then update from the host snapshot (no optimistic push).

  it("double-clicking a Container Block calls nativeEnterContainer(node.id)", () => {
    render(<GraphCanvas />);
    // A real local Container: containerNodeCount set, not a Portal.
    rfHandlers.onNodeDoubleClick?.(
      { clientX: 10, clientY: 10 },
      {
        id: "container-1",
        type: "block",
        data: { name: "Voice Rack", containerNodeCount: 3 },
      },
    );
    expect(nativeEnterContainer).toHaveBeenCalledWith("container-1");
    // It is a DIVE, not a plugin-editor open.
    expect(nativePluginEditorOpen).not.toHaveBeenCalled();
  });

  it("double-clicking a Portal does NOT dive — it opens to edit (honest)", () => {
    render(<GraphCanvas />);
    // A Portal links an external .elboard; it must not fake a local dive.
    rfHandlers.onNodeDoubleClick?.(
      { clientX: 10, clientY: 10 },
      {
        id: "portal-1",
        type: "block",
        data: { name: "External Board", containerNodeCount: 5, isPortal: true },
      },
    );
    expect(nativeEnterContainer).not.toHaveBeenCalled();
    expect(nativePluginEditorOpen).toHaveBeenCalled();
  });

  it("double-clicking a plain plugin Block does NOT dive", () => {
    render(<GraphCanvas />);
    rfHandlers.onNodeDoubleClick?.(
      { clientX: 10, clientY: 10 },
      { id: "synth-1", type: "block", data: { name: "Polysynth" } },
    );
    expect(nativeEnterContainer).not.toHaveBeenCalled();
    expect(nativePluginEditorOpen).toHaveBeenCalled();
  });

  it("double-clicking empty canvas calls nativeExitContainer (navigate UP)", () => {
    render(<GraphCanvas />);
    // Pane double-click: target is the pane, NOT inside a node/edge.
    const paneEl = document.createElement("div");
    paneEl.className = "react-flow__pane";
    rfHandlers.onDoubleClick?.({ target: paneEl } as unknown as React.MouseEvent);
    expect(nativeExitContainer).toHaveBeenCalledTimes(1);
  });

  // REGRESSION (the "double-click does not dive" live bug): React Flow's raw
  // onDoubleClick ALSO fires when a node is double-clicked (the event bubbles
  // from the node DOM to the ReactFlow root). The pane handler must NOT exit on
  // a node-targeted double-click, otherwise the same gesture entered then
  // immediately popped the container → net no-op. The earlier tests invoked the
  // two handlers in isolation and never caught this.
  it("a CONTAINER double-click does not ALSO pop via the pane handler (enter, not enter+exit)", () => {
    render(<GraphCanvas />);

    // (1) React Flow fires the node handler → dive in.
    rfHandlers.onNodeDoubleClick?.(
      { clientX: 10, clientY: 10 },
      {
        id: "container-1",
        type: "block",
        data: { name: "Voice Rack", containerNodeCount: 3 },
      },
    );

    // (2) The SAME physical double-click bubbles to the raw onDoubleClick with a
    //     target INSIDE the node DOM (.react-flow__node wrapper).
    const nodeWrap = document.createElement("div");
    nodeWrap.className = "react-flow__node react-flow__node-block";
    const inner = document.createElement("div"); // e.g. the container header
    nodeWrap.appendChild(inner);
    rfHandlers.onDoubleClick?.({ target: inner } as unknown as React.MouseEvent);

    expect(nativeEnterContainer).toHaveBeenCalledWith("container-1");
    expect(nativeExitContainer).not.toHaveBeenCalled(); // would cancel the dive
  });
});
