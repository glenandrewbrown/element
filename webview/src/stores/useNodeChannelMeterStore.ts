import { create } from "zustand";

/**
 * Per-NODE PER-CHANNEL output levels 0–1 from the host (G3-B item 2), keyed by
 * node UUID. Where {@link useNodeMeterStore} carries ONE summed/loudest scalar
 * per node (the Block VU), this store carries the FULL per-channel array so the
 * BusInspector can show real surround / multi-channel columns (one VU lane per
 * output channel) instead of sharing a single cable scalar across every lane.
 *
 * Every value is real engine data — the host reads each Processor's atomic
 * per-channel output RMS (written lock-free on the audio thread in
 * graphbuilder.cpp) for EVERY output lane, with the same calibration as the
 * scalar path (`jmin(1, rms*3)`). Nothing is fabricated: a silent node reports
 * zeros, a node with no audio output is simply absent (→ `[]`), and a stereo
 * source on a surround bus reports its real 2 lanes (the UI falls back to the
 * scalar for the missing lanes — documented, not invented balance).
 */
interface NodeChannelMeterState {
  /** node UUID → array of per-channel levels (0–1), one entry per output lane. */
  levels: Record<string, number[]>;
  setNodeChannelLevels: (items: Array<{ id: string; ch: number[] }>) => void;
}

/** Below this absolute delta a meter change is visually imperceptible. */
const LEVEL_EPSILON = 0.001;

/** True when two per-channel arrays differ by more than epsilon on any lane
 *  (or differ in length). Mirrors the scalar store's per-element discipline. */
function channelsChanged(prev: number[] | undefined, next: number[]): boolean {
  if (prev === undefined || prev.length !== next.length) return true;
  for (let i = 0; i < next.length; ++i) {
    if (Math.abs(prev[i] - next[i]) > LEVEL_EPSILON) return true;
  }
  return false;
}

export const useNodeChannelMeterStore = create<NodeChannelMeterState>()(
  (set) => ({
    levels: {},
    setNodeChannelLevels: (items) =>
      set((state) => {
        const levels: Record<string, number[]> = {};
        for (const { id, ch } of items)
          levels[id] = Array.isArray(ch) ? ch : [];

        // Diff before set — identical discipline to useNodeMeterStore. The host
        // pushes a FULL snapshot of every node ~60Hz; returning the unchanged
        // `levels` reference on a steady graph keeps subscriber slices identical
        // so React skips the re-render.
        const prev = state.levels;
        const prevKeys = Object.keys(prev);
        if (prevKeys.length === items.length) {
          let changed = false;
          for (const key in levels) {
            if (channelsChanged(prev[key], levels[key])) {
              changed = true;
              break;
            }
          }
          if (!changed) return { levels: prev };
        }
        return { levels };
      }),
  }),
);

/**
 * Derive ONE node's per-channel output levels by its id (UUID). Returns the
 * SAME stable empty array when the node is absent so the selector result is
 * referentially stable across renders (avoids a Zustand v5 `useSyncExternalStore`
 * re-render loop on a fresh `[]` each call).
 */
const EMPTY: number[] = [];
export function useNodeChannelLevels(nodeId: string | undefined): number[] {
  return useNodeChannelMeterStore((s) =>
    nodeId ? (s.levels[nodeId] ?? EMPTY) : EMPTY,
  );
}
