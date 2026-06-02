/**
 * Toolbar — additional coverage for paths not exercised in Toolbar.gaps.test.tsx.
 *
 * Covers (fn coverage was 47%):
 *   - handleToggleRecord: record button click flips recording state
 *   - BPM onBlur: submits clamped tempo when input loses focus
 *   - Cable routing: MAN / BEZ toggle buttons call setCableRouting
 *   - Scene navigation: prev/next chevron buttons wrap-around
 *   - Scene add: + button calls nativePerformAddScene
 *   - Scene capture: CAP button calls nativePerformCaptureScene; disabled while busy
 *   - Board selector: dropdown onChange calls nativeSessionSetActiveGraph (multi-graph)
 *   - EV_OPEN_PREFERENCES: custom event opens PreferencesModal
 *   - Perform mode right panel: About/Settings/Panic buttons visible
 *   - activeSceneData.hasCapture: orange dot rendered when scene has capture
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
import { EV_OPEN_PREFERENCES } from "../../../events";
import { Toolbar } from "../Toolbar";

// ── Bridge fn mocks — hoisted so vi.mock() factories can reference them ──────

const {
  mockTransportPanic,
  mockTransportPlay,
  mockTransportStop,
  mockTransportRewind,
  mockTransportSetTempo,
  mockTransportSetRecording,
  mockSessionNew,
  mockSessionOpen,
  mockSessionSave,
  mockSessionSaveAs,
  mockUndo,
  mockRedo,
  mockPerformAddScene,
  mockPerformCaptureScene,
  mockSessionSetActiveGraph,
} = vi.hoisted(() => ({
  mockTransportPanic: vi.fn(async () => undefined),
  mockTransportPlay: vi.fn(async () => undefined),
  mockTransportStop: vi.fn(async () => undefined),
  mockTransportRewind: vi.fn(async () => undefined),
  mockTransportSetTempo: vi.fn(async () => undefined),
  mockTransportSetRecording: vi.fn(async () => undefined),
  mockSessionNew: vi.fn(async () => undefined),
  mockSessionOpen: vi.fn(async () => undefined),
  mockSessionSave: vi.fn(async () => undefined),
  mockSessionSaveAs: vi.fn(async () => undefined),
  mockUndo: vi.fn(async () => undefined),
  mockRedo: vi.fn(async () => undefined),
  mockPerformAddScene: vi.fn(async () => undefined),
  mockPerformCaptureScene: vi.fn(async () => undefined),
  mockSessionSetActiveGraph: vi.fn(async () => undefined),
}));

vi.mock("../../../bridge/nativeGraph", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sp = (fn: (...a: any[]) => any) => (...a: any[]) => fn(...a);
  return {
    nativeTransportPanic: sp(mockTransportPanic),
    nativeTransportTogglePlay: sp(mockTransportPlay),
    nativeTransportStop: sp(mockTransportStop),
    nativeTransportRewind: sp(mockTransportRewind),
    nativeTransportSetTempo: sp(mockTransportSetTempo),
    nativeTransportSetRecording: sp(mockTransportSetRecording),
    nativeUndo: sp(mockUndo),
    nativeRedo: sp(mockRedo),
  };
});

vi.mock("../../../bridge/nativeSession", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sp = (fn: (...a: any[]) => any) => (...a: any[]) => fn(...a);
  return {
    nativeSessionNew: sp(mockSessionNew),
    nativeSessionOpen: sp(mockSessionOpen),
    nativeSessionSave: sp(mockSessionSave),
    nativeSessionSaveAs: sp(mockSessionSaveAs),
    nativeSessionSetActiveGraph: sp(mockSessionSetActiveGraph),
  };
});

vi.mock("../../../bridge/nativePerform", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sp = (fn: (...a: any[]) => any) => (...a: any[]) => fn(...a);
  return {
    nativePerformAddScene: sp(mockPerformAddScene),
    nativePerformCaptureScene: sp(mockPerformCaptureScene),
  };
});

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
    breadcrumbStack: ["Root"],
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  usePerformStore.setState((s: any) => ({
    scenes: [{ id: "s1", name: "Scene 1", index: 0, active: false, hasCapture: false }],
    liveHealth: { ...s.liveHealth, bpm: 120, cpu: 0, outputPeak: 0 },
  }));
  useSessionStore.setState({ filePath: "", dirty: false, graphs: [] });
}

describe("Toolbar — record toggle", () => {
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

  it("record button renders with correct aria-pressed=false when not recording", () => {
    useEngineSnapshotStore.setState({ transportRecording: false });
    render(<Toolbar />);
    const recBtn = screen.getByRole("button", { name: /record/i });
    expect(recBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("record button has aria-pressed=true when recording", () => {
    useEngineSnapshotStore.setState({ transportRecording: true });
    render(<Toolbar />);
    const recBtn = screen.getByRole("button", { name: /stop recording/i });
    expect(recBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking record button calls nativeTransportSetRecording(!current)", async () => {
    useEngineSnapshotStore.setState({ transportRecording: false });
    render(<Toolbar />);
    const recBtn = screen.getByRole("button", { name: /record/i });
    await act(async () => { fireEvent.click(recBtn); });
    expect(mockTransportSetRecording).toHaveBeenCalledWith(true);
  });
});

describe("Toolbar — BPM onBlur", () => {
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

  it("onBlur with valid BPM calls nativeTransportSetTempo and closes input", async () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByText("120.00"));
    const input = screen.getByDisplayValue("120.00");
    fireEvent.change(input, { target: { value: "150" } });
    await act(async () => { fireEvent.blur(input); });
    expect(mockTransportSetTempo).toHaveBeenCalledWith(150);
    expect(screen.queryByDisplayValue("150")).not.toBeInTheDocument();
  });

  it("onBlur with non-numeric value does not call setTempo but closes input", async () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByText("120.00"));
    const input = screen.getByDisplayValue("120.00");
    fireEvent.change(input, { target: { value: "bad" } });
    await act(async () => { fireEvent.blur(input); });
    expect(mockTransportSetTempo).not.toHaveBeenCalled();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("onBlur clamps BPM below 20 to 20", async () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByText("120.00"));
    const input = screen.getByDisplayValue("120.00");
    fireEvent.change(input, { target: { value: "5" } });
    await act(async () => { fireEvent.blur(input); });
    expect(mockTransportSetTempo).toHaveBeenCalledWith(20);
  });

  it("onBlur clamps BPM above 999 to 999", async () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByText("120.00"));
    const input = screen.getByDisplayValue("120.00");
    fireEvent.change(input, { target: { value: "5000" } });
    await act(async () => { fireEvent.blur(input); });
    expect(mockTransportSetTempo).toHaveBeenCalledWith(999);
  });
});

describe("Toolbar — cable routing toggle", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    resetStores();
    useAppStore.setState({ cableRouting: "manhattan" });
  });

  afterEach(() => {
    bridge.uninstall();
    vi.clearAllMocks();
  });

  it("renders MAN and BEZ toggle buttons", () => {
    render(<Toolbar />);
    expect(screen.getByTitle(/manhattan/i)).toBeInTheDocument();
    expect(screen.getByTitle(/bezier/i)).toBeInTheDocument();
  });

  it("clicking BEZ updates cableRouting to bezier", () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTitle(/bezier/i));
    expect(useAppStore.getState().cableRouting).toBe("bezier");
  });

  it("clicking MAN updates cableRouting to manhattan", () => {
    useAppStore.setState({ cableRouting: "bezier" });
    render(<Toolbar />);
    fireEvent.click(screen.getByTitle(/manhattan/i));
    expect(useAppStore.getState().cableRouting).toBe("manhattan");
  });
});

// QUARANTINE: scene navigation UI shelved (D3, 2026-05-30). Restore when revived.
describe.skip("Toolbar — scene navigation", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    resetStores();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    usePerformStore.setState((s: any) => ({
      scenes: [
        { id: "s1", name: "Scene 1", index: 0, active: false, hasCapture: false },
        { id: "s2", name: "Scene 2", index: 1, active: false, hasCapture: false },
        { id: "s3", name: "Scene 3", index: 2, active: false, hasCapture: false },
      ],
      liveHealth: s.liveHealth,
    }));
    useAppStore.setState({ activeScene: 0 });
  });

  afterEach(() => {
    bridge.uninstall();
    vi.clearAllMocks();
  });

  it("shows SCENE 1/3 label with 3 scenes and activeScene=0", () => {
    render(<Toolbar />);
    expect(screen.getByText(/scene 1\/3/i)).toBeInTheDocument();
  });

  it("clicking Next scene advances activeScene", () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByRole("button", { name: /next scene/i }));
    expect(useAppStore.getState().activeScene).toBe(1);
  });

  it("clicking Prev scene wraps around from 0 to last", () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByRole("button", { name: /previous scene/i }));
    expect(useAppStore.getState().activeScene).toBe(2);
  });

  it("clicking Next wraps around from last to 0", () => {
    useAppStore.setState({ activeScene: 2 });
    render(<Toolbar />);
    fireEvent.click(screen.getByRole("button", { name: /next scene/i }));
    expect(useAppStore.getState().activeScene).toBe(0);
  });

  it("shows orange capture dot when activeSceneData.hasCapture=true", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    usePerformStore.setState((s: any) => ({
      scenes: [{ id: "s1", name: "Scene 1", index: 0, active: true, hasCapture: true }],
      liveHealth: s.liveHealth,
    }));
    render(<Toolbar />);
    expect(
      screen.getByTitle(/this scene has a stored parameter capture/i),
    ).toBeInTheDocument();
  });

  it("does not show capture dot when hasCapture=false", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    usePerformStore.setState((s: any) => ({
      scenes: [{ id: "s1", name: "Scene 1", index: 0, active: true, hasCapture: false }],
      liveHealth: s.liveHealth,
    }));
    render(<Toolbar />);
    expect(
      screen.queryByTitle(/this scene has a stored parameter capture/i),
    ).not.toBeInTheDocument();
  });
});

// QUARANTINE: scene add/capture UI shelved (D3, 2026-05-30). Restore when revived.
describe.skip("Toolbar — scene add and capture", () => {
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

  it("clicking + button calls nativePerformAddScene", async () => {
    render(<Toolbar />);
    await act(async () => {
      fireEvent.click(screen.getByTitle(/add perform scene/i));
    });
    await waitFor(() => expect(mockPerformAddScene).toHaveBeenCalled());
  });

  it("clicking CAP button calls nativePerformCaptureScene", async () => {
    render(<Toolbar />);
    await act(async () => {
      fireEvent.click(screen.getByTitle(/capture current graph parameters/i));
    });
    await waitFor(() => expect(mockPerformCaptureScene).toHaveBeenCalled());
  });

  it("CAP button is disabled while capture is in progress", async () => {
    // Make capture take a while
    let resolveCapture!: () => void;
    mockPerformCaptureScene.mockReturnValueOnce(
      new Promise<undefined>((r) => { resolveCapture = r as () => void; }),
    );
    render(<Toolbar />);
    const capBtn = screen.getByTitle(/capture current graph parameters/i);
    await act(async () => { fireEvent.click(capBtn); });
    expect(capBtn).toBeDisabled();
    await act(async () => { resolveCapture(); });
    await waitFor(() => expect(capBtn).not.toBeDisabled());
  });
});

describe("Toolbar — board selector dropdown", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    resetStores();
    useSessionStore.setState({
      filePath: "/test/song.els",
      dirty: false,
      graphs: [
        { id: "g1", name: "Main", index: 0, active: true },
        { id: "g2", name: "FX", index: 1, active: false },
      ],
    });
  });

  afterEach(() => {
    bridge.uninstall();
    vi.clearAllMocks();
  });

  it("renders Board selector when sessionGraphs.length > 1", () => {
    render(<Toolbar />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("changing Board selector calls nativeSessionSetActiveGraph with numeric index", async () => {
    render(<Toolbar />);
    const select = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.change(select, { target: { value: "1" } });
    });
    expect(mockSessionSetActiveGraph).toHaveBeenCalledWith(1);
  });

  it("does not render Board selector when only 1 graph exists", () => {
    useSessionStore.setState({
      filePath: "",
      dirty: false,
      graphs: [{ id: "g1", name: "Main", index: 0, active: true }],
    });
    render(<Toolbar />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

describe("Toolbar — EV_OPEN_PREFERENCES event", () => {
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

  it("dispatching EV_OPEN_PREFERENCES event opens the preferences modal", async () => {
    render(<Toolbar />);
    act(() => {
      window.dispatchEvent(new Event(EV_OPEN_PREFERENCES));
    });
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toBeInTheDocument(),
    );
  });
});

// QUARANTINE: perform mode right panel shelved (D3, 2026-05-30). Restore when revived.
describe.skip("Toolbar — perform mode right panel", () => {
  let bridge: JuceBridgeMock;

  beforeEach(() => {
    bridge = installJuceBridgeMock();
    bridge.mock.mockResolvedValue(undefined);
    resetStores();
    useAppStore.setState({ mode: "perform" });
  });

  afterEach(() => {
    bridge.uninstall();
    vi.clearAllMocks();
  });

  it("renders PANIC button in perform mode", () => {
    render(<Toolbar />);
    expect(screen.getByRole("button", { name: /panic/i })).toBeInTheDocument();
  });

  it("renders About button in perform mode", () => {
    render(<Toolbar />);
    expect(screen.getByRole("button", { name: /about/i })).toBeInTheDocument();
  });

  it("renders Preferences button in perform mode", () => {
    render(<Toolbar />);
    expect(screen.getByRole("button", { name: /preferences/i })).toBeInTheDocument();
  });

  it("shows active scene name in perform mode when scene has a name", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    usePerformStore.setState((s: any) => ({
      scenes: [{ id: "s1", name: "Main Stage", index: 0, active: true, hasCapture: false }],
      liveHealth: s.liveHealth,
    }));
    useAppStore.setState({ mode: "perform", activeScene: 0 });
    render(<Toolbar />);
    expect(screen.getByText("Main Stage")).toBeInTheDocument();
  });
});
