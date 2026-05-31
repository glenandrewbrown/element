import { create } from "zustand";

/** Per-cable signal level 0–1 from host (audio RMS / MIDI activity), keyed by edge id. */
interface CableMeterState {
  levels: Record<string, number>;
  setCableLevels: (items: Array<{ id: string; level: number }>) => void;
}

/** Below this absolute delta a meter change is visually imperceptible. */
const LEVEL_EPSILON = 0.001;

export const useCableMeterStore = create<CableMeterState>()((set) => ({
  levels: {},
  setCableLevels: (items) =>
    set((state) => {
      const levels: Record<string, number> = {};
      for (const { id, level } of items) levels[id] = level;
      // Diff before set. The host pushes a FULL snapshot of every cable
      // ~60Hz; without this an idle/steady graph re-notifies every Cable
      // subscriber every frame forever (session-drift perf plan Rank 1).
      // Returning the unchanged `levels` reference keeps subscriber slices
      // identical, so React skips the re-render.
      const prev = state.levels;
      const prevKeys = Object.keys(prev);
      if (prevKeys.length === items.length) {
        let changed = false;
        for (const key in levels) {
          const before = prev[key];
          if (before === undefined || Math.abs(before - levels[key]) > LEVEL_EPSILON) {
            changed = true;
            break;
          }
        }
        if (!changed) return { levels: prev };
      }
      return { levels };
    }),
}));
