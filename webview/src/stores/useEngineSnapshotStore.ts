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

/**
 * True when the freshly-polled snapshot differs from what the store already
 * holds. `cpu` is the only field that jitters every 250ms tick, so it is
 * compared at 0.1%-of-fraction resolution (imperceptible on screen) — an
 * exact-equality diff would almost never skip and the idle-tick win would
 * not materialise. During playback `transportFrame`/`transportTimecode`
 * change every tick, so the diff correctly fires then; the win is the
 * stopped/idle case where nothing actually changes.
 */
function snapshotChanged(
  prev: EngineSnapshotState,
  snap: EngineSnapshot,
): boolean {
  return (
    Math.round(snap.cpu * 1000) !== Math.round(prev.cpu * 1000) ||
    snap.engineRunning !== prev.engineRunning ||
    snap.sampleRate !== prev.sampleRate ||
    snap.bufferSize !== prev.bufferSize ||
    snap.deviceName !== prev.deviceName ||
    snap.deviceLatencyInputMs !== prev.deviceLatencyInputMs ||
    snap.deviceLatencyOutputMs !== prev.deviceLatencyOutputMs ||
    snap.transportPlaying !== prev.transportPlaying ||
    snap.transportRecording !== prev.transportRecording ||
    snap.tempoBpm !== prev.tempoBpm ||
    snap.timeSig[0] !== prev.timeSig[0] ||
    snap.timeSig[1] !== prev.timeSig[1] ||
    snap.transportFrame !== prev.transportFrame ||
    snap.transportTimecode !== prev.transportTimecode
  );
}

export const useEngineSnapshotStore = create<EngineSnapshotStore>()(
  (set, get) => ({
    ...initialState,

    refresh: async () => {
      const snap = await nativeGetEngineSnapshot();
      if (snap == null) return;
      // Idle-tick guard: when the host payload is identical to what we
      // already hold, skip BOTH the store set() and the usePerformStore
      // write-through below. Each write-through builds a fresh `liveHealth`
      // object that re-renders every StatusBar/Toolbar/LiveHealth/Inspector
      // consumer; doing that 4×/sec while nothing changes is pure waste.
      if (get().hasHostData && !snapshotChanged(get(), snap)) return;
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
          // Engine snapshot owns transport timecode (~4 Hz). Graph-state
          // snapshot used to mis-write `sampleRateLabel` here — that path
          // was dropped so this is now the single source of truth.
          timecode:
            snap.transportTimecode.length > 0
              ? snap.transportTimecode
              : s.liveHealth.timecode,
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
export const selectTransportFrame = (s: EngineSnapshotStore) =>
  s.transportFrame;
export const selectTransportTimecode = (s: EngineSnapshotStore) =>
  s.transportTimecode;
export const selectHasHostData = (s: EngineSnapshotStore) => s.hasHostData;
