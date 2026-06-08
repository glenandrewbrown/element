/**
 * Task 3.E — selection-driven auto-collapse/expand (brief Phase E §4.3).
 *
 * The inspector follows the selection: a selection OPENS the right panel; no
 * selection COLLAPSES it to the rail — UNLESS the user has deliberately collapsed
 * it (`inspectorUserCollapsed`), which is never fought and never cleared by the
 * auto-driver. This drives the panel via the REAL useAppStore (so `setPanelOpen`,
 * `inspectorUserCollapsed`, and the persisted `rightPanelOpen` are exercised end
 * to end); useGraphStore is mocked to control the selection.
 *
 * Covers the reviewer's two required cases:
 *   1. "deselect → rail"        (no selection collapses the right panel)
 *   2. "user-collapsed → stays collapsed even on select"
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import type { BlockData } from "../../../data/types";

// ── Sub-component mocks (keep the tree light; we only assert panel state) ─────
vi.mock("../../canvas/ScriptEditor", () => ({ ScriptEditor: () => <div /> }));
vi.mock("../BusInspector", () => ({ BusInspector: () => <div data-testid="bus-inspector" /> }));
vi.mock("../NeuPromptModal", () => ({ NeuPromptModal: () => null }));
vi.mock("../LiveHealth", () => ({ LiveHealth: () => <div /> }));

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGetNodeParameters: vi.fn().mockResolvedValue({ parameters: [] }),
  nativeGraphSetNodeNote: vi.fn().mockResolvedValue({}),
  nativeSetNodeParameter: vi.fn().mockResolvedValue({}),
  nativePresetSnapshot: vi.fn().mockResolvedValue({}),
  nativePresetSwap: vi.fn().mockResolvedValue({}),
  nativePresetSave: vi.fn().mockResolvedValue({ ok: true }),
  nativePresetLoad: vi.fn().mockResolvedValue({}),
  nativePresetList: vi.fn().mockResolvedValue({ ok: true, presets: [] }),
}));
vi.mock("../../../bridge/nativePluginEditor", () => ({
  nativePluginEditorOpen: vi.fn().mockResolvedValue({}),
  nativePluginEditorClose: vi.fn().mockResolvedValue({}),
  nativePluginEditorFloat: vi.fn().mockResolvedValue({}),
  nativePluginEditorSetBounds: vi.fn().mockResolvedValue({}),
}));

// ── useGraphStore mock — we drive the SELECTION; everything else is inert ─────
let selNodeId: string | null = null;
let selEdgeId: string | null = null;
const selNode: BlockData | null = null;

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({
      nodes: [],
      edges: [],
      selectedNodeId: selNodeId,
      selectedEdgeId: selEdgeId,
      selectedNode: selNode,
      toggleBypass: vi.fn(),
      toggleMute: vi.fn(),
      toggleMuteInput: vi.fn(),
      setHiddenParams: vi.fn(),
      selectEdge: vi.fn(),
      selectNode: vi.fn(),
    }),
  ),
  selectSelectedNode: () => undefined,
  selectSelectedEdge: () => undefined,
  selectSelectedNodeId: (s: { selectedNodeId: string | null }) => s.selectedNodeId,
  selectSelectedEdgeId: (s: { selectedEdgeId: string | null }) => s.selectedEdgeId,
  selectNodes: (s: { nodes: unknown[] }) => s.nodes,
  selectEdges: (s: { edges: unknown[] }) => s.edges,
}));

// Inert peripheral stores (read-only reads in the resting view).
vi.mock("../../../stores/usePerformStore", () => ({
  usePerformStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({ sessionName: "P", liveHealth: { cpu: 0, latency: 0 } }),
  ),
  selectLiveHealth: (s: { liveHealth: unknown }) => s.liveHealth,
  selectSessionName: (s: { sessionName: string }) => s.sessionName,
}));
vi.mock("../../../stores/useEngineSnapshotStore", () => ({
  useEngineSnapshotStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({
      cpu: 0,
      sampleRate: 44100,
      bufferSize: 256,
      deviceName: "Dev",
      deviceLatencyInputMs: 0,
      deviceLatencyOutputMs: 0,
      hasHostData: true,
    }),
  ),
  selectCpuPercent: () => 0,
  selectSampleRate: (s: { sampleRate: number }) => s.sampleRate,
  selectBufferSize: (s: { bufferSize: number }) => s.bufferSize,
  selectDeviceName: (s: { deviceName: string }) => s.deviceName,
  selectDeviceLatencyMs: () => 0,
  selectHasHostData: () => true,
}));
vi.mock("../../../stores/useHostExtrasStore", () => ({
  useHostExtrasStore: vi.fn((sel: (s: unknown) => unknown) => sel({ logLines: [] })),
}));
vi.mock("../../../stores/useCableMeterStore", () => {
  const useCableMeterStore = Object.assign(
    vi.fn((sel: (s: unknown) => unknown) => sel({ levels: {} })),
    { subscribe: vi.fn(() => () => {}) },
  );
  return { useCableMeterStore };
});
vi.mock("../../../stores/useBusStore", () => ({
  useBusStore: vi.fn((sel?: (s: unknown) => unknown) => (sel ? sel({ cableBus: {} }) : {})),
}));

// ── Under test — the REAL useAppStore is exercised end to end ─────────────────
import { InspectorHub } from "../InspectorHub";
import { useAppStore } from "../../../stores/useAppStore";

function setSelection(nodeId: string | null, edgeId: string | null) {
  selNodeId = nodeId;
  selEdgeId = edgeId;
}

beforeEach(() => {
  setSelection(null, null);
  // Reset the real app store to its defaults each test (panel open, not
  // user-collapsed) so cases don't bleed into each other.
  useAppStore.setState({ rightPanelOpen: true, inspectorUserCollapsed: false });
});

describe("InspectorHub — selection-driven auto-collapse/expand (§4.3)", () => {
  it("no selection → collapses the right panel to the rail", () => {
    setSelection(null, null);
    render(<InspectorHub />);
    expect(useAppStore.getState().rightPanelOpen).toBe(false);
    // The auto-collapse must NOT be recorded as a deliberate user collapse.
    expect(useAppStore.getState().inspectorUserCollapsed).toBe(false);
  });

  it("selecting a Block → auto-expands the right panel", () => {
    // Start collapsed (e.g. came from an empty board), then a Block is selected.
    useAppStore.setState({ rightPanelOpen: false, inspectorUserCollapsed: false });
    setSelection("block-1", null);
    render(<InspectorHub />);
    expect(useAppStore.getState().rightPanelOpen).toBe(true);
  });

  it("selecting a Cable → auto-expands the right panel", () => {
    useAppStore.setState({ rightPanelOpen: false, inspectorUserCollapsed: false });
    setSelection(null, "edge-1");
    render(<InspectorHub />);
    expect(useAppStore.getState().rightPanelOpen).toBe(true);
  });

  it("user-collapsed → stays collapsed even when a Block is selected", () => {
    // The user deliberately collapsed the inspector (Cmd+2 / chevron).
    useAppStore.setState({ rightPanelOpen: false, inspectorUserCollapsed: true });
    setSelection("block-1", null);
    render(<InspectorHub />);
    // Auto-expand must NOT fight the explicit collapse, and must NOT clear the flag.
    expect(useAppStore.getState().rightPanelOpen).toBe(false);
    expect(useAppStore.getState().inspectorUserCollapsed).toBe(true);
  });

  it("user-collapsed → does NOT auto-collapse-or-touch state on deselect", () => {
    // If the user explicitly collapsed while something was selected, deselecting
    // leaves their flag + state intact (no fighting, no clearing).
    useAppStore.setState({ rightPanelOpen: false, inspectorUserCollapsed: true });
    setSelection(null, null);
    render(<InspectorHub />);
    expect(useAppStore.getState().rightPanelOpen).toBe(false);
    expect(useAppStore.getState().inspectorUserCollapsed).toBe(true);
  });
});
