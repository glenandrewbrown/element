import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useGraphStore } from "./useGraphStore";
import type { CableData } from "../data/types";

/** One per-cable level row pushed by the host (~60Hz, full snapshot). */
export interface CableLevelItem {
  id: string;
  /** Unsigned presence 0–1 (audio RMS / MIDI activity / CV block |peak|). */
  level: number;
  /** SIGNED CV value (last rendered sample) — present only on CV-sourced
   *  cables (flow-debug readout). */
  v?: number;
  /** CV block ABSOLUTE PEAK (A5) — present only on CV-sourced cables. The
   *  chip's activity gate uses this, not `v`: fast bipolar CV reads ~0 at
   *  block-end zero crossings and would look idle on last-sample alone. */
  pk?: number;
}

/** Per-cable signal level 0–1 from host (audio RMS / MIDI activity), keyed by edge id. */
interface CableMeterState {
  levels: Record<string, number>;
  /** Signed CV values, keyed by edge id — only CV-sourced cables have an entry. */
  values: Record<string, number>;
  /** CV block |peak| per cable (A5) — only CV-sourced cables have an entry. */
  peaks: Record<string, number>;
  setCableLevels: (items: CableLevelItem[]) => void;
}

/** Below this absolute delta a meter change is visually imperceptible. */
const LEVEL_EPSILON = 0.001;

/**
 * One-pass rolling fingerprint of a cable-level snapshot — folds every item's
 * id, level, and (when present) signed value `v` and peak `pk` into a single
 * 32-bit FNV-1a-style hash, plus the item count. Used as a fast-path in
 * {@link useCableMeterStore.setCableLevels} (ledger #5/#6): a frame whose count
 * AND fingerprint match the last ACCEPTED frame is bit-identical, so the three
 * record maps are NOT re-allocated and the existing references are returned. A
 * genuine change to ANY of level/v/pk perturbs the hash and falls through to
 * the epsilon scan — the fast-path can only confirm "unchanged".
 */
function fingerprintCableLevels(items: CableLevelItem[]): number {
  let h = 0x811c9dc5;
  const fb = new Float64Array(1);
  const ib = new Uint32Array(fb.buffer);
  const fold = (n: number) => {
    fb[0] = n;
    h = Math.imul(h ^ ib[0], 0x01000193);
    h = Math.imul(h ^ ib[1], 0x01000193);
  };
  for (const item of items) {
    for (let i = 0; i < item.id.length; i++) {
      h = Math.imul(h ^ item.id.charCodeAt(i), 0x01000193);
    }
    fold(item.level);
    // Distinguish "present" from "absent" so adding/removing v|pk perturbs h.
    h = Math.imul(h ^ (typeof item.v === "number" ? 0x11 : 0x10), 0x01000193);
    if (typeof item.v === "number") fold(item.v);
    h = Math.imul(h ^ (typeof item.pk === "number" ? 0x21 : 0x20), 0x01000193);
    if (typeof item.pk === "number") fold(item.pk);
    h = Math.imul(h ^ 0x2c, 0x01000193); // record separator
  }
  return h >>> 0;
}

/** Fingerprint + count of the last ACCEPTED cable-levels frame (non-reactive). */
let lastFingerprint = 0;
let lastCount = -1;

export const useCableMeterStore = create<CableMeterState>()((set) => ({
  levels: {},
  values: {},
  peaks: {},
  setCableLevels: (items) =>
    set((state) => {
      // Fast-path (ledger #5/#6): a frame bit-identical to the last ACCEPTED
      // one (same count + fingerprint) skips building all three record maps and
      // returns the existing references. Any real change to level/v/pk perturbs
      // the fingerprint and falls through to the epsilon scan below. The
      // `state.levels` key-count guard keeps the fingerprint self-healing if
      // `levels` was ever replaced out-of-band (setState/reset).
      const count = items.length;
      const fp = fingerprintCableLevels(items);
      if (
        count === lastCount &&
        fp === lastFingerprint &&
        Object.keys(state.levels).length === count
      ) {
        return {
          levels: state.levels,
          values: state.values,
          peaks: state.peaks,
        };
      }
      lastCount = count;
      lastFingerprint = fp;

      const levels: Record<string, number> = {};
      const values: Record<string, number> = {};
      const peaks: Record<string, number> = {};
      for (const item of items) {
        levels[item.id] = item.level;
        if (typeof item.v === "number") values[item.id] = item.v;
        if (typeof item.pk === "number") peaks[item.id] = item.pk;
      }
      // Diff before set. The host pushes a FULL snapshot of every cable
      // ~60Hz; without this an idle/steady graph re-notifies every Cable
      // subscriber every frame forever (session-drift perf plan Rank 1).
      // Returning the unchanged references keeps subscriber slices
      // identical, so React skips the re-render. The epsilon-diff covers
      // ALL records — a steady CV value/peak must not re-render its chip.
      const prevLevels = state.levels;
      const prevValues = state.values;
      const prevPeaks = state.peaks ?? {};
      if (
        Object.keys(prevLevels).length === items.length &&
        Object.keys(prevValues).length === Object.keys(values).length &&
        Object.keys(prevPeaks).length === Object.keys(peaks).length
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
        if (!changed) {
          for (const key in peaks) {
            const before = prevPeaks[key];
            if (before === undefined || Math.abs(before - peaks[key]) > LEVEL_EPSILON) {
              changed = true;
              break;
            }
          }
        }
        if (!changed) return { levels: prevLevels, values: prevValues, peaks: prevPeaks };
      }
      return { levels, values, peaks };
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
