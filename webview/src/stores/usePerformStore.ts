import { create } from "zustand";
import type { AlertData, MacroControl, SceneData } from "../data/types";
import { nativePerformSetActiveScene } from "../bridge/nativePerform";
import { invokeElementNative } from "../bridge/juceBackend";
import { logBridgeError } from "../bridge/bridgeError";

interface LiveHealth {
  cpu: number;
  buffer: number;
  latency: number;
  clock: string;
  bpm: number;
  timecode: string;
  /** Host sample rate label, e.g. "48.0 kHz" */
  sampleRateLabel: string;
  alerts: AlertData[];
  ioActivity: "nominal" | "warning" | "critical";
  /**
   * Master output peak 0–1 from `window.__elementNative.onMetering`.
   * This is the single aggregate peak (max across output channels) — kept for
   * consumers that want one number. For the L/R split use `outputPeakL/R`.
   */
  outputPeak: number;
  /**
   * Master output peak 0–1 for the LEFT output channel (Q-VU-LR, Pillar-2 D3).
   * Real per-channel engine LevelMeter via `__elementNative.onMasterLevels`.
   * Mono devices mirror L into R (honest, not a fabricated split).
   */
  outputPeakL: number;
  /** Master output peak 0–1 for the RIGHT output channel (Q-VU-LR, D3). */
  outputPeakR: number;
  /**
   * Audio INPUT peak 0–1 (Q-VU-INPUT, Pillar-2 D2). Loudest live audio-input
   * channel from the engine's device input LevelMeters via
   * `__elementNative.onMasterLevels`. 0 when no input device / silence.
   */
  inputPeak: number;
}

interface PerformState {
  sessionName: string;
  macros: MacroControl[];
  scenes: SceneData[];
  liveHealth: LiveHealth;
  /** Mirror of host AudioEngine transport state (TransportMonitor::playing). */
  isPlaying: boolean;
  mapModeActive: boolean;
  mappedParameters: Set<string>;
}

interface PerformActions {
  updateMacro: (macroId: string, value: number) => void;
  /**
   * Write the master output L/R + audio-input peak from the host
   * `onMasterLevels` push (Q-VU-LR / Q-VU-INPUT). Each value is clamped to
   * 0–1; missing fields leave the prior value untouched. No-ops (returns the
   * same `liveHealth` reference) when nothing moved past the epsilon so the
   * 60Hz push does not re-render steady consumers.
   */
  setMasterLevels: (payload: {
    outL?: number;
    outR?: number;
    input?: number;
  }) => void;
  /**
   * Optimistically activate a scene then confirm with the host. If the
   * bridge call fails or returns false, the local active-scene flag is
   * rolled back to the prior state and the error is surfaced via
   * `logBridgeError`. (T-P6-8)
   */
  activateScene: (sceneIndex: number) => Promise<void>;
  toggleMapMode: () => void;
  /**
   * Optimistically mark a parameter as mapped/unmapped then confirm
   * with the host. On bridge failure, rolls back the local mapped-set
   * to its prior value and surfaces the error. (T-P6-9)
   */
  markParameterMapped: (
    nodeId: string,
    paramIdx: number,
    mapped: boolean,
  ) => Promise<void>;
  /** Hydrate from native graph snapshot (`perform` + `session` + `engine`). */
  hydrateFromEngine: (data: {
    sessionName?: string;
    scenes?: SceneData[];
    activeSceneIndex?: number;
    bpm?: number;
    buffer?: number;
    clock?: string;
    timecode?: string;
    sampleRateLabel?: string;
    cpu?: number;
    /** Round-trip device latency (ms) from host audio device. */
    latencyMs?: number;
    /** Engine transport state from `engine.isPlaying`. */
    isPlaying?: boolean;
  }) => void;
}

type PerformStore = PerformState & PerformActions;

const defaultHealth: LiveHealth = {
  cpu: 0,
  buffer: 0,
  latency: 0,
  clock: "—",
  bpm: 120,
  timecode: "—",
  sampleRateLabel: "—",
  alerts: [],
  ioActivity: "nominal",
  outputPeak: 0,
  outputPeakL: 0,
  outputPeakR: 0,
  inputPeak: 0,
};

/** True while hydrating mapped parameters from host — prevents bridge re-fire. */
let _mappedHydrating = false;

export const usePerformStore = create<PerformStore>()((set, get) => ({
  sessionName: "Project",
  macros: [],
  scenes: [],
  liveHealth: { ...defaultHealth },
  isPlaying: false,
  mapModeActive: false,
  mappedParameters: new Set<string>(),

  updateMacro: (macroId, value) =>
    set((s) => ({
      macros: s.macros.map((m) => (m.id === macroId ? { ...m, value } : m)),
    })),

  setMasterLevels: (payload) =>
    set((s) => {
      const clamp01 = (v: unknown, fallback: number): number =>
        typeof v === "number" && Number.isFinite(v)
          ? Math.max(0, Math.min(1, v))
          : fallback;
      const h = s.liveHealth;
      const outputPeakL = clamp01(payload.outL, h.outputPeakL);
      const outputPeakR = clamp01(payload.outR, h.outputPeakR);
      const inputPeak = clamp01(payload.input, h.inputPeak);
      // Epsilon-diff so the ~60Hz push does not churn the store on a steady
      // signal (session-drift perf plan): return the SAME object if nothing
      // visibly moved, so subscriber slices stay reference-identical.
      const EPS = 0.001;
      if (
        Math.abs(outputPeakL - h.outputPeakL) < EPS &&
        Math.abs(outputPeakR - h.outputPeakR) < EPS &&
        Math.abs(inputPeak - h.inputPeak) < EPS
      ) {
        return s;
      }
      return {
        liveHealth: { ...h, outputPeakL, outputPeakR, inputPeak },
      };
    }),

  activateScene: async (sceneIndex) => {
    const prevScenes = get().scenes;
    set((s) => ({
      scenes: s.scenes.map((sc, i) => ({
        ...sc,
        active: i === sceneIndex,
      })),
    }));
    try {
      const ok = await nativePerformSetActiveScene(sceneIndex);
      if (!ok) {
        logBridgeError(
          "usePerformStore.activateScene",
          `bridge rejected scene index ${sceneIndex}`,
        );
        set({ scenes: prevScenes });
      }
    } catch (err) {
      logBridgeError("usePerformStore.activateScene", err);
      set({ scenes: prevScenes });
    }
  },

  toggleMapMode: () => set((s) => ({ mapModeActive: !s.mapModeActive })),

  markParameterMapped: async (nodeId, paramIdx, mapped) => {
    const prev = get().mappedParameters;
    set((s) => {
      const key = `${nodeId}:${paramIdx}`;
      const next = new Set(s.mappedParameters);
      if (mapped) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return { mappedParameters: next };
    });
    if (_mappedHydrating) return;
    try {
      const r = await invokeElementNative(
        "elementPerformMarkParameterMapped",
        [{ nodeId, paramIndex: paramIdx, mapped }],
      );
      if (r === false) {
        logBridgeError(
          "usePerformStore.markParameterMapped",
          `bridge rejected ${nodeId}:${paramIdx} → ${mapped}`,
        );
        set({ mappedParameters: prev });
      }
    } catch (err) {
      logBridgeError("usePerformStore.markParameterMapped", err);
      set({ mappedParameters: prev });
    }
  },

  hydrateFromEngine: (data) =>
    set((s) => {
      let scenes = s.scenes;
      if (data.scenes != null) {
        // Allow empty array to clear the store — handles "last scene deleted" case
        if (data.scenes.length === 0) {
          scenes = [];
        } else {
          const idx = data.activeSceneIndex ?? 0;
          scenes = data.scenes.map((sc, i) => ({
            ...sc,
            active:
              typeof sc.index === "number" ? sc.index === idx : i === idx,
          }));
        }
      }
      return {
        sessionName: data.sessionName ?? s.sessionName,
        scenes,
        isPlaying:
          typeof data.isPlaying === "boolean" ? data.isPlaying : s.isPlaying,
        liveHealth: {
          ...s.liveHealth,
          bpm: data.bpm ?? s.liveHealth.bpm,
          buffer: data.buffer ?? s.liveHealth.buffer,
          clock: data.clock ?? s.liveHealth.clock,
          timecode: data.timecode ?? s.liveHealth.timecode,
          sampleRateLabel: data.sampleRateLabel ?? s.liveHealth.sampleRateLabel,
          cpu: data.cpu ?? s.liveHealth.cpu,
          latency:
            typeof data.latencyMs === "number" && !Number.isNaN(data.latencyMs)
              ? data.latencyMs
              : s.liveHealth.latency,
        },
      };
    }),
}));

// ── Bridge: master output peak ──
//
// The host emits a single aggregate peak on `__elementNative.onMetering`.
// We chain ourselves *behind* whatever handler is already installed (the
// existing `useJuceBridge` hook always invokes `prev.onMetering?.(peak)`
// before its own logic — see hooks/useJuceBridge.ts:420). Installing the
// chain at module load runs once per JS context, which matches how the
// other bridge consumers (useCableMeterStore via useJuceBridge) operate.
//
// Honest representation: the bridge today gives us *one* number — we map
// it to `outputPeak`. Input metering and per-channel L/R are tracked under
// Q-id Q-VU-INPUT and Q-VU-LR (need C++ bridge extension).
let _meteringChainInstalled = false;
function installMeteringChain(): void {
  if (typeof window === "undefined") return;
  // Idempotent: prepending a link to `onMetering` on every module
  // evaluation (HMR / repeated import) would stack callbacks that never get
  // removed, so each metering tick would do 2×, 3×… work. Guard so the
  // chain is installed exactly once per JS context (matches juceBackend's
  // `listenerWired`).
  if (_meteringChainInstalled) return;
  _meteringChainInstalled = true;
  // Capture whatever was registered before us (could be undefined or set
  // by useJuceBridge effect on a later tick — both are fine because we
  // chain into prev.onMetering, and useJuceBridge will chain into ours).
  const native: Record<string, unknown> = (window as unknown as {
    __elementNative?: Record<string, unknown>;
  }).__elementNative ?? {};
  const prev = native.onMetering as ((peak: number) => void) | undefined;
  native.onMetering = (peak: number) => {
    prev?.(peak);
    const clamped = Number.isFinite(peak)
      ? Math.max(0, Math.min(1, peak))
      : 0;
    usePerformStore.setState((s) => ({
      liveHealth: { ...s.liveHealth, outputPeak: clamped },
    }));
  };
  (window as unknown as { __elementNative?: Record<string, unknown> })
    .__elementNative = native;
}
installMeteringChain();

// ── Selectors ──

export const selectSessionName = (s: PerformStore) => s.sessionName;
export const selectMacros = (s: PerformStore) => s.macros;
export const selectScenes = (s: PerformStore) => s.scenes;
export const selectLiveHealth = (s: PerformStore) => s.liveHealth;
export const selectMapMode = (s: PerformStore) => s.mapModeActive;
export const selectMappedParameters = (s: PerformStore) => s.mappedParameters;

export const selectActiveScene = (s: PerformStore) =>
  s.scenes.find((sc) => sc.active);

export const selectCpu = (s: PerformStore) => s.liveHealth.cpu;
export const selectBpm = (s: PerformStore) => s.liveHealth.bpm;
export const selectTimecode = (s: PerformStore) => s.liveHealth.timecode;
export const selectAlerts = (s: PerformStore) => s.liveHealth.alerts;
export const selectIsPlaying = (s: PerformStore) => s.isPlaying;
export const selectOutputPeak = (s: PerformStore) => s.liveHealth.outputPeak;
/** Master output LEFT-channel peak 0–1 (Q-VU-LR / D3). */
export const selectOutputPeakL = (s: PerformStore) => s.liveHealth.outputPeakL;
/** Master output RIGHT-channel peak 0–1 (Q-VU-LR / D3). */
export const selectOutputPeakR = (s: PerformStore) => s.liveHealth.outputPeakR;
/** Audio INPUT peak 0–1 (Q-VU-INPUT / D2). */
export const selectInputPeak = (s: PerformStore) => s.liveHealth.inputPeak;

export const selectMacroById = (id: string) => (s: PerformStore) =>
  s.macros.find((m) => m.id === id);

export const selectIsParameterMapped =
  (nodeId: string, paramIdx: number) => (s: PerformStore) =>
    s.mappedParameters.has(`${nodeId}:${paramIdx}`);

// ── Host hydration ──

/**
 * Load all mapped (nodeId, paramIndex) tuples from the host ValueTree and
 * replace the store's mappedParameters Set.  Sets _mappedHydrating while
 * applying so the markParameterMapped action does not re-fire network calls.
 */
export async function loadMappedParametersFromHost(): Promise<void> {
  const raw = await invokeElementNative("elementPerformGetMappedParameters", []);
  if (!Array.isArray(raw)) return;
  const entries = raw as Array<{ nodeId: string; paramIndex: number }>;
  const next = new Set<string>(
    entries.map((e) => `${e.nodeId}:${e.paramIndex}`),
  );
  _mappedHydrating = true;
  try {
    usePerformStore.setState({ mappedParameters: next });
  } finally {
    _mappedHydrating = false;
  }
}
