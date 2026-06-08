/**
 * useKeyboard.panels.test.tsx — Task 3.C: keyboard + hide-all + search focus.
 *
 * New bindings for owner feedback #8:
 *   - Cmd+\        → toggle LEFT browser  (Figma-muscle alias for Cmd+1)
 *   - Cmd+Opt+\    → toggle RIGHT inspector (alias for Cmd+2)
 *   - Cmd+.        → hide ALL panels (full-bleed canvas); press again restores
 *                    the prior per-panel layout
 *   - Cmd+F        → focus browser search via the focusBrowserSearch store
 *                    nonce (NOT a DOM query); opens the browser first if closed
 *
 * Same mock shape as useKeyboard.test.tsx (ReactFlow + bridges mocked).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboard } from "../useKeyboard";
import { useAppStore } from "../../stores/useAppStore";
import { useGraphStore } from "../../stores/useGraphStore";

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

// ── bridge mocks (unused here but imported transitively by the hook) ───────────

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

function resetStores() {
  useAppStore.setState({
    mode: "edit",
    leftPanelOpen: true,
    rightPanelOpen: true,
    bottomPanelOpen: true,
    inspectorUserCollapsed: false,
    focusBrowserSearch: 0,
    panelsHiddenSnapshot: null,
  });
  useGraphStore.setState({
    nodes: [],
    edges: [],
    commentBoxes: [],
    selectedNodeId: null,
    selectedEdgeId: null,
  } as never);
}

function fire(key: string, modifiers: Partial<KeyboardEvent> = {}) {
  const evt = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    metaKey: modifiers.metaKey ?? false,
    ctrlKey: modifiers.ctrlKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
    altKey: modifiers.altKey ?? false,
    ...modifiers,
  });
  act(() => {
    window.dispatchEvent(evt);
  });
  return evt;
}

beforeEach(resetStores);
afterEach(() => vi.clearAllMocks());

// ── Cmd+\ — toggle left ─────────────────────────────────────────────────────

describe("Cmd+\\ (toggle left browser)", () => {
  it("toggles the left panel", () => {
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    expect(useAppStore.getState().leftPanelOpen).toBe(true);
    fire("\\", { metaKey: true });
    expect(useAppStore.getState().leftPanelOpen).toBe(false);
    fire("\\", { metaKey: true });
    expect(useAppStore.getState().leftPanelOpen).toBe(true);
  });

  it("does NOT toggle the right panel", () => {
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("\\", { metaKey: true });
    expect(useAppStore.getState().rightPanelOpen).toBe(true);
  });
});

// ── Cmd+Opt+\ — toggle right ────────────────────────────────────────────────

describe("Cmd+Opt+\\ (toggle right inspector)", () => {
  it("toggles the right panel", () => {
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    expect(useAppStore.getState().rightPanelOpen).toBe(true);
    fire("\\", { metaKey: true, altKey: true });
    expect(useAppStore.getState().rightPanelOpen).toBe(false);
  });

  it("does NOT toggle the left panel", () => {
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("\\", { metaKey: true, altKey: true });
    expect(useAppStore.getState().leftPanelOpen).toBe(true);
  });
});

// ── Cmd+. — hide all / restore ────────────────────────────────────────────────

describe("Cmd+. (hide all panels → full-bleed, restore on repeat)", () => {
  it("first press hides every panel", () => {
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire(".", { metaKey: true });
    const s = useAppStore.getState();
    expect(s.leftPanelOpen).toBe(false);
    expect(s.rightPanelOpen).toBe(false);
    expect(s.bottomPanelOpen).toBe(false);
  });

  it("second press restores the prior layout exactly", () => {
    // Start with a non-uniform layout: right already closed.
    useAppStore.setState({
      leftPanelOpen: true,
      rightPanelOpen: false,
      bottomPanelOpen: true,
    });
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire(".", { metaKey: true }); // hide all
    fire(".", { metaKey: true }); // restore
    const s = useAppStore.getState();
    expect(s.leftPanelOpen).toBe(true);
    expect(s.rightPanelOpen).toBe(false); // stays closed — exact restore
    expect(s.bottomPanelOpen).toBe(true);
  });
});

// ── Cmd+F — store-driven search focus ─────────────────────────────────────────

describe("Cmd+F (focus browser search via store nonce)", () => {
  it("bumps the focusBrowserSearch nonce", () => {
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    const before = useAppStore.getState().focusBrowserSearch;
    fire("f", { metaKey: true });
    expect(useAppStore.getState().focusBrowserSearch).toBe(before + 1);
  });

  it("opens the browser first when it is collapsed", () => {
    useAppStore.setState({ leftPanelOpen: false });
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("f", { metaKey: true });
    expect(useAppStore.getState().leftPanelOpen).toBe(true);
    expect(useAppStore.getState().focusBrowserSearch).toBe(1);
  });

  it("does NOT re-toggle the browser when it is already open", () => {
    useAppStore.setState({ leftPanelOpen: true });
    renderHook(() => useKeyboard({ onToggleCommandPalette: vi.fn() }));
    fire("f", { metaKey: true });
    expect(useAppStore.getState().leftPanelOpen).toBe(true);
  });
});
