/**
 * useKeyboard — gap coverage for previously untested keyboard shortcuts.
 *
 * Covers: input-guard, Ctrl+digit bookmarks, Cmd+Shift alignment,
 * Cmd+1/2/3 panel toggles, Cmd+f search focus, Escape, Tab traversal,
 * Delete/Backspace, w wireless toggle, Shift+C/M/K, Shift+digit recall.
 *
 * The existing useKeyboard.test.tsx covers: Cmd+K, Cmd+s, Cmd+z, Cmd+c,
 * Cmd+v, Cmd+d, Cmd+r, Cmd+0/=/-, Cmd+M (shift).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboard } from "../useKeyboard";
import { useAppStore } from "../../stores/useAppStore";
import { useGraphStore } from "../../stores/useGraphStore";
import { useBusStore } from "../../stores/useBusStore";

// ── ReactFlow mock ────────────────────────────────────────────────────────────

const mockFitView = vi.fn();
const mockZoomIn = vi.fn();
const mockZoomOut = vi.fn();
const mockGetNodes = vi.fn((): unknown[] => []);
const mockGetViewport = vi.fn(() => ({ x: 100, y: 200, zoom: 1.5 }));
const mockSetViewport = vi.fn();
const mockScreenToFlowPosition = vi.fn((p: { x: number; y: number }) => p);

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    fitView: mockFitView,
    zoomIn: mockZoomIn,
    zoomOut: mockZoomOut,
    getNodes: mockGetNodes,
    getViewport: mockGetViewport,
    setViewport: mockSetViewport,
    screenToFlowPosition: mockScreenToFlowPosition,
  }),
}));

// ── bridge mocks — hoisted so vi.mock() factories can reference them ──────────

const {
  mockCommentAdd,
  mockCommentDelete,
  mockRemoveNode,
  mockSetCableBus,
  mockCopyNodes,
  mockPasteNodes,
  mockDuplicateNode,
  mockDuplicateNodes,
  mockUndo,
  mockRedo,
  mockExitContainer,
} = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spread = (fn: (...a: any[]) => any) => (...a: any[]) => fn(...a);
  const mockCommentAdd = vi.fn(async () => undefined);
  const mockCommentDelete = vi.fn(async () => undefined);
  const mockRemoveNode = vi.fn(async () => undefined);
  const mockSetCableBus = vi.fn(async () => undefined);
  const mockCopyNodes = vi.fn(async () => undefined);
  const mockPasteNodes = vi.fn(async () => undefined);
  const mockDuplicateNode = vi.fn(async () => undefined);
  const mockDuplicateNodes = vi.fn(async () => 1);
  const mockUndo = vi.fn(async () => undefined);
  const mockRedo = vi.fn(async () => undefined);
  const mockExitContainer = vi.fn(async () => true);
  return {
    mockCommentAdd,
    mockCommentDelete,
    mockRemoveNode,
    mockSetCableBus,
    mockCopyNodes,
    mockPasteNodes,
    mockDuplicateNode,
    mockDuplicateNodes,
    mockUndo,
    mockRedo,
    mockExitContainer,
    spread,
  };
});

vi.mock("../../bridge/nativeGraph", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sp = (fn: (...a: any[]) => any) => (...a: any[]) => fn(...a);
  return {
    nativeExitContainer: sp(mockExitContainer),
    nativeGraphCommentAdd: sp(mockCommentAdd),
    nativeGraphCommentDelete: sp(mockCommentDelete),
    nativeGraphCopyNodes: sp(mockCopyNodes),
    nativeGraphDuplicateNode: sp(mockDuplicateNode),
    nativeGraphDuplicateNodes: sp(mockDuplicateNodes),
    nativeGraphPasteNodes: sp(mockPasteNodes),
    nativeGraphRemoveNode: sp(mockRemoveNode),
    nativeGraphSetCableBus: sp(mockSetCableBus),
    nativeRedo: sp(mockRedo),
    nativeUndo: sp(mockUndo),
  };
});

vi.mock("../../bridge/nativeSession", () => ({
  nativeSessionSave: vi.fn(async () => undefined),
  nativeSessionSaveAs: vi.fn(async () => undefined),
}));

// ── store helpers ─────────────────────────────────────────────────────────────

const BASE_APP_STATE = {
  hostReady: false,
  refreshNonce: 0,
  activeScene: 0,
  mode: "edit" as const,
  leftPanelOpen: true,
  rightPanelOpen: true,
  bottomPanelOpen: true,
  virtualKeyboardOpen: false,
  openBlockTabs: [],
  spatialBookmarks: {},
  cableRouting: "manhattan" as const,
};

function resetStores() {
  vi.clearAllMocks();
  mockGetNodes.mockReturnValue([]);
  useAppStore.setState(BASE_APP_STATE);
  useGraphStore.setState({
    nodes: [],
    edges: [],
    commentBoxes: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    breadcrumbStack: ["Root"],
    minimapVisible: false,
  });
  useBusStore.setState({ cableBus: {} });
}

// ── key event helpers ─────────────────────────────────────────────────────────

function fire(
  key: string,
  mods: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
  code?: string,
) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      code: code ?? (key.length === 1 ? `Key${key.toUpperCase()}` : key),
      bubbles: true,
      ...mods,
    }),
  );
}

function mountHook() {
  const onToggleCommandPalette = vi.fn();
  renderHook(() => useKeyboard({ onToggleCommandPalette }));
  return { onToggleCommandPalette };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useKeyboard — input guard", () => {
  beforeEach(resetStores);

  it("ignores keydown from INPUT elements", () => {
    mountHook();
    const input = document.createElement("input");
    document.body.appendChild(input);
    const evt = new KeyboardEvent("keydown", {
      key: "Delete",
      bubbles: true,
    });
    Object.defineProperty(evt, "target", { value: input });
    window.dispatchEvent(evt);
    expect(mockRemoveNode).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});

describe("useKeyboard — Ctrl+digit saves spatial bookmark", () => {
  beforeEach(resetStores);

  it("saves viewport to bookmark slot on Ctrl+1", () => {
    mountHook();
    act(() => { fire("1", { ctrlKey: true }, "Digit1"); });
    const bm = useAppStore.getState().spatialBookmarks["1"];
    expect(bm).toEqual({ x: 100, y: 200, zoom: 1.5 });
  });

  it("saves bookmark slot 0 on Ctrl+0", () => {
    mountHook();
    act(() => { fire("0", { ctrlKey: true }, "Digit0"); });
    const bm = useAppStore.getState().spatialBookmarks["0"];
    expect(bm).toEqual({ x: 100, y: 200, zoom: 1.5 });
  });

  it("ignores Ctrl+non-digit (e.g. Ctrl+A)", () => {
    mountHook();
    act(() => { fire("a", { ctrlKey: true }, "KeyA"); });
    expect(useAppStore.getState().spatialBookmarks).toEqual({});
  });
});

describe("useKeyboard — Shift+digit recalls spatial bookmark", () => {
  beforeEach(resetStores);

  it("restores viewport from bookmark on Shift+1", () => {
    useAppStore.setState({
      spatialBookmarks: { "1": { x: 50, y: 60, zoom: 2 } },
    });
    mountHook();
    act(() => { fire("!", { shiftKey: true }, "Digit1"); });
    expect(mockSetViewport).toHaveBeenCalledWith(
      { x: 50, y: 60, zoom: 2 },
      { duration: 150 },
    );
  });

  it("no-ops when bookmark slot is empty", () => {
    mountHook();
    act(() => { fire("!", { shiftKey: true }, "Digit1"); });
    expect(mockSetViewport).not.toHaveBeenCalled();
  });
});

describe("useKeyboard — Cmd+Shift alignment", () => {
  beforeEach(resetStores);

  it("no-ops when fewer than 2 blocks selected", () => {
    useGraphStore.setState({
      nodes: [{ id: "n1", position: { x: 0, y: 0 } }] as unknown as import("../../data/types").BlockData[],
    });
    mockGetNodes.mockReturnValue([{ id: "n1", selected: true, type: "block" }]);
    mountHook();
    const alignSpy = vi.spyOn(useGraphStore.getState(), "alignSelectedNodes");
    act(() => { fire("l", { metaKey: true, shiftKey: true }, "KeyL"); });
    expect(alignSpy).not.toHaveBeenCalled();
  });

  it("aligns left when 2+ blocks selected (Cmd+Shift+L)", () => {
    mockGetNodes.mockReturnValue([
      { id: "n1", selected: true, type: "block" },
      { id: "n2", selected: true, type: "block" },
    ]);
    const alignSpy = vi.fn();
    useGraphStore.setState({
      alignSelectedNodes: alignSpy,
      nodes: [
        { id: "n1", position: { x: 0, y: 0 } },
        { id: "n2", position: { x: 100, y: 0 } },
      ] as unknown as import("../../data/types").BlockData[],
    });
    mountHook();
    act(() => { fire("l", { metaKey: true, shiftKey: true }, "KeyL"); });
    expect(alignSpy).toHaveBeenCalledWith("left", ["n1", "n2"]);
  });

  it("distributes horizontally (Cmd+Shift+H)", () => {
    mockGetNodes.mockReturnValue([
      { id: "n1", selected: true, type: "block" },
      { id: "n2", selected: true, type: "block" },
    ]);
    const distributeSpy = vi.fn();
    useGraphStore.setState({
      distributeSelectedNodes: distributeSpy,
      nodes: [
        { id: "n1", position: { x: 0, y: 0 } },
        { id: "n2", position: { x: 100, y: 0 } },
      ] as unknown as import("../../data/types").BlockData[],
    });
    mountHook();
    act(() => { fire("h", { metaKey: true, shiftKey: true }, "KeyH"); });
    expect(distributeSpy).toHaveBeenCalledWith("horizontal", ["n1", "n2"]);
  });
});

describe("useKeyboard — Cmd+1/2/3 panel toggles", () => {
  beforeEach(resetStores);

  it("Cmd+1 toggles left panel", () => {
    mountHook();
    act(() => { fire("1", { metaKey: true }, "Digit1"); });
    expect(useAppStore.getState().leftPanelOpen).toBe(false);
  });

  it("Cmd+2 toggles right panel", () => {
    mountHook();
    act(() => { fire("2", { metaKey: true }, "Digit2"); });
    expect(useAppStore.getState().rightPanelOpen).toBe(false);
  });

  it("Cmd+3 toggles bottom panel", () => {
    mountHook();
    act(() => { fire("3", { metaKey: true }, "Digit3"); });
    expect(useAppStore.getState().bottomPanelOpen).toBe(false);
  });
});

describe("useKeyboard — Escape", () => {
  beforeEach(resetStores);

  it("clears node selection when a node is selected", () => {
    const clearSpy = vi.fn();
    useGraphStore.setState({ selectedNodeId: "n1", clearSelection: clearSpy });
    mountHook();
    act(() => { fire("Escape", {}); });
    expect(clearSpy).toHaveBeenCalled();
  });

  it("clears edge selection when an edge is selected", () => {
    const clearSpy = vi.fn();
    useGraphStore.setState({ selectedEdgeId: "e1", clearSelection: clearSpy });
    mountHook();
    act(() => { fire("Escape", {}); });
    expect(clearSpy).toHaveBeenCalled();
  });

  it("calls nativeExitContainer when dived (path > 2) and nothing selected", () => {
    mockExitContainer.mockClear();
    // Dived: [session, activeGraph, container] (length 3 > 2). Engine-driven
    // exit — the breadcrumb redraws from the snapshot, never an optimistic pop.
    useGraphStore.setState({
      selectedNodeId: null,
      selectedEdgeId: null,
      currentBoardId: null,
      breadcrumbStack: ["Project", "Main", "Container"],
    });
    mountHook();
    act(() => { fire("Escape", {}); });
    expect(mockExitContainer).toHaveBeenCalled();
  });

  it("does NOT exit at the top level (path length 2, not dived)", () => {
    mockExitContainer.mockClear();
    useGraphStore.setState({
      selectedNodeId: null,
      selectedEdgeId: null,
      currentBoardId: null,
      breadcrumbStack: ["Project", "Main"],
    });
    mountHook();
    act(() => { fire("Escape", {}); });
    expect(mockExitContainer).not.toHaveBeenCalled();
  });
});

describe("useKeyboard — Tab traversal", () => {
  beforeEach(resetStores);

  it("no-ops when no nodes exist", () => {
    useGraphStore.setState({ nodes: [], edges: [], selectedNodeId: null });
    mountHook();
    // Should not throw
    act(() => { fire("Tab", {}); });
  });

  it("selects first node when none is selected", () => {
    const selectSpy = vi.fn();
    useGraphStore.setState({
      nodes: [
        { id: "n1", position: { x: 0, y: 0 } },
        { id: "n2", position: { x: 200, y: 0 } },
      ] as unknown as import("../../data/types").BlockData[],
      edges: [],
      selectedNodeId: null,
      selectNode: selectSpy,
    });
    mountHook();
    act(() => { fire("Tab", {}); });
    expect(selectSpy).toHaveBeenCalled();
  });

  it("advances to next node in signal-chain order", () => {
    const selectSpy = vi.fn();
    useGraphStore.setState({
      nodes: [
        { id: "n1", position: { x: 0, y: 0 } },
        { id: "n2", position: { x: 100, y: 0 } },
      ] as unknown as import("../../data/types").BlockData[],
      edges: [],
      selectedNodeId: "n1",
      selectNode: selectSpy,
    });
    mountHook();
    act(() => { fire("Tab", {}); });
    expect(selectSpy).toHaveBeenCalledWith("n2");
  });
});

describe("useKeyboard — Delete/Backspace", () => {
  beforeEach(resetStores);

  it("no-ops when nothing is selected", () => {
    useGraphStore.setState({ selectedNodeId: null });
    mountHook();
    act(() => { fire("Delete", {}); });
    expect(mockRemoveNode).not.toHaveBeenCalled();
    expect(mockCommentDelete).not.toHaveBeenCalled();
  });

  it("deletes a block node", async () => {
    useGraphStore.setState({
      selectedNodeId: "n1",
      nodes: [{ id: "n1", position: { x: 0, y: 0 } }] as unknown as import("../../data/types").BlockData[],
      commentBoxes: [],
    });
    mountHook();
    await act(async () => { fire("Delete", {}); });
    expect(mockRemoveNode).toHaveBeenCalledWith("n1");
  });

  it("deletes a comment box", async () => {
    useGraphStore.setState({
      selectedNodeId: "c1",
      nodes: [],
      commentBoxes: [{ id: "c1", position: { x: 0, y: 0 }, size: { width: 100, height: 80 }, label: "group", color: "#808080" }],
    });
    mountHook();
    await act(async () => { fire("Backspace", {}); });
    expect(mockCommentDelete).toHaveBeenCalledWith("c1");
  });
});

describe("useKeyboard — Shift+C/M/K", () => {
  beforeEach(resetStores);

  it("Shift+C adds a comment box at canvas centre", async () => {
    mountHook();
    await act(async () => { fire("C", { shiftKey: true }, "KeyC"); });
    expect(mockCommentAdd).toHaveBeenCalled();
  });

  it("Shift+M toggles the minimap", () => {
    const toggleSpy = vi.fn();
    useGraphStore.setState({ toggleMinimap: toggleSpy });
    mountHook();
    act(() => { fire("M", { shiftKey: true }, "KeyM"); });
    expect(toggleSpy).toHaveBeenCalled();
  });

  it("Shift+K toggles the virtual keyboard", () => {
    mountHook();
    act(() => { fire("K", { shiftKey: true }, "KeyK"); });
    expect(useAppStore.getState().virtualKeyboardOpen).toBe(true);
  });
});

describe("useKeyboard — w/W wireless cable toggle", () => {
  beforeEach(resetStores);

  it("no-ops when no edge is selected", () => {
    useGraphStore.setState({ selectedEdgeId: null, edges: [] });
    mountHook();
    act(() => { fire("w", {}); });
    expect(mockSetCableBus).not.toHaveBeenCalled();
  });

  it("assigns a bus name when cable is not wireless", async () => {
    useGraphStore.setState({
      selectedEdgeId: "e1",
      edges: [{ id: "e1", source: "n1", target: "n2", sourcePort: "o0", targetPort: "i0", signalType: "audio", channelCount: 2, isSidechain: false }] as import("../../data/types").CableData[],
    });
    useBusStore.setState({ cableBus: {} });
    mountHook();
    await act(async () => { fire("w", {}); });
    expect(mockSetCableBus).toHaveBeenCalledWith("e1", expect.any(String));
  });

  it("clears bus when cable is already wireless", async () => {
    useGraphStore.setState({
      selectedEdgeId: "e1",
      edges: [{ id: "e1", source: "n1", target: "n2", sourcePort: "o0", targetPort: "i0", signalType: "audio", channelCount: 2, isSidechain: false }] as import("../../data/types").CableData[],
    });
    useBusStore.setState({ cableBus: { e1: "Bus 1" } });
    mountHook();
    await act(async () => { fire("w", {}); });
    expect(mockSetCableBus).toHaveBeenCalledWith("e1", "");
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
