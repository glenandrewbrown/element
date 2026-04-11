import { create } from "zustand";

/** Per-cable signal level 0–1 from host (audio RMS / MIDI activity), keyed by edge id. */
interface CableMeterState {
  levels: Record<string, number>;
  setCableLevels: (items: Array<{ id: string; level: number }>) => void;
}

export const useCableMeterStore = create<CableMeterState>()((set) => ({
  levels: {},
  setCableLevels: (items) =>
    set(() => {
      const levels: Record<string, number> = {};
      for (const { id, level } of items) levels[id] = level;
      return { levels };
    }),
}));
