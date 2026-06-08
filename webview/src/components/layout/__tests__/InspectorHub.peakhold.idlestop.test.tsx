/**
 * Task 1.4 — usePeakHold idle-stop + re-arm tests (perf-diag #5).
 *
 * Tests the two behavioural guarantees added in Task 1.4:
 *   1. At live===0 && peak===0 the rAF loop does NOT re-queue (idle-stop).
 *   2. A non-zero level push via useCableMeterStore re-arms the loop and the
 *      meter tracks it.
 *
 * We drive the hook directly via renderHook + the real useCableMeterStore
 * (not mocked) so we can control setCableLevels. requestAnimationFrame is
 * shimmed synchronously so tick() runs in test time.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCableMeterStore } from "../../../stores/useCableMeterStore";
import { __usePeakHoldForTest as usePeakHold } from "../InspectorHub";

// ── Synchronous rAF shim ──────────────────────────────────────────────────────
// jsdom has no real rAF cadence. We replace it with a synchronous queue so
// tick() calls are driven explicitly via flushRaf().

let rafQueue: FrameRequestCallback[] = [];
let rafIdCounter = 0;
const pendingRafs = new Map<number, FrameRequestCallback>();

function shimRaf(cb: FrameRequestCallback): number {
  const id = ++rafIdCounter;
  pendingRafs.set(id, cb);
  rafQueue.push(cb);
  return id;
}

function shimCancelRaf(id: number): void {
  pendingRafs.delete(id);
  // Remove from queue too (may be a no-op if already flushed)
  rafQueue = rafQueue.filter((_, i) => {
    // We can't match by id here since queue holds the fn directly; we rely on
    // pendingRafs being the authoritative "should run" set — see flushRaf.
    void i;
    return true;
  });
}

/** Run at most `maxFrames` pending rAF callbacks synchronously. */
function flushRaf(maxFrames = 1): void {
  let frames = 0;
  while (pendingRafs.size > 0 && frames < maxFrames) {
    const entries = [...pendingRafs.entries()];
    pendingRafs.clear();
    rafQueue = [];
    for (const [, cb] of entries) {
      cb(performance.now());
    }
    frames++;
  }
}

// ── Store reset helper ────────────────────────────────────────────────────────

function resetCableStore() {
  useCableMeterStore.setState({ levels: {}, values: {}, peaks: {} });
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  rafQueue = [];
  rafIdCounter = 0;
  pendingRafs.clear();
  vi.stubGlobal("requestAnimationFrame", shimRaf);
  vi.stubGlobal("cancelAnimationFrame", shimCancelRaf);
  resetCableStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetCableStore();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Task 1.4 — usePeakHold idle-stop", () => {
  it("at live===0 && peak===0 the rAF does NOT re-queue after the initial tick", () => {
    // level=0 → the hook should NOT arm the rAF at all on mount (nothing to
    // decay). pendingRafs stays empty.
    renderHook(() => usePeakHold(0, "edge-1"));

    // No rAF should be scheduled since level and peak are both 0.
    expect(pendingRafs.size).toBe(0);
  });

  it("at live===0 && peak===0 flushing the rAF does not re-queue a second frame", () => {
    // If somehow a frame fires (e.g. level decayed to 0 during a prior frame),
    // the idle early-out must prevent further re-queuing.
    // We simulate this by providing level=0 and letting the hook start (it
    // won't arm since level+peak are both 0), then confirm flush is a no-op.
    renderHook(() => usePeakHold(0, "edge-2"));
    flushRaf(5); // flush up to 5 frames — queue should stay empty throughout
    expect(pendingRafs.size).toBe(0);
  });

  it("when level starts non-zero the rAF arms and decays toward 0", () => {
    // Start with a non-zero level: the loop should arm.
    const { result, rerender } = renderHook(
      ({ level }: { level: number }) => usePeakHold(level, "edge-3"),
      { initialProps: { level: 0.8 } },
    );

    // The hook arms immediately on mount because level > 0.
    expect(pendingRafs.size).toBe(1);

    // Flush one frame — peak should equal 0.8 (instant attack).
    act(() => { flushRaf(1); });
    expect(result.current).toBeCloseTo(0.8, 2);

    // Drop level to 0 and flush until the loop stops.
    rerender({ level: 0 });
    act(() => { flushRaf(300); }); // enough frames to decay 0.8 → 0 at 0.004/frame

    // Peak should have decayed to 0, loop stopped.
    expect(result.current).toBe(0);
    expect(pendingRafs.size).toBe(0);
  });
});

describe("Task 1.4 — usePeakHold re-arm on non-zero store push", () => {
  it("a non-zero level push via setCableLevels re-arms the loop and the meter tracks it", () => {
    // Start silent — loop should not be running.
    renderHook(() => usePeakHold(0, "edge-4"));
    expect(pendingRafs.size).toBe(0);

    // Push a non-zero level into the store for the watched edge.
    act(() => {
      useCableMeterStore.getState().setCableLevels([
        { id: "edge-4", level: 0.6 },
      ]);
    });

    // The store subscription should have called startLoop() → rAF armed.
    // (useCableLevel in the real component would also update levelRef, but
    //  here we test the subscription path directly: the re-arm fires even
    //  when levelRef hasn't updated yet because the subscription wakes the loop.)
    expect(pendingRafs.size).toBe(1);
  });

  it("re-armed loop picks up the level on the next tick and returns non-zero peak", () => {
    // Mount with level=0 (idle).
    const { result, rerender } = renderHook(
      ({ level }: { level: number }) => usePeakHold(level, "edge-5"),
      { initialProps: { level: 0 } },
    );
    expect(pendingRafs.size).toBe(0);

    // Push a non-zero level into the store — this arms the rAF via subscription.
    act(() => {
      useCableMeterStore.getState().setCableLevels([
        { id: "edge-5", level: 0.5 },
      ]);
    });
    expect(pendingRafs.size).toBe(1);

    // Update the prop so levelRef.current = 0.5 (mirrors the real component
    // where useCableLevel re-renders CableMonitor which re-renders usePeakHold).
    act(() => {
      rerender({ level: 0.5 });
    });

    // Flush one rAF frame — tick() will see live=0.5, set peak=0.5.
    act(() => {
      flushRaf(1);
    });

    // Peak should now reflect the new level.
    expect(result.current).toBeCloseTo(0.5, 2);
    // Loop still running (level is non-zero, hasn't decayed yet).
    expect(pendingRafs.size).toBe(1);
  });

  it("re-arm does NOT double-start if the loop is already running", () => {
    // Start with a non-zero level → loop armed.
    const { unmount } = renderHook(() => usePeakHold(0.3, "edge-6"));
    expect(pendingRafs.size).toBe(1);

    const rafCountBefore = rafIdCounter;

    // Push another non-zero level — should not add a second rAF.
    act(() => {
      useCableMeterStore.getState().setCableLevels([
        { id: "edge-6", level: 0.4 },
      ]);
    });

    // rafIdCounter should NOT have incremented (no new rAF scheduled by sub).
    expect(rafIdCounter).toBe(rafCountBefore);
    expect(pendingRafs.size).toBe(1); // still exactly one pending frame
    unmount();
  });
});
