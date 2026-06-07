/**
 * GraphCanvas gaps — covers handlers and event paths not exercised in
 * GraphCanvas.test.tsx:
 *   - onNodeClick (block/comment, edit/perform mode)
 *   - onNodeDoubleClick (comment no-op, container breadcrumb, plugin editor)
 *   - onEdgeClick → selectEdge
 *   - onEdgeContextMenu (edit / perform guard)
 *   - onNodeContextMenu (edit / perform / comment guards)
 *   - onPaneDoubleClick → popBreadcrumb
 *   - onPaneClick dismisses all menus
 *   - onNodeDragStop (comment, single block, multi-block)
 *   - onConnect guard (null source)
 *   - onEdgesDelete → nativeGraphDisconnect
 *   - EV_FIT_BOARD / EV_CREATE_COMMENT / EV_START_RENAME window events
 *   - Inline rename overlay (input change, Enter commit, Escape dismiss, blur)
 *   - Empty board watermark visibility
 *   - MiniMap hidden when minimapVisible=false
 *   - minimapNodeColor for comment / known / unknown category
 *   - onViewportMove debounce, onViewportMoveEnd immediate + timer
 *   - Timer cleanup on unmount
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

// ── Hoisted shared state ─────────────────────────────────────────────────────
const { capturedProps, capturedMinimapProps, mockStore, mockAppStore, mockHostExtras, mockReactFlow } =
  vi.hoisted(() => {
    const store = {
      nodes: [] as Array<{ id: string; name: string; [key: string]: unknown }>,
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
    const appStore = {
      mode: "edit" as "edit" | "perform",
      openBlockTab: vi.fn(),
      embeddedEditorNodeId: null as string | null,
    };
    const hostExtras = {
      canvas: { snapToGrid: false, gridSize: 8, graphBounds: { minX: 0, minY: 0, maxX: 800, maxY: 600 } },
    };
    const reactFlow = {
      fitView: vi.fn(),
      screenToFlowPosition: vi.fn(() => ({ x: 0, y: 0 })),
      // In-place rename anchors at the block's screen position via this
      // transform; return a recognisable offset so the positioning test can
      // assert the editor is placed AT the block, not a centered modal.
      flowToScreenPosition: vi.fn((p: { x: number; y: number }) => ({
        x: p.x + 1000,
        y: p.y + 500,
      })),
    };
    return {
      capturedProps: {} as Record<string, unknown>,
      capturedMinimapProps: {} as Record<string, unknown>,
      mockStore: store,
      mockAppStore: appStore,
      mockHostExtras: hostExtras,
      mockReactFlow: reactFlow,
    };
  });

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@xyflow/react", () => ({
  ReactFlow: (props: Record<string, unknown>) => {
    Object.assign(capturedProps, props);
    return (
      <div
        data-testid="react-flow"
        onContextMenu={props.onPaneContextMenu as React.MouseEventHandler}
        onDoubleClick={props.onDoubleClick as React.MouseEventHandler}
        onClick={props.onPaneClick as React.MouseEventHandler}
      >
        {props.children as React.ReactNode}
      </div>
    );
  },
  Background: () => <div data-testid="rf-background" />,
  MiniMap: (props: Record<string, unknown>) => {
    Object.assign(capturedMinimapProps, props);
    return <div data-testid="rf-minimap" />;
  },
  useNodesState: vi.fn(() => [[], vi.fn(), vi.fn()]),
  useEdgesState: vi.fn(() => [[], vi.fn(), vi.fn()]),
  useReactFlow: vi.fn(() => mockReactFlow),
  // Minimal store-api stub: GraphCanvas calls useStoreApi() for imperative
  // RF state reads (cable-splice insert path). The tests here don't exercise
  // it, so a getState() returning empty defaults is sufficient.
  useStoreApi: vi.fn(() => ({
    getState: () => ({ nodeLookup: new Map(), transform: [0, 0, 1] }),
  })),
  BackgroundVariant: { Dots: "dots" },
  SelectionMode: { Partial: "partial" },
}));

vi.mock("@xyflow/react/dist/style.css", () => ({}));

vi.mock("../../../stores/useGraphStore", () => {
  const fn = vi.fn((sel: (s: typeof mockStore) => unknown) => sel(mockStore));
  (fn as unknown as { getState: () => typeof mockStore }).getState = () => mockStore;
  return {
    useGraphStore: fn,
    zoomToTier: vi.fn((z: number) => (z < 0.5 ? "compact" : "normal")),
    selectBreadcrumbs: (s: { breadcrumbStack?: string[] }) => s.breadcrumbStack ?? [],
  };
});

vi.mock("../../../stores/useAppStore", () => {
  const fn = vi.fn((sel: (s: typeof mockAppStore) => unknown) => sel(mockAppStore));
  (fn as unknown as { getState: () => typeof mockAppStore }).getState = () =>
    mockAppStore;
  return { useAppStore: fn };
});

vi.mock("../../../stores/useHostExtrasStore", () => ({
  useHostExtrasStore: vi.fn((sel: (s: typeof mockHostExtras) => unknown) => sel(mockHostExtras)),
}));

const mockNativeGraph = vi.hoisted(() => ({
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

vi.mock("../../../bridge/nativeGraph", () => mockNativeGraph);

const mockNativePluginEditor = vi.hoisted(() => ({
  nativePluginEditorOpen: vi.fn(),
  nativePluginEditorClose: vi.fn(),
}));

vi.mock("../../../bridge/nativePluginEditor", () => mockNativePluginEditor);

vi.mock("../Block", () => ({ Block: () => <div data-testid="block" /> }));
vi.mock("../Cable", () => ({ Cable: () => null }));
vi.mock("../CommentFrame", () => ({ CommentFrame: () => null }));
vi.mock("../QuickAddPopup", () => ({ QuickAddPopup: () => <div data-testid="quick-add-popup" /> }));
vi.mock("../NodeContextMenu", () => ({ NodeContextMenu: () => <div data-testid="node-context-menu" /> }));
vi.mock("../EdgeContextMenu", () => ({ EdgeContextMenu: () => <div data-testid="edge-context-menu" /> }));

import { GraphCanvas } from "../GraphCanvas";
import { EV_FIT_BOARD, EV_CREATE_COMMENT, EV_START_RENAME } from "../../../events";

// ─────────────────────────────────────────────────────────────────────────────

const mockEvt = {
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  clientX: 100,
  clientY: 200,
};

describe("GraphCanvas (gaps)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppStore.mode = "edit";
    mockStore.nodes = [];
    mockStore.minimapVisible = true;
    Object.keys(capturedProps).forEach((k) => delete capturedProps[k]);
    Object.keys(capturedMinimapProps).forEach((k) => delete capturedMinimapProps[k]);
  });

  // ── onNodeClick ─────────────────────────────────────────────────────────────

  it("onNodeClick selects node and opens block tab in edit mode", () => {
    render(<GraphCanvas />);
    act(() =>
      (capturedProps.onNodeClick as Function)({}, { id: "b1", type: "block", data: {} }),
    );
    expect(mockStore.selectNode).toHaveBeenCalledWith("b1");
    expect(mockAppStore.openBlockTab).toHaveBeenCalledWith("b1");
  });

  it("onNodeClick does NOT open block tab in perform mode", () => {
    mockAppStore.mode = "perform";
    render(<GraphCanvas />);
    act(() =>
      (capturedProps.onNodeClick as Function)({}, { id: "b1", type: "block", data: {} }),
    );
    expect(mockStore.selectNode).toHaveBeenCalledWith("b1");
    expect(mockAppStore.openBlockTab).not.toHaveBeenCalled();
  });

  it("onNodeClick comment type never opens block tab", () => {
    render(<GraphCanvas />);
    act(() =>
      (capturedProps.onNodeClick as Function)({}, { id: "c1", type: "comment", data: {} }),
    );
    expect(mockStore.selectNode).toHaveBeenCalledWith("c1");
    expect(mockAppStore.openBlockTab).not.toHaveBeenCalled();
  });

  // ── onNodeDoubleClick ────────────────────────────────────────────────────────

  it("onNodeDoubleClick comment type → no-op (no dive, no editor)", () => {
    render(<GraphCanvas />);
    act(() =>
      (capturedProps.onNodeDoubleClick as Function)(mockEvt, { id: "c1", type: "comment", data: {} }),
    );
    expect(mockNativeGraph.nativeEnterContainer).not.toHaveBeenCalled();
    expect(mockNativePluginEditor.nativePluginEditorOpen).not.toHaveBeenCalled();
  });

  it("onNodeDoubleClick container block → nativeEnterContainer (engine dive)", () => {
    render(<GraphCanvas />);
    const node = { id: "cont1", type: "block", data: { name: "My Rack", containerNodeCount: 3 } };
    act(() => (capturedProps.onNodeDoubleClick as Function)(mockEvt, node));
    // Dives by node id (the breadcrumb follows the snapshot, not a client push).
    expect(mockNativeGraph.nativeEnterContainer).toHaveBeenCalledWith("cont1");
    expect(mockNativePluginEditor.nativePluginEditorOpen).not.toHaveBeenCalled();
  });

  it("onNodeDoubleClick portal block → does NOT dive (opens to edit, honest)", () => {
    render(<GraphCanvas />);
    // A Portal links an external .elboard — it must not fake a local dive.
    const node = {
      id: "p1",
      type: "block",
      data: { name: "Portal", containerNodeCount: 4, isPortal: true },
    };
    act(() => (capturedProps.onNodeDoubleClick as Function)(mockEvt, node));
    expect(mockNativeGraph.nativeEnterContainer).not.toHaveBeenCalled();
    expect(mockNativePluginEditor.nativePluginEditorOpen).toHaveBeenCalled();
  });

  it("onNodeDoubleClick plugin block → nativePluginEditorOpen with click coords", () => {
    render(<GraphCanvas />);
    const node = { id: "b1", type: "block", data: { name: "Surge XT" } };
    const evt = { clientX: 300, clientY: 150 };
    act(() => (capturedProps.onNodeDoubleClick as Function)(evt, node));
    expect(mockNativePluginEditor.nativePluginEditorOpen).toHaveBeenCalledWith(
      "b1", 300, 150, 720, 480,
    );
    expect(mockNativeGraph.nativeEnterContainer).not.toHaveBeenCalled();
  });

  // ── onEdgeClick ──────────────────────────────────────────────────────────────

  it("onEdgeClick → selectEdge", () => {
    render(<GraphCanvas />);
    act(() => (capturedProps.onEdgeClick as Function)({}, { id: "cable-1" }));
    expect(mockStore.selectEdge).toHaveBeenCalledWith("cable-1");
  });

  // ── onEdgeContextMenu ────────────────────────────────────────────────────────

  it("onEdgeContextMenu in edit mode shows EdgeContextMenu and selects edge", () => {
    render(<GraphCanvas />);
    act(() =>
      (capturedProps.onEdgeContextMenu as Function)(mockEvt, { id: "cable-2" }),
    );
    expect(screen.getByTestId("edge-context-menu")).toBeInTheDocument();
    expect(mockStore.selectEdge).toHaveBeenCalledWith("cable-2");
    expect(mockEvt.preventDefault).toHaveBeenCalled();
    expect(mockEvt.stopPropagation).toHaveBeenCalled();
  });

  it("onEdgeContextMenu in perform mode → no menu", () => {
    mockAppStore.mode = "perform";
    render(<GraphCanvas />);
    act(() =>
      (capturedProps.onEdgeContextMenu as Function)(mockEvt, { id: "cable-2" }),
    );
    expect(screen.queryByTestId("edge-context-menu")).not.toBeInTheDocument();
  });

  // ── onPaneDoubleClick → nativeExitContainer (navigate UP one level) ──────────

  it("onPaneDoubleClick → nativeExitContainer (engine exit)", () => {
    render(<GraphCanvas />);
    const pane = screen.getByTestId("react-flow");
    fireEvent.doubleClick(pane);
    expect(mockNativeGraph.nativeExitContainer).toHaveBeenCalled();
  });

  // ── onPaneClick dismiss ──────────────────────────────────────────────────────

  // Glen QA 2026-06-06 (reverses A2): QuickAdd direct = SHIFT+right-click now
  // (plain right-click opens the full board CanvasContextMenu instead).
  it("paneClick dismisses open context menu and calls clearSelection", () => {
    render(<GraphCanvas />);
    // Open the QuickAdd context menu first (Shift+RC = speed path)
    fireEvent.contextMenu(screen.getByTestId("react-flow"), { clientX: 10, clientY: 10, shiftKey: true });
    expect(screen.getByTestId("quick-add-popup")).toBeInTheDocument();
    // Click to dismiss
    act(() => (capturedProps.onPaneClick as Function)());
    expect(screen.queryByTestId("quick-add-popup")).not.toBeInTheDocument();
    expect(mockStore.clearSelection).toHaveBeenCalled();
  });

  // ── onNodeContextMenu ────────────────────────────────────────────────────────

  it("onNodeContextMenu in edit mode shows NodeContextMenu and selects node", () => {
    render(<GraphCanvas />);
    act(() =>
      (capturedProps.onNodeContextMenu as Function)(mockEvt, { id: "b1", type: "block" }),
    );
    expect(screen.getByTestId("node-context-menu")).toBeInTheDocument();
    expect(mockStore.selectNode).toHaveBeenCalledWith("b1");
  });

  it("onNodeContextMenu in perform mode → no menu", () => {
    mockAppStore.mode = "perform";
    render(<GraphCanvas />);
    act(() =>
      (capturedProps.onNodeContextMenu as Function)(mockEvt, { id: "b1", type: "block" }),
    );
    expect(screen.queryByTestId("node-context-menu")).not.toBeInTheDocument();
  });

  it("onNodeContextMenu comment type → no menu", () => {
    render(<GraphCanvas />);
    act(() =>
      (capturedProps.onNodeContextMenu as Function)(mockEvt, { id: "c1", type: "comment" }),
    );
    expect(screen.queryByTestId("node-context-menu")).not.toBeInTheDocument();
  });

  // ── onNodeDragStop ───────────────────────────────────────────────────────────

  it("onNodeDragStop with comment node → updateCommentBoxLayout + nativeGraphCommentUpsert", () => {
    render(<GraphCanvas />);
    const commentNode = {
      id: "cm1",
      type: "comment",
      position: { x: 50, y: 80 },
      data: { id: "cm1", label: "Group A", color: "#FF0000", size: { width: 200, height: 120 } },
    };
    act(() => (capturedProps.onNodeDragStop as Function)({}, commentNode, []));
    expect(mockStore.updateCommentBoxLayout).toHaveBeenCalledWith("cm1", {
      x: 50, y: 80, width: 200, height: 120,
    });
    expect(mockNativeGraph.nativeGraphCommentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cm1", x: 50, y: 80 }),
    );
  });

  it("onNodeDragStop with block node → updateNodePositions + nativeGraphMoveNodes", () => {
    render(<GraphCanvas />);
    const blockNode = { id: "b1", type: "block", position: { x: 10, y: 20 }, data: {} };
    act(() => (capturedProps.onNodeDragStop as Function)({}, blockNode, []));
    expect(mockStore.updateNodePositions).toHaveBeenCalledWith([{ id: "b1", x: 10, y: 20 }]);
    expect(mockNativeGraph.nativeGraphMoveNodes).toHaveBeenCalledWith([{ id: "b1", x: 10, y: 20 }]);
  });

  it("onNodeDragStop multi-select sends all dragged nodes", () => {
    render(<GraphCanvas />);
    const primary = { id: "b1", type: "block", position: { x: 0, y: 0 }, data: {} };
    const sibling = { id: "b2", type: "block", position: { x: 30, y: 40 }, data: {} };
    act(() => (capturedProps.onNodeDragStop as Function)({}, primary, [primary, sibling]));
    expect(mockStore.updateNodePositions).toHaveBeenCalledWith([
      { id: "b1", x: 0, y: 0 },
      { id: "b2", x: 30, y: 40 },
    ]);
  });

  // ── onConnect ────────────────────────────────────────────────────────────────

  it("onConnect with valid source/target → nativeGraphConnect", () => {
    render(<GraphCanvas />);
    act(() =>
      (capturedProps.onConnect as Function)({
        source: "src1", sourceHandle: "out-0", target: "tgt1", targetHandle: "in-0",
      }),
    );
    expect(mockNativeGraph.nativeGraphConnect).toHaveBeenCalledWith("src1", "out-0", "tgt1", "in-0");
  });

  it("onConnect with null source → guard fires, nativeGraphConnect not called", () => {
    render(<GraphCanvas />);
    act(() =>
      (capturedProps.onConnect as Function)({ source: null, target: "tgt1" }),
    );
    expect(mockNativeGraph.nativeGraphConnect).not.toHaveBeenCalled();
  });

  it("onConnect falls back to default handles when sourceHandle/targetHandle absent", () => {
    render(<GraphCanvas />);
    act(() =>
      (capturedProps.onConnect as Function)({ source: "s1", target: "t1" }),
    );
    expect(mockNativeGraph.nativeGraphConnect).toHaveBeenCalledWith("s1", "out-0", "t1", "in-0");
  });

  // ── onEdgesDelete ────────────────────────────────────────────────────────────

  it("onEdgesDelete → nativeGraphDisconnect for each deleted edge", () => {
    render(<GraphCanvas />);
    const edges = [
      { source: "s1", sourceHandle: "out-0", target: "t1", targetHandle: "in-0" },
      { source: "s2", sourceHandle: "out-1", target: "t2", targetHandle: "in-1" },
    ];
    act(() => (capturedProps.onEdgesDelete as Function)(edges));
    expect(mockNativeGraph.nativeGraphDisconnect).toHaveBeenCalledTimes(2);
    expect(mockNativeGraph.nativeGraphDisconnect).toHaveBeenNthCalledWith(1, "s1", "out-0", "t1", "in-0");
    expect(mockNativeGraph.nativeGraphDisconnect).toHaveBeenNthCalledWith(2, "s2", "out-1", "t2", "in-1");
  });

  it("onEdgesDelete falls back to default handles when missing", () => {
    render(<GraphCanvas />);
    act(() =>
      (capturedProps.onEdgesDelete as Function)([{ source: "s1", target: "t1" }]),
    );
    expect(mockNativeGraph.nativeGraphDisconnect).toHaveBeenCalledWith("s1", "out-0", "t1", "in-0");
  });

  // ── Window events ────────────────────────────────────────────────────────────

  it("EV_FIT_BOARD → reactFlow.fitView with padding 0.15", () => {
    render(<GraphCanvas />);
    act(() => window.dispatchEvent(new Event(EV_FIT_BOARD)));
    expect(mockReactFlow.fitView).toHaveBeenCalledWith(
      expect.objectContaining({ padding: 0.15 }),
    );
  });

  it("EV_CREATE_COMMENT → nativeGraphCommentAdd at canvas centre", () => {
    render(<GraphCanvas />);
    act(() => window.dispatchEvent(new Event(EV_CREATE_COMMENT)));
    expect(mockNativeGraph.nativeGraphCommentAdd).toHaveBeenCalled();
  });

  it("EV_START_RENAME with known nodeId → in-place rename editor appears", () => {
    mockStore.nodes = [{ id: "node-1", name: "Surge XT" }];
    render(<GraphCanvas />);
    act(() =>
      window.dispatchEvent(
        new CustomEvent(EV_START_RENAME, { detail: { nodeId: "node-1" } }),
      ),
    );
    // In-place editor: the editable label carries the accessible name (no
    // detached "Rename Block" modal heading anymore).
    expect(screen.getByLabelText(/rename block/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Surge XT");
  });

  it("EV_START_RENAME with unknown nodeId → no overlay", () => {
    mockStore.nodes = [];
    render(<GraphCanvas />);
    act(() =>
      window.dispatchEvent(
        new CustomEvent(EV_START_RENAME, { detail: { nodeId: "ghost" } }),
      ),
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  // ── Rename overlay interactions ──────────────────────────────────────────────

  function openRename() {
    mockStore.nodes = [{ id: "n1", name: "Old Name" }];
    render(<GraphCanvas />);
    act(() =>
      window.dispatchEvent(
        new CustomEvent(EV_START_RENAME, { detail: { nodeId: "n1" } }),
      ),
    );
  }

  it("rename overlay: typing updates input value", () => {
    openRename();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "New Name" } });
    expect(input).toHaveValue("New Name");
  });

  it("rename overlay: Enter commits rename and dismisses overlay", () => {
    openRename();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "New Name" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockNativeGraph.nativeGraphRenameNode).toHaveBeenCalledWith("n1", "New Name");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("rename overlay: Enter with whitespace-only value → no commit", () => {
    openRename();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockNativeGraph.nativeGraphRenameNode).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("rename overlay: Escape dismisses without committing", () => {
    openRename();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Changed" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(mockNativeGraph.nativeGraphRenameNode).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("rename overlay: blur dismisses without committing", () => {
    openRename();
    const input = screen.getByRole("textbox");
    fireEvent.blur(input);
    expect(mockNativeGraph.nativeGraphRenameNode).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  // ── In-place positioning (Item 5b: editor AT the block, not a centered modal) ──

  it("rename editor renders AT the block's screen position (in-place, not centered)", () => {
    mockStore.nodes = [
      { id: "n1", name: "Old Name", position: { x: 120, y: 80 } },
    ];
    render(<GraphCanvas />);
    act(() =>
      window.dispatchEvent(
        new CustomEvent(EV_START_RENAME, { detail: { nodeId: "n1" } }),
      ),
    );
    // flowToScreenPosition mock maps {x,y} → {x+1000, y+500}, so the editor
    // wrapper must be absolutely positioned at 1120/580 — NOT a centered modal
    // (which would have no inline left/top and use the pt-16 fallback).
    const wrapper = screen.getByTestId("rename-inplace");
    expect(wrapper.style.left).toBe("1120px");
    expect(wrapper.style.top).toBe("580px");
  });

  it("rename editor falls back to a fixed anchor when no screen position", () => {
    // Node without a position → flowToScreenPosition isn't applied → null
    // anchor → fixed fallback (no inline left/top).
    mockStore.nodes = [{ id: "n1", name: "Old Name" }];
    render(<GraphCanvas />);
    act(() =>
      window.dispatchEvent(
        new CustomEvent(EV_START_RENAME, { detail: { nodeId: "n1" } }),
      ),
    );
    const wrapper = screen.getByTestId("rename-inplace");
    expect(wrapper.style.left).toBe("");
    expect(wrapper.style.top).toBe("");
  });

  // ── Key-trap (Item 5b/G5: a keystroke never leaks to global shortcuts) ──

  it("rename editor traps keys (stopPropagation) so no global shortcut fires", () => {
    const stopSpy = vi.spyOn(Event.prototype, "stopPropagation");
    openRename();
    const input = screen.getByRole("textbox");
    // A bare letter (e.g. would be an align/duplicate chord at the canvas) must
    // be swallowed by the editor.
    fireEvent.keyDown(input, { key: "d" });
    expect(stopSpy).toHaveBeenCalled();
    // Still editing (a non-Enter/Esc key neither commits nor dismisses).
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(mockNativeGraph.nativeGraphRenameNode).not.toHaveBeenCalled();
    stopSpy.mockRestore();
  });

  // ── Empty board watermark ────────────────────────────────────────────────────

  it("shows empty board watermark when nodes is empty", () => {
    mockStore.nodes = [];
    render(<GraphCanvas />);
    expect(screen.getByText(/empty board/i)).toBeInTheDocument();
  });

  it("hides empty board watermark when there are nodes", () => {
    mockStore.nodes = [{ id: "b1", name: "Surge" }];
    render(<GraphCanvas />);
    expect(screen.queryByText(/empty board/i)).not.toBeInTheDocument();
  });

  // ── MiniMap visibility ───────────────────────────────────────────────────────

  it("renders MiniMap when minimapVisible=true", () => {
    mockStore.minimapVisible = true;
    render(<GraphCanvas />);
    expect(screen.getByTestId("rf-minimap")).toBeInTheDocument();
  });

  it("hides MiniMap when minimapVisible=false", () => {
    mockStore.minimapVisible = false;
    render(<GraphCanvas />);
    expect(screen.queryByTestId("rf-minimap")).not.toBeInTheDocument();
  });

  // ── minimapNodeColor ─────────────────────────────────────────────────────────

  it("minimapNodeColor: comment type → grey #5C5C62", () => {
    render(<GraphCanvas />);
    const nodeColor = capturedMinimapProps.nodeColor as (n: unknown) => string;
    expect(nodeColor({ type: "comment", data: {} })).toBe("#5C5C62");
  });

  it("minimapNodeColor: instrument category → blue #4A90D9", () => {
    render(<GraphCanvas />);
    const nodeColor = capturedMinimapProps.nodeColor as (n: unknown) => string;
    expect(nodeColor({ type: "block", data: { category: "instrument" } })).toBe("#4A90D9");
  });

  it("minimapNodeColor: audiofx category → orange #E8A838", () => {
    render(<GraphCanvas />);
    const nodeColor = capturedMinimapProps.nodeColor as (n: unknown) => string;
    expect(nodeColor({ type: "block", data: { category: "audiofx" } })).toBe("#E8A838");
  });

  it("minimapNodeColor: unknown category → fallback grey #8E8E93", () => {
    render(<GraphCanvas />);
    const nodeColor = capturedMinimapProps.nodeColor as (n: unknown) => string;
    expect(nodeColor({ type: "block", data: { category: "unknown" } })).toBe("#8E8E93");
  });

  // ── onViewportMove debounce ──────────────────────────────────────────────────

  it("onViewportMove debounces setZoomTier by ~80ms", () => {
    vi.useFakeTimers();
    try {
      render(<GraphCanvas />);
      act(() =>
        (capturedProps.onMove as Function)(null, { zoom: 0.3, x: 0, y: 0 }),
      );
      expect(mockStore.setZoomTier).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(mockStore.setZoomTier).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // ── onViewportMoveEnd ────────────────────────────────────────────────────────

  it("onViewportMoveEnd → setZoomTier immediately + schedules nativeGraphSetViewport", () => {
    vi.useFakeTimers();
    try {
      render(<GraphCanvas />);
      act(() =>
        (capturedProps.onMoveEnd as Function)(null, { zoom: 1.5, x: 10, y: 20 }),
      );
      // setZoomTier fires immediately
      expect(mockStore.setZoomTier).toHaveBeenCalled();
      // nativeGraphSetViewport deferred
      expect(mockNativeGraph.nativeGraphSetViewport).not.toHaveBeenCalled();
      vi.advanceTimersByTime(200);
      expect(mockNativeGraph.nativeGraphSetViewport).toHaveBeenCalledWith(10, 20, 1.5);
    } finally {
      vi.useRealTimers();
    }
  });

  // ── Timer cleanup on unmount ──────────────────────────────────────────────────

  it("cleans up viewport and zoom timers on unmount without error", () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(<GraphCanvas />);
      act(() =>
        (capturedProps.onMove as Function)(null, { zoom: 0.5, x: 0, y: 0 }),
      );
      expect(() => unmount()).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  // ── Window event cleanup ─────────────────────────────────────────────────────

  it("removes window event listeners on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<GraphCanvas />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith(EV_FIT_BOARD, expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith(EV_CREATE_COMMENT, expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith(EV_START_RENAME, expect.any(Function));
  });
});
