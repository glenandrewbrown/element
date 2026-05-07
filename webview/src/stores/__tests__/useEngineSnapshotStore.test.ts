/**
 * Tests for `useEngineSnapshotStore` — US-002 / Wave 2 engine status
 * snapshot. Mocks the JUCE backend (`invokeElementNative`) and verifies:
 *   1) `refresh()` parses host JSON and hydrates store fields
 *   2) `refresh()` write-throughs CPU/sample-rate/buffer/device into
 *      `usePerformStore.liveHealth`
 *   3) `startPolling()` is idempotent
 *   4) Selectors return the expected derived values
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  selectCpuPercent,
  selectDeviceLatencyMs,
  selectEngineRunning,
  useEngineSnapshotStore,
} from "../useEngineSnapshotStore";
import { usePerformStore } from "../usePerformStore";

// Mock the JUCE backend so `invokeElementNative` can be controlled per-test.
vi.mock("../../bridge/juceBackend", () => ({
  invokeElementNative: vi.fn(async () => undefined),
}));
import { invokeElementNative } from "../../bridge/juceBackend";

const mockInvoke = invokeElementNative as unknown as ReturnType<typeof vi.fn>;

const SAMPLE_PAYLOAD = {
  cpu: 0.0123,
  engineRunning: true,
  sampleRate: 48000,
  bufferSize: 512,
  deviceName: "Fireface 802",
  deviceLatencyInputMs: 1.5,
  deviceLatencyOutputMs: 1.8,
  transportPlaying: false,
  transportRecording: false,
  tempoBpm: 124.5,
  timeSig: [4, 4],
};

describe("useEngineSnapshotStore", () => {
  beforeEach(() => {
    // Reset store to initial state between tests.
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
      lastUpdated: 0,
      hasHostData: false,
    });
    mockInvoke.mockReset();
  });

  afterEach(() => {
    useEngineSnapshotStore.getState().stopPolling();
  });

  it("refresh() hydrates store fields from a JSON payload", async () => {
    mockInvoke.mockResolvedValueOnce(JSON.stringify(SAMPLE_PAYLOAD));

    await useEngineSnapshotStore.getState().refresh();
    const s = useEngineSnapshotStore.getState();
    expect(s.cpu).toBeCloseTo(0.0123);
    expect(s.engineRunning).toBe(true);
    expect(s.sampleRate).toBe(48000);
    expect(s.bufferSize).toBe(512);
    expect(s.deviceName).toBe("Fireface 802");
    expect(s.tempoBpm).toBeCloseTo(124.5);
    expect(s.timeSig).toEqual([4, 4]);
    expect(s.hasHostData).toBe(true);
    expect(s.lastUpdated).toBeGreaterThan(0);
  });

  it("refresh() also accepts a plain object payload (already-parsed)", async () => {
    mockInvoke.mockResolvedValueOnce(SAMPLE_PAYLOAD);
    await useEngineSnapshotStore.getState().refresh();
    expect(useEngineSnapshotStore.getState().deviceName).toBe("Fireface 802");
  });

  it("refresh() write-throughs into usePerformStore.liveHealth", async () => {
    mockInvoke.mockResolvedValueOnce(JSON.stringify(SAMPLE_PAYLOAD));

    await useEngineSnapshotStore.getState().refresh();
    const lh = usePerformStore.getState().liveHealth;
    // CPU is converted to percent (0..100, capped at 99.9).
    expect(lh.cpu).toBeCloseTo(1.23, 2);
    expect(lh.buffer).toBe(512);
    expect(lh.clock).toBe("Fireface 802");
    expect(lh.sampleRateLabel).toBe("48.0 kHz");
    expect(lh.latency).toBeCloseTo(3.3, 2);
  });

  it("refresh() does nothing when host returns null (dev / no bridge)", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await useEngineSnapshotStore.getState().refresh();
    const s = useEngineSnapshotStore.getState();
    expect(s.hasHostData).toBe(false);
    expect(s.lastUpdated).toBe(0);
  });

  it("startPolling() is idempotent for the same interval", () => {
    vi.useFakeTimers();
    try {
      const stop1 = useEngineSnapshotStore.getState().startPolling(250);
      const stop2 = useEngineSnapshotStore.getState().startPolling(250);
      // Both return functions; calling stop1 leaves the second call a no-op
      // (single underlying interval).
      expect(typeof stop1).toBe("function");
      expect(typeof stop2).toBe("function");
      // Advance past the immediate refresh + one tick — invocation count
      // should reflect a single setInterval, not two.
      vi.advanceTimersByTime(550);
      // 1 immediate call (set up by startPolling) + 2 ticks (550ms / 250ms).
      expect(mockInvoke).toHaveBeenCalledTimes(3);
    } finally {
      useEngineSnapshotStore.getState().stopPolling();
      vi.useRealTimers();
    }
  });

  it("selectors derive percent / latency / engineRunning correctly", () => {
    useEngineSnapshotStore.setState({
      cpu: 0.42,
      deviceLatencyInputMs: 2.5,
      deviceLatencyOutputMs: 3.5,
      engineRunning: true,
    });
    const s = useEngineSnapshotStore.getState();
    expect(selectCpuPercent(s)).toBeCloseTo(42);
    expect(selectDeviceLatencyMs(s)).toBeCloseTo(6);
    expect(selectEngineRunning(s)).toBe(true);
  });

  it("selectCpuPercent caps at 99.9", () => {
    useEngineSnapshotStore.setState({ cpu: 5 });
    expect(selectCpuPercent(useEngineSnapshotStore.getState())).toBe(99.9);
  });
});
