/**
 * Gap tests for usePerformStore — rollback paths and edge cases not covered
 * by usePerformStore.test.ts or usePerformStore.markParameterMapped.test.ts.
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
import { usePerformStore } from "../usePerformStore";
import type { SceneData, MacroControl } from "../../data/types";

const mockInvoke = invokeElementNative as unknown as ReturnType<typeof vi.fn>;
const mockSetScene = nativePerformSetActiveScene as unknown as ReturnType<typeof vi.fn>;

const SCENE_A: SceneData = { id: "s1", index: 0, name: "Scene A", active: true };
const SCENE_B: SceneData = { id: "s2", index: 1, name: "Scene B", active: false };

const defaultHealth = {
  cpu: 0,
  buffer: 0,
  latency: 0,
  clock: "—",
  bpm: 120,
  timecode: "—",
  sampleRateLabel: "—",
  alerts: [],
  ioActivity: "nominal" as const,
  outputPeak: 0,
  outputPeakL: 0,
  outputPeakR: 0,
  inputPeak: 0,
};

function resetStore() {
  mockInvoke.mockReset();
  mockSetScene.mockReset();
  mockInvoke.mockResolvedValue(undefined);
  mockSetScene.mockResolvedValue(true);
  usePerformStore.setState({
    sessionName: "Project",
    macros: [],
    scenes: [],
    liveHealth: { ...defaultHealth },
    isPlaying: false,
    mapModeActive: false,
    mappedParameters: new Set<string>(),
  });
}

// ── activateScene ─────────────────────────────────────────────────────────────

describe("usePerformStore.activateScene — rollback", () => {
  beforeEach(resetStore);
  afterEach(() => { mockInvoke.mockReset(); mockSetScene.mockReset(); });

  it("optimistic update is confirmed when bridge returns true", async () => {
    mockSetScene.mockResolvedValueOnce(true);
    usePerformStore.setState({ scenes: [{ ...SCENE_A }, { ...SCENE_B }] });
    await usePerformStore.getState().activateScene(1);
    const scenes = usePerformStore.getState().scenes;
    expect(scenes[0].active).toBe(false);
    expect(scenes[1].active).toBe(true);
  });

  it("rolls back to previous scenes when bridge returns false", async () => {
    mockSetScene.mockResolvedValueOnce(false);
    usePerformStore.setState({ scenes: [{ ...SCENE_A }, { ...SCENE_B }] });
    await usePerformStore.getState().activateScene(1);
    const scenes = usePerformStore.getState().scenes;
    expect(scenes[0].active).toBe(true);
    expect(scenes[1].active).toBe(false);
  });

  it("rolls back to previous scenes when bridge throws", async () => {
    mockSetScene.mockRejectedValueOnce(new Error("network error"));
    usePerformStore.setState({ scenes: [{ ...SCENE_A }, { ...SCENE_B }] });
    await usePerformStore.getState().activateScene(1);
    const scenes = usePerformStore.getState().scenes;
    expect(scenes[0].active).toBe(true);
    expect(scenes[1].active).toBe(false);
  });
});

// ── markParameterMapped ───────────────────────────────────────────────────────

describe("usePerformStore.markParameterMapped — rollback", () => {
  beforeEach(resetStore);
  afterEach(() => { mockInvoke.mockReset(); });

  it("removes parameter from mappedParameters when bridge returns false (add path)", async () => {
    mockInvoke.mockResolvedValueOnce(false);
    await usePerformStore.getState().markParameterMapped("node-1", 0, true);
    expect(usePerformStore.getState().mappedParameters.has("node-1:0")).toBe(false);
  });

  it("restores parameter in mappedParameters when bridge throws (add path)", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("bridge down"));
    await usePerformStore.getState().markParameterMapped("node-2", 3, true);
    expect(usePerformStore.getState().mappedParameters.has("node-2:3")).toBe(false);
  });
});

// ── hydrateFromEngine ─────────────────────────────────────────────────────────

describe("usePerformStore.hydrateFromEngine — edge cases", () => {
  beforeEach(resetStore);

  it("does not throw when all optional fields are omitted", () => {
    expect(() =>
      usePerformStore.getState().hydrateFromEngine({}),
    ).not.toThrow();
  });

  it("keeps all defaults when called with empty object", () => {
    const before = usePerformStore.getState();
    usePerformStore.getState().hydrateFromEngine({});
    const after = usePerformStore.getState();
    expect(after.sessionName).toBe(before.sessionName);
    expect(after.isPlaying).toBe(before.isPlaying);
    expect(after.liveHealth.bpm).toBe(before.liveHealth.bpm);
  });

  it("sets isPlaying to true when provided", () => {
    usePerformStore.getState().hydrateFromEngine({ isPlaying: true });
    expect(usePerformStore.getState().isPlaying).toBe(true);
  });

  it("sets isPlaying to false when provided", () => {
    usePerformStore.setState({ isPlaying: true });
    usePerformStore.getState().hydrateFromEngine({ isPlaying: false });
    expect(usePerformStore.getState().isPlaying).toBe(false);
  });

  it("does not override isPlaying when isPlaying is not provided", () => {
    usePerformStore.setState({ isPlaying: true });
    usePerformStore.getState().hydrateFromEngine({ bpm: 140 });
    expect(usePerformStore.getState().isPlaying).toBe(true);
  });
});

// ── updateMacro ───────────────────────────────────────────────────────────────

describe("usePerformStore.updateMacro", () => {
  beforeEach(resetStore);

  const makeMacro = (id: string, value: number): MacroControl => ({
    id,
    name: id,
    sourceBlock: "n1",
    sourceParam: "p0",
    value,
    type: "knob",
    signalType: "value",
  });

  it("updates the matching macro value", () => {
    usePerformStore.setState({
      macros: [makeMacro("m1", 0.0), makeMacro("m2", 0.5)],
    });
    usePerformStore.getState().updateMacro("m1", 0.9);
    expect(usePerformStore.getState().macros.find((m) => m.id === "m1")?.value).toBe(0.9);
    expect(usePerformStore.getState().macros.find((m) => m.id === "m2")?.value).toBe(0.5);
  });

  it("leaves macros unchanged when id does not match any macro", () => {
    usePerformStore.setState({ macros: [makeMacro("m1", 0.3)] });
    usePerformStore.getState().updateMacro("unknown", 1.0);
    expect(usePerformStore.getState().macros[0].value).toBe(0.3);
  });
});
