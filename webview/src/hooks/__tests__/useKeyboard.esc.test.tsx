/**
 * useKeyboard — Escape priority resolver tests.
 *
 * Verifies the Escape priority chain:
 *   (1) palette open       → close palette, do NOT deselect
 *   (2) embedded editor    → close it (P1-A)
 *   (3a) selection         → deselect
 *   (3b) dived (no select) → ENGINE exit one level (nativeExitContainer), NOT a
 *                            cosmetic client pop. "Is dived" = currentBoardId set
 *                            OR breadcrumb path deeper than [session, activeGraph]
 *                            (length > 2). Breadcrumb redraws from the snapshot.
 *
 * Also verifies that there is exactly ONE window "keydown" listener after
 * the hook mounts (regression guard against adding a second listener).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboard } from "../useKeyboard";
import { useGraphStore } from "../../stores/useGraphStore";
import { nativeExitContainer } from "../../bridge/nativeGraph";

// ── ReactFlow mock ────────────────────────────────────────────────────────────

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    fitView: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    getNodes: vi.fn(() => []),
    getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
    setViewport: vi.fn(),
    screenToFlowPosition: vi.fn((p: { x: number; y: number }) => p),
  }),
}));

// ── bridge mocks ──────────────────────────────────────────────────────────────

vi.mock("../../bridge/nativeGraph", () => ({
  nativeExitContainer: vi.fn(async () => true),
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

// ── helpers ───────────────────────────────────────────────────────────────────

function fireEsc() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
}

function resetGraphStore() {
  useGraphStore.setState({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    breadcrumbStack: ["Main Project"],
    currentBoardId: null,
    commentBoxes: [],
    minimapVisible: false,
    snapToGrid: false,
  } as unknown as Parameters<typeof useGraphStore.setState>[0]);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("useKeyboard — Escape priority resolver", () => {
  beforeEach(() => {
    resetGraphStore();
    // Clear accumulated bridge-mock calls between tests (module mocks persist).
    (nativeExitContainer as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("priority 1: palette open → calls onClosePalette, does NOT clear selection", () => {
    const onToggleCommandPalette = vi.fn();
    const onClosePalette = vi.fn();

    // Give the store a selected node so we can detect whether clearSelection ran
    useGraphStore.setState({ selectedNodeId: "node-1" } as unknown as Parameters<typeof useGraphStore.setState>[0]);

    renderHook(() =>
      useKeyboard({
        onToggleCommandPalette,
        paletteOpen: true,
        onClosePalette,
      }),
    );

    fireEsc();

    expect(onClosePalette).toHaveBeenCalledOnce();
    // clearSelection must NOT have fired — selectedNodeId still set
    expect(useGraphStore.getState().selectedNodeId).toBe("node-1");
  });

  it("priority 1 beats priority 3: palette open → no dive exit either", () => {
    const onClosePalette = vi.fn();

    // Dived (length 3 = [session, activeGraph, container]).
    useGraphStore.setState({
      selectedNodeId: null,
      selectedEdgeId: null,
      breadcrumbStack: ["Project", "Main", "Container"],
    } as unknown as Parameters<typeof useGraphStore.setState>[0]);

    renderHook(() =>
      useKeyboard({
        onToggleCommandPalette: vi.fn(),
        paletteOpen: true,
        onClosePalette,
      }),
    );

    fireEsc();

    expect(onClosePalette).toHaveBeenCalledOnce();
    // Dive exit must NOT have fired while the palette is open.
    expect(nativeExitContainer).not.toHaveBeenCalled();
  });

  it("priority 3: palette closed + node selected → clears selection", () => {
    const onClosePalette = vi.fn();

    useGraphStore.setState({ selectedNodeId: "node-2" } as unknown as Parameters<typeof useGraphStore.setState>[0]);

    renderHook(() =>
      useKeyboard({
        onToggleCommandPalette: vi.fn(),
        paletteOpen: false,
        onClosePalette,
      }),
    );

    fireEsc();

    expect(onClosePalette).not.toHaveBeenCalled();
    expect(useGraphStore.getState().selectedNodeId).toBeNull();
  });

  it("priority 3b: palette closed + nothing selected + dived → ENGINE exit (no client pop)", () => {
    const onClosePalette = vi.fn();

    // Dived: breadcrumb path deeper than [session, activeGraph] (length > 2).
    useGraphStore.setState({
      selectedNodeId: null,
      selectedEdgeId: null,
      breadcrumbStack: ["Project", "Main", "Container A"],
      currentBoardId: "container-a",
    } as unknown as Parameters<typeof useGraphStore.setState>[0]);

    renderHook(() =>
      useKeyboard({
        onToggleCommandPalette: vi.fn(),
        paletteOpen: false,
        onClosePalette,
      }),
    );

    fireEsc();

    expect(onClosePalette).not.toHaveBeenCalled();
    // Engine-driven: the host backs out and re-pushes the snapshot. The local
    // breadcrumb is NOT mutated optimistically (desync-safe).
    expect(nativeExitContainer).toHaveBeenCalledTimes(1);
    expect(useGraphStore.getState().breadcrumbStack).toHaveLength(3);
  });

  it("priority 3b: dived via currentBoardId alone (path length 2) still exits on Esc", () => {
    useGraphStore.setState({
      selectedNodeId: null,
      selectedEdgeId: null,
      breadcrumbStack: ["Project", "Main"],
      currentBoardId: "some-board",
    } as unknown as Parameters<typeof useGraphStore.setState>[0]);

    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));

    fireEsc();

    expect(nativeExitContainer).toHaveBeenCalledTimes(1);
  });

  it("priority 3b: NOT dived (top level) → Esc does NOT exit", () => {
    useGraphStore.setState({
      selectedNodeId: null,
      selectedEdgeId: null,
      breadcrumbStack: ["Project", "Main"],
      currentBoardId: null,
    } as unknown as Parameters<typeof useGraphStore.setState>[0]);

    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));

    fireEsc();

    expect(nativeExitContainer).not.toHaveBeenCalled();
  });

  it("backwards-compat: omitting paletteOpen/onClosePalette still clears selection", () => {
    // App.tsx still calls useKeyboard with only onToggleCommandPalette —
    // this test guards that the optional props don't break the old call site.
    useGraphStore.setState({ selectedNodeId: "node-3" } as unknown as Parameters<typeof useGraphStore.setState>[0]);

    renderHook(() =>
      useKeyboard({ onToggleCommandPalette: vi.fn() }),
    );

    fireEsc();

    expect(useGraphStore.getState().selectedNodeId).toBeNull();
  });

  it("exactly ONE window keydown listener is registered per hook instance", () => {
    const addSpy = vi.spyOn(window, "addEventListener");

    const { unmount } = renderHook(() =>
      useKeyboard({
        onToggleCommandPalette: vi.fn(),
        paletteOpen: false,
        onClosePalette: vi.fn(),
      }),
    );

    const keydownCalls = addSpy.mock.calls.filter(([ev]) => ev === "keydown");
    expect(keydownCalls).toHaveLength(1);

    unmount();
    addSpy.mockRestore();
  });
});
