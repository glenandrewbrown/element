/**
 * InspectorHub gaps — covers paths not exercised in InspectorHub.test.tsx:
 *   - ProjectOverview engine-stat labels (SAMPLE RATE, BUFFER, DEVICE, etc.)
 *   - LogPanel empty state + with log lines
 *   - MetersPanel host section + cable count
 *   - BlockNoteEditor textarea renders block.note; typing works
 *   - PluginEditorControls visible for VST3 block; absent for INT
 *   - muteInput button + toggleMuteInput
 *   - PresetStrip A/B buttons visible when block selected
 *   - formatParamDisplay via BlockParameterList (boolean + range params)
 *   - BlockParameterList loading state → resolves to param rows
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { BlockData } from "../../../data/types";

// ── Mock sub-components ──────────────────────────────────────────────────────

vi.mock("../ConnectionEditor", () => ({ ConnectionEditor: () => <div data-testid="connection-editor" /> }));
vi.mock("../../canvas/ScriptEditor", () => ({ ScriptEditor: () => <div data-testid="script-editor" /> }));
vi.mock("../BusInspector", () => ({ BusInspector: () => <div data-testid="bus-inspector" /> }));
vi.mock("../NeuPromptModal", () => ({ NeuPromptModal: () => null }));

// ── Mock bridge ──────────────────────────────────────────────────────────────

const { mockGetNodeParams, mockPresetList } = vi.hoisted(() => ({
  mockGetNodeParams: vi.fn().mockResolvedValue({ parameters: [] }),
  mockPresetList: vi.fn().mockResolvedValue({ ok: true, presets: [] }),
}));

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGetNodeParameters: mockGetNodeParams,
  nativeGraphSetNodeNote: vi.fn().mockResolvedValue({}),
  nativeSetNodeParameter: vi.fn().mockResolvedValue({}),
  nativePresetSnapshot: vi.fn().mockResolvedValue({}),
  nativePresetSwap: vi.fn().mockResolvedValue({}),
  nativePresetSave: vi.fn().mockResolvedValue({ ok: true }),
  nativePresetLoad: vi.fn().mockResolvedValue({}),
  nativePresetList: mockPresetList,
}));

vi.mock("../../../bridge/nativePluginEditor", () => ({
  nativePluginEditorOpen: vi.fn().mockResolvedValue({}),
  nativePluginEditorClose: vi.fn().mockResolvedValue({}),
  nativePluginEditorFloat: vi.fn().mockResolvedValue({}),
  nativePluginEditorSetBounds: vi.fn().mockResolvedValue({}),
}));

// ── Mock stores ──────────────────────────────────────────────────────────────

const mockToggleMuteInput = vi.fn();
const mockToggleBypass = vi.fn();
const mockToggleMute = vi.fn();

let mockSelectedNode: BlockData | null = null;
let mockLogLines: string[] = [];
let mockCableLevels: Record<string, number> = {};

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      nodes: mockSelectedNode ? [mockSelectedNode] : [],
      edges: [],
      selectedNode: mockSelectedNode,
      toggleBypass: mockToggleBypass,
      toggleMute: mockToggleMute,
      toggleMuteInput: mockToggleMuteInput,
    }),
  ),
  selectSelectedNode: (s: { selectedNode: BlockData | null }) => s.selectedNode,
  selectNodes: (s: { nodes: unknown[] }) => s.nodes,
  selectEdges: (s: { edges: unknown[] }) => s.edges,
}));

vi.mock("../../../stores/usePerformStore", () => ({
  usePerformStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      sessionName: "Demo Project",
      liveHealth: { cpu: 23.5, latency: 4.2 },
    }),
  ),
  selectLiveHealth: (s: { liveHealth: { cpu: number; latency: number } }) => s.liveHealth,
  selectSessionName: (s: { sessionName: string }) => s.sessionName,
}));

vi.mock("../../../stores/useEngineSnapshotStore", () => ({
  useEngineSnapshotStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      cpu: 0.235,
      sampleRate: 44100,
      bufferSize: 256,
      deviceName: "Fireface 802",
      deviceLatencyInputMs: 2.0,
      deviceLatencyOutputMs: 2.0,
      hasHostData: true,
    }),
  ),
  selectCpuPercent: (s: { cpu: number }) => Math.min(99.9, s.cpu * 100),
  selectSampleRate: (s: { sampleRate: number }) => s.sampleRate,
  selectBufferSize: (s: { bufferSize: number }) => s.bufferSize,
  selectDeviceName: (s: { deviceName: string }) => s.deviceName,
  selectDeviceLatencyMs: (s: { deviceLatencyInputMs: number; deviceLatencyOutputMs: number }) =>
    s.deviceLatencyInputMs + s.deviceLatencyOutputMs,
  selectHasHostData: (s: { hasHostData: boolean }) => s.hasHostData,
}));

vi.mock("../../../stores/useHostExtrasStore", () => ({
  useHostExtrasStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({ logLines: mockLogLines }),
  ),
}));

vi.mock("../../../stores/useCableMeterStore", () => ({
  useCableMeterStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({ levels: mockCableLevels }),
  ),
}));

import { InspectorHub } from "../InspectorHub";
import { useGraphStore } from "../../../stores/useGraphStore";
import { useHostExtrasStore } from "../../../stores/useHostExtrasStore";
import { useCableMeterStore } from "../../../stores/useCableMeterStore";
import { usePerformStore } from "../../../stores/usePerformStore";

function makeBlock(overrides: Partial<BlockData> = {}): BlockData {
  return {
    id: "block-1",
    name: "Surge XT",
    category: "instrument",
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: [
      { id: "in-0", label: "L", direction: "input", type: "audio", connected: false },
      { id: "out-0", label: "L", direction: "output", type: "audio", connected: false },
    ],
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

function setSelected(node: BlockData | null) {
  mockSelectedNode = node;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(useGraphStore).mockImplementation((selector: any) =>
    selector({
      nodes: node ? [node] : [],
      edges: [],
      selectedNode: node,
      toggleBypass: mockToggleBypass,
      toggleMute: mockToggleMute,
      toggleMuteInput: mockToggleMuteInput,
    }),
  );
}

function setLogLines(lines: string[]) {
  mockLogLines = lines;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(useHostExtrasStore).mockImplementation((selector: any) =>
    selector({ logLines: lines }),
  );
}

function setCableLevels(levels: Record<string, number>) {
  mockCableLevels = levels;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(useCableMeterStore).mockImplementation((selector: any) =>
    selector({ levels }),
  );
}

beforeEach(() => {
  mockSelectedNode = null;
  mockLogLines = [];
  mockCableLevels = {};
  mockToggleMuteInput.mockClear();
  mockToggleBypass.mockClear();
  mockToggleMute.mockClear();
  mockGetNodeParams.mockResolvedValue({ parameters: [] });
  mockPresetList.mockResolvedValue({ ok: true, presets: [] });
  setSelected(null);
});

describe("<InspectorHub /> (gaps)", () => {
  // ── ProjectOverview ──────────────────────────────────────────────────────────

  it("shows BLOCKS and CABLES counts in ProjectOverview (no block selected)", () => {
    render(<InspectorHub />);
    expect(screen.getByText("BLOCKS")).toBeInTheDocument();
    expect(screen.getByText("CABLES")).toBeInTheDocument();
  });

  it("shows SAMPLE RATE label in ProjectOverview", () => {
    render(<InspectorHub />);
    expect(screen.getByText("SAMPLE RATE")).toBeInTheDocument();
    expect(screen.getByText("44.1 kHz")).toBeInTheDocument();
  });

  it("shows BUFFER label in ProjectOverview", () => {
    render(<InspectorHub />);
    expect(screen.getByText("BUFFER")).toBeInTheDocument();
    expect(screen.getByText("256 smp")).toBeInTheDocument();
  });

  it("shows DEVICE label with device name in ProjectOverview", () => {
    render(<InspectorHub />);
    expect(screen.getByText("DEVICE")).toBeInTheDocument();
    expect(screen.getByText("Fireface 802")).toBeInTheDocument();
  });

  it("shows project name in ProjectOverview", () => {
    render(<InspectorHub />);
    expect(screen.getByText("Demo Project")).toBeInTheDocument();
  });

  // ── LogPanel ─────────────────────────────────────────────────────────────────

  it("LOG tab: shows empty state text when no log lines", () => {
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("button", { name: /log/i }));
    expect(screen.getByText(/no log lines yet/i)).toBeInTheDocument();
  });

  it("LOG tab: renders log lines when present", () => {
    setLogLines(["[INFO] Engine started", "[WARN] Buffer underrun"]);
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("button", { name: /log/i }));
    expect(screen.getByText("[INFO] Engine started")).toBeInTheDocument();
    expect(screen.getByText("[WARN] Buffer underrun")).toBeInTheDocument();
  });

  it("LOG tab: caps display at 300 lines (tail)", () => {
    const lines = Array.from({ length: 350 }, (_, i) => `line-${i}`);
    setLogLines(lines);
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("button", { name: /log/i }));
    // First 50 lines should NOT be in the DOM (only last 300 are shown)
    expect(screen.queryByText("line-0")).not.toBeInTheDocument();
    expect(screen.getByText("line-349")).toBeInTheDocument();
  });

  // ── MetersPanel ──────────────────────────────────────────────────────────────

  it("METERS tab: renders Host section with CPU", () => {
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("button", { name: /meters/i }));
    expect(screen.getByText("Host")).toBeInTheDocument();
    expect(screen.getByText("CPU est.")).toBeInTheDocument();
    expect(screen.getByText(/23\.5%/)).toBeInTheDocument();
  });

  it("METERS tab: shows device latency", () => {
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("button", { name: /meters/i }));
    expect(screen.getByText("Device latency")).toBeInTheDocument();
    expect(screen.getByText(/4\.2 ms/)).toBeInTheDocument();
  });

  it("METERS tab: shows smart cable channel count from useCableMeterStore", () => {
    setCableLevels({ "cable-1": 0.5, "cable-2": 0.8 });
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("button", { name: /meters/i }));
    expect(screen.getByText(/smart cables: 2/i)).toBeInTheDocument();
  });

  it("METERS tab: zero latency shows em dash", () => {
    // liveHealth.latency = 0 → "—"
    vi.mocked(useGraphStore); // already selected=null, health.latency needed via usePerformStore
    // The mock has latency: 4.2, patch for this test:
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(usePerformStore).mockImplementationOnce((sel: any) =>
      sel({ sessionName: "P", liveHealth: { cpu: 0, latency: 0 } }),
    );
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("button", { name: /meters/i }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  // ── BlockNoteEditor ──────────────────────────────────────────────────────────

  it("shows notes textarea with block.note value when block selected", () => {
    setSelected(makeBlock({ note: "Needs gain staging" }));
    render(<InspectorHub />);
    const textarea = screen.getByPlaceholderText(/add a note/i);
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue("Needs gain staging");
  });

  it("typing in notes textarea updates the input value", () => {
    setSelected(makeBlock({ note: "" }));
    render(<InspectorHub />);
    const textarea = screen.getByPlaceholderText(/add a note/i);
    fireEvent.change(textarea, { target: { value: "New note" } });
    expect(textarea).toHaveValue("New note");
  });

  // ── PluginEditorControls ─────────────────────────────────────────────────────

  it("shows Plugin window section for VST3 block", () => {
    setSelected(makeBlock({ format: "VST3" }));
    render(<InspectorHub />);
    expect(screen.getByText(/plugin window/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /embed in shell/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /float window/i })).toBeInTheDocument();
  });

  it("does NOT show Plugin window section for INT (built-in) block", () => {
    setSelected(makeBlock({ format: "INT", name: "Script" }));
    render(<InspectorHub />);
    expect(screen.queryByText(/plugin window/i)).not.toBeInTheDocument();
  });

  // ── muteInput button ─────────────────────────────────────────────────────────

  it("shows MUTE INPUTS button when block selected", () => {
    setSelected(makeBlock({ muteInput: false }));
    render(<InspectorHub />);
    expect(screen.getByRole("button", { name: /mute inputs/i })).toBeInTheDocument();
  });

  it("calls toggleMuteInput on MUTE INPUTS click", () => {
    setSelected(makeBlock({ id: "blk-99", muteInput: false }));
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("button", { name: /mute inputs/i }));
    expect(mockToggleMuteInput).toHaveBeenCalledWith("blk-99");
  });

  it("shows IN MUTED label when muteInput=true", () => {
    setSelected(makeBlock({ muteInput: true }));
    render(<InspectorHub />);
    expect(screen.getByRole("button", { name: /in muted/i })).toBeInTheDocument();
  });

  // ── PresetStrip ──────────────────────────────────────────────────────────────

  it("shows Presets section with A, B buttons when block selected", () => {
    setSelected(makeBlock());
    render(<InspectorHub />);
    expect(screen.getByText("Presets")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "B" })).toBeInTheDocument();
  });

  it("shows Save… and Load… buttons in PresetStrip", () => {
    setSelected(makeBlock());
    render(<InspectorHub />);
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load/i })).toBeInTheDocument();
  });

  // ── BlockParameterList (async) ────────────────────────────────────────────────

  it("shows 'Loading parameters…' while params are fetching", () => {
    // Never resolve so we can see the loading state
    mockGetNodeParams.mockReturnValue(new Promise(() => {}));
    setSelected(makeBlock());
    render(<InspectorHub />);
    expect(screen.getByText(/loading parameters/i)).toBeInTheDocument();
  });

  it("shows 'No automatable parameters' when param list is empty", async () => {
    mockGetNodeParams.mockResolvedValue({ parameters: [] });
    setSelected(makeBlock());
    render(<InspectorHub />);
    await waitFor(() =>
      expect(screen.getByText(/no automatable parameters/i)).toBeInTheDocument(),
    );
  });

  it("renders boolean param as ON/OFF button pair", async () => {
    mockGetNodeParams.mockResolvedValue({
      parameters: [
        { index: 0, name: "Active", label: "Active", value: 0.8, boolean: true },
      ],
    });
    setSelected(makeBlock());
    render(<InspectorHub />);
    await waitFor(() => expect(screen.getByText("Active")).toBeInTheDocument());
    // value ≥ 0.5 → "ON"
    expect(screen.getByRole("button", { name: /^on$/i })).toBeInTheDocument();
  });

  it("renders boolean param as OFF when value < 0.5", async () => {
    mockGetNodeParams.mockResolvedValue({
      parameters: [
        { index: 0, name: "Gate", label: "Gate", value: 0.2, boolean: true },
      ],
    });
    setSelected(makeBlock());
    render(<InspectorHub />);
    await waitFor(() => expect(screen.getByText("Gate")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^off$/i })).toBeInTheDocument();
  });

  it("renders range param with a range input slider", async () => {
    mockGetNodeParams.mockResolvedValue({
      parameters: [
        { index: 1, name: "Gain", label: "Gain", value: 0.5, min: 0, max: 2, boolean: false },
      ],
    });
    setSelected(makeBlock());
    render(<InspectorHub />);
    await waitFor(() => expect(screen.getByText("Gain")).toBeInTheDocument());
    expect(screen.getByRole("slider", { name: "Gain" })).toBeInTheDocument();
  });

  it("renders stepped param display as rounded integer", async () => {
    mockGetNodeParams.mockResolvedValue({
      parameters: [
        { index: 2, name: "Mode", label: "Mode", value: 0.5, min: 0, max: 4, stepped: true, boolean: false },
      ],
    });
    setSelected(makeBlock());
    render(<InspectorHub />);
    await waitFor(() => expect(screen.getByText("Mode")).toBeInTheDocument());
    // value=0.5, min=0, max=4 → v = 0 + 0.5 * 4 = 2 → stepped → "2"
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("Refresh parameters button triggers reload", async () => {
    mockGetNodeParams.mockResolvedValue({ parameters: [] });
    setSelected(makeBlock());
    render(<InspectorHub />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
    const refreshBtn = screen.getByRole("button", { name: /refresh parameters/i });
    fireEvent.click(refreshBtn);
    expect(mockGetNodeParams).toHaveBeenCalledTimes(2);
  });
});
