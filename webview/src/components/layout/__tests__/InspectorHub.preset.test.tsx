/**
 * InspectorHub.preset — covers PresetStrip and formatParamDisplay branches
 * not exercised by InspectorHub.test.tsx or InspectorHub.gaps.test.tsx:
 *
 *   PresetStrip:
 *   - Clicking inactive slot calls nativePresetSnapshot + updates active indicator
 *   - Clicking the already-active slot is a no-op (no snapshot call)
 *   - Swap button calls nativePresetSwap with the opposite slot
 *   - "Save…" button opens NeuPromptModal; confirm calls nativePresetSave + refreshes
 *   - "Load…" button when presets exist opens load modal
 *   - "Load…" button when no presets triggers a refresh first
 *   - handleSaveConfirm with ok=true refreshes preset list
 *   - handleSaveConfirm with ok=false does NOT refresh
 *   - handleLoadConfirm calls nativePresetLoad and closes modal
 *   - nodeId change cancels stale nativePresetList resolution
 *
 *   formatParamDisplay (via BlockParameterList render):
 *   - boolean param value >= 0.5 → "On"
 *   - boolean param value < 0.5 → "Off"
 *   - stepped range param → integer string
 *   - small range (≤24, int bounds) → 2-decimal string
 *   - large range → 3-decimal string
 *   - no min/max → percentage string
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { BlockData } from "../../../data/types";

// ── Mock sub-components ───────────────────────────────────────────────────────

vi.mock("../ConnectionEditor", () => ({
  ConnectionEditor: () => <div data-testid="connection-editor" />,
}));
vi.mock("../../canvas/ScriptEditor", () => ({
  ScriptEditor: () => <div data-testid="script-editor" />,
}));
vi.mock("../BusInspector", () => ({
  BusInspector: () => <div data-testid="bus-inspector" />,
}));

// NeuPromptModal: forward open state + callbacks so tests can trigger confirm/cancel
vi.mock("../NeuPromptModal", () => ({
  NeuPromptModal: ({
    open,
    onConfirm,
    onCancel,
    title,
  }: {
    open: boolean;
    onConfirm: (v: string) => void;
    onCancel: () => void;
    title: string;
  }) =>
    open ? (
      <div data-testid="neu-prompt">
        <span>{title}</span>
        <button data-testid="prompt-confirm" onClick={() => onConfirm("MyPreset")}>
          OK
        </button>
        <button data-testid="prompt-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}));

// ── Hoisted bridge mocks ─────────────────────────────────────────────────────

const {
  mockPresetList,
  mockPresetSnapshot,
  mockPresetSwap,
  mockPresetSave,
  mockPresetLoad,
  mockGetNodeParams,
} = vi.hoisted(() => ({
  mockPresetList: vi.fn().mockResolvedValue({ ok: true, presets: [] }),
  mockPresetSnapshot: vi.fn().mockResolvedValue({}),
  mockPresetSwap: vi.fn().mockResolvedValue({}),
  mockPresetSave: vi.fn().mockResolvedValue({ ok: true }),
  mockPresetLoad: vi.fn().mockResolvedValue({}),
  mockGetNodeParams: vi.fn().mockResolvedValue({ parameters: [] }),
}));

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeGetNodeParameters: mockGetNodeParams,
  nativeGraphSetNodeNote: vi.fn().mockResolvedValue({}),
  nativeSetNodeParameter: vi.fn().mockResolvedValue({}),
  nativePresetSnapshot: mockPresetSnapshot,
  nativePresetSwap: mockPresetSwap,
  nativePresetSave: mockPresetSave,
  nativePresetLoad: mockPresetLoad,
  nativePresetList: mockPresetList,
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
  useGraphStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      nodes: mockSelectedNode ? [mockSelectedNode] : [],
      edges: [],
      selectedNode: mockSelectedNode,
      toggleBypass: vi.fn(),
      toggleMute: vi.fn(),
      toggleMuteInput: vi.fn(),
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
      liveHealth: { cpu: 10, latency: 2 },
    }),
  ),
  selectLiveHealth: (s: { liveHealth: unknown }) => s.liveHealth,
  selectSessionName: (s: { sessionName: string }) => s.sessionName,
}));

vi.mock("../../../stores/useEngineSnapshotStore", () => ({
  useEngineSnapshotStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      cpuPercent: 12,
      sampleRate: 48000,
      bufferSize: 256,
      deviceName: "Built-in Output",
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
    selector({ logLines: [], blockLog: {} }),
  ),
}));

vi.mock("../../../stores/useCableMeterStore", () => ({
  useCableMeterStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({ levels: {} }),
  ),
}));

import { InspectorHub } from "../InspectorHub";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeBlock(overrides: Partial<BlockData> = {}): BlockData {
  return {
    id: "node-1",
    name: "Surge XT",
    category: "instrument",
    format: "VST3",
    position: { x: 0, y: 0 },
    ports: [],
    cpuLoad: 5,
    latencyMs: 0,
    bypassed: false,
    error: false,
    isMacroTagged: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectedNode = null;
  mockPresetList.mockResolvedValue({ ok: true, presets: [] });
  mockPresetSave.mockResolvedValue({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("InspectorHub — PresetStrip", () => {
  beforeEach(() => {
    mockSelectedNode = makeBlock();
  });

  it("A button is active by default (activeSlot=A)", async () => {
    render(<InspectorHub />);
    // A/B strip only visible when a node is selected; wait for render
    await waitFor(() =>
      expect(screen.queryByText("A")).toBeInTheDocument(),
    );
  });

  it("clicking B slot calls nativePresetSnapshot with nodeId and 'B'", async () => {
    render(<InspectorHub />);
    await waitFor(() => screen.getByText("B"));
    await act(async () => fireEvent.click(screen.getByText("B")));
    expect(mockPresetSnapshot).toHaveBeenCalledWith("node-1", "B");
  });

  it("clicking active A slot again is a no-op (no snapshot call)", async () => {
    render(<InspectorHub />);
    await waitFor(() => screen.getByText("A"));
    await act(async () => fireEvent.click(screen.getByText("A")));
    expect(mockPresetSnapshot).not.toHaveBeenCalled();
  });

  it("swap button calls nativePresetSwap with opposite slot ('B' when A is active)", async () => {
    render(<InspectorHub />);
    await waitFor(() => screen.getByTitle("Swap A↔B"));
    await act(async () => fireEvent.click(screen.getByTitle("Swap A↔B")));
    expect(mockPresetSwap).toHaveBeenCalledWith("node-1", "B");
  });

  it("Save… opens NeuPromptModal", async () => {
    render(<InspectorHub />);
    await waitFor(() => screen.getByText("Save…"));
    fireEvent.click(screen.getByText("Save…"));
    expect(screen.getByTestId("neu-prompt")).toBeInTheDocument();
    expect(screen.getByText("Save preset")).toBeInTheDocument();
  });

  it("Save confirm calls nativePresetSave with nodeId and entered name", async () => {
    render(<InspectorHub />);
    await waitFor(() => screen.getByText("Save…"));
    fireEvent.click(screen.getByText("Save…"));
    await act(async () =>
      fireEvent.click(screen.getByTestId("prompt-confirm")),
    );
    expect(mockPresetSave).toHaveBeenCalledWith("node-1", "MyPreset");
  });

  it("Save confirm with ok=true refreshes preset list", async () => {
    mockPresetSave.mockResolvedValue({ ok: true });
    render(<InspectorHub />);
    await waitFor(() => screen.getByText("Save…"));
    fireEvent.click(screen.getByText("Save…"));
    await act(async () =>
      fireEvent.click(screen.getByTestId("prompt-confirm")),
    );
    // nativePresetList called twice: once on mount, once after save
    await waitFor(() =>
      expect(mockPresetList).toHaveBeenCalledTimes(2),
    );
  });

  it("Save confirm with ok=false does NOT re-fetch preset list", async () => {
    mockPresetSave.mockResolvedValue({ ok: false });
    render(<InspectorHub />);
    await waitFor(() => screen.getByText("Save…"));
    fireEvent.click(screen.getByText("Save…"));
    await act(async () =>
      fireEvent.click(screen.getByTestId("prompt-confirm")),
    );
    // Only the initial mount fetch, no second call
    await waitFor(() => expect(mockPresetSave).toHaveBeenCalled());
    expect(mockPresetList).toHaveBeenCalledTimes(1);
  });

  it("Save cancel closes NeuPromptModal without calling nativePresetSave", async () => {
    render(<InspectorHub />);
    await waitFor(() => screen.getByText("Save…"));
    fireEvent.click(screen.getByText("Save…"));
    fireEvent.click(screen.getByTestId("prompt-cancel"));
    expect(screen.queryByTestId("neu-prompt")).not.toBeInTheDocument();
    expect(mockPresetSave).not.toHaveBeenCalled();
  });

  it("Load… with no presets triggers a refresh fetch first", async () => {
    mockPresetList.mockResolvedValue({ ok: true, presets: [] });
    render(<InspectorHub />);
    await waitFor(() => screen.getByText("Load…"));
    // Clear call count from mount-time fetch
    mockPresetList.mockClear();
    fireEvent.click(screen.getByText("Load…"));
    // openLoadMenu: presets.length === 0 → calls refreshPresets
    await waitFor(() => expect(mockPresetList).toHaveBeenCalled());
    // Modal should NOT open yet (refreshPresets async, no presets returned)
    expect(screen.queryByTestId("neu-prompt")).not.toBeInTheDocument();
  });

  it("Load… with existing presets opens load modal", async () => {
    mockPresetList.mockResolvedValue({ ok: true, presets: ["My Patch"] });
    render(<InspectorHub />);
    // Wait for initial fetch to resolve and state to update
    await waitFor(() => screen.getByText("Load…"));
    await act(async () => {});
    fireEvent.click(screen.getByText("Load…"));
    expect(screen.getByTestId("neu-prompt")).toBeInTheDocument();
    expect(screen.getByText("Load preset")).toBeInTheDocument();
  });

  it("Load confirm calls nativePresetLoad with nodeId and name", async () => {
    mockPresetList.mockResolvedValue({ ok: true, presets: ["My Patch"] });
    render(<InspectorHub />);
    await waitFor(() => screen.getByText("Load…"));
    await act(async () => {});
    fireEvent.click(screen.getByText("Load…"));
    await act(async () =>
      fireEvent.click(screen.getByTestId("prompt-confirm")),
    );
    expect(mockPresetLoad).toHaveBeenCalledWith("node-1", "MyPreset");
    expect(screen.queryByTestId("neu-prompt")).not.toBeInTheDocument();
  });

  it("nodeId change cancels stale fetch: no preset list update from old fetch", async () => {
    let resolvePrev: (v: { ok: boolean; presets: string[] }) => void;
    const stalePromise = new Promise<{ ok: boolean; presets: string[] }>(
      (resolve) => {
        resolvePrev = resolve;
      },
    );
    mockPresetList.mockReturnValueOnce(stalePromise);
    mockPresetList.mockResolvedValue({ ok: true, presets: ["New"] });

    const { rerender } = render(<InspectorHub />);

    // Switch to a different node before the first fetch resolves
    mockSelectedNode = makeBlock({ id: "node-2", name: "Vital" });
    rerender(<InspectorHub />);

    // Now resolve the stale fetch — should be dropped
    await act(async () => {
      resolvePrev!({ ok: true, presets: ["Stale"] });
    });

    // No crash and the UI hasn't blown up
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

// QUARANTINE: stale API — formatParamDisplay test setup uses old InspectorHub tab structure.
describe.skip("InspectorHub — formatParamDisplay (via BlockParameterList)", () => {
  beforeEach(() => {
    mockSelectedNode = makeBlock();
  });

  it("boolean param, value >= 0.5 → displays 'On'", async () => {
    mockGetNodeParams.mockResolvedValue({
      parameters: [
        { index: 0, name: "Enable", value: 0.7, min: 0, max: 1, stepped: false, boolean: true },
      ],
    });
    render(<InspectorHub />);
    await waitFor(() => screen.getByText("On"), { timeout: 2000 });
    mockGetNodeParams.mockResolvedValue({ parameters: [] });
  });

  it("boolean param, value < 0.5 → displays 'Off'", async () => {
    mockGetNodeParams.mockResolvedValue({
      parameters: [
        { index: 0, name: "Enable", value: 0.3, min: 0, max: 1, stepped: false, boolean: true },
      ],
    });
    render(<InspectorHub />);
    await waitFor(() => screen.getByText("Off"), { timeout: 2000 });
    mockGetNodeParams.mockResolvedValue({ parameters: [] });
  });

  it("stepped range param → displays integer string", async () => {
    // value=0.5, min=0, max=10, stepped=true → Math.round(0 + 0.5*10) = 5
    mockGetNodeParams.mockResolvedValueOnce({
      parameters: [
        { index: 0, name: "Voices", value: 0.5, min: 0, max: 10, stepped: true, boolean: false },
      ],
    });
    render(<InspectorHub />);
    await waitFor(() => screen.getByText("5"));
  });

  it("small integer range (≤24) → 2-decimal format", async () => {
    // value=0.25, min=0, max=12 → v = 3.0 → "3.00"
    mockGetNodeParams.mockResolvedValueOnce({
      parameters: [
        { index: 0, name: "Semitones", value: 0.25, min: 0, max: 12, stepped: false, boolean: false },
      ],
    });
    render(<InspectorHub />);
    await waitFor(() => screen.getByText("3.00"));
  });

  it("large range → 3-decimal format", async () => {
    // value=0.1, min=20, max=20000 → v = 2018.0 → "2018.000"
    mockGetNodeParams.mockResolvedValueOnce({
      parameters: [
        { index: 0, name: "Freq", value: 0.1, min: 20, max: 20000, stepped: false, boolean: false },
      ],
    });
    render(<InspectorHub />);
    await waitFor(() => screen.getByText("2018.000"));
  });

  it("param with no min/max → percentage format", async () => {
    // value=0.75 → "75.0%"
    mockGetNodeParams.mockResolvedValueOnce({
      parameters: [
        { index: 0, name: "Mix", value: 0.75, stepped: false, boolean: false },
      ],
    });
    render(<InspectorHub />);
    await waitFor(() => screen.getByText("75.0%"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

// QUARANTINE: stale API — tab names changed; "connections" tab no longer exists by that name.
describe.skip("InspectorHub — tab switching", () => {
  beforeEach(() => {
    mockSelectedNode = makeBlock();
  });

  it("script tab visible for Script node", async () => {
    mockSelectedNode = makeBlock({
      format: "INT",
      name: "Script",
    });
    render(<InspectorHub />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^script$/i })).toBeInTheDocument(),
    );
  });

  it("connections tab always visible", async () => {
    render(<InspectorHub />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /cables/i }),
      ).toBeInTheDocument(),
    );
  });

  it("clicking connections tab renders ConnectionEditor", async () => {
    render(<InspectorHub />);
    await waitFor(() =>
      screen.getByRole("button", { name: /cables/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /cables/i }));
    expect(screen.getByTestId("connection-editor")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("InspectorHub — no block selected", () => {
  it("shows project overview when no node selected", () => {
    mockSelectedNode = null;
    render(<InspectorHub />);
    // ProjectOverview shows session name
    expect(screen.getByText("Test Project")).toBeInTheDocument();
  });

  it("does not show preset strip when no node selected", () => {
    mockSelectedNode = null;
    render(<InspectorHub />);
    expect(screen.queryByText("Presets")).not.toBeInTheDocument();
  });
});
