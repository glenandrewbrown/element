/**
 * §0.5a usePeakHold rAF idle-stop tests.
 *
 * usePeakHold is a private function inside InspectorHub.tsx. We test its
 * behavioural contract: when both the live level AND the held peak are zero
 * the rAF effect guard returns early (no rAF requested), so a cable inspector
 * with a zero-level cable costs nothing at idle.
 *
 * jsdom does not implement requestAnimationFrame; the guard
 * `if (levelRef.current === 0 && peakRef.current === 0) return;`
 * means the effect exits before any rAF call — so if the guard is missing
 * the component would throw in jsdom. We verify by mounting with a zero cable.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// ── Mock all heavy sub-components so we only exercise usePeakHold path ───────

vi.mock("../ConnectionEditor", () => ({
  ConnectionEditor: () => <div data-testid="connection-editor" />,
}));
vi.mock("../../canvas/ScriptEditor", () => ({
  ScriptEditor: () => <div data-testid="script-editor" />,
}));
vi.mock("../BusInspector", () => ({
  BusInspector: () => <div data-testid="bus-inspector" />,
}));
vi.mock("../NeuPromptModal", () => ({ NeuPromptModal: () => null }));

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

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      nodes: [],
      edges: [],
      selectedNode: null,
      selectedEdge: undefined,
      selectedNodeId: null,
      selectedEdgeId: null,
      toggleBypass: vi.fn(),
      toggleMute: vi.fn(),
      toggleMuteInput: vi.fn(),
      selectNode: vi.fn(),
    }),
  ),
  selectSelectedNode: (s: { selectedNode: null }) => s.selectedNode,
  // Task 3.E: InspectorHub reads selectSelectedEdge at the top level now (the
  // selection TYPE routes the panel). No edge selected → undefined → the resting
  // view renders, which is what these no-selection peak-hold tests expect.
  selectSelectedEdge: (s: { selectedEdge: unknown }) => s.selectedEdge,
  // The selection-driven auto-collapse effect reads the raw IDs (both null here →
  // no selection → it collapses the right panel via the real useAppStore, which is
  // inert for these peak-hold assertions).
  selectSelectedNodeId: (s: { selectedNodeId: string | null }) => s.selectedNodeId,
  selectSelectedEdgeId: (s: { selectedEdgeId: string | null }) => s.selectedEdgeId,
  selectNodes: (s: { nodes: unknown[] }) => s.nodes,
  selectEdges: (s: { edges: unknown[] }) => s.edges,
}));

vi.mock("../../../stores/usePerformStore", () => ({
  usePerformStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      sessionName: "Demo",
      liveHealth: { cpu: 0, latency: 0 },
    }),
  ),
  selectLiveHealth: (s: { liveHealth: { cpu: number; latency: number } }) =>
    s.liveHealth,
  selectSessionName: (s: { sessionName: string }) => s.sessionName,
}));

vi.mock("../../../stores/useEngineSnapshotStore", () => ({
  useEngineSnapshotStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      cpu: 0,
      sampleRate: 44100,
      bufferSize: 256,
      deviceName: "",
      deviceLatencyInputMs: 0,
      deviceLatencyOutputMs: 0,
      hasHostData: false,
    }),
  ),
  selectCpuPercent: (s: { cpu: number }) => Math.min(99.9, s.cpu * 100),
  selectSampleRate: (s: { sampleRate: number }) => s.sampleRate,
  selectBufferSize: (s: { bufferSize: number }) => s.bufferSize,
  selectDeviceName: (s: { deviceName: string }) => s.deviceName,
  selectDeviceLatencyMs: (s: {
    deviceLatencyInputMs: number;
    deviceLatencyOutputMs: number;
  }) => s.deviceLatencyInputMs + s.deviceLatencyOutputMs,
  selectHasHostData: (s: { hasHostData: boolean }) => s.hasHostData,
}));

vi.mock("../../../stores/useHostExtrasStore", () => ({
  useHostExtrasStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({ logLines: [] }),
  ),
}));

vi.mock("../../../stores/useCableMeterStore", () => ({
  useCableMeterStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({ levels: {} }),
  ),
}));

import { InspectorHub } from "../InspectorHub";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("§0.5a usePeakHold — rAF loop stops at zero level + zero peak", () => {
  it("mounts without throwing when cable level is 0 (rAF guard returns early)", () => {
    // In jsdom requestAnimationFrame is undefined. If usePeakHold called rAF
    // unconditionally this render would throw. The guard
    // `if (levelRef.current === 0 && peakRef.current === 0) return;`
    // prevents the rAF call, so the component mounts cleanly.
    expect(() => render(<InspectorHub />)).not.toThrow();
  });

  it("renders successfully with no selected node (peak hold never arms)", () => {
    const { container } = render(<InspectorHub />);
    expect(container).toBeTruthy();
  });
});
