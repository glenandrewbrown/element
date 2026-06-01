import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useGraphStore } from "./useGraphStore";
import type { CableData } from "../data/types";

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

/**
 * Derive a single Block's output VU level = the MAX real cable level over its
 * OUTGOING edges. This is the honest, end-to-end-wired stand-in for a true
 * per-block output RMS (Q-VU-PER-BLOCK / D1-full) until the C++ side exposes one
 * directly: a Block's loudest outgoing cable carries the signal it just emitted,
 * so its meter tracks real audio rather than fabricating motion.
 *
 * Blocks with ZERO outgoing edges return 0 (idle) — these are EXPLICITLY EXCLUDED
 * from the "nothing fake" guarantee until the per-block RMS bridge lands, because
 * an output-only/terminal block has no cable level to borrow.
 *
 * Re-render safety (session-drift perf plan): two subscriptions, both stable.
 *  • `useGraphStore` selector is wrapped in `useShallow`, so the outgoing-edge-id
 *    array is element-compared and only changes when the graph TOPOLOGY changes
 *    (not every 60Hz level push).
 *  • The `useCableMeterStore` selector returns a NUMBER (the max) via a plain
 *    `for`-loop whose every `return` is a number, so React's
 *    `useSyncExternalStore` `Object.is` check holds whenever the value is
 *    unchanged — no re-render storm — and it never even re-runs unless `levels`
 *    itself changed (the epsilon-diff above keeps that reference identical on a
 *    steady graph). This mirrors `Cable.tsx`'s `fanOffset` selector (transient
 *    work, primitive result) — deliberately NOT `.reduce`, which the
 *    fresh-allocation selector guard classifies as allocating by syntax.
 */
export function useBlockOutputLevel(blockId: string): number {
  const outgoingEdgeIds = useGraphStore(
    useShallow((s) => {
      const ids: string[] = [];
      for (const e of s.edges as CableData[]) {
        if (e.source === blockId) ids.push(e.id);
      }
      return ids;
    }),
  );
  return useCableMeterStore((s) => {
    let max = 0;
    for (const id of outgoingEdgeIds) {
      const lvl = s.levels[id] ?? 0;
      if (lvl > max) max = lvl;
    }
    return max;
  });
}
