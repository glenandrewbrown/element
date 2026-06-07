/**
 * Tests for lib/autoFitExtent — the 3a-W2 auto-fit hysteresis predicate (G4).
 *
 * The spec asks specifically for a vitest on the HYSTERESIS PREDICATE: the
 * extent must only grow when a block creeps within the outer ~100px band, and
 * hold steady (no pan/jerk) otherwise.
 */

import { describe, expect, it } from "vitest";
import {
  shouldExpandExtent,
  nextAutoFitExtent,
  extentForBounds,
  DEFAULT_BAND,
  type Bounds,
  type Extent,
} from "../autoFitExtent";

const BOUNDS: Bounds = { minX: 0, minY: 0, maxX: 200, maxY: 100 };

describe("autoFitExtent — hysteresis", () => {
  it("holds steady when every block edge has more slack than the band", () => {
    // Extent comfortably larger than bounds on all sides (slack ≫ band).
    const current: Extent = [
      [-500, -500],
      [700, 600],
    ];
    expect(shouldExpandExtent(current, BOUNDS)).toBe(false);
    expect(nextAutoFitExtent(current, BOUNDS)).toBeNull();
  });

  it("expands when a block creeps within the band of the right edge", () => {
    // Right wall only ~50px past the block's right edge (< 100px band).
    const current: Extent = [
      [-500, -500],
      [250, 600],
    ];
    expect(shouldExpandExtent(current, BOUNDS)).toBe(true);
    const next = nextAutoFitExtent(current, BOUNDS);
    expect(next).not.toBeNull();
    // Grown right edge clears the band by margin-band → far past maxX.
    expect(next![1][0]).toBeGreaterThan(BOUNDS.maxX + DEFAULT_BAND);
  });

  it("expands when a block crosses the left wall (negative slack)", () => {
    const current: Extent = [
      [50, -500], // left wall is to the RIGHT of the block's minX=0
      [700, 600],
    ];
    expect(shouldExpandExtent(current, BOUNDS)).toBe(true);
  });

  it("treats the band boundary as exclusive (exactly band px of slack holds)", () => {
    // Right slack == band exactly → NOT inside the band → no expand.
    const current: Extent = [
      [-500, -500],
      [BOUNDS.maxX + DEFAULT_BAND, 600],
    ];
    // left/top/bottom all have huge slack; right slack == band.
    expect(shouldExpandExtent(current, BOUNDS)).toBe(false);
  });

  it("grows monotonically — never shrinks an already-large extent", () => {
    const current: Extent = [
      [-2000, -2000],
      [2000, 2000],
    ];
    // Bounds near the right wall would trigger expand, but the union must keep
    // the big existing extent (no snap-smaller jerk).
    const nearRight: Bounds = { minX: 0, minY: 0, maxX: 1950, maxY: 100 };
    const next = nextAutoFitExtent(current, nearRight);
    expect(next).not.toBeNull();
    expect(next![0][0]).toBeLessThanOrEqual(-2000); // left never shrinks inward
    expect(next![1][1]).toBeGreaterThanOrEqual(2000); // bottom never shrinks
  });

  it("extentForBounds pads symmetrically", () => {
    const e = extentForBounds(BOUNDS, 100);
    expect(e).toEqual([
      [-100, -100],
      [300, 200],
    ]);
  });
});
