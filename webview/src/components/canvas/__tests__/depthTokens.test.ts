import { describe, expect, it } from "vitest";
import {
  MAX_DEPTH_LEVEL,
  depthVar,
  depthHsl,
  depthColorName,
  DEPTH_COLOR_NAME,
} from "../depthTokens";

describe("depthVar", () => {
  it("returns var(--depth-N) for valid levels 0-4", () => {
    for (let i = 0; i <= MAX_DEPTH_LEVEL; i++) {
      expect(depthVar(i)).toBe(`var(--depth-${i})`);
    }
  });

  it("clamps negative levels to 0", () => {
    expect(depthVar(-1)).toBe("var(--depth-0)");
    expect(depthVar(-99)).toBe("var(--depth-0)");
  });

  it("clamps levels above MAX_DEPTH_LEVEL to MAX_DEPTH_LEVEL", () => {
    expect(depthVar(5)).toBe(`var(--depth-${MAX_DEPTH_LEVEL})`);
    expect(depthVar(100)).toBe(`var(--depth-${MAX_DEPTH_LEVEL})`);
  });

  it("MAX_DEPTH_LEVEL is 4", () => {
    expect(MAX_DEPTH_LEVEL).toBe(4);
  });
});

describe("depthHsl", () => {
  it("returns bare hsl() when alpha is 1 (default)", () => {
    expect(depthHsl(0)).toBe("hsl(var(--depth-0))");
    expect(depthHsl(2)).toBe("hsl(var(--depth-2))");
    expect(depthHsl(1, 1)).toBe("hsl(var(--depth-1))");
  });

  it("returns hsl with alpha when alpha < 1", () => {
    expect(depthHsl(0, 0.45)).toBe("hsl(var(--depth-0) / 0.45)");
    expect(depthHsl(3, 0.15)).toBe("hsl(var(--depth-3) / 0.15)");
  });

  it("clamps depth before composing hsl", () => {
    expect(depthHsl(99, 0.5)).toBe(`hsl(var(--depth-${MAX_DEPTH_LEVEL}) / 0.5)`);
    expect(depthHsl(-1, 0.5)).toBe("hsl(var(--depth-0) / 0.5)");
  });

  it("alpha=0 produces hsl with / 0", () => {
    expect(depthHsl(1, 0)).toBe("hsl(var(--depth-1) / 0)");
  });
});

describe("depthColorName", () => {
  it("returns correct name for each depth 0-4", () => {
    expect(depthColorName(0)).toBe("blue");
    expect(depthColorName(1)).toBe("teal");
    expect(depthColorName(2)).toBe("purple");
    expect(depthColorName(3)).toBe("amber");
    expect(depthColorName(4)).toBe("magenta");
  });

  it("clamps out-of-range levels", () => {
    expect(depthColorName(-5)).toBe("blue");
    expect(depthColorName(99)).toBe("magenta");
  });

  it("DEPTH_COLOR_NAME has exactly 5 entries", () => {
    expect(DEPTH_COLOR_NAME).toHaveLength(5);
  });
});
