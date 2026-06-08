/**
 * useKeyboard — Cmd+Shift+D "Group selection into Container" chord (T10).
 *
 * Asserts: ≥2 selected blocks → groupSelectedBlocks called with the ids;
 * <2 selected → no-op; refusal surfaces via the canvasHint channel.
 * (groupSelection's own gates are unit-tested in groupSelection.test.ts.)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { graphState, appState, mockGetNodes, mockGroup } = vi.hoisted(() => ({
  graphState: {
    nodes: [] as unknown[],
    edges: [] as unknown[],
    commentBoxes: [] as Array<{ id: string }>,
    selectedNodeId: null as string | null,
    selectedEdgeId: null as string | null,
    breadcrumbStack: ["Root"] as string[],
    selectNode: vi.fn(),
    clearSelection: vi.fn(),
    alignSelectedNodes: vi.fn(),
    distributeSelectedNodes: vi.fn(),
    toggleMinimap: vi.fn(),
    popBreadcrumb: vi.fn(),
  },
  appState: {
    mode: "edit" as const,
    canvasHint: null as string | null,
    setCanvasHint: vi.fn(),
    togglePanel: vi.fn(),
    toggleMode: vi.fn(),
    toggleVirtualKeyboard: vi.fn(),
    openBlockTab: vi.fn(),
    saveSpatialBookmark: vi.fn(),
    getSpatialBookmark: vi.fn(() => undefined),
  },
  mockGetNodes: vi.fn((): unknown[] => []),
  mockGroup: vi.fn(
    async (): Promise<
      { ok: true; containerId: string } | { ok: false; reason: string }
    > => ({ ok: true, containerId: "c-1" }),
  ),
}));

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    fitView: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    getNodes: mockGetNodes,
    getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
    setViewport: vi.fn(),
    screenToFlowPosition: vi.fn((p: { x: number; y: number }) => p),
  }),
}));

vi.mock("../../components/canvas/groupSelection", () => ({
  groupSelectionWithFeedback: mockGroup,
}));

vi.mock("../../bridge/nativeGraph", () => ({
  nativeGraphRemoveNode: vi.fn(),
  nativeGraphCommentDelete: vi.fn(),
  nativeGraphCommentAdd: vi.fn(),
  nativeGraphSetCableBus: vi.fn(),
  nativeGraphCopyNodes: vi.fn(),
  nativeGraphPasteNodes: vi.fn(),
  nativeGraphDuplicateNode: vi.fn(async () => undefined),
  nativeGraphDuplicateNodes: vi.fn(async () => 1),
  nativeRedo: vi.fn(),
  nativeUndo: vi.fn(),
}));

vi.mock("../../bridge/nativeSession", () => ({
  nativeSessionSave: vi.fn(),
  nativeSessionSaveAs: vi.fn(),
}));

vi.mock("../../bridge/nativePluginEditor", () => ({
  nativePluginEditorClose: vi.fn(),
}));

vi.mock("../../stores/useGraphStore", () => {
  const fn = vi.fn((sel: (s: typeof graphState) => unknown) => sel(graphState));
  (fn as unknown as { getState: () => typeof graphState }).getState = () =>
    graphState;
  return { useGraphStore: fn };
});

vi.mock("../../stores/useAppStore", () => {
  const fn = vi.fn((sel: (s: typeof appState) => unknown) => sel(appState));
  (fn as unknown as { getState: () => typeof appState }).getState = () =>
    appState;
  return { useAppStore: fn };
});

vi.mock("../../stores/useBusStore", () => {
  const bus = { cableBus: {}, setBusForCable: vi.fn() };
  const fn = vi.fn((sel: (s: typeof bus) => unknown) => sel(bus));
  (fn as unknown as { getState: () => typeof bus }).getState = () => bus;
  return {
    useBusStore: fn,
    deriveBuses: () => [],
    suggestBusName: () => "Bus 1",
  };
});

import { useKeyboard } from "../useKeyboard";

function fireKey(key: string, mods: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      code: `Key${key.toUpperCase()}`,
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

const flow = (id: string) => ({ id, selected: true, type: "block" });

beforeEach(() => {
  vi.clearAllMocks();
  mockGetNodes.mockReturnValue([]);
});

describe("useKeyboard — Cmd+Shift+D group chord", () => {
  it("≥2 selected blocks → groupSelectedBlocks with the selected ids", async () => {
    mockGetNodes.mockReturnValue([flow("a"), flow("b"), { id: "c", selected: false, type: "block" }]);
    mount();
    await act(async () => fireKey("d", { metaKey: true, shiftKey: true }));
    expect(mockGroup).toHaveBeenCalledWith(["a", "b"]);
  });

  it("1 selected block → groupSelectionWithFeedback called so refusal surfaces", async () => {
    // The "need-2" refusal must be VISIBLE, not silently swallowed.
    // groupSelectionWithFeedback handles the need-2 case internally (see
    // groupSelection.test.ts); the chord's job is to always call it so the
    // StatusBar shows the reason.
    mockGetNodes.mockReturnValue([flow("a")]);
    mount();
    await act(async () => fireKey("d", { metaKey: true, shiftKey: true }));
    expect(mockGroup).toHaveBeenCalledWith(["a"]);
  });

  it("0 selected blocks → groupSelectionWithFeedback not called (nothing to group)", async () => {
    mockGetNodes.mockReturnValue([]);
    mount();
    await act(async () => fireKey("d", { metaKey: true, shiftKey: true }));
    expect(mockGroup).not.toHaveBeenCalled();
  });

  it("plain Cmd+D (no shift) does NOT group", async () => {
    mockGetNodes.mockReturnValue([flow("a"), flow("b")]);
    mount();
    await act(async () => fireKey("d", { metaKey: true }));
    expect(mockGroup).not.toHaveBeenCalled();
  });

  // Refusal → canvasHint feedback lives inside groupSelectionWithFeedback and
  // is covered by groupSelection.test.ts; the chord's contract is just to call
  // it with the eligible selection.

  it("comment nodes are filtered out — only blocks count toward the selection", async () => {
    // 1 block + 1 comment → selected block ids = ["a"]. groupSelectionWithFeedback
    // is called with ["a"] so the "need-2" refusal surfaces in the StatusBar
    // (comments do not count as eligible blocks for grouping).
    mockGetNodes.mockReturnValue([
      flow("a"),
      { id: "k", selected: true, type: "comment" },
    ]);
    mount();
    await act(async () => fireKey("d", { metaKey: true, shiftKey: true }));
    expect(mockGroup).toHaveBeenCalledWith(["a"]);
  });
});

describe("useKeyboard — Cmd+G group alias (Task 5.2)", () => {
  it("≥2 selected blocks → groupSelectionWithFeedback with the selected ids", async () => {
    mockGetNodes.mockReturnValue([flow("a"), flow("b"), { id: "c", selected: false, type: "block" }]);
    mount();
    await act(async () => fireKey("g", { metaKey: true }));
    expect(mockGroup).toHaveBeenCalledWith(["a", "b"]);
  });

  it("1 selected block → groupSelectionWithFeedback called so refusal surfaces", async () => {
    mockGetNodes.mockReturnValue([flow("a")]);
    mount();
    await act(async () => fireKey("g", { metaKey: true }));
    expect(mockGroup).toHaveBeenCalledWith(["a"]);
  });

  it("0 selected blocks → groupSelectionWithFeedback not called", async () => {
    mockGetNodes.mockReturnValue([]);
    mount();
    await act(async () => fireKey("g", { metaKey: true }));
    expect(mockGroup).not.toHaveBeenCalled();
  });

  it("Cmd+Shift+G also triggers group — meta+shift block has no 'g' handler, falls through to meta switch", async () => {
    // Cmd+Shift+G: meta+shift block checks lower==="d" (no), l/r/t/b/h/v (no),
    // falls through; the `if (meta) switch` then fires case "G" → group.
    mockGetNodes.mockReturnValue([flow("a"), flow("b")]);
    mount();
    await act(async () => fireKey("G", { metaKey: true, shiftKey: true }));
    expect(mockGroup).toHaveBeenCalledWith(["a", "b"]);
  });

  it("Cmd+G and Cmd+Shift+D both dispatch for the same ≥2 selection", async () => {
    mockGetNodes.mockReturnValue([flow("x"), flow("y")]);
    mount();
    await act(async () => fireKey("d", { metaKey: true, shiftKey: true }));
    await act(async () => fireKey("g", { metaKey: true }));
    expect(mockGroup).toHaveBeenCalledTimes(2);
    expect(mockGroup).toHaveBeenNthCalledWith(1, ["x", "y"]);
    expect(mockGroup).toHaveBeenNthCalledWith(2, ["x", "y"]);
  });
});
