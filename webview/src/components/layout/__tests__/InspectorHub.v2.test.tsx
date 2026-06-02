/**
 * InspectorHub v2 — aligned to current 4-tab BLOCK/BUS/CABLE/HEALTH API.
 *
 * The quarantined gap tests looked for "LOG"/"METERS" tab buttons that no
 * longer exist. This file tests the live shell:
 *   - 4 tabs render with correct roles/labels
 *   - BLOCK tab: ProjectOverview (no block), BlockTabBody (block selected)
 *   - HEALTH tab: Engine vitals / Host meters / Engine log sub-sections
 *   - BUS tab: delegates to BusInspector
 *   - CABLE tab: CableOverview when no edge selected
 *   - InspectorSection collapse/expand
 *   - ProjectOverview engine-stat fields
 *   - LogPanel empty vs. with lines (under HEALTH tab)
 *   - MetersPanel cable count (under HEALTH tab)
 *   - BlockNoteEditor textarea
 *   - muteInput button / toggleMuteInput
 *   - PluginEditorControls visibility (INT vs VST3)
 *   - formatParamDisplay: boolean ON/OFF, range slider, stepped integer
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { BlockData } from "../../../data/types";

// ── Sub-component mocks ───────────────────────────────────────────────────────

vi.mock("../ConnectionEditor", () => ({ ConnectionEditor: () => <div data-testid="connection-editor" /> }));
vi.mock("../../canvas/ScriptEditor", () => ({ ScriptEditor: () => <div data-testid="script-editor" /> }));
vi.mock("../BusInspector",           () => ({ BusInspector: (p: { onOpenBlock: unknown }) => <div data-testid="bus-inspector" data-has-open={String(!!p.onOpenBlock)} /> }));
vi.mock("../NeuPromptModal",         () => ({ NeuPromptModal: () => null }));
vi.mock("../LiveHealth",             () => ({ LiveHealth: () => <div data-testid="live-health" /> }));

// ── Bridge mocks ──────────────────────────────────────────────────────────────

const mockGetNodeParams = vi.fn().mockResolvedValue({ parameters: [] });

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGetNodeParameters:  (...a: unknown[]) => mockGetNodeParams(...a),
  nativeGraphSetNodeNote:   vi.fn().mockResolvedValue({}),
  nativeSetNodeParameter:   vi.fn().mockResolvedValue({}),
  nativePresetSnapshot:     vi.fn().mockResolvedValue({}),
  nativePresetSwap:         vi.fn().mockResolvedValue({}),
  nativePresetSave:         vi.fn().mockResolvedValue({ ok: true }),
  nativePresetLoad:         vi.fn().mockResolvedValue({}),
  nativePresetList:         vi.fn().mockResolvedValue({ ok: true, presets: [] }),
}));

vi.mock("../../../bridge/nativePluginEditor", () => ({
  nativePluginEditorOpen:      vi.fn().mockResolvedValue({}),
  nativePluginEditorClose:     vi.fn().mockResolvedValue({}),
  nativePluginEditorFloat:     vi.fn().mockResolvedValue({}),
  nativePluginEditorSetBounds: vi.fn().mockResolvedValue({}),
}));

// ── Store mocks ───────────────────────────────────────────────────────────────

const mockToggleBypass    = vi.fn();
const mockToggleMute      = vi.fn();
const mockToggleMuteInput = vi.fn();
const mockSelectEdge      = vi.fn();
const mockSelectNode      = vi.fn();

let mockSelectedNode: BlockData | null = null;
let mockEdges: unknown[]  = [];
let mockLogLines: string[] = [];
let mockCableLevels: Record<string, number> = {};

vi.mock("../../../stores/useGraphStore", () => ({
  useGraphStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({
      nodes: mockSelectedNode ? [mockSelectedNode] : [],
      edges: mockEdges,
      selectedNodeId: mockSelectedNode?.id ?? null,
      selectedEdgeId: null,
      toggleBypass:    mockToggleBypass,
      toggleMute:      mockToggleMute,
      toggleMuteInput: mockToggleMuteInput,
      selectEdge:      mockSelectEdge,
      selectNode:      mockSelectNode,
    }),
  ),
  selectSelectedNode: (s: { selectedNodeId: string | null; nodes: BlockData[] }) =>
    s.selectedNodeId ? s.nodes.find((n) => n.id === s.selectedNodeId) : undefined,
  selectSelectedEdge: (s: { selectedEdgeId: string | null; edges: unknown[] }) =>
    s.selectedEdgeId ? (s.edges as Array<{ id: string }>).find((e) => e.id === s.selectedEdgeId) : undefined,
  selectNodes:        (s: { nodes: unknown[] })                => s.nodes,
  selectEdges:        (s: { edges: unknown[] })                => s.edges,
}));

vi.mock("../../../stores/usePerformStore", () => ({
  usePerformStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({ sessionName: "Demo Project", liveHealth: { cpu: 23.5, latency: 4.2 } }),
  ),
  selectLiveHealth:   (s: { liveHealth: { cpu: number; latency: number } }) => s.liveHealth,
  selectSessionName:  (s: { sessionName: string })                          => s.sessionName,
}));

vi.mock("../../../stores/useEngineSnapshotStore", () => ({
  useEngineSnapshotStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({
      cpu: 0.235,
      sampleRate: 44100,
      bufferSize: 256,
      deviceName: "Fireface 802",
      deviceLatencyInputMs: 2.0,
      deviceLatencyOutputMs: 2.0,
      hasHostData: true,
    }),
  ),
  selectCpuPercent:       (s: { cpu: number })                   => Math.min(99.9, s.cpu * 100),
  selectSampleRate:       (s: { sampleRate: number })            => s.sampleRate,
  selectBufferSize:       (s: { bufferSize: number })            => s.bufferSize,
  selectDeviceName:       (s: { deviceName: string })            => s.deviceName,
  selectDeviceLatencyMs:  (s: { deviceLatencyInputMs: number; deviceLatencyOutputMs: number }) =>
    s.deviceLatencyInputMs + s.deviceLatencyOutputMs,
  selectHasHostData:      (s: { hasHostData: boolean })          => s.hasHostData,
}));

vi.mock("../../../stores/useHostExtrasStore", () => ({
  useHostExtrasStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({ logLines: mockLogLines }),
  ),
}));

vi.mock("../../../stores/useCableMeterStore", () => ({
  useCableMeterStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({ levels: mockCableLevels }),
  ),
}));

// ── Import under test ─────────────────────────────────────────────────────────

import { InspectorHub } from "../InspectorHub";
import { useGraphStore }        from "../../../stores/useGraphStore";
import { useHostExtrasStore }   from "../../../stores/useHostExtrasStore";
import { useCableMeterStore }   from "../../../stores/useCableMeterStore";
import { usePerformStore }      from "../../../stores/usePerformStore";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBlock(overrides: Partial<BlockData> = {}): BlockData {
  return {
    id: "block-1",
    name: "Surge XT",
    category: "instrument",
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: [
      { id: "in-0",  label: "L", direction: "input",  type: "audio", connected: false },
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
  vi.mocked(useGraphStore).mockImplementation((sel: any) =>
    sel({
      nodes: node ? [node] : [],
      edges: mockEdges,
      selectedNodeId: node?.id ?? null,
      selectedEdgeId: null,
      toggleBypass:    mockToggleBypass,
      toggleMute:      mockToggleMute,
      toggleMuteInput: mockToggleMuteInput,
      selectEdge:      mockSelectEdge,
      selectNode:      mockSelectNode,
    }),
  );
}

function setLogLines(lines: string[]) {
  mockLogLines = lines;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(useHostExtrasStore).mockImplementation((sel: any) =>
    sel({ logLines: lines }),
  );
}

function setCableLevels(levels: Record<string, number>) {
  mockCableLevels = levels;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(useCableMeterStore).mockImplementation((sel: any) =>
    sel({ levels }),
  );
}

beforeEach(() => {
  mockSelectedNode = null;
  mockEdges        = [];
  mockLogLines     = [];
  mockCableLevels  = {};
  mockToggleBypass.mockClear();
  mockToggleMute.mockClear();
  mockToggleMuteInput.mockClear();
  mockGetNodeParams.mockResolvedValue({ parameters: [] });
  setSelected(null);
});

// ── Tab shell ─────────────────────────────────────────────────────────────────

describe("<InspectorHub /> — tab shell", () => {
  it("renders a tablist with accessible label", () => {
    render(<InspectorHub />);
    expect(screen.getByRole("tablist", { name: /inspector sections/i })).toBeInTheDocument();
  });

  it("renders 4 tabs: BLOCK, BUS, CABLE, HEALTH", () => {
    render(<InspectorHub />);
    expect(screen.getByRole("tab", { name: /^block$/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^bus$/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^cable$/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^health$/i })).toBeInTheDocument();
  });

  it("BLOCK tab is selected by default", () => {
    render(<InspectorHub />);
    expect(screen.getByRole("tab", { name: /^block$/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /^bus$/i })).toHaveAttribute("aria-selected", "false");
  });

  it("clicking BUS tab makes it selected", () => {
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("tab", { name: /^bus$/i }));
    expect(screen.getByRole("tab", { name: /^bus$/i })).toHaveAttribute("aria-selected", "true");
  });

  it("clicking HEALTH tab makes it selected", () => {
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("tab", { name: /^health$/i }));
    expect(screen.getByRole("tab", { name: /^health$/i })).toHaveAttribute("aria-selected", "true");
  });
});

// ── BLOCK tab — no node selected ──────────────────────────────────────────────

describe("<InspectorHub /> — BLOCK tab / ProjectOverview", () => {
  it("shows 'Project Overview' header when no block selected", () => {
    render(<InspectorHub />);
    expect(screen.getByText(/project overview/i)).toBeInTheDocument();
  });

  it("shows project name from usePerformStore", () => {
    render(<InspectorHub />);
    expect(screen.getByText("Demo Project")).toBeInTheDocument();
  });

  it("shows BLOCKS and CABLES row labels", () => {
    render(<InspectorHub />);
    expect(screen.getByText("BLOCKS")).toBeInTheDocument();
    expect(screen.getByText("CABLES")).toBeInTheDocument();
  });

  it("shows SAMPLE RATE with formatted value", () => {
    render(<InspectorHub />);
    expect(screen.getByText("SAMPLE RATE")).toBeInTheDocument();
    expect(screen.getByText("44.1 kHz")).toBeInTheDocument();
  });

  it("shows BUFFER with formatted value", () => {
    render(<InspectorHub />);
    expect(screen.getByText("BUFFER")).toBeInTheDocument();
    expect(screen.getByText("256 smp")).toBeInTheDocument();
  });

  it("shows DEVICE with device name", () => {
    render(<InspectorHub />);
    expect(screen.getByText("DEVICE")).toBeInTheDocument();
    expect(screen.getByText("Fireface 802")).toBeInTheDocument();
  });

  it("shows DEVICE LATENCY as sum of input + output ms", () => {
    render(<InspectorHub />);
    expect(screen.getByText("DEVICE LATENCY")).toBeInTheDocument();
    // 2.0 + 2.0 = 4.0 ms
    expect(screen.getByText("4.0 ms")).toBeInTheDocument();
  });
});

// ── BLOCK tab — block selected ────────────────────────────────────────────────

describe("<InspectorHub /> — BLOCK tab / block selected", () => {
  it("shows block name in header when block selected", async () => {
    setSelected(makeBlock({ name: "Surge XT" }));
    render(<InspectorHub />);
    await waitFor(() => expect(screen.getByText("Surge XT")).toBeInTheDocument());
  });

  it("shows BYPASS button", async () => {
    // State section auto-opens when bypassed=true; otherwise it starts collapsed
    setSelected(makeBlock({ bypassed: true }));
    render(<InspectorHub />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /bypassed/i })).toBeInTheDocument(),
    );
  });

  it("clicking BYPASS calls toggleBypass with block id", async () => {
    setSelected(makeBlock({ id: "b-42", bypassed: true }));
    render(<InspectorHub />);
    const btn = await screen.findByRole("button", { name: /bypassed/i });
    fireEvent.click(btn);
    expect(mockToggleBypass).toHaveBeenCalledWith("b-42");
  });

  it("shows BYPASSED label when block.bypassed=true", async () => {
    setSelected(makeBlock({ bypassed: true }));
    render(<InspectorHub />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /bypassed/i })).toBeInTheDocument(),
    );
  });

  it("shows MUTE button", async () => {
    // State section auto-opens when muted=true
    setSelected(makeBlock({ muted: true }));
    render(<InspectorHub />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^muted$/i })).toBeInTheDocument(),
    );
  });

  it("clicking MUTE calls toggleMute", async () => {
    setSelected(makeBlock({ id: "b-7", muted: true }));
    render(<InspectorHub />);
    const btn = await screen.findByRole("button", { name: /^muted$/i });
    fireEvent.click(btn);
    expect(mockToggleMute).toHaveBeenCalledWith("b-7");
  });

  it("shows MUTED label when block.muted=true", async () => {
    setSelected(makeBlock({ muted: true }));
    render(<InspectorHub />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^muted$/i })).toBeInTheDocument(),
    );
  });

  it("shows MUTE INPUTS button", async () => {
    // State section auto-opens when muteInput=true
    setSelected(makeBlock({ muteInput: true }));
    render(<InspectorHub />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /in muted/i })).toBeInTheDocument(),
    );
  });

  it("clicking MUTE INPUTS calls toggleMuteInput with block id", async () => {
    setSelected(makeBlock({ id: "b-99", muteInput: true }));
    render(<InspectorHub />);
    const btn = await screen.findByRole("button", { name: /in muted/i });
    fireEvent.click(btn);
    expect(mockToggleMuteInput).toHaveBeenCalledWith("b-99");
  });

  it("shows IN MUTED label when muteInput=true", async () => {
    setSelected(makeBlock({ muteInput: true }));
    render(<InspectorHub />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /in muted/i })).toBeInTheDocument(),
    );
  });
});

// ── BLOCK tab — notes ─────────────────────────────────────────────────────────

describe("<InspectorHub /> — BlockNoteEditor", () => {
  it("shows Notes section with textarea", async () => {
    setSelected(makeBlock({ note: "needs gain staging" }));
    render(<InspectorHub />);
    // Notes section starts collapsed; click the header (text contains "Notes") to expand
    const notesBtn = await screen.findByRole("button", { name: /notes/i });
    fireEvent.click(notesBtn);
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/add a note/i)).toBeInTheDocument(),
    );
  });

  it("textarea is pre-filled with block.note", async () => {
    setSelected(makeBlock({ note: "needs gain staging" }));
    render(<InspectorHub />);
    const notesBtn = await screen.findByRole("button", { name: /notes/i });
    fireEvent.click(notesBtn);
    const ta = await screen.findByPlaceholderText(/add a note/i);
    expect(ta).toHaveValue("needs gain staging");
  });

  it("typing in textarea updates value", async () => {
    setSelected(makeBlock({ note: "" }));
    render(<InspectorHub />);
    const notesBtn = await screen.findByRole("button", { name: /notes/i });
    fireEvent.click(notesBtn);
    const ta = await screen.findByPlaceholderText(/add a note/i);
    fireEvent.change(ta, { target: { value: "New note text" } });
    expect(ta).toHaveValue("New note text");
  });

  it("note bullet shows in Notes section summary when note is non-empty", async () => {
    setSelected(makeBlock({ note: "I have content" }));
    render(<InspectorHub />);
    await waitFor(() =>
      // The summary prop renders "•" when hasNote
      expect(screen.getByText("•")).toBeInTheDocument(),
    );
  });
});

// ── BLOCK tab — plugin editor controls ───────────────────────────────────────

describe("<InspectorHub /> — PluginEditorControls", () => {
  it("shows Plugin window section for VST3 block", async () => {
    setSelected(makeBlock({ format: "VST3" }));
    render(<InspectorHub />);
    await waitFor(() =>
      expect(screen.getByText(/plugin window/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /embed in shell/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /float window/i })).toBeInTheDocument();
  });

  it("does NOT show Plugin window section for INT block", async () => {
    setSelected(makeBlock({ format: "INT" }));
    render(<InspectorHub />);
    await waitFor(() =>
      expect(screen.queryByText(/plugin window/i)).not.toBeInTheDocument(),
    );
  });
});

// ── BLOCK tab — parameters ────────────────────────────────────────────────────

describe("<InspectorHub /> — BlockParameterList", () => {
  it("shows loading state while params are pending", () => {
    mockGetNodeParams.mockReturnValue(new Promise(() => {}));
    setSelected(makeBlock());
    render(<InspectorHub />);
    expect(screen.getByText(/loading parameters/i)).toBeInTheDocument();
  });

  it("renders boolean param as ON button when value ≥ 0.5", async () => {
    mockGetNodeParams.mockResolvedValue({
      parameters: [{ index: 0, name: "Active", label: "Active", value: 0.8, boolean: true }],
    });
    setSelected(makeBlock());
    render(<InspectorHub />);
    await waitFor(() => expect(screen.getByText("Active")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^on$/i })).toBeInTheDocument();
  });

  it("renders boolean param as OFF button when value < 0.5", async () => {
    mockGetNodeParams.mockResolvedValue({
      parameters: [{ index: 0, name: "Gate", label: "Gate", value: 0.2, boolean: true }],
    });
    setSelected(makeBlock());
    render(<InspectorHub />);
    await waitFor(() => expect(screen.getByText("Gate")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^off$/i })).toBeInTheDocument();
  });

  it("renders range param with a slider", async () => {
    mockGetNodeParams.mockResolvedValue({
      parameters: [{ index: 1, name: "Gain", label: "Gain", value: 0.5, min: 0, max: 2, boolean: false }],
    });
    setSelected(makeBlock());
    render(<InspectorHub />);
    await waitFor(() => expect(screen.getByText("Gain")).toBeInTheDocument());
    expect(screen.getByRole("slider", { name: "Gain" })).toBeInTheDocument();
  });

  it("renders stepped param display as rounded integer", async () => {
    mockGetNodeParams.mockResolvedValue({
      parameters: [{ index: 2, name: "Mode", label: "Mode", value: 0.5, min: 0, max: 4, stepped: true, boolean: false }],
    });
    setSelected(makeBlock());
    render(<InspectorHub />);
    await waitFor(() => expect(screen.getByText("Mode")).toBeInTheDocument());
    // value=0.5, min=0, max=4 → v = 2 → stepped → "2"
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows Refresh parameters button", async () => {
    // Provide a param so hasParams stays true after loading finishes
    mockGetNodeParams.mockResolvedValue({
      parameters: [{ index: 0, name: "Vol", label: "Vol", value: 0.5, boolean: false }],
    });
    setSelected(makeBlock());
    render(<InspectorHub />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /refresh parameters/i })).toBeInTheDocument(),
    );
  });

  it("Refresh parameters triggers another getNodeParameters call", async () => {
    mockGetNodeParams.mockResolvedValue({
      parameters: [{ index: 0, name: "Vol", label: "Vol", value: 0.5, boolean: false }],
    });
    setSelected(makeBlock());
    render(<InspectorHub />);
    const countBefore = mockGetNodeParams.mock.calls.length;
    const refreshBtn = await screen.findByRole("button", { name: /refresh parameters/i });
    fireEvent.click(refreshBtn);
    await waitFor(() =>
      expect(mockGetNodeParams.mock.calls.length).toBeGreaterThan(countBefore),
    );
  });
});

// ── BLOCK tab — InspectorSection collapse/expand ─────────────────────────────

describe("<InspectorHub /> — InspectorSection collapse/expand", () => {
  it("I/O Ports section starts collapsed (aria-expanded=false)", async () => {
    setSelected(makeBlock());
    render(<InspectorHub />);
    await waitFor(() => {
      const ioBtn = screen.getAllByRole("button", { name: /i\/o ports/i })[0];
      expect(ioBtn).toHaveAttribute("aria-expanded", "false");
    });
  });

  it("clicking I/O Ports header expands it (aria-expanded=true)", async () => {
    setSelected(makeBlock());
    render(<InspectorHub />);
    await waitFor(() => {
      const ioBtn = screen.getAllByRole("button", { name: /i\/o ports/i })[0];
      fireEvent.click(ioBtn);
      expect(ioBtn).toHaveAttribute("aria-expanded", "true");
    });
  });

  it("Metrics section starts collapsed", async () => {
    setSelected(makeBlock());
    render(<InspectorHub />);
    await waitFor(() => {
      const btn = screen.getAllByRole("button", { name: /metrics/i })[0];
      expect(btn).toHaveAttribute("aria-expanded", "false");
    });
  });

  it("State section auto-opens when block is bypassed", async () => {
    setSelected(makeBlock({ bypassed: true }));
    render(<InspectorHub />);
    // State section with bypassed=true opens by default
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /bypassed/i })).toBeInTheDocument(),
    );
  });
});

// ── BUS tab ───────────────────────────────────────────────────────────────────

describe("<InspectorHub /> — BUS tab", () => {
  it("clicking BUS tab shows BusInspector", () => {
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("tab", { name: /^bus$/i }));
    expect(screen.getByTestId("bus-inspector")).toBeInTheDocument();
  });

  it("BusInspector receives onOpenBlock callback", () => {
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("tab", { name: /^bus$/i }));
    const inspector = screen.getByTestId("bus-inspector");
    expect(inspector.dataset.hasOpen).toBe("true");
  });
});

// ── CABLE tab ─────────────────────────────────────────────────────────────────

describe("<InspectorHub /> — CABLE tab", () => {
  it("shows Cable Monitor heading when no edge selected", () => {
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("tab", { name: /^cable$/i }));
    expect(screen.getByText(/cable monitor/i)).toBeInTheDocument();
  });

  it("shows '0 cables' count when board is empty", () => {
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("tab", { name: /^cable$/i }));
    expect(screen.getByText(/0 cables/i)).toBeInTheDocument();
  });

  it("shows empty state guidance when no cables on board", () => {
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("tab", { name: /^cable$/i }));
    expect(screen.getByText(/no cables on this board/i)).toBeInTheDocument();
  });
});

// ── HEALTH tab ────────────────────────────────────────────────────────────────

describe("<InspectorHub /> — HEALTH tab", () => {
  it("shows 'Engine vitals' collapsible section", () => {
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("tab", { name: /^health$/i }));
    expect(screen.getByRole("button", { name: /engine vitals/i })).toBeInTheDocument();
  });

  it("shows 'Host meters' collapsible section", () => {
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("tab", { name: /^health$/i }));
    expect(screen.getByRole("button", { name: /host meters/i })).toBeInTheDocument();
  });

  it("shows 'Engine log' collapsible section (collapsed by default)", () => {
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("tab", { name: /^health$/i }));
    const logSection = screen.getByRole("button", { name: /engine log/i });
    expect(logSection).toHaveAttribute("aria-expanded", "false");
  });

  it("LiveHealth component renders inside Engine vitals", () => {
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("tab", { name: /^health$/i }));
    expect(screen.getByTestId("live-health")).toBeInTheDocument();
  });

  it("Host meters shows CPU est. from liveHealth", () => {
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("tab", { name: /^health$/i }));
    expect(screen.getByText("CPU est.")).toBeInTheDocument();
    expect(screen.getByText("23.5%")).toBeInTheDocument();
  });

  it("Host meters shows device latency", () => {
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("tab", { name: /^health$/i }));
    expect(screen.getByText("Device latency")).toBeInTheDocument();
    expect(screen.getByText("4.2 ms")).toBeInTheDocument();
  });

  it("Host meters latency shows em dash when latency=0", () => {
    // Override for all calls during this render (Once is consumed by the first
    // usePerformStore call in BlockTabBody/ProjectOverview before the HEALTH tab renders)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(usePerformStore).mockImplementation((sel: any) =>
      sel({ sessionName: "P", liveHealth: { cpu: 0, latency: 0 } }),
    );
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("tab", { name: /^health$/i }));
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("Host meters shows cable count from useCableMeterStore", () => {
    setCableLevels({ "cable-1": 0.5, "cable-2": 0.8 });
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("tab", { name: /^health$/i }));
    expect(screen.getByText(/smart cables: 2/i)).toBeInTheDocument();
  });

  it("Engine log: empty state when no log lines", () => {
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("tab", { name: /^health$/i }));
    // Expand the log section
    fireEvent.click(screen.getByRole("button", { name: /engine log/i }));
    expect(screen.getByText(/no log lines yet/i)).toBeInTheDocument();
  });

  it("Engine log: renders log lines when present", () => {
    setLogLines(["[INFO] Engine started", "[WARN] Buffer underrun"]);
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("tab", { name: /^health$/i }));
    fireEvent.click(screen.getByRole("button", { name: /engine log/i }));
    expect(screen.getByText("[INFO] Engine started")).toBeInTheDocument();
    expect(screen.getByText("[WARN] Buffer underrun")).toBeInTheDocument();
  });

  it("Engine log: caps display at 300 lines (shows last line of 350)", () => {
    const lines = Array.from({ length: 350 }, (_, i) => `line-${i}`);
    setLogLines(lines);
    render(<InspectorHub />);
    fireEvent.click(screen.getByRole("tab", { name: /^health$/i }));
    fireEvent.click(screen.getByRole("button", { name: /engine log/i }));
    expect(screen.queryByText("line-0")).not.toBeInTheDocument();
    expect(screen.getByText("line-349")).toBeInTheDocument();
  });
});

// ── Script block detection ────────────────────────────────────────────────────

describe("<InspectorHub /> — script block", () => {
  it("shows Script section for INT block named 'Script'", async () => {
    setSelected(makeBlock({ format: "INT", name: "Script" }));
    render(<InspectorHub />);
    // InspectorSection header text is "▶ Script"; use /script/i (not anchored)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /script/i })).toBeInTheDocument(),
    );
  });

  it("does NOT show Script section for non-script block", async () => {
    setSelected(makeBlock({ format: "VST3", name: "Surge XT" }));
    render(<InspectorHub />);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /script/i })).not.toBeInTheDocument(),
    );
  });
});

// ── PresetStrip ───────────────────────────────────────────────────────────────

describe("<InspectorHub /> — PresetStrip", () => {
  it("shows A and B slot buttons when block selected", async () => {
    setSelected(makeBlock());
    render(<InspectorHub />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^a$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^b$/i })).toBeInTheDocument();
    });
  });

  it("shows Save… and Load… buttons", async () => {
    setSelected(makeBlock());
    render(<InspectorHub />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /load/i })).toBeInTheDocument();
    });
  });
});
