/**
 * Tests for the per-Block VU falling-envelope ballistics (P3-A).
 *
 * The envelope is stepped DETERMINISTICALLY via `__ballisticTestApi` (a pinned
 * synthetic clock) rather than racing real rAF/timers in jsdom. Host frames are
 * pushed through the REAL `useNodeMeterStore.setNodeLevels` so the store
 * heartbeat + reference-change detection behave exactly as in production.
 *
 * Locks the three honesty invariants from the task:
 *   (a) between pushes the displayed value is monotonically NON-INCREASING and
 *       never exceeds the last host value (NOTHING-fake: never raised except by
 *       a push);
 *   (b) a host push of 0 decays the display to exactly 0 (honest idle);
 *   (c) no host frame for >250ms flips state to "stale" (no-data treatment).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useNodeMeterStore } from "../../stores/useNodeMeterStore";
import {
  __ballisticTestApi as api,
  useBlockNodeLevelBallistic,
} from "../useBlockNodeLevelBallistic";

// Synthetic clocks conventionally start above 0 — a t=0 base would be
// indistinguishable from "never pushed" (the bridged heartbeat is 0 at rest).
const T0 = 1000;
const ID = "synth";

function push(level: number): void {
  // A DISTINCT value each call so the store returns a fresh `levels` reference
  // (the epsilon-diff dedups only when nothing moved), which the ballistics read
  // as a real host frame.
  useNodeMeterStore.getState().setNodeLevels([{ id: ID, level }]);
}

beforeEach(() => {
  useNodeMeterStore.setState({ levels: {} });
  api.reset();
  api.track(ID); // mirror a mounted Block consumer
});

afterEach(() => {
  useNodeMeterStore.setState({ levels: {} });
  api.reset();
});

describe("Block VU ballistics — falling envelope", () => {
  it("snaps UP instantly to the real value on a host push (fast attack)", () => {
    push(0.1);
    api.tick(T0);
    expect(api.displayed(ID)).toBeCloseTo(0.1, 5);

    push(0.9);
    api.tick(T0 + 5); // 5ms later
    // Attack is immediate: the display jumps to ~0.9 (minus a negligible 5ms
    // of decay), it does NOT ramp up over time.
    expect(api.displayed(ID)).toBeGreaterThan(0.88);
  });

  it("(a) is monotonically NON-INCREASING between pushes and never exceeds the last host value", () => {
    push(0.8);
    api.tick(T0);
    expect(api.displayed(ID)).toBeCloseTo(0.8, 5);

    // Step forward with NO new push — every reading must fall (or hold at 0) and
    // never rise above the 0.8 host value.
    let prev = api.displayed(ID);
    for (const dt of [40, 80, 120, 160, 200, 260]) {
      api.tick(T0 + dt);
      const cur = api.displayed(ID);
      expect(cur).toBeLessThanOrEqual(prev + 1e-9); // non-increasing
      expect(cur).toBeLessThanOrEqual(0.8 + 1e-9); // never exceeds host value
      prev = cur;
    }
  });

  it("(b) a host push of 0 decays the display to exactly 0 (honest idle)", () => {
    push(0.6);
    api.tick(T0);
    expect(api.displayed(ID)).toBeCloseTo(0.6, 5);

    // Engine still alive, signal stops: push a real 0 frame (the attack must NOT
    // raise on a 0 push — it stays 0.6 and the envelope releases gracefully).
    push(0);
    api.tick(T0); // the 0-frame instant; release has not accrued yet
    expect(api.displayed(ID)).toBeCloseTo(0.6, 5);

    // A beat later, with no further frame, the release is underway.
    api.tick(T0 + 40);
    expect(api.displayed(ID)).toBeLessThan(0.6);

    // Run the envelope out — a 0.6 value fully releases within ~168ms (DECAY_MS
    // 280), so by +220ms it is pinned at exactly 0 (honest idle, engine alive).
    api.tick(T0 + 220);
    expect(api.displayed(ID)).toBe(0);
    expect(api.snapshot(ID)).toEqual({ level: 0, state: "idle" });
  });

  it("(c) no host frame for >250ms flips state to 'stale' (no-data)", () => {
    push(0.5);
    api.tick(T0);
    expect(api.snapshot(ID).state).toBe("live");

    // Advance past the stale window with NO new push (host wedged / engine dead).
    api.tick(T0 + 300);
    const snap = api.snapshot(ID);
    expect(snap.state).toBe("stale");
    expect(snap.level).toBe(0); // a frozen value must NOT read as live signal
  });

  it("stays 'live' while host frames keep arriving (not falsely stale)", () => {
    // A continuous stream of real frames keeps the meter live even across a
    // span far longer than the stale window.
    for (let i = 0; i < 10; ++i) {
      push(0.4 + i * 0.01); // distinct values → fresh frames
      api.tick(T0 + i * 40); // 40ms apart, total 360ms > STALE_MS
    }
    expect(api.snapshot(ID).state).toBe("live");
    expect(api.displayed(ID)).toBeGreaterThan(0);
  });
});

describe("useBlockNodeLevelBallistic — hook surface", () => {
  it("returns the honest idle shape before any signal", () => {
    const { result } = renderHook(() => useBlockNodeLevelBallistic("never-seen"));
    expect(result.current).toEqual({ level: 0, state: "idle" });
  });
});
