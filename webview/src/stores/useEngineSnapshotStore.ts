// US-002 / Wave 2 — engine snapshot store.
//
// Holds the engine-status fields polled from the C++
// `elementGetEngineSnapshot` handler. `startPolling` is idempotent — only
// one polling loop runs per app lifetime, regardless of how many components
// call into it. `useJuceBridge` calls `startPolling` once at mount so this
// store stays warm without any per-component effects.
//
// The store also write-throughs the live CPU value into `usePerformStore`
// so that out-of-scope readers (`ToolPalette`, `QuickAccess`,
// `LiveHealth.tsx`, `MetersPanel`) get the real CPU on the same channel
// that previously surfaced the fake `peak * 320` value.
import { create } from "zustand";
import {
  nativeGetEngineSnapshot,
  DEFAULT_ENGINE_SNAPSHOT,
  type EngineSnapshot,
} from "../bridge/nativeEngineSnapshot";
import { usePerformStore } from "./usePerformStore";

interface EngineSnapshotState extends EngineSnapshot {
  /** Last time `refresh()` succeeded (ms epoch); 0 = never. */
  lastUpdated: number;
  /** Whether `refresh()` ever produced a non-null host payload. */
  hasHostData: boolean;
}

interface EngineSnapshotActions {
  /** Fetch a single snapshot from the host and apply it to the store. */
  refresh: () => Promise<void>;
  /**
   * Start the polling loop. Idempotent — calling more than once with the
   * same intervalMs is a no-op. Returns a cleanup function that stops the
   * loop (used in test teardown / hot-reload).
   */
  startPolling: (intervalMs?: number) => () => void;
  /** Stop the polling loop (no-op if not running). */
  stopPolling: () => void;
}

type EngineSnapshotStore = EngineSnapshotState & EngineSnapshotActions;

// Module-level interval handle so polling really is a singleton.
// Keeping it outside the store state avoids needless re-renders.
let pollHandle: ReturnType<typeof setInterval> | null = null;
let pollIntervalMs = 0;

const initialState: EngineSnapshotState = {
  ...DEFAULT_ENGINE_SNAPSHOT,
  lastUpdated: 0,
  hasHostData: false,
};

export const useEngineSnapshotStore = create<EngineSnapshotStore>()(
  (set, get) => ({
    ...initialState,

    refresh: async () => {
      const snap = await nativeGetEngineSnapshot();
      if (snap == null) return;
      set({
        ...snap,
        lastUpdated: Date.now(),
        hasHostData: true,
      });
      // Write-through into usePerformStore.liveHealth so the existing
      // CPU/sample-rate/buffer/latency consumers (ToolPalette, QuickAccess,
      // LiveHealth.tsx, MetersPanel, StatusBar, InspectorHub) see the same
      // live value without each having to subscribe to this store directly.
      const cpuPercent = Math.min(99.9, Math.max(0, snap.cpu * 100));
      const sampleRateLabel =
        snap.sampleRate > 0
          ? `${(snap.sampleRate / 1000).toFixed(1)} kHz`
          : "—";
      const latencyMs = snap.deviceLatencyInputMs + snap.deviceLatencyOutputMs;
      usePerformStore.setState((s) => ({
        liveHealth: {
          ...s.liveHealth,
          cpu: cpuPercent,
          buffer: snap.bufferSize > 0 ? snap.bufferSize : s.liveHealth.buffer,
          clock: snap.deviceName.length > 0 ? snap.deviceName : s.liveHealth.clock,
          sampleRateLabel:
            snap.sampleRate > 0 ? sampleRateLabel : s.liveHealth.sampleRateLabel,
          latency: latencyMs > 0 ? latencyMs : s.liveHealth.latency,
        },
      }));
    },

    startPolling: (intervalMs = 250) => {
      // Idempotent: same interval already running -> reuse.
      if (pollHandle != null && pollIntervalMs === intervalMs) {
        return get().stopPolling;
      }
      // Different interval requested -> stop and restart.
      if (pollHandle != null) {
        clearInterval(pollHandle);
        pollHandle = null;
      }
      pollIntervalMs = intervalMs;
      // Fire one immediate refresh so consumers get data on the first tick.
      void get().refresh();
      pollHandle = setInterval(() => {
        void get().refresh();
      }, intervalMs);
      return get().stopPolling;
    },

    stopPolling: () => {
      if (pollHandle != null) {
        clearInterval(pollHandle);
        pollHandle = null;
        pollIntervalMs = 0;
      }
    },
  }),
);

// ── Selectors ──

export const selectCpuFraction = (s: EngineSnapshotStore) => s.cpu;
export const selectCpuPercent = (s: EngineSnapshotStore) =>
  Math.min(99.9, Math.max(0, s.cpu * 100));
export const selectEngineRunning = (s: EngineSnapshotStore) => s.engineRunning;
export const selectSampleRate = (s: EngineSnapshotStore) => s.sampleRate;
export const selectBufferSize = (s: EngineSnapshotStore) => s.bufferSize;
export const selectDeviceName = (s: EngineSnapshotStore) => s.deviceName;
export const selectDeviceLatencyMs = (s: EngineSnapshotStore) =>
  s.deviceLatencyInputMs + s.deviceLatencyOutputMs;
export const selectTempoBpm = (s: EngineSnapshotStore) => s.tempoBpm;
export const selectTimeSig = (s: EngineSnapshotStore) => s.timeSig;
export const selectTransportPlaying = (s: EngineSnapshotStore) =>
  s.transportPlaying;
export const selectTransportRecording = (s: EngineSnapshotStore) =>
  s.transportRecording;
export const selectHasHostData = (s: EngineSnapshotStore) => s.hasHostData;
