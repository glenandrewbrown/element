/**
 * useKeyboard.tab — covers Tab traversal, Delete/Backspace, W wireless toggle,
 * Shift+C/M/K, Ctrl+digit bookmark save, Shift+digit bookmark recall, and
 * Cmd+Shift alignment shortcuts.
 *
 * Existing files already cover: Cmd+K, Cmd+s/z/c/v/d/r/0/=/-, input-guard,
 * Escape, Shift+C/M/K (gaps file). This file adds:
 *   Tab: signal-chain ordering, wrap-around, Shift+Tab backward, no-nodes
 *   Delete/Backspace: no selection, regular node, comment, ghost id
 *   W wireless: no edge, edge not in list, wired→wireless, wireless→wired
 *   Cmd+Shift align: 0 / 1 / 2+ selected, comment-type exclusion, all directions
 *   Ctrl+digit bookmark save, Shift+digit bookmark recall (hit / miss)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboard } from "../useKeyboard";

// ── Shared hoisted state (must precede vi.mock calls) ─────────────────────────

const {
  graphState,
  appState,
  busState,
  mockRemoveNode,
  mockCommentDelete,
  mockCommentAdd,
  mockSetCableBus,
} = vi.hoisted(() => {
  type Node = { id: string; position: { x: number; y: number } };
  type Edge = { id: string; source: string; target: string };

  const graph = {
    nodes: [] as Node[],
    edges: [] as Edge[],
    selectedNodeId: null as string | null,
    selectedEdgeId: null as string | null,
    commentBoxes: [] as Array<{ id: string }>,
    breadcrumbStack: ["Root"] as string[],
    selectNode: vi.fn(),
    clearSelection: vi.fn(),
    alignSelectedNodes: vi.fn(),
    distributeSelectedNodes: vi.fn(),
    toggleMinimap: vi.fn(),
    popBreadcrumb: vi.fn(),
  };

  const app = {
    mode: "edit" as const,
    togglePanel: vi.fn(),
    toggleMode: vi.fn(),
    toggleVirtualKeyboard: vi.fn(),
    openBlockTab: vi.fn(),
    saveSpatialBookmark: vi.fn(),
    getSpatialBookmark: vi.fn(() => undefined as { x: number; y: number; zoom: number } | undefined),
  };

  const bus = {
    cableBus: {} as Record<string, string>,
    setBusForCable: vi.fn(),
  };

  return {
    graphState: graph,
    appState: app,
    busState: bus,
    mockRemoveNode: vi.fn(async () => undefined),
    mockCommentDelete: vi.fn(async () => undefined),
    mockCommentAdd: vi.fn(async () => undefined),
    mockSetCableBus: vi.fn(async () => undefined),
  };
});

// ── ReactFlow mock ────────────────────────────────────────────────────────────

const mockGetNodes = vi.fn((): unknown[] => []);
const mockGetViewport = vi.fn(() => ({ x: 50, y: 60, zoom: 1.2 }));
const mockSetViewport = vi.fn();

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    fitView: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    getNodes: mockGetNodes,
    getViewport: mockGetViewport,
    setViewport: mockSetViewport,
    screenToFlowPosition: vi.fn((p: { x: number; y: number }) => p),
  }),
}));

// ── Bridge mocks ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const spread = (fn: (...a: any[]) => any) => (...a: any[]) => fn(...a);

vi.mock("../../bridge/nativeGraph", () => ({
  nativeGraphRemoveNode: spread(mockRemoveNode),
  nativeGraphCommentDelete: spread(mockCommentDelete),
  nativeGraphCommentAdd: spread(mockCommentAdd),
  nativeGraphSetCableBus: spread(mockSetCableBus),
  nativeGraphCopyNodes: vi.fn(async () => undefined),
  nativeGraphPasteNodes: vi.fn(async () => undefined),
  nativeGraphDuplicateNode: vi.fn(async () => undefined),
  nativeGraphDuplicateNodes: vi.fn(async () => 1),
  nativeRedo: vi.fn(async () => undefined),
  nativeUndo: vi.fn(async () => undefined),
}));

vi.mock("../../bridge/nativeSession", () => ({
  nativeSessionSave: vi.fn(async () => undefined),
  nativeSessionSaveAs: vi.fn(async () => undefined),
}));

// ── Store mocks with .getState attached ──────────────────────────────────────

vi.mock("../../stores/useGraphStore", () => {
  const fn = vi.fn(
    (sel: (s: typeof graphState) => unknown) => sel(graphState),
  );
  (fn as unknown as { getState: () => typeof graphState }).getState = () =>
    graphState;
  return {
    useGraphStore: fn,
    deriveBuses: () => [],
    suggestBusName: () => "Bus 1",
  };
});

vi.mock("../../stores/useAppStore", () => {
  const fn = vi.fn(
    (sel: (s: typeof appState) => unknown) => sel(appState),
  );
  (fn as unknown as { getState: () => typeof appState }).getState = () =>
    appState;
  return { useAppStore: fn };
});

vi.mock("../../stores/useBusStore", () => {
  const fn = vi.fn(
    (sel: (s: typeof busState) => unknown) => sel(busState),
  );
  (fn as unknown as { getState: () => typeof busState }).getState = () =>
    busState;
  return {
    useBusStore: fn,
    deriveBuses: (
      _edges: unknown[],
      cableBus: Record<string, string>,
    ) =>
      Object.entries(cableBus).map(([id, name]) => ({ id, name })),
    suggestBusName: (names: string[]) => `Bus ${names.length + 1}`,
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function fireKey(key: string, mods: Partial<KeyboardEventInit> = {}) {
  const code =
    mods.code ??
    (key.match(/^\d$/) ? `Digit${key}` : `Key${key.toUpperCase()}`);
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      code,
      bubbles: true,
      cancelable: true,
      ...mods,
    }),
  );
}

function mount() {
  return renderHook(() =>
    useKeyboard({ onToggleCommandPalette: vi.fn() }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  graphState.nodes = [];
  graphState.edges = [];
  graphState.selectedNodeId = null;
  graphState.selectedEdgeId = null;
  graphState.commentBoxes = [];
  busState.cableBus = {};
  appState.getSpatialBookmark.mockReturnValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useKeyboard — Tab traversal", () => {
  it("Tab with no nodes → no selectNode", () => {
    graphState.nodes = [];
    mount();
    act(() => fireKey("Tab"));
    expect(graphState.selectNode).not.toHaveBeenCalled();
  });

  it("Tab selects first node when nothing selected", () => {
    graphState.nodes = [
      { id: "a", position: { x: 0, y: 0 } },
      { id: "b", position: { x: 100, y: 0 } },
    ];
    mount();
    act(() => fireKey("Tab"));
    expect(graphState.selectNode).toHaveBeenCalledWith("a");
  });

  it("Tab wraps from last node to first", () => {
    graphState.nodes = [
      { id: "a", position: { x: 0, y: 0 } },
      { id: "b", position: { x: 100, y: 0 } },
    ];
    graphState.selectedNodeId = "b";
    mount();
    act(() => fireKey("Tab"));
    expect(graphState.selectNode).toHaveBeenCalledWith("a");
  });

  it("Tab advances by signal-chain order (sink after source)", () => {
    graphState.nodes = [
      { id: "a", position: { x: 50, y: 0 } },
      { id: "b", position: { x: 0, y: 0 } },
    ];
    graphState.edges = [{ id: "e1", source: "a", target: "b" }];
    graphState.selectedNodeId = "a";
    mount();
    act(() => fireKey("Tab"));
    expect(graphState.selectNode).toHaveBeenCalledWith("b");
  });

  it("Shift+Tab moves backward (second → first)", () => {
    graphState.nodes = [
      { id: "a", position: { x: 0, y: 0 } },
      { id: "b", position: { x: 100, y: 0 } },
    ];
    graphState.selectedNodeId = "b";
    mount();
    act(() => fireKey("Tab", { shiftKey: true }));
    expect(graphState.selectNode).toHaveBeenCalledWith("a");
  });

  it("Shift+Tab wraps from first to last", () => {
    graphState.nodes = [
      { id: "a", position: { x: 0, y: 0 } },
      { id: "b", position: { x: 100, y: 0 } },
    ];
    graphState.selectedNodeId = "a";
    mount();
    act(() => fireKey("Tab", { shiftKey: true }));
    expect(graphState.selectNode).toHaveBeenCalledWith("b");
  });

  it("Tab with single node cycles to itself", () => {
    graphState.nodes = [{ id: "only", position: { x: 0, y: 0 } }];
    graphState.selectedNodeId = "only";
    mount();
    act(() => fireKey("Tab"));
    expect(graphState.selectNode).toHaveBeenCalledWith("only");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useKeyboard — Delete / Backspace", () => {
  it("Delete with no selectedNodeId → no-op", () => {
    graphState.selectedNodeId = null;
    mount();
    act(() => fireKey("Delete"));
    expect(mockRemoveNode).not.toHaveBeenCalled();
  });

  it("Backspace with no selectedNodeId → no-op", () => {
    graphState.selectedNodeId = null;
    mount();
    act(() => fireKey("Backspace"));
    expect(mockRemoveNode).not.toHaveBeenCalled();
  });

  it("Delete on a regular block → nativeGraphRemoveNode", async () => {
    graphState.nodes = [{ id: "n1", position: { x: 0, y: 0 } }];
    graphState.selectedNodeId = "n1";
    mount();
    await act(async () => fireKey("Delete"));
    expect(mockRemoveNode).toHaveBeenCalledWith("n1");
    expect(mockCommentDelete).not.toHaveBeenCalled();
  });

  it("Delete on a comment box → nativeGraphCommentDelete", async () => {
    graphState.commentBoxes = [{ id: "cm1" }];
    graphState.selectedNodeId = "cm1";
    mount();
    await act(async () => fireKey("Delete"));
    expect(mockCommentDelete).toHaveBeenCalledWith("cm1");
    expect(mockRemoveNode).not.toHaveBeenCalled();
  });

  it("Delete with id absent from both nodes and comments → no-op", async () => {
    graphState.nodes = [];
    graphState.commentBoxes = [];
    graphState.selectedNodeId = "ghost";
    mount();
    await act(async () => fireKey("Delete"));
    expect(mockRemoveNode).not.toHaveBeenCalled();
    expect(mockCommentDelete).not.toHaveBeenCalled();
  });

  it("Backspace on a block behaves same as Delete", async () => {
    graphState.nodes = [{ id: "n2", position: { x: 0, y: 0 } }];
    graphState.selectedNodeId = "n2";
    mount();
    await act(async () => fireKey("Backspace"));
    expect(mockRemoveNode).toHaveBeenCalledWith("n2");
  });

  it("input element target suppresses Delete (input guard)", () => {
    graphState.nodes = [{ id: "n1", position: { x: 0, y: 0 } }];
    graphState.selectedNodeId = "n1";
    mount();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    act(() =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Delete",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(mockRemoveNode).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useKeyboard — W wireless toggle", () => {
  it("W with no selectedEdgeId → no-op", () => {
    graphState.selectedEdgeId = null;
    mount();
    act(() => fireKey("w"));
    expect(mockSetCableBus).not.toHaveBeenCalled();
  });

  it("W with edge id not in edges list → no-op", () => {
    graphState.selectedEdgeId = "missing";
    graphState.edges = [];
    mount();
    act(() => fireKey("w"));
    expect(mockSetCableBus).not.toHaveBeenCalled();
  });

  it("W on wired cable assigns next bus name", async () => {
    graphState.selectedEdgeId = "e1";
    graphState.edges = [{ id: "e1", source: "s1", target: "t1" }];
    busState.cableBus = {};
    mount();
    await act(async () => fireKey("w"));
    expect(busState.setBusForCable).toHaveBeenCalledWith("e1", expect.stringContaining("Bus"));
    expect(mockSetCableBus).toHaveBeenCalled();
  });

  it("W on wireless cable clears the bus", async () => {
    graphState.selectedEdgeId = "e2";
    graphState.edges = [{ id: "e2", source: "s1", target: "t1" }];
    busState.cableBus = { e2: "Reverb Send" };
    mount();
    await act(async () => fireKey("w"));
    expect(busState.setBusForCable).toHaveBeenCalledWith("e2", undefined);
    expect(mockSetCableBus).toHaveBeenCalledWith("e2", "");
  });

  it("uppercase W also triggers wireless toggle", async () => {
    graphState.selectedEdgeId = "e3";
    graphState.edges = [{ id: "e3", source: "s1", target: "t1" }];
    busState.cableBus = {};
    mount();
    await act(async () => fireKey("W"));
    expect(busState.setBusForCable).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useKeyboard — Ctrl+digit bookmark save", () => {
  it("Ctrl+1 saves viewport under key '1'", () => {
    mount();
    act(() => fireKey("1", { ctrlKey: true, code: "Digit1" }));
    expect(appState.saveSpatialBookmark).toHaveBeenCalledWith("1", {
      x: 50,
      y: 60,
      zoom: 1.2,
    });
  });

  it("Ctrl+0 saves viewport under key '0'", () => {
    mount();
    act(() => fireKey("0", { ctrlKey: true, code: "Digit0" }));
    expect(appState.saveSpatialBookmark).toHaveBeenCalledWith("0", expect.any(Object));
  });

  it("Ctrl+Meta+digit does NOT save bookmark (metaKey blocks ctrlKey-only guard)", () => {
    mount();
    act(() => fireKey("1", { ctrlKey: true, metaKey: true, code: "Digit1" }));
    expect(appState.saveSpatialBookmark).not.toHaveBeenCalled();
  });

  it("Ctrl+non-digit does not save", () => {
    mount();
    act(() => fireKey("a", { ctrlKey: true, code: "KeyA" }));
    expect(appState.saveSpatialBookmark).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useKeyboard — Shift+digit bookmark recall", () => {
  it("Shift+1 with stored bookmark restores viewport", () => {
    const bm = { x: 200, y: 300, zoom: 0.8 };
    appState.getSpatialBookmark.mockReturnValue(bm);
    mount();
    act(() => fireKey("!", { shiftKey: true, code: "Digit1" }));
    expect(mockSetViewport).toHaveBeenCalledWith(bm, { duration: 150 });
  });

  it("Shift+1 with no stored bookmark → no setViewport", () => {
    appState.getSpatialBookmark.mockReturnValue(undefined);
    mount();
    act(() => fireKey("!", { shiftKey: true, code: "Digit1" }));
    expect(mockSetViewport).not.toHaveBeenCalled();
  });

  it("Shift+0 with stored bookmark restores viewport", () => {
    const bm = { x: 0, y: 0, zoom: 1.0 };
    appState.getSpatialBookmark.mockReturnValue(bm);
    mount();
    act(() => fireKey(")", { shiftKey: true, code: "Digit0" }));
    expect(mockSetViewport).toHaveBeenCalledWith(bm, { duration: 150 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useKeyboard — Cmd+Shift alignment", () => {
  it("Cmd+Shift+L with 0 selected → no alignSelectedNodes", () => {
    mockGetNodes.mockReturnValue([]);
    mount();
    act(() => fireKey("l", { metaKey: true, shiftKey: true }));
    expect(graphState.alignSelectedNodes).not.toHaveBeenCalled();
  });

  it("Cmd+Shift+L with 1 selected block → no alignSelectedNodes", () => {
    mockGetNodes.mockReturnValue([
      { id: "a", type: "block", selected: true },
    ]);
    mount();
    act(() => fireKey("l", { metaKey: true, shiftKey: true }));
    expect(graphState.alignSelectedNodes).not.toHaveBeenCalled();
  });

  it("Cmd+Shift+L with 2 blocks → alignSelectedNodes('left', ids)", () => {
    mockGetNodes.mockReturnValue([
      { id: "a", type: "block", selected: true },
      { id: "b", type: "block", selected: true },
    ]);
    mount();
    act(() => fireKey("l", { metaKey: true, shiftKey: true }));
    expect(graphState.alignSelectedNodes).toHaveBeenCalledWith("left", ["a", "b"]);
  });

  it("Cmd+Shift+R aligns right", () => {
    mockGetNodes.mockReturnValue([
      { id: "a", type: "block", selected: true },
      { id: "b", type: "block", selected: true },
    ]);
    mount();
    act(() => fireKey("r", { metaKey: true, shiftKey: true }));
    expect(graphState.alignSelectedNodes).toHaveBeenCalledWith("right", ["a", "b"]);
  });

  it("Cmd+Shift+T aligns top", () => {
    mockGetNodes.mockReturnValue([
      { id: "a", type: "block", selected: true },
      { id: "b", type: "block", selected: true },
    ]);
    mount();
    act(() => fireKey("t", { metaKey: true, shiftKey: true }));
    expect(graphState.alignSelectedNodes).toHaveBeenCalledWith("top", ["a", "b"]);
  });

  it("Cmd+Shift+B aligns bottom", () => {
    mockGetNodes.mockReturnValue([
      { id: "a", type: "block", selected: true },
      { id: "b", type: "block", selected: true },
    ]);
    mount();
    act(() => fireKey("b", { metaKey: true, shiftKey: true }));
    expect(graphState.alignSelectedNodes).toHaveBeenCalledWith("bottom", ["a", "b"]);
  });

  it("Cmd+Shift+H distributes horizontally", () => {
    mockGetNodes.mockReturnValue([
      { id: "a", type: "block", selected: true },
      { id: "b", type: "block", selected: true },
      { id: "c", type: "block", selected: true },
    ]);
    mount();
    act(() => fireKey("h", { metaKey: true, shiftKey: true }));
    expect(graphState.distributeSelectedNodes).toHaveBeenCalledWith(
      "horizontal",
      ["a", "b", "c"],
    );
  });

  it("Cmd+Shift+V distributes vertically", () => {
    mockGetNodes.mockReturnValue([
      { id: "a", type: "block", selected: true },
      { id: "b", type: "block", selected: true },
    ]);
    mount();
    act(() => fireKey("v", { metaKey: true, shiftKey: true }));
    expect(graphState.distributeSelectedNodes).toHaveBeenCalledWith(
      "vertical",
      ["a", "b"],
    );
  });

  it("comment nodes excluded from selection (only 1 block → no-op)", () => {
    mockGetNodes.mockReturnValue([
      { id: "c1", type: "comment", selected: true },
      { id: "b1", type: "block", selected: true },
    ]);
    mount();
    act(() => fireKey("l", { metaKey: true, shiftKey: true }));
    expect(graphState.alignSelectedNodes).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useKeyboard — Shift combos (no meta)", () => {
  it("Shift+C → nativeGraphCommentAdd", async () => {
    mount();
    await act(async () => fireKey("C", { shiftKey: true }));
    expect(mockCommentAdd).toHaveBeenCalled();
  });

  it("Shift+M → toggleMinimap", () => {
    mount();
    act(() => fireKey("M", { shiftKey: true }));
    expect(graphState.toggleMinimap).toHaveBeenCalled();
  });

  it("Shift+K → toggleVirtualKeyboard", () => {
    mount();
    act(() => fireKey("K", { shiftKey: true }));
    expect(appState.toggleVirtualKeyboard).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useKeyboard — cleanup", () => {
  it("removes keydown listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = mount();
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });
});
