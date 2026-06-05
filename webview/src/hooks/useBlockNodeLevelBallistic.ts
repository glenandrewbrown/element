/**
 * Falling-envelope DISPLAY ballistics for the per-Block VU (P3-A).
 *
 * The raw path ({@link useBlockNodeLevel} in `useNodeMeterStore`) stores the
 * host's 60Hz per-node output RMS verbatim, with NO decay. When the host stops
 * pushing (engine wedged / dead, or the bridge tears down) the last value
 * sticks — a green meter with no signal. This hook layers a *display* envelope
 * on top that:
 *
 *   • snaps the shown value UP to the real value on every host push (fast
 *     attack — a meter must react instantly to signal), and
 *   • decays the shown value toward 0 between pushes over ~{@link DECAY_MS}
 *     (graceful release), so a stopped-but-alive engine falls to 0 and HOLDS 0.
 *
 * NOTHING-fake invariant: the displayed value is NEVER raised except by a real
 * host push. Between pushes it only ever falls. The engine never reported the
 * intermediate decayed values, but they are strictly ≤ the last real value and
 * trend to the honest floor (0), so the meter never *over*-reports signal.
 *
 * IDLE vs DEAD (the honesty that matters):
 *   • a host push of value 0 → decays to 0 = "idle" (engine alive, no signal).
 *   • NO host frame for >{@link STALE_MS} (host wedged / engine dead, ~15 missed
 *     60Hz frames) → state "stale": the caller renders a VISIBLY DIFFERENT
 *     no-data treatment (dimmed/grey, NOT a green/coloured meter) so a frozen
 *     reading can never masquerade as live silence.
 *
 * Performance: ONE shared requestAnimationFrame loop drives EVERY meter (not one
 * rAF per Block), and a SINGLE subscription to `useNodeMeterStore` detects
 * pushes for all nodes. Per-consumer reactivity is `useSyncExternalStore` with a
 * cached, reference-stable snapshot so a Block only re-renders when its own
 * displayed level (past a small quantum) or state actually changes.
 */
import { useSyncExternalStore } from "react";
import {
  useNodeMeterStore,
  nodeLevelsLastPushAt,
} from "../stores/useNodeMeterStore";

export type BallisticState = "live" | "idle" | "stale";

export interface BallisticLevel {
  /** Display level 0–1 (falling envelope). Never raised except by a host push. */
  level: number;
  /**
   * "live" = decaying from a recent non-zero push; "idle" = engine pushing but
   * the node reads ~0 (honest silence); "stale" = no host frame for >STALE_MS
   * (no data — render dimmed/grey, never a coloured meter).
   */
  state: BallisticState;
}

/** ~ms for a full-scale display value to fall to 0 between pushes. */
const DECAY_MS = 280;
/** No host frame for this long ⇒ "stale" (no-data). ~15 missed 60Hz frames. */
const STALE_MS = 250;
/** Below this the display is treated as silent (snaps to exact 0). */
const SILENCE_EPS = 0.002;
/**
 * Re-render quantum: only notify subscribers when the displayed level crosses a
 * ~0.4%-of-scale step. Sub-pixel changes are imperceptible on a 14-segment
 * meter and would otherwise re-render every Block every animation frame.
 */
const NOTIFY_QUANTUM = 0.004;

interface Entry {
  /** Last REAL value the host reported for this node (push target / ceiling). */
  raw: number;
  /** Current displayed (decayed) value 0–1. */
  displayed: number;
  /** performance.now() of the last host push that touched this node. */
  lastPushAt: number;
  /** performance.now() of the last decay step (for dt-correct release). */
  lastDecayAt?: number;
  /** Cached snapshot handed to useSyncExternalStore — reference-stable. */
  snapshot: BallisticLevel;
  /** Displayed value at the time `snapshot` was last rebuilt (quantum gate). */
  notifiedLevel: number;
  subs: Set<() => void>;
}

const registry = new Map<string, Entry>();

/** Heartbeat (performance.now) of the LAST store reference change we observed. */
let lastSnapshotChangeAt = 0;
let lastLevelsRef: Record<string, number> | null = null;

/**
 * True once a REAL host frame has flowed through the bridge (`setNodeLevels`
 * stamps the store heartbeat) or, under the test clock, once a frame has been
 * ingested. Until then we are un-bridged (pure Storybook / dev seed via
 * `setState`): there is NO host-frame timeline, so we passthrough the seeded
 * value with NO decay and NEVER go "stale" — a static seed in a no-bridge
 * context is "no host", not "frozen host data". This keeps the existing
 * static-seed VU stories pixel-identical while the live app gets full
 * attack/decay + idle-vs-stale.
 */
function everBridged(): boolean {
  if (clockOverridden) return lastSnapshotChangeAt > 0;
  return nodeLevelsLastPushAt() > 0;
}

const IDLE: BallisticLevel = Object.freeze({ level: 0, state: "idle" });
const STALE: BallisticLevel = Object.freeze({ level: 0, state: "stale" });

// Single injectable clock so the whole tick pipeline (ingest → decay → snapshot
// → stale) shares ONE time base. Production uses performance.now(); unit tests
// override it for deterministic stepping. When overridden, the store's
// real-wall-clock heartbeat is ignored for stale detection (the test owns the
// frame timeline via `lastSnapshotChangeAt`).
function realNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
let clock: () => number = realNow;
let clockOverridden = false;

function now(): number {
  return clock();
}

function getEntry(id: string): Entry {
  let e = registry.get(id);
  if (!e) {
    e = {
      raw: 0,
      displayed: 0,
      lastPushAt: 0,
      snapshot: IDLE,
      notifiedLevel: 0,
      subs: new Set(),
    };
    registry.set(id, e);
  }
  return e;
}

/**
 * Build the (frozen) snapshot for an entry. Returns the SAME reference when
 * neither the quantised level nor the state changed, so useSyncExternalStore's
 * Object.is check holds and the Block does not re-render.
 */
function snapshotFor(e: Entry, t: number): BallisticLevel {
  let state: BallisticState;
  let level = e.displayed;
  if (!everBridged()) {
    // Un-bridged (Storybook / dev seed): passthrough, no stale, no decay.
    state = level <= SILENCE_EPS ? "idle" : "live";
    if (state === "idle") level = 0;
  } else if (t - lastFrameAt() > STALE_MS) {
    // No host frame at all for >STALE_MS → no data. Force the display dark so a
    // frozen value can't read as live; the treatment (grey) is the caller's.
    state = "stale";
    level = 0;
  } else if (e.displayed <= SILENCE_EPS) {
    state = "idle";
    level = 0;
  } else {
    state = "live";
  }

  const prev = e.snapshot;
  if (
    prev.state === state &&
    Math.abs(prev.level - level) <= NOTIFY_QUANTUM &&
    // Always settle exactly on the rails (0 / state change) so the meter
    // doesn't hang one quantum above black.
    !(level === 0 && prev.level !== 0)
  ) {
    return prev;
  }
  if (state === "idle" && level === 0) return IDLE;
  if (state === "stale") return STALE;
  return Object.freeze({ level, state });
}

/**
 * The freshest host-frame wall-clock we know about: the MAX of the store's
 * own heartbeat (stamped on every setNodeLevels, even deduped — covers a fully
 * steady silent-but-alive graph) and the last `levels` reference change we
 * observed (covers stories / tests that poke `setState({ levels })` directly,
 * which bypass setNodeLevels).
 */
function lastFrameAt(): number {
  // Under a test clock the store heartbeat (real wall-clock) is on a different
  // timeline, so rely solely on the test-driven reference-change stamp.
  if (clockOverridden) return lastSnapshotChangeAt;
  const storeBeat = nodeLevelsLastPushAt();
  return storeBeat > lastSnapshotChangeAt ? storeBeat : lastSnapshotChangeAt;
}

/** Notify an entry's subscribers iff its cached snapshot reference changed. */
function refresh(e: Entry, t: number): void {
  const next = snapshotFor(e, t);
  if (next !== e.snapshot) {
    e.snapshot = next;
    e.notifiedLevel = next.level;
    for (const cb of e.subs) cb();
  }
}

/** Pull the latest raw host values into the registry; snap display UP on a rise. */
function ingestPush(): void {
  const levels = useNodeMeterStore.getState().levels;
  if (levels === lastLevelsRef) return; // reference-stable ⇒ no value moved
  lastLevelsRef = levels;
  const t = now();
  lastSnapshotChangeAt = t;
  const bridged = everBridged();
  for (const [id, e] of registry) {
    const raw = levels[id] ?? 0;
    e.raw = raw;
    e.lastPushAt = t;
    // Reset the decay clock to the push instant so the next decay step measures
    // dt from NOW, not from a stale prior tick (which would over-decay a value
    // we just snapped up).
    e.lastDecayAt = t;
    if (!bridged) {
      // Un-bridged seed (Storybook/dev): mirror the value exactly, up OR down.
      e.displayed = raw;
    } else if (raw > e.displayed) {
      // Fast attack: bridged display can only be RAISED by a real push (never by
      // the decay loop). Falls are handled in stepDecay.
      e.displayed = raw;
    }
  }
}

/** Decay every entry's display toward 0 and re-emit changed snapshots. */
function stepDecay(t: number): void {
  const bridged = everBridged();
  for (const [, e] of registry) {
    // Only the live-bridge envelope decays; an un-bridged seed holds its value
    // (no host-frame timeline to release against).
    if (bridged && e.displayed > 0) {
      const dt = t - (e.lastDecayAt ?? e.lastPushAt);
      // Linear release: full-scale → 0 over DECAY_MS, clamped at ≥0.
      const drop = dt / DECAY_MS;
      e.displayed = e.displayed - drop;
      if (e.displayed < SILENCE_EPS) e.displayed = 0;
    }
    e.lastDecayAt = t;
    refresh(e, t);
  }
}

// ── Shared rAF loop ──────────────────────────────────────────────────────────
let rafId = 0;
let running = false;

function loop(): void {
  ingestPush();
  stepDecay(now());
  if (registry.size > 0 && hasSubscribers()) {
    if (typeof requestAnimationFrame === "function") {
      rafId = requestAnimationFrame(loop);
      return;
    }
  }
  running = false;
  rafId = 0;
}

function hasSubscribers(): boolean {
  for (const [, e] of registry) if (e.subs.size > 0) return true;
  return false;
}

function ensureRunning(): void {
  if (running) return;
  if (typeof requestAnimationFrame !== "function") return; // jsdom: driven by tests
  running = true;
  rafId = requestAnimationFrame(loop);
}

function stopIfIdle(): void {
  if (hasSubscribers()) return;
  if (rafId !== 0 && typeof cancelAnimationFrame === "function")
    cancelAnimationFrame(rafId);
  rafId = 0;
  running = false;
}

/**
 * Falling-envelope Block VU level + honesty state for one node, keyed by UUID.
 * Drop-in replacement for {@link useBlockNodeLevel} that returns
 * `{ level, state }` instead of a bare number. See module docstring.
 */
export function useBlockNodeLevelBallistic(blockId: string): BallisticLevel {
  return useSyncExternalStore(
    (onChange) => {
      const e = getEntry(blockId);
      e.subs.add(onChange);
      // Seed from the current raw value immediately so the first paint is honest
      // (no flash of 0 before the first rAF tick).
      ingestPush();
      ensureRunning();
      return () => {
        e.subs.delete(onChange);
        if (e.subs.size === 0) registry.delete(blockId);
        stopIfIdle();
      };
    },
    () => getEntry(blockId).snapshot,
    () => IDLE,
  );
}

// ── Test-only deterministic driver ───────────────────────────────────────────
// jsdom has no real rAF cadence, so unit tests step the envelope explicitly
// rather than racing wall-clock timers. NOT part of the public surface.
export const __ballisticTestApi = {
  /** Wipe all registry state between tests. */
  reset(): void {
    registry.clear();
    lastSnapshotChangeAt = 0;
    lastLevelsRef = null;
    rafId = 0;
    running = false;
    clock = realNow;
    clockOverridden = false;
  },
  /** Pin the module clock to a fixed value (enables deterministic stepping). */
  setClock(t: number): void {
    clock = () => t;
    clockOverridden = true;
  },
  /**
   * Step the envelope as of synthetic time `t`: pins the clock to `t` (so
   * ingest + decay + stale all share that instant), ingests the latest store
   * push, then decays + re-emits.
   */
  tick(t: number): void {
    clock = () => t;
    clockOverridden = true;
    ingestPush();
    stepDecay(t);
  },
  /** The cached snapshot for an entry as of the last tick (without stepping). */
  snapshot(id: string): BallisticLevel {
    return getEntry(id).snapshot;
  },
  /** Read an entry's internal displayed value (post-decay). */
  displayed(id: string): number {
    return registry.get(id)?.displayed ?? 0;
  },
  /** Ensure an entry exists (mirrors a mounted consumer) for headless stepping. */
  track(id: string): void {
    const e = getEntry(id);
    e.subs.add(() => {});
  },
};
