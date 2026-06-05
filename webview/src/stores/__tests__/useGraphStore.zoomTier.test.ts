/**
 * Unit tests for `zoomToTier` — verifies the widened standard band (0.45–0.9)
 * so that normal mouse-wheel steps land in "standard" rather than skipping
 * compact→expanded.
 */

import { describe, expect, it } from "vitest";
import { zoomToTier } from "../useGraphStore";

describe("zoomToTier", () => {
  it("returns compact below 0.45", () => {
    expect(zoomToTier(0)).toBe("compact");
    expect(zoomToTier(0.1)).toBe("compact");
    expect(zoomToTier(0.44)).toBe("compact");
    expect(zoomToTier(0.449)).toBe("compact");
  });

  it("returns expanded above 0.9", () => {
    expect(zoomToTier(0.91)).toBe("expanded");
    expect(zoomToTier(1.0)).toBe("expanded");
    expect(zoomToTier(2.0)).toBe("expanded");
  });

  it("returns standard across the full 0.45–0.9 band", () => {
    const midPoints = [0.45, 0.5, 0.6, 0.7, 0.8, 0.9];
    for (const z of midPoints) {
      expect(zoomToTier(z), `zoom=${z}`).toBe("standard");
    }
  });

  it("wheel-step sequence passes THROUGH standard — no compact→expanded jump", () => {
    // Simulate wheel-up from deep compact through standard into expanded.
    // Each step is 0.1 (larger than a real wheel delta so the test is fast).
    const steps = [0.2, 0.3, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const tiers = steps.map(zoomToTier);

    // At least one mid-value must be "standard".
    expect(tiers).toContain("standard");

    // No adjacent pair should jump directly compact→expanded.
    for (let i = 0; i < tiers.length - 1; i++) {
      const isIllegalJump =
        tiers[i] === "compact" && tiers[i + 1] === "expanded";
      expect(isIllegalJump, `illegal jump at zoom=${steps[i]}→${steps[i + 1]}`).toBe(false);
    }
  });

  it("boundary values sit in the correct tiers", () => {
    // Exact boundary: 0.45 is standard (not compact), 0.9 is standard (not expanded).
    expect(zoomToTier(0.45)).toBe("standard");
    expect(zoomToTier(0.9)).toBe("standard");
  });
});
