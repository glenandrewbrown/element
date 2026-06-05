import { create } from "zustand";

/**
 * Per-NODE output level 0–1 from the host (Q-VU-PER-BLOCK / Pillar-2 D1),
 * keyed by node UUID. This is the CORRECTNESS path for the Block VU that
 * supersedes the cable-derived fast path (`useBlockOutputLevel` in
 * `useCableMeterStore`): the host walks every node in the active graph and
 * reports each node's OWN output RMS, so terminal / output-only / unconnected
 * blocks (which have no outgoing cable to borrow a level from) now meter REAL
 * signal instead of sitting idle.
 *
 * Every value is real engine data — the host reads each Processor's atomic
 * per-channel output RMS (written lock-free on the audio thread in
 * graphbuilder.cpp). Nothing is fabricated; a silent node reports 0.
 */
interface NodeMeterState {
  levels: Record<string, number>;
  setNodeLevels: (items: Array<{ id: string; level: number }>) => void;
}

/** Below this absolute delta a meter change is visually imperceptible. */
const LEVEL_EPSILON = 0.001;

/**
 * Wall-clock of the LAST host frame, stamped on EVERY `setNodeLevels` call —
 * even the deduped one that returns the unchanged `levels` reference. This is a
 * non-reactive heartbeat (kept OUTSIDE Zustand state so it triggers zero
 * re-renders) used by the falling-envelope ballistics
 * ({@link useBlockNodeLevelBallistic}) to tell "engine alive, every node
 * silent" (honest idle) apart from "host stopped pushing" (stale / no-data).
 * Without it, a fully-steady silent graph (every node identical frame-over-
 * frame → store returns the same reference → no subscriber fires) would be
 * misread as stale. Reads via {@link nodeLevelsLastPushAt}.
 */
let lastPushAt = 0;

/** Wall-clock (performance.now) of the most recent host meter frame, or 0. */
export function nodeLevelsLastPushAt(): number {
  return lastPushAt;
}

export const useNodeMeterStore = create<NodeMeterState>()((set) => ({
  levels: {},
  setNodeLevels: (items) =>
    set((state) => {
      // Heartbeat first — a frame ARRIVED, regardless of whether its values
      // moved past epsilon. Stamped before the dedup early-return below.
      lastPushAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const levels: Record<string, number> = {};
      for (const { id, level } of items) levels[id] = level;
      // Diff before set — identical discipline to useCableMeterStore. The host
      // pushes a FULL snapshot of every node ~60Hz; returning the unchanged
      // `levels` reference on a steady graph keeps subscriber slices identical
      // so React skips the re-render (session-drift perf plan Rank 1).
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
 * Derive a single Block's output VU level from its REAL per-node output RMS,
 * keyed by the node's id (UUID). Unlike `useBlockOutputLevel` (cable-derived),
 * this lights up terminal / unconnected blocks because it reads the node's own
 * output level rather than an outgoing cable's.
 *
 * Re-render safety (session-drift perf plan): the selector returns a NUMBER, so
 * `useSyncExternalStore`'s `Object.is` check holds whenever the value is
 * unchanged — and the epsilon-diff in `setNodeLevels` keeps the `levels`
 * reference identical on a steady graph so the selector does not even re-run.
 */
export function useBlockNodeLevel(blockId: string): number {
  return useNodeMeterStore((s) => s.levels[blockId] ?? 0);
}
