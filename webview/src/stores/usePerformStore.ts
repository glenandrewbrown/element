import { create } from "zustand";
import type { AlertData, MacroControl, SceneData } from "../data/types";
import { demoPerform } from "../data/demoPerform";

interface LiveHealth {
  cpu: number;
  buffer: number;
  latency: number;
  clock: string;
  bpm: number;
  timecode: string;
  alerts: AlertData[];
  ioActivity: "nominal" | "warning" | "critical";
}

interface PerformState {
  macros: MacroControl[];
  scenes: SceneData[];
  liveHealth: LiveHealth;
  mapModeActive: boolean;
}

interface PerformActions {
  updateMacro: (macroId: string, value: number) => void;
  activateScene: (sceneIndex: number) => void;
  toggleMapMode: () => void;
}

type PerformStore = PerformState & PerformActions;

export const usePerformStore = create<PerformStore>()((set) => ({
  macros: demoPerform.macros,
  scenes: demoPerform.scenes,
  liveHealth: {
    cpu: demoPerform.health.cpuPercent,
    buffer: demoPerform.health.bufferSize,
    latency: demoPerform.health.latencyMs,
    clock: demoPerform.health.clockSource,
    bpm: demoPerform.health.bpm,
    timecode: demoPerform.health.timecode,
    alerts: demoPerform.alerts,
    ioActivity: demoPerform.health.ioActivity,
  },
  mapModeActive: false,

  updateMacro: (macroId, value) =>
    set((s) => ({
      macros: s.macros.map((m) => (m.id === macroId ? { ...m, value } : m)),
    })),

  activateScene: (sceneIndex) =>
    set((s) => ({
      scenes: s.scenes.map((sc) => ({
        ...sc,
        active: sc.index === sceneIndex,
      })),
    })),

  toggleMapMode: () => set((s) => ({ mapModeActive: !s.mapModeActive })),
}));

// ── Selectors ──

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
