/**
 * A1/F1 regression + G5 layout tests for the Block parameter list.
 *
 * F1 (CRITICAL): `p.name` is the display name; JUCE `label` is a UNIT string
 * ("dB", "Hz") and is routinely EMPTY. The old `(p.label ?? p.name)` precedence
 * let an empty-string label beat the real name, blanking every param row.
 * This exact case had ZERO coverage before this file.
 *
 * G5: sticky filter appears above 8 params; group-by-prefix above 12 params
 * with shared name prefixes.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { BlockData } from "../../../data/types";

// ── Sub-component mocks ───────────────────────────────────────────────────────

vi.mock("../ConnectionEditor", () => ({ ConnectionEditor: () => <div data-testid="connection-editor" /> }));
vi.mock("../../canvas/ScriptEditor", () => ({ ScriptEditor: () => <div data-testid="script-editor" /> }));
vi.mock("../BusInspector", () => ({ BusInspector: () => <div data-testid="bus-inspector" /> }));
vi.mock("../NeuPromptModal", () => ({ NeuPromptModal: () => null }));
vi.mock("../LiveHealth", () => ({ LiveHealth: () => <div data-testid="live-health" /> }));

// ── Bridge mocks ──────────────────────────────────────────────────────────────

const mockGetNodeParams = vi.fn().mockResolvedValue({ parameters: [] });

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGetNodeParameters: (...a: unknown[]) => mockGetNodeParams(...a),
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

// ── Store mocks ───────────────────────────────────────────────────────────────

let mockSelectedNode: BlockData | null = null;

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({
      nodes: mockSelectedNode ? [mockSelectedNode] : [],
      edges: [],
      selectedNodeId: mockSelectedNode?.id ?? null,
      selectedEdgeId: null,
      toggleBypass: vi.fn(),
      toggleMute: vi.fn(),
      toggleMuteInput: vi.fn(),
      selectEdge: vi.fn(),
      selectNode: vi.fn(),
    }),
  ),
  selectSelectedNode: (s: { selectedNodeId: string | null; nodes: BlockData[] }) =>
    s.selectedNodeId ? s.nodes.find((n) => n.id === s.selectedNodeId) : undefined,
  selectSelectedEdge: () => undefined,
  selectSelectedNodeId: (s: { selectedNodeId: string | null }) => s.selectedNodeId,
  selectSelectedEdgeId: (s: { selectedEdgeId: string | null }) => s.selectedEdgeId,
  selectNodes: (s: { nodes: unknown[] }) => s.nodes,
  selectEdges: (s: { edges: unknown[] }) => s.edges,
}));

vi.mock("../../../stores/usePerformStore", () => ({
  usePerformStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({ sessionName: "Demo", liveHealth: { cpu: 10, latency: 4 } }),
  ),
  selectLiveHealth: (s: { liveHealth: unknown }) => s.liveHealth,
  selectSessionName: (s: { sessionName: string }) => s.sessionName,
}));

vi.mock("../../../stores/useEngineSnapshotStore", () => ({
  useEngineSnapshotStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({
      cpu: 0.1,
      sampleRate: 48000,
      bufferSize: 256,
      deviceName: "Dev",
      hasHostData: true,
    }),
  ),
  selectCpuPercent: (s: { cpu: number }) => s.cpu * 100,
  selectSampleRate: (s: { sampleRate: number }) => s.sampleRate,
  selectBufferSize: (s: { bufferSize: number }) => s.bufferSize,
  selectDeviceName: (s: { deviceName: string }) => s.deviceName,
  selectDeviceLatencyMs: () => 4,
  selectHasHostData: (s: { hasHostData: boolean }) => s.hasHostData,
}));

vi.mock("../../../stores/useHostExtrasStore", () => ({
  useHostExtrasStore: vi.fn((sel: (s: unknown) => unknown) => sel({ logLines: [] })),
}));

vi.mock("../../../stores/useCableMeterStore", () => ({
  useCableMeterStore: vi.fn((sel: (s: unknown) => unknown) => sel({ levels: {} })),
}));

// ── Import under test ─────────────────────────────────────────────────────────

import { InspectorHub } from "../InspectorHub";

function makeBlock(overrides: Partial<BlockData> = {}): BlockData {
  return {
    id: "block-1",
    name: "Surge XT",
    category: "instrument",
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: [],
    bypassed: false,
    muted: false,
    muteInput: false,
    cpuLoad: 0,
    latencyMs: 0,
    note: "",
    error: false,
    isMacroTagged: false,
    ...overrides,
  } as BlockData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectedNode = makeBlock();
  mockGetNodeParams.mockResolvedValue({ parameters: [] });
});

// ── F1: name-first precedence ─────────────────────────────────────────────────

describe("BlockParameterList — F1 param naming regression", () => {
  it("renders the real NAME when label is an empty string (the F1 bug)", async () => {
    mockGetNodeParams.mockResolvedValue({
      parameters: [
        { index: 0, name: "Cutoff", label: "", value: 0.5, boolean: false },
      ],
    });
    render(<InspectorHub />);
    await waitFor(() => expect(screen.getByText("Cutoff")).toBeInTheDocument());
    expect(screen.getByRole("slider", { name: "Cutoff" })).toBeInTheDocument();
  });

  it("falls back to label, then Param N, when name is empty", async () => {
    mockGetNodeParams.mockResolvedValue({
      parameters: [
        { index: 0, name: "", label: "Resonance", value: 0.5, boolean: false },
        { index: 1, name: "", label: "", value: 0.5, boolean: false },
        { index: 2, name: "   ", label: "  ", value: 0.5, boolean: false },
      ],
    });
    render(<InspectorHub />);
    await waitFor(() =>
      expect(screen.getByText("Resonance")).toBeInTheDocument(),
    );
    expect(screen.getByText("Param 1")).toBeInTheDocument();
    // whitespace-only name AND label → still Param N, never a blank row
    expect(screen.getByText("Param 2")).toBeInTheDocument();
  });

  it("shows the JUCE label as a muted UNIT suffix next to the value", async () => {
    mockGetNodeParams.mockResolvedValue({
      parameters: [
        { index: 0, name: "Threshold", label: "dB", value: 0.5, boolean: false },
      ],
    });
    render(<InspectorHub />);
    await waitFor(() =>
      expect(screen.getByText("Threshold")).toBeInTheDocument(),
    );
    expect(screen.getByText("dB")).toBeInTheDocument();
  });

  it("does NOT duplicate the unit when label merely repeats the name", async () => {
    mockGetNodeParams.mockResolvedValue({
      parameters: [
        { index: 0, name: "Gain", label: "Gain", value: 0.5, boolean: false },
      ],
    });
    render(<InspectorHub />);
    await waitFor(() => expect(screen.getByText("Gain")).toBeInTheDocument());
    // exactly one "Gain" text node — the row label, no unit suffix
    expect(screen.getAllByText("Gain")).toHaveLength(1);
  });
});

// ── G5: filter + grouping ─────────────────────────────────────────────────────

function manyParams(n: number, prefixes: string[] = []) {
  return Array.from({ length: n }, (_, i) => {
    const prefix = prefixes.length > 0 ? prefixes[i % prefixes.length] : "";
    const name = prefix ? `${prefix} P${i}` : `Solo${i}`;
    return { index: i, name, label: "", value: 0.5, boolean: false };
  });
}

describe("BlockParameterList — G5 big-plugin layout", () => {
  it("shows NO filter input at ≤8 params", async () => {
    mockGetNodeParams.mockResolvedValue({ parameters: manyParams(8) });
    render(<InspectorHub />);
    await waitFor(() => expect(screen.getByText("Solo0")).toBeInTheDocument());
    expect(
      screen.queryByPlaceholderText(/filter .* parameters/i),
    ).not.toBeInTheDocument();
  });

  it("shows a filter input above 8 params and it narrows rows", async () => {
    mockGetNodeParams.mockResolvedValue({ parameters: manyParams(9) });
    render(<InspectorHub />);
    await waitFor(() => expect(screen.getByText("Solo0")).toBeInTheDocument());
    const filter = screen.getByPlaceholderText(/filter 9 parameters/i);
    fireEvent.change(filter, { target: { value: "Solo3" } });
    await waitFor(() => {
      expect(screen.getByText("Solo3")).toBeInTheDocument();
      expect(screen.queryByText("Solo0")).not.toBeInTheDocument();
    });
  });

  it("groups by shared name prefix above 12 params", async () => {
    mockGetNodeParams.mockResolvedValue({
      parameters: manyParams(16, ["Delay", "Mod"]),
    });
    render(<InspectorHub />);
    await waitFor(() => expect(screen.getByText("Delay")).toBeInTheDocument());
    expect(screen.getByText("Mod")).toBeInTheDocument();
    // group headers are collapsible
    const delayHeader = screen.getByText("Delay").closest("button");
    expect(delayHeader).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(delayHeader!);
    expect(delayHeader).toHaveAttribute("aria-expanded", "false");
    // the Delay family's first row is hidden once collapsed
    expect(screen.queryByText("Delay P0")).not.toBeInTheDocument();
  });

  it("does NOT group when names share no prefixes", async () => {
    mockGetNodeParams.mockResolvedValue({ parameters: manyParams(14) });
    render(<InspectorHub />);
    await waitFor(() => expect(screen.getByText("Solo0")).toBeInTheDocument());
    // no group headers — every row renders flat
    expect(screen.queryByText("Other")).not.toBeInTheDocument();
    expect(screen.getByText("Solo13")).toBeInTheDocument();
  });
});
