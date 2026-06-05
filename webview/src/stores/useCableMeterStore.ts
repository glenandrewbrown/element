import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useGraphStore } from "./useGraphStore";
import type { CableData } from "../data/types";

/** One per-cable level row pushed by the host (~60Hz, full snapshot). */
export interface CableLevelItem {
  id: string;
  /** Unsigned presence 0–1 (audio RMS / MIDI activity / |CV|). */
  level: number;
  /** SIGNED CV value — present only on CV-sourced cables (flow-debug readout). */
  v?: number;
}

/** Per-cable signal level 0–1 from host (audio RMS / MIDI activity), keyed by edge id. */
interface CableMeterState {
  levels: Record<string, number>;
  /** Signed CV values, keyed by edge id — only CV-sourced cables have an entry. */
  values: Record<string, number>;
  setCableLevels: (items: CableLevelItem[]) => void;
}

/** Below this absolute delta a meter change is visually imperceptible. */
const LEVEL_EPSILON = 0.001;

export const useCableMeterStore = create<CableMeterState>()((set) => ({
  levels: {},
  values: {},
  setCableLevels: (items) =>
    set((state) => {
      const levels: Record<string, number> = {};
      const values: Record<string, number> = {};
      for (const item of items) {
        levels[item.id] = item.level;
        if (typeof item.v === "number") values[item.id] = item.v;
      }
      // Diff before set. The host pushes a FULL snapshot of every cable
      // ~60Hz; without this an idle/steady graph re-notifies every Cable
      // subscriber every frame forever (session-drift perf plan Rank 1).
      // Returning the unchanged references keeps subscriber slices
      // identical, so React skips the re-render. The epsilon-diff covers
      // BOTH records — a steady CV value must not re-render its chip.
      const prevLevels = state.levels;
      const prevValues = state.values;
      if (
        Object.keys(prevLevels).length === items.length &&
        Object.keys(prevValues).length === Object.keys(values).length
      ) {
        let changed = false;
        for (const key in levels) {
          const before = prevLevels[key];
          if (before === undefined || Math.abs(before - levels[key]) > LEVEL_EPSILON) {
            changed = true;
            break;
          }
        }
        if (!changed) {
          for (const key in values) {
            const before = prevValues[key];
            if (before === undefined || Math.abs(before - values[key]) > LEVEL_EPSILON) {
              changed = true;
              break;
            }
          }
        }
        if (!changed) return { levels: prevLevels, values: prevValues };
      }
      return { levels, values };
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
