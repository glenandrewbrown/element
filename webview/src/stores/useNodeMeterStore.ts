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
 * One-pass rolling fingerprint of an `{id, level}` snapshot (key-count + a
 * numeric hash folding every id's chars AND each level's value). Used as a
 * fast-path in {@link useNodeMeterStore.setNodeLevels} (ledger #5/#6): if the
 * incoming frame's count AND fingerprint both match the last ACCEPTED frame,
 * the values are bit-identical, so we skip building a fresh `levels` record
 * map and return the existing reference. A genuine value change perturbs the
 * hash (FNV-1a-style mix over the IEEE-754 bits), so a real meter move always
 * falls through to the epsilon scan below — the fast-path can only confirm
 * "unchanged", never mask a change.
 */
function fingerprintLevels(items: Array<{ id: string; level: number }>): number {
  // 32-bit FNV-1a, seeded; mixes id chars + a 32-bit fold of each float's bits.
  let h = 0x811c9dc5;
  const fb = new Float64Array(1);
  const ib = new Uint32Array(fb.buffer);
  for (const { id, level } of items) {
    for (let i = 0; i < id.length; i++) {
      h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
    }
    fb[0] = level;
    h = Math.imul(h ^ ib[0], 0x01000193);
    h = Math.imul(h ^ ib[1], 0x01000193);
    h = Math.imul(h ^ 0x2c, 0x01000193); // record separator
  }
  return h >>> 0;
}

/** Fingerprint + count of the last ACCEPTED node-levels frame (non-reactive). */
let lastFingerprint = 0;
let lastCount = -1;

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
      // moved past epsilon. Stamped before any early-return below.
      lastPushAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();

      // Fast-path (ledger #5/#6): if this frame is bit-identical to the last
      // ACCEPTED frame (same count + fingerprint), skip building the `levels`
      // record map entirely and return the existing reference. A real value
      // change perturbs the fingerprint and falls through to the epsilon scan.
      // The `state.levels` key-count guard keeps the fingerprint self-healing
      // if `levels` was ever replaced out-of-band (e.g. setState/reset): a
      // mismatch there forces the slow path so a stale fingerprint can never
      // mask a genuine snapshot.
      const count = items.length;
      const fp = fingerprintLevels(items);
      if (
        count === lastCount &&
        fp === lastFingerprint &&
        Object.keys(state.levels).length === count
      ) {
        return { levels: state.levels };
      }
      lastCount = count;
      lastFingerprint = fp;

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
