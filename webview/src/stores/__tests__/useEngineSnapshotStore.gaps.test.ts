/**
 * Gap tests for useEngineSnapshotStore — covers branches not exercised by
 * useEngineSnapshotStore.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bridge/nativeEngineSnapshot", () => ({
  nativeGetEngineSnapshot: vi.fn(async () => null),
  DEFAULT_ENGINE_SNAPSHOT: {
    cpu: 0,
    engineRunning: false,
    sampleRate: 0,
    bufferSize: 0,
    deviceName: "",
    deviceLatencyInputMs: 0,
    deviceLatencyOutputMs: 0,
    transportPlaying: false,
    transportRecording: false,
    tempoBpm: 120,
    timeSig: [4, 4] as [number, number],
    transportFrame: 0,
    transportTimecode: "1.1.0",
  },
}));

// Also mock juceBackend so the write-through into usePerformStore does not
// trigger real bridge calls during these gap tests.
vi.mock("../../bridge/juceBackend", () => ({
  invokeElementNative: vi.fn(async () => undefined),
}));

import { nativeGetEngineSnapshot } from "../../bridge/nativeEngineSnapshot";
import {
  selectCpuPercent,
  useEngineSnapshotStore,
} from "../useEngineSnapshotStore";

const mockGetSnapshot = nativeGetEngineSnapshot as ReturnType<typeof vi.fn>;

const BASE_SNAPSHOT = {
  cpu: 0.1,
  engineRunning: true,
  sampleRate: 44100,
  bufferSize: 256,
  deviceName: "Built-in",
  deviceLatencyInputMs: 1.0,
  deviceLatencyOutputMs: 1.0,
  transportPlaying: false,
  transportRecording: false,
  tempoBpm: 120,
  timeSig: [4, 4] as [number, number],
  transportFrame: 0,
  transportTimecode: "1.1.0",
};

function resetStore() {
  useEngineSnapshotStore.getState().stopPolling();
  useEngineSnapshotStore.setState({
    cpu: 0,
    engineRunning: false,
    sampleRate: 0,
    bufferSize: 0,
    deviceName: "",
    deviceLatencyInputMs: 0,
    deviceLatencyOutputMs: 0,
    transportPlaying: false,
    transportRecording: false,
    tempoBpm: 120,
    timeSig: [4, 4],
    transportFrame: 0,
    transportTimecode: "1.1.0",
    lastUpdated: 0,
    hasHostData: false,
  });
  mockGetSnapshot.mockReset();
}

describe("useEngineSnapshotStore — idle-tick guard", () => {
  beforeEach(resetStore);
  afterEach(() => useEngineSnapshotStore.getState().stopPolling());

  it("second refresh with identical payload does not change lastUpdated", async () => {
    mockGetSnapshot.mockResolvedValue({ ...BASE_SNAPSHOT });
    await useEngineSnapshotStore.getState().refresh();

    // Overwrite lastUpdated to a sentinel after the first set() so we can
    // detect whether a second set() fires on the next identical refresh.
    useEngineSnapshotStore.setState({ lastUpdated: 999 });

    mockGetSnapshot.mockResolvedValue({ ...BASE_SNAPSHOT });
    await useEngineSnapshotStore.getState().refresh();

    expect(useEngineSnapshotStore.getState().lastUpdated).toBe(999);
  });
});

describe("useEngineSnapshotStore — refresh with null/undefined", () => {
  beforeEach(resetStore);
  afterEach(() => useEngineSnapshotStore.getState().stopPolling());

  it("refresh with null from bridge leaves state unchanged", async () => {
    mockGetSnapshot.mockResolvedValueOnce(null);
    await useEngineSnapshotStore.getState().refresh();
    expect(useEngineSnapshotStore.getState().hasHostData).toBe(false);
    expect(useEngineSnapshotStore.getState().lastUpdated).toBe(0);
  });

  it("refresh with undefined from bridge leaves state unchanged", async () => {
    mockGetSnapshot.mockResolvedValueOnce(undefined);
    await useEngineSnapshotStore.getState().refresh();
    expect(useEngineSnapshotStore.getState().hasHostData).toBe(false);
  });
});

describe("useEngineSnapshotStore — snapshotChanged triggers", () => {
  beforeEach(resetStore);
  afterEach(() => useEngineSnapshotStore.getState().stopPolling());

  it("change in timeSig[0] triggers a store update and persists the new value", async () => {
    mockGetSnapshot.mockResolvedValueOnce({ ...BASE_SNAPSHOT });
    await useEngineSnapshotStore.getState().refresh();

    mockGetSnapshot.mockResolvedValueOnce({ ...BASE_SNAPSHOT, timeSig: [3, 4] as [number, number] });
    await useEngineSnapshotStore.getState().refresh();
    expect(useEngineSnapshotStore.getState().timeSig[0]).toBe(3);
    expect(useEngineSnapshotStore.getState().lastUpdated).toBeGreaterThan(0);
  });

  it("change in transportTimecode triggers a store update and persists the new value", async () => {
    mockGetSnapshot.mockResolvedValueOnce({ ...BASE_SNAPSHOT });
    await useEngineSnapshotStore.getState().refresh();

    mockGetSnapshot.mockResolvedValueOnce({ ...BASE_SNAPSHOT, transportTimecode: "2.1.0" });
    await useEngineSnapshotStore.getState().refresh();
    expect(useEngineSnapshotStore.getState().transportTimecode).toBe("2.1.0");
    expect(useEngineSnapshotStore.getState().hasHostData).toBe(true);
  });

  it("identical payload after hasHostData=true skips the store set call", async () => {
    mockGetSnapshot.mockResolvedValue({ ...BASE_SNAPSHOT });
    await useEngineSnapshotStore.getState().refresh();

    // Overwrite lastUpdated to a sentinel so we can detect if set() fires again.
    useEngineSnapshotStore.setState({ lastUpdated: 1 });

    await useEngineSnapshotStore.getState().refresh();
    expect(useEngineSnapshotStore.getState().lastUpdated).toBe(1);
  });
});

describe("useEngineSnapshotStore — startPolling with different interval", () => {
  beforeEach(resetStore);
  afterEach(() => {
    useEngineSnapshotStore.getState().stopPolling();
    vi.useRealTimers();
  });

  it("startPolling with a different interval replaces the running interval", () => {
    vi.useFakeTimers();
    mockGetSnapshot.mockResolvedValue(null);

    useEngineSnapshotStore.getState().startPolling(250);
    useEngineSnapshotStore.getState().startPolling(500);

    vi.advanceTimersByTime(1100);
    // startPolling(250) fires an immediate refresh, then startPolling(500)
    // cancels that interval and fires another immediate refresh, then 2 ticks
    // at 500ms and 1000ms. Total = 4. If both intervals were still running we
    // would see significantly more (~6+) calls.
    expect(mockGetSnapshot.mock.calls.length).toBeLessThanOrEqual(4);
  });
});

describe("useEngineSnapshotStore — stopPolling when not running", () => {
  beforeEach(resetStore);

  it("stopPolling when polling is not running does not throw", () => {
    expect(() => useEngineSnapshotStore.getState().stopPolling()).not.toThrow();
  });

  it("stopPolling can be called multiple times without throwing", () => {
    useEngineSnapshotStore.getState().stopPolling();
    expect(() => useEngineSnapshotStore.getState().stopPolling()).not.toThrow();
  });
});

describe("selectCpuPercent — boundary values", () => {
  it("clamps to 0 for negative cpu fraction", () => {
    useEngineSnapshotStore.setState({ cpu: -0.5 });
    expect(selectCpuPercent(useEngineSnapshotStore.getState())).toBe(0);
  });

  it("clamps to 99.9 for cpu fraction greater than 1.0", () => {
    useEngineSnapshotStore.setState({ cpu: 2.0 });
    expect(selectCpuPercent(useEngineSnapshotStore.getState())).toBe(99.9);
  });

  it("returns exact percent for cpu fraction in range", () => {
    useEngineSnapshotStore.setState({ cpu: 0.25 });
    expect(selectCpuPercent(useEngineSnapshotStore.getState())).toBeCloseTo(25);
  });
});
