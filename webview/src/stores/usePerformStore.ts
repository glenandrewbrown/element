import { create } from "zustand";
import type { AlertData, MacroControl, SceneData } from "../data/types";
import { nativePerformSetActiveScene } from "../bridge/nativePerform";
import { demoGraph } from "../data/demoGraph";

/** Standalone Vite: `VITE_USE_DEMO_GRAPH=1 npm run dev` seeds the demo board. */
const useDemoSeed = import.meta.env.VITE_USE_DEMO_GRAPH === "1";

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
  mapModeActive: boolean;
}

interface PerformActions {
  updateMacro: (macroId: string, value: number) => void;
  activateScene: (sceneIndex: number) => void;
  toggleMapMode: () => void;
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

export const usePerformStore = create<PerformStore>()((set) => ({
  sessionName: useDemoSeed ? "Demo Session" : "Project",
  macros: useDemoSeed ? demoGraph.macros : [],
  scenes: useDemoSeed ? demoGraph.scenes : [],
  liveHealth: { ...defaultHealth },
  mapModeActive: false,

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

  hydrateFromEngine: (data) =>
    set((s) => {
      let scenes = s.scenes;
      if (data.scenes != null && data.scenes.length > 0) {
        const idx = data.activeSceneIndex ?? 0;
        scenes = data.scenes.map((sc, i) => ({
          ...sc,
          active: sc.index === idx || i === idx,
        }));
      }
      return {
        sessionName: data.sessionName ?? s.sessionName,
        scenes,
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

export const selectActiveScene = (s: PerformStore) =>
  s.scenes.find((sc) => sc.active);

export const selectCpu = (s: PerformStore) => s.liveHealth.cpu;
export const selectBpm = (s: PerformStore) => s.liveHealth.bpm;
export const selectTimecode = (s: PerformStore) => s.liveHealth.timecode;
export const selectAlerts = (s: PerformStore) => s.liveHealth.alerts;

export const selectMacroById = (id: string) => (s: PerformStore) =>
  s.macros.find((m) => m.id === id);
