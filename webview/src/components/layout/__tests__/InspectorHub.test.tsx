/**
 * Tests for <InspectorHub /> — the right-panel inspector with tabs.
 *
 * Heavy component: mocks all bridge calls, child panels, and stores so tests
 * stay fast and deterministic. Focus areas:
 *   - Tab set (no SCRIPT tab for non-script nodes; SCRIPT tab for script nodes)
 *   - Empty state (no block selected → ProjectOverview)
 *   - Block selected → header, bypass/mute controls
 *   - Tab switching
 *   - effectiveTab fallback when script tab active but non-script block selected
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { BlockData } from "../../../data/types";

// ── Mock sub-components ──────────────────────────────────────────────────────

vi.mock("../ConnectionEditor", () => ({ ConnectionEditor: () => <div data-testid="connection-editor" /> }));
vi.mock("../../canvas/ScriptEditor", () => ({ ScriptEditor: () => <div data-testid="script-editor" /> }));
vi.mock("../BusInspector", () => ({ BusInspector: () => <div data-testid="bus-inspector" /> }));
vi.mock("../NeuPromptModal", () => ({ NeuPromptModal: () => null }));

// ── Mock bridge ──────────────────────────────────────────────────────────────

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

// ── Mock stores ──────────────────────────────────────────────────────────────

const mockToggleBypass = vi.fn();
const mockToggleMute = vi.fn();
const mockToggleMuteInput = vi.fn();

let mockSelectedNode: BlockData | null = null;

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      nodes: [],
      edges: [],
      zoomTier: "normal",
      selectedNodeId: null,
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
      sessionName: "Test Project",
      liveHealth: "ok",
      transportState: "stopped",
    }),
  ),
  selectLiveHealth: (s: { liveHealth: string }) => s.liveHealth,
  selectSessionName: (s: { sessionName: string }) => s.sessionName,
}));

vi.mock("../../../stores/useEngineSnapshotStore", () => ({
  useEngineSnapshotStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      cpuPercent: 12,
      sampleRate: 48000,
      bufferSize: 256,
      deviceName: "CoreAudio",
      deviceLatencyMs: 5.3,
      hasHostData: true,
    }),
  ),
  selectCpuPercent: (s: { cpuPercent: number }) => s.cpuPercent,
  selectSampleRate: (s: { sampleRate: number }) => s.sampleRate,
  selectBufferSize: (s: { bufferSize: number }) => s.bufferSize,
  selectDeviceName: (s: { deviceName: string }) => s.deviceName,
  selectDeviceLatencyMs: (s: { deviceLatencyMs: number }) => s.deviceLatencyMs,
  selectHasHostData: (s: { hasHostData: boolean }) => s.hasHostData,
}));

vi.mock("../../../stores/useHostExtrasStore", () => ({
  useHostExtrasStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({ molecules: [], graphOutline: [] }),
  ),
}));

vi.mock("../../../stores/useCableMeterStore", () => ({
  useCableMeterStore: vi.fn(() => ({})),
}));

import { InspectorHub } from "../InspectorHub";
import { useGraphStore } from "../../../stores/useGraphStore";

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
    cpuLoad: 2.5,
    latencyMs: 0,
    note: "",
    ...overrides,
  } as BlockData;
}

function setSelectedNode(node: BlockData | null) {
  mockSelectedNode = node;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(useGraphStore).mockImplementation((selector: any) =>
    selector({
      nodes: node ? [node] : [],
      edges: [],
      zoomTier: "normal",
      selectedNode: node,
      toggleBypass: mockToggleBypass,
      toggleMute: mockToggleMute,
      toggleMuteInput: mockToggleMuteInput,
    }),
  );
}

beforeEach(() => {
  mockSelectedNode = null;
  setSelectedNode(null);
  mockToggleBypass.mockClear();
  mockToggleMute.mockClear();
  mockToggleMuteInput.mockClear();
});

describe("<InspectorHub />", () => {
  // ── Tab set ────────────────────────────────────────────────────────────────

  it("renders INSPECTOR, CABLES, LOG, METERS tabs always", () => {
    render(<InspectorHub />);
    expect(screen.getByRole("button", { name: /inspector/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cables/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /meters/i })).toBeInTheDocument();
  });

  it("hides SCRIPT tab for non-script block", () => {
    setSelectedNode(makeBlock({ name: "Surge XT", format: "VST3" }));
    render(<InspectorHub />);
    expect(screen.queryByRole("button", { name: /script/i })).not.toBeInTheDocument();
  });

  it("shows SCRIPT tab for script node (name contains 'script')", () => {
    setSelectedNode(makeBlock({ name: "My Script" }));
    render(<InspectorHub />);
    expect(screen.getByRole("button", { name: /script/i })).toBeInTheDocument();
  });

  it("shows SCRIPT tab for internal Script node (format=INT, name=Script)", () => {
    setSelectedNode(makeBlock({ name: "Script", format: "INT" }));
    render(<InspectorHub />);
    expect(screen.getByRole("button", { name: /script/i })).toBeInTheDocument();
  });

  it("hides SCRIPT tab when no block selected", () => {
    render(<InspectorHub />);
    expect(screen.queryByRole("button", { name: /script/i })).not.toBeInTheDocument();
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  it("shows BusInspector when no block selected", () => {
    render(<InspectorHub />);
    expect(screen.getByTestId("bus-inspector")).toBeInTheDocument();
  });

  it("does not show bypass/mute buttons when no block selected", () => {
    render(<InspectorHub />);
    expect(screen.queryByRole("button", { name: /bypass/i })).not.toBeInTheDocument();
  });

  // ── Block selected ─────────────────────────────────────────────────────────

  it("shows block name when a block is selected", () => {
    setSelectedNode(makeBlock({ name: "Pro-Q 3" }));
    render(<InspectorHub />);
    expect(screen.getByText("Pro-Q 3")).toBeInTheDocument();
  });

  it("shows BYPASS button when block selected", () => {
    setSelectedNode(makeBlock());
    render(<InspectorHub />);
    expect(screen.getByRole("button", { name: /bypass/i })).toBeInTheDocument();
  });

  it("shows MUTE button when block selected", () => {
    setSelectedNode(makeBlock());
    render(<InspectorHub />);
    expect(screen.getByRole("button", { name: /^mute$/i })).toBeInTheDocument();
  });

  it("calls toggleBypass with block id on BYPASS click", () => {
    setSelectedNode(makeBlock({ id: "blk-42" }));
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("button", { name: /bypass/i }));
    expect(mockToggleBypass).toHaveBeenCalledWith("blk-42");
  });

  it("calls toggleMute with block id on MUTE click", () => {
    setSelectedNode(makeBlock({ id: "blk-7" }));
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("button", { name: /^mute$/i }));
    expect(mockToggleMute).toHaveBeenCalledWith("blk-7");
  });

  it("shows BYPASSED label when block is bypassed", () => {
    setSelectedNode(makeBlock({ bypassed: true }));
    render(<InspectorHub />);
    expect(screen.getByRole("button", { name: /bypassed/i })).toBeInTheDocument();
  });

  it("shows MUTED label when block is muted", () => {
    setSelectedNode(makeBlock({ muted: true }));
    render(<InspectorHub />);
    expect(screen.getByRole("button", { name: /muted/i })).toBeInTheDocument();
  });

  // ── Tab switching ──────────────────────────────────────────────────────────

  it("switches to CABLES tab on click", () => {
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("button", { name: /cables/i }));
    expect(screen.getByTestId("connection-editor")).toBeInTheDocument();
  });

  it("renders ScriptEditor when SCRIPT tab active", () => {
    setSelectedNode(makeBlock({ name: "Script", format: "INT" }));
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("button", { name: /script/i }));
    expect(screen.getByTestId("script-editor")).toBeInTheDocument();
  });

  // ── effectiveTab fallback ──────────────────────────────────────────────────

  it("falls back to inspector tab when script tab selected but block is no longer script", async () => {
    setSelectedNode(makeBlock({ name: "Script", format: "INT" }));
    const { rerender } = render(<InspectorHub />);
    fireEvent.click(screen.getByRole("button", { name: /script/i }));
    expect(screen.getByTestId("script-editor")).toBeInTheDocument();

    // Now switch to non-script block — script tab should disappear, inspector shown
    setSelectedNode(makeBlock({ name: "Surge XT", format: "VST3" }));
    rerender(<InspectorHub />);
    expect(screen.queryByTestId("script-editor")).not.toBeInTheDocument();
    expect(screen.getByText("Surge XT")).toBeInTheDocument();
  });

  // ── Metrics ────────────────────────────────────────────────────────────────

  it("shows cpu load in block metrics", () => {
    setSelectedNode(makeBlock({ cpuLoad: 7.3 }));
    render(<InspectorHub />);
    expect(screen.getByText("7.3%")).toBeInTheDocument();
  });

  it("shows em dash for zero latency", () => {
    setSelectedNode(makeBlock({ latencyMs: 0 }));
    render(<InspectorHub />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows latency in ms when non-zero", () => {
    setSelectedNode(makeBlock({ latencyMs: 2.1 }));
    render(<InspectorHub />);
    expect(screen.getByText("2.1 ms")).toBeInTheDocument();
  });
});
