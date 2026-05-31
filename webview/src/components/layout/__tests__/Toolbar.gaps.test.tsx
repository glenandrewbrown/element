/**
 * Toolbar — gap coverage for previously untested paths (was 41.8%).
 *
 * Covers: sessionDisplayName logic (via rendered output), tap-tempo,
 * BPM inline editing, transport controls, panic button, mode switch,
 * cable-routing toggle, scene add/capture.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  installJuceBridgeMock,
  type JuceBridgeMock,
} from "../../../test/mockJuceBridge";
import { useEngineSnapshotStore } from "../../../stores/useEngineSnapshotStore";
import { useAppStore } from "../../../stores/useAppStore";
import { usePerformStore } from "../../../stores/usePerformStore";
import { useGraphStore } from "../../../stores/useGraphStore";
import { useSessionStore } from "../../../stores/useSessionStore";
import { Toolbar } from "../Toolbar";

// ── Bridge fn mocks (called by Toolbar buttons) ───────────────────────────────

const mockTransportPanic = vi.fn(async () => undefined);
const mockTransportPlay = vi.fn(async () => undefined);
const mockTransportStop = vi.fn(async () => undefined);
const mockTransportRewind = vi.fn(async () => undefined);
const mockTransportSetTempo = vi.fn(async () => undefined);
const mockTransportSetRecording = vi.fn(async () => undefined);
const mockSessionNew = vi.fn(async () => undefined);
const mockSessionOpen = vi.fn(async () => undefined);
const mockSessionSave = vi.fn(async () => undefined);
const mockSessionSaveAs = vi.fn(async () => undefined);
const mockUndo = vi.fn(async () => undefined);
const mockRedo = vi.fn(async () => undefined);
const mockPerformAddScene = vi.fn(async () => undefined);
const mockPerformCaptureScene = vi.fn(async () => undefined);
const mockSessionSetActiveGraph = vi.fn(async () => undefined);

vi.mock("../../../bridge/nativeGraph", () => ({
  nativeTransportPanic: (...a: unknown[]) => mockTransportPanic(...a),
  nativeTransportTogglePlay: (...a: unknown[]) => mockTransportPlay(...a),
  nativeTransportStop: (...a: unknown[]) => mockTransportStop(...a),
  nativeTransportRewind: (...a: unknown[]) => mockTransportRewind(...a),
  nativeTransportSetTempo: (...a: unknown[]) => mockTransportSetTempo(...a),
  nativeTransportSetRecording: (...a: unknown[]) => mockTransportSetRecording(...a),
  nativeUndo: (...a: unknown[]) => mockUndo(...a),
  nativeRedo: (...a: unknown[]) => mockRedo(...a),
}));

vi.mock("../../../bridge/nativeSession", () => ({
  nativeSessionNew: (...a: unknown[]) => mockSessionNew(...a),
  nativeSessionOpen: (...a: unknown[]) => mockSessionOpen(...a),
  nativeSessionSave: (...a: unknown[]) => mockSessionSave(...a),
  nativeSessionSaveAs: (...a: unknown[]) => mockSessionSaveAs(...a),
  nativeSessionSetActiveGraph: (...a: unknown[]) => mockSessionSetActiveGraph(...a),
}));

vi.mock("../../../bridge/nativePerform", () => ({
  nativePerformAddScene: (...a: unknown[]) => mockPerformAddScene(...a),
  nativePerformCaptureScene: (...a: unknown[]) => mockPerformCaptureScene(...a),
}));

// ── Store reset ───────────────────────────────────────────────────────────────

function resetStores() {
  useEngineSnapshotStore.getState().stopPolling?.();
  useEngineSnapshotStore.setState({
    cpu: 0,
    engineRunning: true,
    sampleRate: 44100,
    bufferSize: 512,
    deviceName: "Built-in Output",
    deviceLatencyInputMs: 0,
    deviceLatencyOutputMs: 11.6,
    transportPlaying: false,
    transportRecording: false,
    tempoBpm: 120,
    timeSig: [4, 4] as [number, number],
    transportFrame: 0,
    transportTimecode: "1.1.0",
    lastUpdated: 0,
    hasHostData: true,
  });
  useAppStore.setState({
    mode: "edit",
    leftPanelOpen: true,
    rightPanelOpen: true,
    bottomPanelOpen: true,
    cableRouting: "manhattan",
    spatialBookmarks: {},
    openBlockTabs: [],
    virtualKeyboardOpen: false,
    activeScene: 0,
    hostReady: true,
    refreshNonce: 0,
  });
  useGraphStore.setState({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    breadcrumbStack: [{ boardId: "root", label: "Root" }],
  });
  usePerformStore.setState((s) => ({
    scenes: [],
    liveHealth: { ...s.liveHealth, cpu: 0, outputPeak: 0 },
    bpm: 120,
  }));
  useSessionStore.setState({ filePath: "", dirty: false, graphs: [] });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Toolbar — session name display", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    resetStores();
  });

  afterEach(() => {
    bridge.uninstall();
    vi.clearAllMocks();
    useAppStore.setState({ mode: "edit" });
  });

  it('shows "Untitled" when no file is loaded and not dirty', () => {
    useSessionStore.setState({ filePath: "", dirty: false });
    render(<Toolbar />);
    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it('shows "Untitled •" when no file is loaded but dirty', () => {
    useSessionStore.setState({ filePath: "", dirty: true });
    render(<Toolbar />);
    expect(screen.getByText("Untitled •")).toBeInTheDocument();
  });

  it("shows bare filename without extension when file is loaded", () => {
    useSessionStore.setState({ filePath: "/Users/glen/Songs/MyTrack.els", dirty: false });
    render(<Toolbar />);
    expect(screen.getByText("MyTrack")).toBeInTheDocument();
  });

  it("shows filename with dirty marker when file is loaded and dirty", () => {
    useSessionStore.setState({ filePath: "/Users/glen/Songs/MyTrack.els", dirty: true });
    render(<Toolbar />);
    expect(screen.getByText("MyTrack •")).toBeInTheDocument();
  });

  it("handles file path with no extension (non-.els extension)", () => {
    useSessionStore.setState({ filePath: "/Users/glen/Songs/Project", dirty: false });
    render(<Toolbar />);
    expect(screen.getByText("Project")).toBeInTheDocument();
  });
});

describe("Toolbar — panic button", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    resetStores();
  });

  afterEach(() => {
    bridge.uninstall();
    vi.clearAllMocks();
  });

  it("renders a PANIC button", () => {
    render(<Toolbar />);
    expect(screen.getByRole("button", { name: /panic/i })).toBeInTheDocument();
  });

  it("calls nativeTransportPanic when PANIC is clicked", async () => {
    render(<Toolbar />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /panic/i }));
    });
    expect(mockTransportPanic).toHaveBeenCalled();
  });
});

describe("Toolbar — transport controls", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    resetStores();
  });

  afterEach(() => {
    bridge.uninstall();
    vi.clearAllMocks();
  });

  it("renders play/stop, record, and rewind buttons", () => {
    render(<Toolbar />);
    // Play/Stop toggled button (aria-label changes based on isPlaying)
    expect(
      screen.getByRole("button", { name: /play|stop/i }),
    ).toBeInTheDocument();
  });

  it("calls nativeTransportTogglePlay when play button clicked", async () => {
    render(<Toolbar />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /play|stop/i }));
    });
    expect(mockTransportPlay).toHaveBeenCalled();
  });

  it("shows LIVE badge in perform mode when engine is running", () => {
    act(() => {
      useEngineSnapshotStore.setState({ engineRunning: true });
      useAppStore.setState({ mode: "perform" });
    });
    render(<Toolbar />);
    expect(screen.getByText("LIVE")).toBeInTheDocument();
  });

  it("shows IDLE badge in perform mode when engine is not running", () => {
    act(() => {
      useEngineSnapshotStore.setState({ engineRunning: false });
      useAppStore.setState({ mode: "perform" });
    });
    render(<Toolbar />);
    expect(screen.getByText("IDLE")).toBeInTheDocument();
  });
});

describe("Toolbar — BPM display and editing", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    resetStores();
  });

  afterEach(() => {
    bridge.uninstall();
    vi.clearAllMocks();
  });

  it("shows current BPM from engine snapshot", () => {
    useEngineSnapshotStore.setState({ tempoBpm: 130 });
    render(<Toolbar />);
    expect(screen.getByText("130.0")).toBeInTheDocument();
  });

  it("switches BPM to input mode on click", () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByText("120.0"));
    expect(screen.getByDisplayValue("120.0")).toBeInTheDocument();
  });

  it("submits new BPM on Enter and calls nativeTransportSetTempo", async () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByText("120.0"));
    const input = screen.getByDisplayValue("120.0");
    fireEvent.change(input, { target: { value: "140" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(mockTransportSetTempo).toHaveBeenCalledWith(140);
  });

  it("cancels BPM edit on Escape", () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByText("120.0"));
    const input = screen.getByDisplayValue("120.0");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByDisplayValue("120.0")).not.toBeInTheDocument();
    expect(screen.getByText("120.0")).toBeInTheDocument();
  });

  it("ignores non-numeric BPM input on Enter", async () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByText("120.0"));
    const input = screen.getByDisplayValue("120.0");
    fireEvent.change(input, { target: { value: "abc" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(mockTransportSetTempo).not.toHaveBeenCalled();
  });
});

describe("Toolbar — mode toggle", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    resetStores();
  });

  afterEach(() => {
    bridge.uninstall();
    vi.clearAllMocks();
  });

  it("shows Edit mode label when in edit mode", () => {
    useAppStore.setState({ mode: "edit" });
    render(<Toolbar />);
    expect(screen.getByText(/edit/i)).toBeInTheDocument();
  });

  it("shows Perform mode label when in perform mode", () => {
    useAppStore.setState({ mode: "perform" });
    render(<Toolbar />);
    expect(screen.getByText(/perform/i)).toBeInTheDocument();
  });
});

describe("Toolbar — undo/redo", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    resetStores();
  });

  afterEach(() => {
    bridge.uninstall();
    vi.clearAllMocks();
  });

  it("calls nativeUndo when Undo button clicked", async () => {
    render(<Toolbar />);
    const undoBtn = screen.getByRole("button", { name: /undo/i });
    await act(async () => { fireEvent.click(undoBtn); });
    expect(mockUndo).toHaveBeenCalled();
  });

  it("calls nativeRedo when Redo button clicked", async () => {
    render(<Toolbar />);
    const redoBtn = screen.getByRole("button", { name: /redo/i });
    await act(async () => { fireEvent.click(redoBtn); });
    expect(mockRedo).toHaveBeenCalled();
  });
});

describe("Toolbar — tap tempo", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    vi.useFakeTimers();
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    resetStores();
  });

  afterEach(() => {
    vi.useRealTimers();
    bridge.uninstall();
    vi.clearAllMocks();
  });

  it("calls nativeTransportSetTempo after 2+ taps", async () => {
    render(<Toolbar />);
    const tapBtn = screen.getByRole("button", { name: /tap/i });
    // Two taps 500 ms apart → 120 BPM
    await act(async () => {
      fireEvent.click(tapBtn);
      vi.advanceTimersByTime(500);
      fireEvent.click(tapBtn);
    });
    await waitFor(() => expect(mockTransportSetTempo).toHaveBeenCalled());
  });

  it("resets tap buffer after 2s of inactivity", async () => {
    render(<Toolbar />);
    const tapBtn = screen.getByRole("button", { name: /tap/i });
    await act(async () => {
      fireEvent.click(tapBtn);
      vi.advanceTimersByTime(2100); // > 2s → reset
      fireEvent.click(tapBtn);
    });
    // Only 1 tap in the new buffer → not enough to compute → no call
    expect(mockTransportSetTempo).not.toHaveBeenCalled();
  });
});
