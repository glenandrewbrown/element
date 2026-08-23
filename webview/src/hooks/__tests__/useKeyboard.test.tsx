/**
 * useKeyboard tests — global shortcut dispatch and edge-case guards.
 *
 * The hook uses useReactFlow; we mock @xyflow/react so tests run outside
 * a full ReactFlow context. Bridge calls (nativeGraph*, nativeSession*) are
 * also mocked — we assert they were called with the right args, not their
 * implementation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboard } from "../useKeyboard";
import { useAppStore } from "../../stores/useAppStore";
import { useGraphStore } from "../../stores/useGraphStore";

// ── ReactFlow mock ────────────────────────────────────────────────────────────

const mockFitView = vi.fn();
const mockZoomIn = vi.fn();
const mockZoomOut = vi.fn();
const mockGetNodes = vi.fn((): unknown[] => []);
const mockGetViewport = vi.fn(() => ({ x: 0, y: 0, zoom: 1 }));
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

// ── bridge mocks ──────────────────────────────────────────────────────────────

vi.mock("../../bridge/nativeGraph", () => ({
  nativeGraphCommentAdd: vi.fn(async () => undefined),
  nativeGraphCommentDelete: vi.fn(async () => undefined),
  nativeGraphCopyNodes: vi.fn(async () => undefined),
  nativeGraphDuplicateNode: vi.fn(async () => undefined),
  nativeGraphDuplicateNodes: vi.fn(async () => 1),
  nativeGraphPasteNodes: vi.fn(async () => undefined),
  nativeGraphRemoveNode: vi.fn(async () => undefined),
  nativeGraphSetCableBus: vi.fn(async () => undefined),
  nativeRedo: vi.fn(async () => undefined),
  nativeUndo: vi.fn(async () => undefined),
}));

vi.mock("../../bridge/nativeSession", () => ({
  nativeSessionSave: vi.fn(async () => undefined),
  nativeSessionSaveAs: vi.fn(async () => undefined),
}));

import { nativeGraphRemoveNode, nativeGraphCopyNodes, nativeUndo, nativeRedo } from "../../bridge/nativeGraph";
import { nativeSessionSave, nativeSessionSaveAs } from "../../bridge/nativeSession";

// ── store helpers ─────────────────────────────────────────────────────────────

function resetStores() {
  mockFitView.mockClear();
  mockZoomIn.mockClear();
  mockZoomOut.mockClear();
  mockGetNodes.mockReturnValue([]);
  useAppStore.setState({
    hostReady: false,
    refreshNonce: 0,
    activeScene: 0,
    mode: "edit",
    leftPanelOpen: true,
    rightPanelOpen: true,
    bottomPanelOpen: true,
    virtualKeyboardOpen: false,
    openBlockTabs: [],
    spatialBookmarks: {},
    cableRouting: "manhattan",
  });
  useGraphStore.setState({
    nodes: [],
    edges: [],
    commentBoxes: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    breadcrumbs: undefined,
  } as any);
}

function fire(
  key: string,
  modifiers: Partial<KeyboardEvent> = {},
  target?: EventTarget,
) {
  const evt = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    metaKey: modifiers.metaKey ?? false,
    ctrlKey: modifiers.ctrlKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
    ...modifiers,
  });
  if (target) Object.defineProperty(evt, "target", { value: target });
  act(() => {
    window.dispatchEvent(evt);
  });
  return evt;
}

beforeEach(resetStores);
afterEach(() => vi.clearAllMocks());

// ── mount/unmount ─────────────────────────────────────────────────────────────

describe("lifecycle", () => {
  it("registers keydown listener on mount", () => {
    const spy = vi.spyOn(window, "addEventListener");
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    expect(spy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("removes keydown listener on unmount", () => {
    const spy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() =>
      useKeyboard({ onToggleCommandPalette: vi.fn() }),
    );
    unmount();
    expect(spy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });
});

// ── input guard ───────────────────────────────────────────────────────────────

describe("input element guard", () => {
  it.each(["INPUT", "TEXTAREA", "SELECT"])(
    "ignores keydown when target is %s",
    (tagName) => {
      const toggle = vi.fn();
      renderHook(() => useKeyboard({ onToggleCommandPalette: toggle }));
      const el = document.createElement(tagName.toLowerCase());
      document.body.appendChild(el);
      fire("k", { metaKey: true }, el);
      expect(toggle).not.toHaveBeenCalled();
      document.body.removeChild(el);
    },
  );
});

// ── Meta+K — command palette ──────────────────────────────────────────────────

describe("Meta+K", () => {
  it("calls onToggleCommandPalette", () => {
    const toggle = vi.fn();
    renderHook(() => useKeyboard({ onToggleCommandPalette: toggle }));
    fire("k", { metaKey: true });
    expect(toggle).toHaveBeenCalledOnce();
  });
});

// ── Meta+1/2/3 — panel toggles ────────────────────────────────────────────────

describe("Meta+1/2/3 panel toggles", () => {
  it.each([
    ["1", "left"],
    ["2", "right"],
    ["3", "bottom"],
  ] as const)("Meta+%s toggles %s panel", (key, panel) => {
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    const before = useAppStore.getState()[`${panel}PanelOpen`];
    fire(key, { metaKey: true });
    expect(useAppStore.getState()[`${panel}PanelOpen`]).toBe(!before);
  });
});

// ── Meta+S / Meta+Shift+S — save / save-as ───────────────────────────────────

describe("Meta+S", () => {
  it("calls nativeSessionSave", () => {
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("s", { metaKey: true });
    expect(nativeSessionSave).toHaveBeenCalledOnce();
  });

  it("calls nativeSessionSaveAs on Meta+Shift+S", () => {
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("s", { metaKey: true, shiftKey: true });
    expect(nativeSessionSaveAs).toHaveBeenCalledOnce();
  });
});

// ── Meta+Z / Meta+Shift+Z — undo / redo ──────────────────────────────────────

describe("Meta+Z", () => {
  it("calls nativeUndo", () => {
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("z", { metaKey: true });
    expect(nativeUndo).toHaveBeenCalledOnce();
  });

  it("calls nativeRedo on Meta+Shift+Z", () => {
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("z", { metaKey: true, shiftKey: true });
    expect(nativeRedo).toHaveBeenCalledOnce();
  });
});

// ── Meta+0 / Meta+= / Meta+- — zoom ──────────────────────────────────────────

describe("zoom shortcuts", () => {
  it("Meta+0 calls fitView", () => {
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("0", { metaKey: true });
    expect(mockFitView).toHaveBeenCalledWith({ padding: 0.15, duration: 200 });
  });

  it("Meta+= calls zoomIn", () => {
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("=", { metaKey: true });
    expect(mockZoomIn).toHaveBeenCalledWith({ duration: 150 });
  });

  it("Meta+- calls zoomOut", () => {
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("-", { metaKey: true });
    expect(mockZoomOut).toHaveBeenCalledWith({ duration: 150 });
  });
});

// ── Escape ────────────────────────────────────────────────────────────────────

describe("Escape", () => {
  it("calls clearSelection when a node is selected", () => {
    useGraphStore.setState((s) => ({ ...s, selectedNodeId: "n1" }) as any);
    const spy = vi.spyOn(useGraphStore.getState(), "clearSelection");
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("Escape");
    expect(spy).toHaveBeenCalled();
  });

  it("calls popBreadcrumb when breadcrumbs.length > 1 and nothing selected", () => {
    useGraphStore.setState((s) => ({
      ...s,
      selectedNodeId: null,
      selectedEdgeId: null,
      breadcrumbStack: ["root", "child"],
    }) as any);
    const spy = vi.spyOn(useGraphStore.getState(), "popBreadcrumb");
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("Escape");
    expect(spy).toHaveBeenCalled();
  });
});

// ── Delete / Backspace ────────────────────────────────────────────────────────

describe("Delete / Backspace", () => {
  it("calls nativeGraphRemoveNode when a regular node is selected", () => {
    useGraphStore.setState((s) => ({
      ...s,
      selectedNodeId: "n1",
      nodes: [{ id: "n1" }],
      commentBoxes: [],
    }) as any);
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("Delete");
    expect(nativeGraphRemoveNode).toHaveBeenCalledWith("n1");
  });

  it("does nothing when no node is selected", () => {
    useGraphStore.setState((s) => ({
      ...s,
      selectedNodeId: null,
      nodes: [],
    }) as any);
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("Delete");
    expect(nativeGraphRemoveNode).not.toHaveBeenCalled();
  });
});

// ── Meta+C — copy ─────────────────────────────────────────────────────────────

describe("Meta+C", () => {
  it("calls nativeGraphCopyNodes with selectedNodeId", () => {
    useGraphStore.setState((s) => ({
      ...s,
      selectedNodeId: "n42",
      nodes: [{ id: "n42" }],
      commentBoxes: [],
    }) as any);
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("c", { metaKey: true });
    expect(nativeGraphCopyNodes).toHaveBeenCalledWith(["n42"]);
  });

  it("does nothing when nothing is selected", () => {
    useGraphStore.setState((s) => ({
      ...s,
      selectedNodeId: null,
    }) as any);
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("c", { metaKey: true });
    expect(nativeGraphCopyNodes).not.toHaveBeenCalled();
  });

  it("does nothing when selected id is a comment box", () => {
    useGraphStore.setState((s) => ({
      ...s,
      selectedNodeId: "cb1",
      nodes: [],
      commentBoxes: [{ id: "cb1" }],
    }) as any);
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("c", { metaKey: true });
    expect(nativeGraphCopyNodes).not.toHaveBeenCalled();
  });
});

// ── Ctrl+0-9: save spatial bookmark ──────────────────────────────────────────

describe("Ctrl+0-9 spatial bookmarks", () => {
  // The handler derives the digit from `e.code` (e.g. "Digit5"), not `e.key`,
  // so the shifted-character problem (Shift+5 → "%") never bites
  // (useKeyboard.ts:47). The synthetic events must therefore set `code`.
  it("saves bookmark with Ctrl+5", () => {
    mockGetViewport.mockReturnValue({ x: 100, y: 200, zoom: 1.5 });
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("5", { ctrlKey: true, code: "Digit5" });
    const bm = useAppStore.getState().getSpatialBookmark("5");
    expect(bm).toEqual({ x: 100, y: 200, zoom: 1.5 });
  });

  it("restores bookmark with Shift+5", () => {
    useAppStore.getState().saveSpatialBookmark("5", { x: 50, y: 75, zoom: 2 });
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("5", { shiftKey: true, code: "Digit5" });
    expect(mockSetViewport).toHaveBeenCalledWith(
      { x: 50, y: 75, zoom: 2 },
      { duration: 150 },
    );
  });

  it("does nothing on Shift+5 when bookmark does not exist", () => {
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("9", { shiftKey: true, code: "Digit9" }); // never saved
    expect(mockSetViewport).not.toHaveBeenCalled();
  });
});

// ── Tab — signal-chain navigation ─────────────────────────────────────────────

describe("Tab navigation", () => {
  it("selects the next node in signal-chain order", () => {
    const nodes = [
      { id: "a", position: { x: 0, y: 0 }, selected: false, type: "block" },
      { id: "b", position: { x: 100, y: 0 }, selected: false, type: "block" },
    ];
    useGraphStore.setState((s) => ({
      ...s,
      nodes,
      edges: [],
      selectedNodeId: "a",
    }) as any);
    mockGetNodes.mockReturnValue(nodes);
    const spy = vi.spyOn(useGraphStore.getState(), "selectNode");
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("Tab");
    expect(spy).toHaveBeenCalledWith("b");
  });

  it("wraps around to first node when on last", () => {
    const nodes = [
      { id: "a", position: { x: 0, y: 0 }, selected: false, type: "block" },
      { id: "b", position: { x: 100, y: 0 }, selected: false, type: "block" },
    ];
    useGraphStore.setState((s) => ({
      ...s,
      nodes,
      edges: [],
      selectedNodeId: "b",
    }) as any);
    const spy = vi.spyOn(useGraphStore.getState(), "selectNode");
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("Tab");
    expect(spy).toHaveBeenCalledWith("a");
  });

  it("does nothing when no nodes on canvas", () => {
    useGraphStore.setState((s) => ({
      ...s,
      nodes: [],
    }) as any);
    const spy = vi.spyOn(useGraphStore.getState(), "selectNode");
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("Tab");
    expect(spy).not.toHaveBeenCalled();
  });
});
