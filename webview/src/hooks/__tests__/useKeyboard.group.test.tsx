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
  groupSelectedBlocks: mockGroup,
  GROUP_REFUSAL_COPY: { "cv-boundary": "CV crosses the selection edge" },
}));

vi.mock("../../bridge/nativeGraph", () => ({
  nativeGraphRemoveNode: vi.fn(),
  nativeGraphCommentDelete: vi.fn(),
  nativeGraphCommentAdd: vi.fn(),
  nativeGraphSetCableBus: vi.fn(),
  nativeGraphCopyNodes: vi.fn(),
  nativeGraphPasteNodes: vi.fn(),
  nativeGraphDuplicateNode: vi.fn(),
  nativeGraphDuplicateNodes: vi.fn(),
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

  it("<2 selected → chord is a no-op (no bridge call)", async () => {
    mockGetNodes.mockReturnValue([flow("a")]);
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

  it("refusal surfaces via canvasHint", async () => {
    mockGroup.mockResolvedValueOnce({ ok: false, reason: "cv-boundary" });
    mockGetNodes.mockReturnValue([flow("a"), flow("b")]);
    mount();
    await act(async () => {
      fireKey("d", { metaKey: true, shiftKey: true });
      await Promise.resolve();
    });
    expect(appState.setCanvasHint).toHaveBeenCalledWith(
      "CV crosses the selection edge",
    );
  });

  it("comment nodes are not counted as selection", async () => {
    mockGetNodes.mockReturnValue([
      flow("a"),
      { id: "k", selected: true, type: "comment" },
    ]);
    mount();
    await act(async () => fireKey("d", { metaKey: true, shiftKey: true }));
    expect(mockGroup).not.toHaveBeenCalled();
  });
});
