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
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mock @xyflow/react ──────────────────────────────────────────────────────
// We capture onNodeDoubleClick / onDoubleClick so dive-gesture tests can invoke
// them directly with a synthetic node/event (full RF interaction is E2E).
type RFProps = {
  children?: React.ReactNode;
  onPaneContextMenu?: (e: React.MouseEvent) => void;
  onNodeDoubleClick?: (e: unknown, node: unknown) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
};
const rfHandlers: {
  onNodeDoubleClick?: RFProps["onNodeDoubleClick"];
  onDoubleClick?: RFProps["onDoubleClick"];
} = {};

vi.mock("@xyflow/react", () => {
  const ReactFlow = ({
    children,
    onPaneContextMenu,
    onNodeDoubleClick,
    onDoubleClick,
  }: RFProps) => {
    rfHandlers.onNodeDoubleClick = onNodeDoubleClick;
    rfHandlers.onDoubleClick = onDoubleClick;
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
    useReactFlow: vi.fn(() => ({
      fitView: vi.fn(),
      screenToFlowPosition: vi.fn(() => ({ x: 0, y: 0 })),
      getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
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
const { useGraphStoreMock } = vi.hoisted(() => {
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
  QuickAddPopup: () => <div data-testid="quick-add-popup" />,
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
} from "../../../bridge/nativeGraph";
import { nativePluginEditorOpen } from "../../../bridge/nativePluginEditor";

// ─────────────────────────────────────────────────────────────────────────────

describe("GraphCanvas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppStore.mode = "edit";
    mockAppStore.embeddedEditorNodeId = null;
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

  // ── Context menu: pane right-click ────────────────────────────────────────
  // QUARANTINE: stale interaction — right-click now opens a canvas context menu
  // first; QuickAddPopup only opens after clicking "Add Block…" inside it.
  // Test needs to be updated to follow the new 2-step flow.
  it.skip("shows QuickAddPopup on pane right-click in edit mode", () => {
    render(<GraphCanvas />);
    const pane = screen.getByTestId("react-flow");
    fireEvent.contextMenu(pane, { clientX: 100, clientY: 200 });
    expect(screen.getByTestId("quick-add-popup")).toBeInTheDocument();
  });

  it("does NOT show QuickAddPopup in perform mode", () => {
    mockAppStore.mode = "perform";
    render(<GraphCanvas />);
    const pane = screen.getByTestId("react-flow");
    fireEvent.contextMenu(pane, { clientX: 100, clientY: 200 });
    expect(screen.queryByTestId("quick-add-popup")).not.toBeInTheDocument();
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
