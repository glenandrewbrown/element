import { create } from "zustand";
import type { AlertData, MacroControl, SceneData } from "../data/types";
import { nativePerformSetActiveScene } from "../bridge/nativePerform";
import { invokeElementNative } from "../bridge/juceBackend";

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
  activateScene: (sceneIndex: number) => void;
  toggleMapMode: () => void;
  markParameterMapped: (nodeId: string, paramIdx: number, mapped: boolean) => void;
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
};

/** True while hydrating mapped parameters from host — prevents bridge re-fire. */
let _mappedHydrating = false;

export const usePerformStore = create<PerformStore>()((set) => ({
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

  activateScene: (sceneIndex) => {
    void nativePerformSetActiveScene(sceneIndex);
    set((s) => ({
      scenes: s.scenes.map((sc, i) => ({
        ...sc,
        active: i === sceneIndex,
      })),
    }));
  },

  toggleMapMode: () => set((s) => ({ mapModeActive: !s.mapModeActive })),

  markParameterMapped: (nodeId, paramIdx, mapped) => {
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
    if (!_mappedHydrating) {
      void invokeElementNative("elementPerformMarkParameterMapped", [
        { nodeId, paramIndex: paramIdx, mapped },
      ]);
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
            active: sc.index === idx || i === idx,
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
