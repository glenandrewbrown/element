/**
 * Tests for usePerformStore — updateMacro, activateScene rollback,
 * hydrateFromEngine, loadMappedParametersFromHost, toggleMapMode, selectors.
 *
 * markParameterMapped is covered in usePerformStore.markParameterMapped.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bridge/juceBackend", () => ({
  invokeElementNative: vi.fn(async () => undefined),
}));

vi.mock("../../bridge/nativePerform", () => ({
  nativePerformSetActiveScene: vi.fn(async () => true),
}));

import { invokeElementNative } from "../../bridge/juceBackend";
import { nativePerformSetActiveScene } from "../../bridge/nativePerform";
import {
  usePerformStore,
  loadMappedParametersFromHost,
  selectActiveScene,
  selectBpm,
  selectCpu,
  selectIsPlaying,
  selectMacroById,
  selectMappedParameters,
  selectMapMode,
  selectOutputPeak,
  selectScenes,
  selectSessionName,
  selectTimecode,
} from "../usePerformStore";
import type { SceneData } from "../../data/types";

const mockInvoke = invokeElementNative as unknown as ReturnType<typeof vi.fn>;
const mockSetScene = nativePerformSetActiveScene as unknown as ReturnType<typeof vi.fn>;

const SCENE_A: SceneData = { id: "s1", index: 0, name: "Scene A", active: true };
const SCENE_B: SceneData = { id: "s2", index: 1, name: "Scene B", active: false };

function resetStore() {
  mockInvoke.mockReset();
  mockSetScene.mockReset();
  mockInvoke.mockResolvedValue(undefined);
  mockSetScene.mockResolvedValue(true);
  usePerformStore.setState({
    sessionName: "Project",
    macros: [],
    scenes: [],
    liveHealth: {
      cpu: 0, buffer: 0, latency: 0, clock: "—", bpm: 120,
      timecode: "—", sampleRateLabel: "—", alerts: [],
      ioActivity: "nominal", outputPeak: 0,
      outputPeakL: 0, outputPeakR: 0, inputPeak: 0,
    },
    isPlaying: false,
    mapModeActive: false,
    mappedParameters: new Set(),
  });
}

// ── updateMacro ──────────────────────────────────────────────────────────────

describe("usePerformStore.updateMacro", () => {
  beforeEach(resetStore);
  afterEach(() => { mockInvoke.mockReset(); mockSetScene.mockReset(); });

  it("updates matching macro value", () => {
    usePerformStore.setState({
      macros: [
        { id: "m1", name: "Vol", sourceBlock: "n1", sourceParam: "p0", value: 0, type: "knob", signalType: "value" },
        { id: "m2", name: "Pan", sourceBlock: "n2", sourceParam: "p0", value: 0.5, type: "knob", signalType: "value" },
      ],
    });
    usePerformStore.getState().updateMacro("m1", 0.8);
    const macros = usePerformStore.getState().macros;
    expect(macros.find((m) => m.id === "m1")?.value).toBe(0.8);
    expect(macros.find((m) => m.id === "m2")?.value).toBe(0.5);
  });

  it("no-op when macro id not found", () => {
    usePerformStore.setState({
      macros: [{ id: "m1", name: "X", sourceBlock: "n1", sourceParam: "p0", value: 0.5, type: "knob", signalType: "value" }],
    });
    usePerformStore.getState().updateMacro("missing", 1.0);
    expect(usePerformStore.getState().macros[0].value).toBe(0.5);
  });
});

// ── activateScene ─────────────────────────────────────────────────────────────

describe("usePerformStore.activateScene", () => {
  beforeEach(resetStore);
  afterEach(() => { mockInvoke.mockReset(); mockSetScene.mockReset(); });

  it("optimistically sets active scene then confirms with bridge", async () => {
    mockSetScene.mockResolvedValueOnce(true);
    usePerformStore.setState({ scenes: [{ ...SCENE_A }, { ...SCENE_B }] });
    await usePerformStore.getState().activateScene(1);
    const scenes = usePerformStore.getState().scenes;
    expect(scenes[0].active).toBe(false);
    expect(scenes[1].active).toBe(true);
  });

  it("calls bridge with correct scene index", async () => {
    mockSetScene.mockResolvedValueOnce(true);
    usePerformStore.setState({ scenes: [{ ...SCENE_A }, { ...SCENE_B }] });
    await usePerformStore.getState().activateScene(1);
    expect(mockSetScene).toHaveBeenCalledWith(1);
  });

  it("rolls back when bridge returns false", async () => {
    mockSetScene.mockResolvedValueOnce(false);
    usePerformStore.setState({ scenes: [{ ...SCENE_A }, { ...SCENE_B }] });
    await usePerformStore.getState().activateScene(1);
    const scenes = usePerformStore.getState().scenes;
    expect(scenes[0].active).toBe(true);
    expect(scenes[1].active).toBe(false);
  });

  it("rolls back when bridge throws", async () => {
    mockSetScene.mockRejectedValueOnce(new Error("bridge down"));
    usePerformStore.setState({ scenes: [{ ...SCENE_A }, { ...SCENE_B }] });
    await usePerformStore.getState().activateScene(1);
    const scenes = usePerformStore.getState().scenes;
    expect(scenes[0].active).toBe(true);
    expect(scenes[1].active).toBe(false);
  });
});

// ── toggleMapMode ─────────────────────────────────────────────────────────────

describe("usePerformStore.toggleMapMode", () => {
  beforeEach(resetStore);

  it("toggles false -> true", () => {
    usePerformStore.getState().toggleMapMode();
    expect(usePerformStore.getState().mapModeActive).toBe(true);
  });

  it("toggles true -> false", () => {
    usePerformStore.setState({ mapModeActive: true });
    usePerformStore.getState().toggleMapMode();
    expect(usePerformStore.getState().mapModeActive).toBe(false);
  });
});

// ── hydrateFromEngine ─────────────────────────────────────────────────────────

describe("usePerformStore.hydrateFromEngine", () => {
  beforeEach(resetStore);

  it("updates sessionName", () => {
    usePerformStore.getState().hydrateFromEngine({ sessionName: "My Project" });
    expect(usePerformStore.getState().sessionName).toBe("My Project");
  });

  it("sets scenes with activeSceneIndex", () => {
    usePerformStore.getState().hydrateFromEngine({
      scenes: [
        { id: "s1", index: 0, name: "A", active: false },
        { id: "s2", index: 1, name: "B", active: false },
      ],
      activeSceneIndex: 1,
    });
    const scenes = usePerformStore.getState().scenes;
    expect(scenes[0].active).toBe(false);
    expect(scenes[1].active).toBe(true);
  });

  it("clears scenes when empty array passed", () => {
    usePerformStore.setState({ scenes: [{ ...SCENE_A }] });
    usePerformStore.getState().hydrateFromEngine({ scenes: [] });
    expect(usePerformStore.getState().scenes).toEqual([]);
  });

  it("updates bpm, buffer, clock, timecode, sampleRateLabel, cpu", () => {
    usePerformStore.getState().hydrateFromEngine({
      bpm: 140,
      buffer: 512,
      clock: "4/4",
      timecode: "00:01:00:00",
      sampleRateLabel: "48.0 kHz",
      cpu: 23,
    });
    const h = usePerformStore.getState().liveHealth;
    expect(h.bpm).toBe(140);
    expect(h.buffer).toBe(512);
    expect(h.clock).toBe("4/4");
    expect(h.timecode).toBe("00:01:00:00");
    expect(h.sampleRateLabel).toBe("48.0 kHz");
    expect(h.cpu).toBe(23);
  });

  it("updates latency from latencyMs", () => {
    usePerformStore.getState().hydrateFromEngine({ latencyMs: 11.5 });
    expect(usePerformStore.getState().liveHealth.latency).toBe(11.5);
  });

  it("ignores NaN latencyMs — keeps previous", () => {
    usePerformStore.setState({
      liveHealth: { ...usePerformStore.getState().liveHealth, latency: 5 },
    });
    usePerformStore.getState().hydrateFromEngine({ latencyMs: NaN });
    expect(usePerformStore.getState().liveHealth.latency).toBe(5);
  });

  it("updates isPlaying", () => {
    usePerformStore.getState().hydrateFromEngine({ isPlaying: true });
    expect(usePerformStore.getState().isPlaying).toBe(true);
  });

  it("does not override isPlaying when not provided", () => {
    usePerformStore.setState({ isPlaying: true });
    usePerformStore.getState().hydrateFromEngine({ bpm: 130 });
    expect(usePerformStore.getState().isPlaying).toBe(true);
  });
});

// ── loadMappedParametersFromHost ─────────────────────────────────────────────

describe("loadMappedParametersFromHost", () => {
  beforeEach(resetStore);
  afterEach(() => { mockInvoke.mockReset(); });

  it("populates mappedParameters from bridge array", async () => {
    mockInvoke.mockResolvedValueOnce([
      { nodeId: "n1", paramIndex: 0 },
      { nodeId: "n2", paramIndex: 3 },
    ]);
    await loadMappedParametersFromHost();
    const mapped = usePerformStore.getState().mappedParameters;
    expect(mapped.has("n1:0")).toBe(true);
    expect(mapped.has("n2:3")).toBe(true);
  });

  it("clears mapped set when bridge returns empty array", async () => {
    usePerformStore.setState({ mappedParameters: new Set(["n1:0"]) });
    mockInvoke.mockResolvedValueOnce([]);
    await loadMappedParametersFromHost();
    expect(usePerformStore.getState().mappedParameters.size).toBe(0);
  });

  it("no-op when bridge returns non-array", async () => {
    usePerformStore.setState({ mappedParameters: new Set(["n1:0"]) });
    mockInvoke.mockResolvedValueOnce(null);
    await loadMappedParametersFromHost();
    expect(usePerformStore.getState().mappedParameters.has("n1:0")).toBe(true);
  });
});

// ── Selectors ────────────────────────────────────────────────────────────────

describe("selectors", () => {
  beforeEach(resetStore);

  it("selectSessionName", () => {
    usePerformStore.setState({ sessionName: "Test" });
    expect(selectSessionName(usePerformStore.getState())).toBe("Test");
  });

  it("selectScenes", () => {
    usePerformStore.setState({ scenes: [{ ...SCENE_A }] });
    expect(selectScenes(usePerformStore.getState())).toHaveLength(1);
  });

  it("selectActiveScene returns active scene", () => {
    usePerformStore.setState({ scenes: [{ ...SCENE_A }, { ...SCENE_B }] });
    expect(selectActiveScene(usePerformStore.getState())?.id).toBe("s1");
  });

  it("selectActiveScene returns undefined when no active", () => {
    usePerformStore.setState({
      scenes: [{ ...SCENE_A, active: false }, { ...SCENE_B }],
    });
    expect(selectActiveScene(usePerformStore.getState())).toBeUndefined();
  });

  it("selectBpm", () => {
    usePerformStore.setState({
      liveHealth: { ...usePerformStore.getState().liveHealth, bpm: 160 },
    });
    expect(selectBpm(usePerformStore.getState())).toBe(160);
  });

  it("selectCpu", () => {
    usePerformStore.setState({
      liveHealth: { ...usePerformStore.getState().liveHealth, cpu: 42 },
    });
    expect(selectCpu(usePerformStore.getState())).toBe(42);
  });

  it("selectIsPlaying", () => {
    usePerformStore.setState({ isPlaying: true });
    expect(selectIsPlaying(usePerformStore.getState())).toBe(true);
  });

  it("selectMapMode", () => {
    usePerformStore.setState({ mapModeActive: true });
    expect(selectMapMode(usePerformStore.getState())).toBe(true);
  });

  it("selectMappedParameters", () => {
    const s = new Set(["n1:0"]);
    usePerformStore.setState({ mappedParameters: s });
    expect(selectMappedParameters(usePerformStore.getState())).toBe(s);
  });

  it("selectOutputPeak", () => {
    usePerformStore.setState({
      liveHealth: { ...usePerformStore.getState().liveHealth, outputPeak: 0.9 },
    });
    expect(selectOutputPeak(usePerformStore.getState())).toBe(0.9);
  });

  it("selectTimecode", () => {
    usePerformStore.setState({
      liveHealth: { ...usePerformStore.getState().liveHealth, timecode: "01:23:45:00" },
    });
    expect(selectTimecode(usePerformStore.getState())).toBe("01:23:45:00");
  });

  it("selectMacroById returns matching macro", () => {
    usePerformStore.setState({
      macros: [
        { id: "m1", name: "Vol", sourceBlock: "n1", sourceParam: "p0", value: 0.5, type: "knob", signalType: "value" },
      ],
    });
    expect(selectMacroById("m1")(usePerformStore.getState())?.id).toBe("m1");
  });

  it("selectMacroById returns undefined for unknown id", () => {
    expect(selectMacroById("nope")(usePerformStore.getState())).toBeUndefined();
  });
});
