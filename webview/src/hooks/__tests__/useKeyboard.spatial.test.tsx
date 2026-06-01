/**
 * useKeyboard — gaps: spatial bookmarks (Ctrl+0-9, Shift+0-9), multi-select
 * alignment (Cmd+Shift+L/R/T/B/H/V), W-key bus toggle, and edge-case branches
 * (not enough selected for alignment, no selected edge for W, etc.).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { useGraphStore } from "../../stores/useGraphStore";
import { useAppStore } from "../../stores/useAppStore";
import { useBusStore } from "../../stores/useBusStore";
import { useKeyboard } from "../useKeyboard";
import type { BlockData, CableData } from "../../data/types";

// ── Bridge mocks ──────────────────────────────────────────────────────────────

const mockSetCableBus = vi.fn();
const mockCopyNodes = vi.fn();
const mockPasteNodes = vi.fn();
const mockDuplicateNodes = vi.fn();
const mockDuplicateNode = vi.fn();
const mockRemoveNode = vi.fn();
const mockCommentAdd = vi.fn();
const mockCommentDelete = vi.fn();
const mockUndo = vi.fn();
const mockRedo = vi.fn();
const mockSave = vi.fn();
const mockSaveAs = vi.fn();

vi.mock("../../bridge/nativeGraph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../bridge/nativeGraph")>();
  return {
    ...actual,
    nativeGraphSetCableBus: (...a: unknown[]) => mockSetCableBus(...a),
    nativeGraphCopyNodes: (...a: unknown[]) => mockCopyNodes(...a),
    nativeGraphPasteNodes: (...a: unknown[]) => mockPasteNodes(...a),
    nativeGraphDuplicateNodes: (...a: unknown[]) => mockDuplicateNodes(...a),
    nativeGraphDuplicateNode: (...a: unknown[]) => mockDuplicateNode(...a),
    nativeGraphRemoveNode: (...a: unknown[]) => mockRemoveNode(...a),
    nativeGraphCommentAdd: (...a: unknown[]) => mockCommentAdd(...a),
    nativeGraphCommentDelete: (...a: unknown[]) => mockCommentDelete(...a),
    nativeUndo: (...a: unknown[]) => mockUndo(...a),
    nativeRedo: (...a: unknown[]) => mockRedo(...a),
  };
});

vi.mock("../../bridge/nativeSession", () => ({
  nativeSessionSave: () => mockSave(),
  nativeSessionSaveAs: () => mockSaveAs(),
}));

// ── Mock ReactFlow ────────────────────────────────────────────────────────────

const mockGetViewport = vi.fn(() => ({ x: 100, y: 200, zoom: 1.5 }));
const mockSetViewport = vi.fn();
const mockGetNodes = vi.fn(() => []);
const mockFitView = vi.fn();
const mockZoomIn = vi.fn();
const mockZoomOut = vi.fn();
const mockScreenToFlowPosition = vi.fn(() => ({ x: 0, y: 0 }));

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    useReactFlow: () => ({
      getViewport: mockGetViewport,
      setViewport: mockSetViewport,
      getNodes: mockGetNodes,
      fitView: mockFitView,
      zoomIn: mockZoomIn,
      zoomOut: mockZoomOut,
      screenToFlowPosition: mockScreenToFlowPosition,
    }),
  };
});

// ── Test harness ──────────────────────────────────────────────────────────────

const togglePalette = vi.fn();

function TestBed() {
  useKeyboard({ onToggleCommandPalette: togglePalette });
  return <div data-testid="bed" />;
}

function setup() {
  return render(
    <ReactFlowProvider>
      <TestBed />
    </ReactFlowProvider>,
  );
}

function key(opts: KeyboardEventInit) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...opts }));
  });
}

function resetStores() {
  useAppStore.setState((s) => ({
    ...s,
    spatialBookmarks: {},
    mode: "edit",
  }));
  useGraphStore.setState((s) => ({
    ...s,
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    commentBoxes: [],
    breadcrumbStack: ["Root"],
  }));
  useBusStore.setState({ cableBus: {} });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useKeyboard — spatial bookmarks (Ctrl+digit)", () => {
  beforeEach(() => {
    resetStores();
    setup();
  });
  afterEach(() => vi.clearAllMocks());

  it("Ctrl+1 saves viewport as spatial bookmark '1'", () => {
    mockGetViewport.mockReturnValueOnce({ x: 50, y: 75, zoom: 2 });
    key({ key: "1", code: "Digit1", ctrlKey: true });
    expect(useAppStore.getState().spatialBookmarks["1"]).toEqual({ x: 50, y: 75, zoom: 2 });
  });

  it("Ctrl+0 saves bookmark '0'", () => {
    key({ key: "0", code: "Digit0", ctrlKey: true });
    expect(useAppStore.getState().spatialBookmarks["0"]).toBeDefined();
  });

  it("Ctrl+digit does NOT fire when metaKey is also held", () => {
    key({ key: "1", code: "Digit1", ctrlKey: true, metaKey: true });
    expect(useAppStore.getState().spatialBookmarks["1"]).toBeUndefined();
  });
});

describe("useKeyboard — spatial bookmark recall (Shift+digit)", () => {
  beforeEach(() => {
    resetStores();
    useAppStore.setState((s) => ({
      ...s,
      spatialBookmarks: { "2": { x: 300, y: 400, zoom: 0.8 } },
    }));
    setup();
  });
  afterEach(() => vi.clearAllMocks());

  it("Shift+Digit2 recalls bookmark and calls setViewport", () => {
    key({ key: "@", code: "Digit2", shiftKey: true });
    expect(mockSetViewport).toHaveBeenCalledWith(
      { x: 300, y: 400, zoom: 0.8 },
      { duration: 150 },
    );
  });

  it("Shift+digit with no saved bookmark does not call setViewport", () => {
    key({ key: "!", code: "Digit1", shiftKey: true });
    expect(mockSetViewport).not.toHaveBeenCalled();
  });
});

describe("useKeyboard — alignment (Cmd+Shift+L/R/T/B/H/V)", () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => vi.clearAllMocks());

  it("Cmd+Shift+L aligns selected nodes left", () => {
    useGraphStore.setState((s) => ({
      ...s,
      nodes: [
        { id: "a", position: { x: 0, y: 0 } },
        { id: "b", position: { x: 100, y: 50 } },
      ] as BlockData[],
    }));
    mockGetNodes.mockReturnValue([
      { id: "a", selected: true, type: "block" },
      { id: "b", selected: true, type: "block" },
    ] as never[]);
    const alignSpy = vi.spyOn(useGraphStore.getState(), "alignSelectedNodes");
    setup();
    key({ key: "L", code: "KeyL", metaKey: true, shiftKey: true });
    expect(alignSpy).toHaveBeenCalledWith("left", expect.arrayContaining(["a", "b"]));
  });

  it("Cmd+Shift with < 2 selected nodes is a no-op (no align call)", () => {
    mockGetNodes.mockReturnValue([
      { id: "a", selected: true, type: "block" },
    ] as never[]);
    const alignSpy = vi.spyOn(useGraphStore.getState(), "alignSelectedNodes");
    setup();
    key({ key: "L", code: "KeyL", metaKey: true, shiftKey: true });
    expect(alignSpy).not.toHaveBeenCalled();
  });

  it("Cmd+Shift+H distributes nodes horizontally", () => {
    mockGetNodes.mockReturnValue([
      { id: "a", selected: true, type: "block" },
      { id: "b", selected: true, type: "block" },
      { id: "c", selected: true, type: "block" },
    ] as never[]);
    const distributeSpy = vi.spyOn(useGraphStore.getState(), "distributeSelectedNodes");
    setup();
    key({ key: "H", code: "KeyH", metaKey: true, shiftKey: true });
    expect(distributeSpy).toHaveBeenCalledWith("horizontal", expect.arrayContaining(["a", "b", "c"]));
  });

  it("Cmd+Shift+V distributes nodes vertically", () => {
    mockGetNodes.mockReturnValue([
      { id: "a", selected: true, type: "block" },
      { id: "b", selected: true, type: "block" },
    ] as never[]);
    const distributeSpy = vi.spyOn(useGraphStore.getState(), "distributeSelectedNodes");
    setup();
    key({ key: "V", code: "KeyV", metaKey: true, shiftKey: true });
    expect(distributeSpy).toHaveBeenCalledWith("vertical", expect.arrayContaining(["a", "b"]));
  });
});

describe("useKeyboard — W key bus toggle", () => {
  beforeEach(() => {
    resetStores();
    mockSetCableBus.mockResolvedValue(undefined);
  });
  afterEach(() => vi.clearAllMocks());

  it("W with no selected edge is a no-op", () => {
    setup();
    key({ key: "w" });
    expect(mockSetCableBus).not.toHaveBeenCalled();
  });

  it("W with selected wired edge assigns a bus name", () => {
    useGraphStore.setState((s) => ({
      ...s,
      selectedEdgeId: "cable-1",
      edges: [{ id: "cable-1", source: "a", target: "b", sourcePort: "out", targetPort: "in", signalType: "audio", channelCount: 2, isSidechain: false }] as CableData[],
    }));
    setup();
    key({ key: "w" });
    expect(mockSetCableBus).toHaveBeenCalledWith("cable-1", expect.stringContaining("Bus"));
  });

  it("W on already-wireless cable clears the bus", () => {
    useGraphStore.setState((s) => ({
      ...s,
      selectedEdgeId: "cable-2",
      edges: [{ id: "cable-2", source: "a", target: "b", sourcePort: "out", targetPort: "in", signalType: "audio", channelCount: 2, isSidechain: false }] as CableData[],
    }));
    useBusStore.setState({ cableBus: { "cable-2": "Reverb A" } });
    setup();
    key({ key: "w" });
    expect(mockSetCableBus).toHaveBeenCalledWith("cable-2", "");
  });
});

describe("useKeyboard — Shift+C comment add", () => {
  beforeEach(() => {
    resetStores();
    mockCommentAdd.mockResolvedValue(undefined);
    mockScreenToFlowPosition.mockReturnValue({ x: 0, y: 0 });
    setup();
  });
  afterEach(() => vi.clearAllMocks());

  it("Shift+C calls nativeGraphCommentAdd", () => {
    key({ key: "C", shiftKey: true });
    expect(mockCommentAdd).toHaveBeenCalled();
  });
});

describe("useKeyboard — input field guard", () => {
  beforeEach(() => {
    resetStores();
    setup();
  });
  afterEach(() => vi.clearAllMocks());

  it("keydown on INPUT element does not trigger shortcuts", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    });
    expect(togglePalette).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("keydown on TEXTAREA element does not trigger shortcuts", () => {
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    act(() => {
      ta.dispatchEvent(new KeyboardEvent("keydown", { key: "s", metaKey: true, bubbles: true }));
    });
    expect(mockSave).not.toHaveBeenCalled();
    document.body.removeChild(ta);
  });
});
