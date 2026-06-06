/**
 * T5 — useParamGesture math: deadzone, relative drag, re-anchored fine
 * (mid-drag Shift), reset, clamp, stepped snap.
 *
 * The hook's stateful pointer handling is exercised via the Block/widget
 * integration tests; here we lock the PURE math (computeDragValue + snapStepped)
 * which the locked gesture spec hinges on.
 */

import { describe, expect, it } from "vitest";
import { computeDragValue, snapStepped } from "../inline/useParamGesture";

describe("computeDragValue", () => {
  const base = {
    anchorY: 100,
    anchorValue: 0.5,
    sensitivity: 1 / 200, // full 0–1 sweep over 200px
    fineFactor: 0.1,
    min: 0,
    max: 1,
  };

  it("relative drag up increases value, down decreases", () => {
    // 100px up from anchor → +0.5 → clamps to 1
    expect(computeDragValue({ ...base, clientY: 0, shift: false })).toBeCloseTo(
      1,
      5,
    );
    // 100px down → -0.5 → 0
    expect(
      computeDragValue({ ...base, clientY: 200, shift: false }),
    ).toBeCloseTo(0, 5);
  });

  it("coarse: 20px up moves 0.1 from anchor", () => {
    expect(
      computeDragValue({ ...base, clientY: 80, shift: false }),
    ).toBeCloseTo(0.6, 5);
  });

  it("fine (Shift) moves 10× less for the same pixel delta", () => {
    // 20px up coarse = +0.1; fine = +0.01
    expect(computeDragValue({ ...base, clientY: 80, shift: true })).toBeCloseTo(
      0.51,
      5,
    );
  });

  it("re-anchoring (new anchorY + anchorValue) prevents a jump on Shift engage", () => {
    // Simulate: dragged to value 0.7 at y=60, then Shift engaged → re-anchor.
    // From the re-anchored point, moving another 20px up fine = +0.01.
    const reanchored = computeDragValue({
      anchorY: 60,
      anchorValue: 0.7,
      clientY: 40,
      sensitivity: base.sensitivity,
      fineFactor: base.fineFactor,
      shift: true,
      min: 0,
      max: 1,
    });
    expect(reanchored).toBeCloseTo(0.71, 5);
    // Crucially NOT a big jump: without re-anchoring, applying fine to the whole
    // delta-from-original-anchor would have produced a wildly different value.
  });

  it("clamps to [min,max]", () => {
    expect(
      computeDragValue({ ...base, anchorValue: 0.95, clientY: 0, shift: false }),
    ).toBe(1);
    expect(
      computeDragValue({ ...base, anchorValue: 0.05, clientY: 999, shift: false }),
    ).toBe(0);
  });
});

describe("snapStepped", () => {
  it("snaps to the nearest of N steps across [0,1]", () => {
    // 4 steps over 0..1 → increments of 0.25
    expect(snapStepped(0.1, 0, 1, 4)).toBeCloseTo(0, 5);
    expect(snapStepped(0.13, 0, 1, 4)).toBeCloseTo(0.25, 5);
    expect(snapStepped(0.6, 0, 1, 4)).toBeCloseTo(0.5, 5);
    expect(snapStepped(0.9, 0, 1, 4)).toBeCloseTo(1, 5);
  });

  it("passes through (just clamps) when steps <= 1", () => {
    expect(snapStepped(0.37, 0, 1, 1)).toBeCloseTo(0.37, 5);
    expect(snapStepped(1.5, 0, 1, 0)).toBe(1);
    expect(snapStepped(-0.5, 0, 1, 0)).toBe(0);
  });

  it("snaps within a non-0..1 range", () => {
    // 11 semitones over -12..12 ... use 24 steps for ±12 integer snap
    expect(snapStepped(0.3, -12, 12, 24)).toBeCloseTo(0, 5);
    expect(snapStepped(7.4, -12, 12, 24)).toBeCloseTo(7, 5);
  });
});
